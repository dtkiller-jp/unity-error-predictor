(function () {
    const vscode = acquireVsCodeApi();
    
    const dirInput = document.getElementById('directory-input');
    const browseBtn = document.getElementById('browse-btn');
    const startFastBtn = document.getElementById('start-fast-btn');
    const startDeepBtn = document.getElementById('start-deep-btn');
    const stopBtn = document.getElementById('stop-btn');
    const clearBtn = document.getElementById('clear-btn');
    const statusDiv = document.getElementById('status');
    const resultsContainer = document.getElementById('results-container');

    let errorCount = 0;
    let warningCount = 0;

    window.addEventListener('load', () => { vscode.postMessage({ type: 'ready' }); });

    browseBtn.addEventListener('click', () => { vscode.postMessage({ type: 'browseDirectory' }); });
    startFastBtn.addEventListener('click', () => { if (dirInput.value) { vscode.postMessage({ type: 'startPrediction', directory: dirInput.value, mode: 'fast' }); } });
    startDeepBtn.addEventListener('click', () => { if (dirInput.value) { vscode.postMessage({ type: 'startPrediction', directory: dirInput.value, mode: 'deep' }); } });
    stopBtn.addEventListener('click', () => { vscode.postMessage({ type: 'stopPrediction' }); });
    clearBtn.addEventListener('click', () => { vscode.postMessage({ type: 'clearPrediction' }); });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'start':
                resultsContainer.innerHTML = '';
                statusDiv.textContent = 'Analyzing...';
                errorCount = 0;
                warningCount = 0;
                break;
            case 'setDirectory':
                if (dirInput) { dirInput.value = message.value; }
                break;
            case 'setStatus':
                if (message.isComplete) {
                    let summary = `Analysis complete: ${errorCount} errors and ${warningCount} warnings found.`;
                    if (errorCount === 0 && warningCount === 0) { summary = 'Analysis complete: No issues found.'; }
                    statusDiv.textContent = summary;
                } else {
                    statusDiv.textContent = message.value;
                }
                break;
            case 'addResult':
                const result = message.value;
                const item = document.createElement('div');
                item.classList.add('result-item');
                const severity = result.Severity ? result.Severity.toLowerCase() : 'info';
                let icon = 'info';
                if (severity === 'error') { item.classList.add('error'); icon = 'error'; errorCount++; }
                else if (severity === 'warning') { item.classList.add('warning'); icon = 'warning'; warningCount++; }
                else { item.classList.add('info'); }
                let contentHtml = `<div class="codicon codicon-${icon}"></div>`;
                const contentDiv = document.createElement('div');
                contentDiv.classList.add('result-item-content');
                if (result.FilePath && result.FilePath.trim() !== "") {
                    item.dataset.path = result.FilePath;
                    item.dataset.line = result.Line;
                    item.addEventListener('click', (e) => {
                        const target = e.currentTarget;
                        vscode.postMessage({ type: 'openFile', path: target.dataset.path, line: parseInt(target.dataset.line, 10) });
                    });
                    const fileName = result.FilePath.split(/[\\/]/).pop();
                    contentDiv.innerHTML = `<div class="result-message">${result.Message}</div><div class="result-location">${fileName}:${result.Line + 1}</div>`;
                } else {
                    contentDiv.innerHTML = `<div class="result-message">${result.Message}</div>`;
                }
                item.innerHTML = contentHtml;
                item.appendChild(contentDiv);
                resultsContainer.appendChild(item);
                break;
            case 'clearResults':
                resultsContainer.innerHTML = '';
                statusDiv.textContent = 'Ready';
                errorCount = 0;
                warningCount = 0;
                break;
        }
    });
}());