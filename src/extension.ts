import * as vscode from 'vscode';
import { MainViewProvider } from './view/MainViewProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new MainViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            MainViewProvider.viewType,
            provider
        )
    );
}

export function deactivate() {}