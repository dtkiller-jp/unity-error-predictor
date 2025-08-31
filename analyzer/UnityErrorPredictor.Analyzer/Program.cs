using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.MSBuild;

public class Program
{
    public static async Task Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.Error.WriteLine("Error: Insufficient arguments. Requires project path and mode ('fast' or 'deep').");
            return;
        }
        var projectPath = args[0];
        var mode = args[1];

        if (mode == "fast")
        {
            await RunFastAnalysis(projectPath);
        }
        else if (mode == "deep")
        {
            await RunDeepAnalysis(projectPath);
        }
    }

    private static async Task RunFastAnalysis(string projectPath)
    {
        var csFiles = Directory.GetFiles(projectPath, "*.cs", SearchOption.AllDirectories);
        var totalFiles = csFiles.Length;
        var processedFiles = 0;

        foreach (var file in csFiles)
        {
            processedFiles++;
            var progressInfo = new { message = $"({processedFiles}/{totalFiles}) {Path.GetFileName(file)}" };
            OutputJson(new { type = "progress", payload = progressInfo });

            try
            {
                var sourceText = await File.ReadAllTextAsync(file);
                var syntaxTree = CSharpSyntaxTree.ParseText(sourceText, path: file);
                foreach (var diagnostic in syntaxTree.GetDiagnostics())
                {
                    OutputDiagnostic(diagnostic, new HashSet<string>());
                }
            }
            catch { /* Ignore file read errors */ }
        }
    }

    private static async Task RunDeepAnalysis(string projectPath)
    {
        try
        {
            if (!MSBuildLocator.IsRegistered)
            {
                var vsInstance = MSBuildLocator.QueryVisualStudioInstances().OrderByDescending(i => i.Version).FirstOrDefault();
                if (vsInstance == null)
                {
                    var errorResult = new { Message = "Error: MSBuild instance not found. Please ensure Visual Studio with the '.NET desktop development' workload is installed.", Severity = "Error" };
                    OutputJson(new { type = "diagnostic", payload = errorResult });
                    return;
                }
                MSBuildLocator.RegisterInstance(vsInstance);
            }
        }
        catch (Exception ex)
        {
            var errorResult = new { Message = $"Error initializing MSBuild: {ex.Message}", Severity = "Error" };
            OutputJson(new { type = "diagnostic", payload = errorResult });
            return;
        }

        using (var workspace = MSBuildWorkspace.Create())
        {
            workspace.WorkspaceFailed += (s, e) => {
                var warningResult = new { Message = $"Workspace Info: {e.Diagnostic.Message}", Severity = "Warning" };
                OutputJson(new { type = "diagnostic", payload = warningResult });
            };

            var slnFiles = Directory.GetFiles(projectPath, "*.sln", SearchOption.AllDirectories);
            var solutionPath = slnFiles.OrderBy(f => f.Length).FirstOrDefault();

            if (solutionPath == null)
            {
                var errorResult = new { Message = "Error: No .sln file found. Please generate project files from Unity Editor (Edit > Preferences > External Tools > Regenerate project files).", Severity = "Error" };
                OutputJson(new { type = "diagnostic", payload = errorResult });
                return;
            }

            var solution = await workspace.OpenSolutionAsync(solutionPath);
            var totalProjects = solution.Projects.Count();
            var processedProjects = 0;

            // --- ▼▼▼ 最重要修正点 ▼▼▼ ---
            // 全てのプロジェクトから、全ての警告抑制設定を事前に収集し、マスターリストを作成
            var masterNoWarnSet = new HashSet<string>();
            foreach (var proj in solution.Projects)
            {
                foreach (var warnId in ParseNoWarnFromCsproj(proj.FilePath))
                {
                    masterNoWarnSet.Add(warnId);
                }
            }
            // --- ▲▲▲ 最重要修正点 ▲▲▲ ---

            foreach (var project in solution.Projects)
            {
                processedProjects++;
                var progressInfo = new { message = $"({processedProjects}/{totalProjects}) Analyzing project: {project.Name}..." };
                OutputJson(new { type = "progress", payload = progressInfo });
                
                var compilation = await project.GetCompilationAsync();
                if (compilation == null) continue;

                foreach (var diagnostic in compilation.GetDiagnostics())
                {
                    // マスターリストを使ってフィルタリング
                    OutputDiagnostic(diagnostic, masterNoWarnSet);
                }
            }
        }
    }

    private static HashSet<string> ParseNoWarnFromCsproj(string? csprojPath)
    {
        var noWarnSet = new HashSet<string>();
        if (string.IsNullOrEmpty(csprojPath) || !File.Exists(csprojPath)) return noWarnSet;
        
        try
        {
            var doc = XDocument.Load(csprojPath);
            XNamespace ns = doc.Root?.GetDefaultNamespace() ?? XNamespace.None;
            var noWarnValues = doc.Descendants(ns + "NoWarn").Select(e => e.Value);
            var allWarns = string.Join(";", noWarnValues)
                                 .Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries)
                                 .Select(s => s.Trim());
            
            foreach(var warn in allWarns)
            {
                noWarnSet.Add(warn.StartsWith("CS") ? warn : "CS" + warn);
            }
        }
        catch { /* XML解析エラーは無視 */ }
        return noWarnSet;
    }

    private static void OutputDiagnostic(Diagnostic diagnostic, ISet<string> noWarnSet)
    {
        if (diagnostic.IsSuppressed || 
            diagnostic.Severity < DiagnosticSeverity.Warning || 
            diagnostic.Location.Kind != LocationKind.SourceFile ||
            noWarnSet.Contains(diagnostic.Id))
        {
            return;
        }
        var location = diagnostic.Location.GetLineSpan();
        var result = new { FilePath = location.Path, Line = location.StartLinePosition.Line, Severity = diagnostic.Severity.ToString(), Id = diagnostic.Id, Message = diagnostic.GetMessage() };
        OutputJson(new { type = "diagnostic", payload = result });
    }

    private static void OutputJson(object data)
    {
        Console.WriteLine(JsonSerializer.Serialize(data));
    }
}