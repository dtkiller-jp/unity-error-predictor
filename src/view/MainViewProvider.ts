import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

export class MainViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'unityErrorPredictorView';
    private _view?: vscode.WebviewView;
    private _analyzerProcess: ChildProcess | null = null;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [ this._extensionUri, vscode.Uri.joinPath(this._extensionUri, 'node_modules') ]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'ready':
                    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
                        this._view?.webview.postMessage({ type: 'setDirectory', value: rootPath });
                    }
                    break;
                case 'browseDirectory':
                    const browseOptions: vscode.OpenDialogOptions = { canSelectMany: false, canSelectFiles: false, canSelectFolders: true, openLabel: 'Select Folder' };
                    const folderUri = await vscode.window.showOpenDialog(browseOptions);
                    if (folderUri && folderUri[0]) { this._view?.webview.postMessage({ type: 'setDirectory', value: folderUri[0].fsPath }); }
                    break;
                case 'startPrediction':
                    await this.startPrediction(data.directory, data.mode);
                    break;
                case 'clearPrediction':
                    this._view?.webview.postMessage({ type: 'clearResults' });
                    break;
                case 'stopPrediction':
                    this.stopPrediction();
                    break;
                case 'openFile':
                    const fileUri = vscode.Uri.file(data.path);
                    const doc = await vscode.workspace.openTextDocument(fileUri);
                    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(data.line, 0, data.line, 0) });
                    break;
            }
        });
    }
    
    private async getAnalyzerPath(): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration('unityErrorPredictor');
        let analyzerPath = config.get<string>('analyzer.path');
        if (!analyzerPath || !fs.existsSync(analyzerPath)) {
            vscode.window.showInformationMessage('Initial Setup: Please specify the analyzer executable (UnityErrorPredictor.Analyzer.exe).');
            const options: vscode.OpenDialogOptions = { canSelectMany: false, openLabel: 'Select Analyzer Executable', filters: { 'Executable': ['exe'] } };
            const fileUri = await vscode.window.showOpenDialog(options);
            if (fileUri && fileUri[0]) {
                analyzerPath = fileUri[0].fsPath;
                await config.update('analyzer.path', analyzerPath, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Path saved: ${analyzerPath}`);
            } else { return undefined; }
        }
        return analyzerPath;
    }

    private async startPrediction(directory: string, mode: 'fast' | 'deep') {
        if (this._analyzerProcess) {
            vscode.window.showWarningMessage('A prediction process is already running.');
            return;
        }
        const analyzerPath = await this.getAnalyzerPath();
        if (!analyzerPath) return;
        if (!directory || !fs.existsSync(directory)) {
            this._view?.webview.postMessage({ type: 'addResult', value: { Message: `Error: Directory not found - ${directory}`, Severity: 'Error' }});
            return;
        }
        this._view?.webview.postMessage({ type: 'start' });
        const spawnArgs = [directory, mode];
        this._analyzerProcess = spawn(analyzerPath, spawnArgs);
        this._analyzerProcess.stdout?.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach((line: string) => {
                if (line.trim()) {
                    try {
                        const message = JSON.parse(line);
                        if (message.type === 'progress') {
                            this._view?.webview.postMessage({ type: 'setStatus', value: message.payload.message, isComplete: false });
                        } else if (message.type === 'diagnostic') {
                            this._view?.webview.postMessage({ type: 'addResult', value: message.payload });
                        }
                    } catch (e) { console.error("Failed to parse analyzer output:", line); }
                }
            });
        });
        this._analyzerProcess.stderr?.on('data', (data) => {
            console.error(`Analyzer stderr: ${data}`);
            this._view?.webview.postMessage({ type: 'addResult', value: { Message: `${data}`, Severity: 'Error' }});
        });
        this._analyzerProcess.on('close', (code) => {
            this._view?.webview.postMessage({ type: 'setStatus', value: ``, isComplete: true });
            this._analyzerProcess = null;
        });
    }
    
    private stopPrediction() {
        if (this._analyzerProcess) {
            this._analyzerProcess.kill();
            this._analyzerProcess = null;
            this._view?.webview.postMessage({ type: 'setStatus', value: 'Analysis stopped' });
        }
    }

    // --- ▼▼▼ ここが最後の、そして最も重要な修正点です ▼▼▼ ---
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // HTMLファイルへのパスを、コンパイル後の 'out' ディレクトリに変更
        const htmlPath = path.join(this._extensionUri.fsPath, 'out', 'view', 'main.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // URIを生成するヘルパー関数
        const getUri = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, ...p));

        // 全てのリソースへのURIを、コンパイル後の 'out' ディレクトリ基準で生成
        const scriptUri = getUri('out', 'view', 'main.js');
        const codiconsUri = getUri('node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
        const toolkitUri = getUri('node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.js');

        // HTML内のプレースホルダーを置換
        return htmlContent
            .replace('{{scriptUri}}', scriptUri.toString())
            .replace('{{codiconsUri}}', codiconsUri.toString())
            .replace('{{toolkitUri}}', toolkitUri.toString());
    }
    // --- ▲▲▲ ここまでが最後の、そして最も重要な修正点です ▲▲▲ ---
}