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
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'startPrediction':
                    this.startPrediction(data.directory);
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

    private startPrediction(directory: string) {
        if (this._analyzerProcess) {
            vscode.window.showWarningMessage('A prediction process is already running.');
            return;
        }

        // --- ここでC#の解析エンジンを起動 ---
        // 実際にはビルドしたexeのパスを指定する
        const analyzerPath = path.join(this._extensionUri.fsPath, 'analyzer', 'bin', 'Debug', 'net8.0', 'UnityErrorPredictor.Analyzer.exe');
        
        if (!fs.existsSync(analyzerPath)) {
            vscode.window.showErrorMessage(`Analyzer not found: ${analyzerPath}`);
            return;
        }
        if (!fs.existsSync(directory)) {
            this._view?.webview.postMessage({ type: 'addResult', value: { message: `Error: Directory not found - ${directory}` }});
            return;
        }

        this._view?.webview.postMessage({ type: 'setStatus', value: '解析中...' });

        this._analyzerProcess = spawn(analyzerPath, [directory]);

        this._analyzerProcess.stdout?.on('data', (data) => {
            // 解析エンジンからJSON形式で結果が送られてくる
            const lines = data.toString().split('\n');
            lines.forEach((line: string) => {
                if (line.trim()) {
                    try {
                        const result = JSON.parse(line);
                        this._view?.webview.postMessage({ type: 'addResult', value: result });
                    } catch (e) {
                        console.error("Failed to parse analyzer output:", line);
                    }
                }
            });
        });

        this._analyzerProcess.stderr?.on('data', (data) => {
            console.error(`Analyzer stderr: ${data}`);
            this._view?.webview.postMessage({ type: 'addResult', value: { message: `Analyzer Error: ${data}` }});
        });

        this._analyzerProcess.on('close', (code) => {
            this._view?.webview.postMessage({ type: 'setStatus', value: `解析完了 (終了コード: ${code})` });
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
        // HTMLは別ファイルから読み込むのがベター
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'view', 'main.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        // スクリプトとCSSのURIを置換
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'view', 'main.js'));
        // const styleUri = ...
        
        htmlContent = htmlContent.replace('{{scriptUri}}', scriptUri.toString());
        return htmlContent;
    }
}