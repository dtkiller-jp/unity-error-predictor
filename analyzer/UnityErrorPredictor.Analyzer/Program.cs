using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

public class Program
{
    public static async Task Main(string[] args)
    {
        if (args.Length < 1 || !Directory.Exists(args[0]))
        {
            Console.Error.WriteLine("Error: Please provide a valid project directory path.");
            Environment.Exit(1);
        }
        var projectPath = args[0];
        var unityEditorPath = args.Length > 1 ? args[1] : null;

        var csFiles = Directory.GetFiles(projectPath, "*.cs", SearchOption.AllDirectories);
        if (!csFiles.Any())
        {
            var infoResult = new { Message = "Info: No C# files found.", Severity = "Info" };
            Console.WriteLine(JsonSerializer.Serialize(infoResult));
            return;
        }

        var syntaxTrees = new List<SyntaxTree>();
        foreach (var file in csFiles)
        {
            try
            {
                var sourceText = await File.ReadAllTextAsync(file);
                syntaxTrees.Add(CSharpSyntaxTree.ParseText(sourceText, path: file));
            }
            catch (Exception ex)
            {
                var errorResult = new { FilePath = file, Line = 0, Severity = "Error", Message = $"Failed to read file: {ex.Message}" };
                Console.WriteLine(JsonSerializer.Serialize(errorResult));
            }
        }

        var references = FindAllReferences(projectPath, unityEditorPath);

        var compilation = CSharpCompilation.Create("UnityProjectAnalysis")
            .WithOptions(new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary))
            .AddReferences(references)
            .AddSyntaxTrees(syntaxTrees);
        
        var diagnostics = compilation.GetDiagnostics();

        foreach (var diagnostic in diagnostics)
        {
            if (diagnostic.IsSuppressed || diagnostic.Severity < DiagnosticSeverity.Warning || diagnostic.Location.Kind != LocationKind.SourceFile)
            {
                continue;
            }

            var location = diagnostic.Location.GetLineSpan();
            var result = new
            {
                FilePath = location.Path,
                Line = location.StartLinePosition.Line,
                Severity = diagnostic.Severity.ToString(),
                Id = diagnostic.Id,
                Message = diagnostic.GetMessage()
            };
            Console.WriteLine(JsonSerializer.Serialize(result));
        }
    }

    private static List<MetadataReference> FindAllReferences(string projectPath, string? unityEditorPath)
    {
        var references = new List<MetadataReference>();

        if (string.IsNullOrEmpty(unityEditorPath) || !Directory.Exists(unityEditorPath))
        {
            return references; // Unity Editorのパスがなければ何もできない
        }

        // 1. Unity Editorに同梱されている.NET標準ライブラリへの参照を追加
        //    これにより、'Object'の重複定義エラー(CS0433)を回避する
        string monoBleedingEdgePath = Path.Combine(unityEditorPath, "Data", "MonoBleedingEdge", "lib", "mono", "unityjit");
        if (Directory.Exists(monoBleedingEdgePath))
        {
            references.Add(MetadataReference.CreateFromFile(Path.Combine(monoBleedingEdgePath, "mscorlib.dll")));
            references.Add(MetadataReference.CreateFromFile(Path.Combine(monoBleedingEdgePath, "System.dll")));
            references.Add(MetadataReference.CreateFromFile(Path.Combine(monoBleedingEdgePath, "System.Core.dll")));
        }

        // 2. Unityエンジンの主要モジュールへの参照を追加
        string engineModulePath = Path.Combine(unityEditorPath, "Data", "Managed", "UnityEngine");
        if (Directory.Exists(engineModulePath))
        {
            references.Add(MetadataReference.CreateFromFile(Path.Combine(engineModulePath, "UnityEngine.CoreModule.dll")));
        }
        
        // 3. プロジェクトのライブラリフォルダから、コンパイル済みアセンブリ(パッケージ等)をすべて参照
        //    これにより、'UnityEngine.UI'が見つからないエラー(CS0234)を解決する
        //    注意: このフォルダは、Unity Editorでプロジェクトを一度開かないと生成されない
        string scriptAssembliesPath = Path.Combine(projectPath, "Library", "ScriptAssemblies");
        if (Directory.Exists(scriptAssembliesPath))
        {
            var dllFiles = Directory.GetFiles(scriptAssembliesPath, "*.dll");
            foreach (var dllFile in dllFiles)
            {
                references.Add(MetadataReference.CreateFromFile(dllFile));
            }
        }

        return references;
    }
}