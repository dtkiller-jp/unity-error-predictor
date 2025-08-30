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
            localResourceRoots: [
                this._extensionUri,
                vscode.Uri.joinPath(this._extensionUri, 'node_modules')
            ]
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
                    const browseOptions: vscode.OpenDialogOptions = {
                        canSelectMany: false,
                        canSelectFiles: false,
                        canSelectFolders: true,
                        openLabel: 'Select Folder'
                    };
                    const folderUri = await vscode.window.showOpenDialog(browseOptions);
                    if (folderUri && folderUri[0]) {
                        this._view?.webview.postMessage({ type: 'setDirectory', value: folderUri[0].fsPath });
                    }
                    break;
                case 'startPrediction':
                    await this.startPrediction(data.directory);
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
                    await vscode.window.showTextDocument(doc, {
                        selection: new vscode.Range(data.line, 0, data.line, 0)
                    });
                    break;
            }
        });
    }
    
    private async getPathSetting(configKey: string, dialogTitle: string, isFolder: boolean): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration('unityErrorPredictor');
        let settingPath = config.get<string>(configKey);

        if (!settingPath || (isFolder ? !fs.existsSync(settingPath) : !fs.existsSync(settingPath))) {
            vscode.window.showInformationMessage(dialogTitle);
            
            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                canSelectFiles: !isFolder,
                canSelectFolders: isFolder,
                openLabel: 'Select'
            };
            if (!isFolder) {
                options.filters = { 'Executable': ['exe'] };
            }

            const fileUri = await vscode.window.showOpenDialog(options);
            if (fileUri && fileUri[0]) {
                settingPath = fileUri[0].fsPath;
                await config.update(configKey, settingPath, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`パスを保存しました: ${settingPath}`);
            } else {
                return undefined;
            }
        }
        return settingPath;
    }

    private async startPrediction(directory: string) {
        if (this._analyzerProcess) {
            vscode.window.showWarningMessage('A prediction process is already running.');
            return;
        }

        const analyzerPath = await this.getPathSetting('analyzer.path', '初回設定：解析エンジンの実行ファイルを指定してください。', false);
        if (!analyzerPath) return;

        const unityEditorPath = await this.getPathSetting('unityEditorPath', '初回設定：Unity Editorのインストールフォルダを指定してください。', true);
        if (!unityEditorPath) return;

        if (!directory || !fs.existsSync(directory)) {
            this._view?.webview.postMessage({ type: 'addResult', value: { Message: `Error: Directory not found - ${directory}`, Severity: 'Error' }});
            return;
        }

        this._view?.webview.postMessage({ type: 'start' });

        const spawnArgs = [directory, unityEditorPath];
        this._analyzerProcess = spawn(analyzerPath, spawnArgs);

        this._analyzerProcess.stdout?.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach((line: string) => {
                if (line.trim()) {
                    try {
                        const result = JSON.parse(line);
                        this._view?.webview.postMessage({ type: 'addResult', value: result });
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
            this._view?.webview.postMessage({ type: 'setStatus', value: '解析を停止しました' });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'view', 'main.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'view', 'main.js'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
        const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.js'));

        htmlContent = htmlContent.replace('{{scriptUri}}', scriptUri.toString());
        htmlContent = htmlContent.replace('{{codiconsUri}}', codiconsUri.toString());
        htmlContent = htmlContent.replace('{{toolkitUri}}', toolkitUri.toString());
        
        return htmlContent;
    }
}