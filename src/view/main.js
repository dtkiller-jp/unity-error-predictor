(function () {
    const vscode = acquireVsCodeApi();

    const startBtn = document.getElementById('start-btn');
    const clearBtn = document.getElementById('clear-btn');
    const stopBtn = document.getElementById('stop-btn');
    const dirInput = document.getElementById('directory-input');
    const resultsList = document.getElementById('results-list');
    const statusDiv = document.getElementById('status');

    startBtn.addEventListener('click', () => {
        vscode.postMessage({
            type: 'startPrediction',
            directory: dirInput.value
        });
    });

    clearBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'clearPrediction' });
    });

    stopBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'stopPrediction' });
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'setStatus':
                statusDiv.textContent = message.value;
                break;
            case 'addResult':
                const li = document.createElement('li');
                const result = message.value;
                // ファイルパス、行番号、メッセージを持つオブジェクトを想定
                if (result.filePath) {
                    const link = document.createElement('a');
                    link.href = '#';
                    link.textContent = `${result.filePath}:${result.line + 1} - ${result.severity}: ${result.message}`;
                    link.dataset.path = result.filePath;
                    link.dataset.line = result.line;
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        vscode.postMessage({
                            type: 'openFile',
                            path: e.target.dataset.path,
                            line: parseInt(e.target.dataset.line, 10)
                        });
                    });
                    li.appendChild(link);
                } else {
                    li.textContent = result.message; // エラーメッセージなど
                }
                resultsList.appendChild(li);
                break;
            case 'clearResults':
                resultsList.innerHTML = '';
                statusDiv.textContent = '待機中';
                break;
        }
    });
}());