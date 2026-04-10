import * as vscode from 'vscode';
import { TestSuiteResult, TestCaseResult } from '../types';
import { COLORS, EMODJI } from '../config';

/**
 * Webview panel that shows test suite results in a nice report.
 * Opens as a full editor tab.
 */
export class TestResultsPanel {
  private static _panel: vscode.WebviewPanel | undefined;
  public static readonly viewType = 'ws-client.testResults';

  static show(result: TestSuiteResult, extensionUri: vscode.Uri): void {
    const column = vscode.ViewColumn.Beside;

    if (this._panel) {
      this._panel.reveal(column);
    } else {
      this._panel = vscode.window.createWebviewPanel(
        this.viewType,
        `Test Results — ${result.collectionName}`,
        column,
        { enableScripts: true }
      );
      this._panel.onDidDispose(() => { this._panel = undefined; });
    }

    this._panel.title = `Test Results — ${result.collectionName}`;
    this._panel.webview.html = this._buildHtml(result);
  }

  private static _buildHtml(r: TestSuiteResult): string {
    const passRate = r.totalCount > 0
      ? Math.round((r.passedCount / r.totalCount) * 100)
      : 0;

    const rows = r.results.map((res) => this._buildRow(res)).join('');

    const statusColor = r.failedCount === 0 ? COLORS.SUCCESS : COLORS.FAILURE;
    const statusLabel = r.failedCount === 0 ? `${EMODJI.SUCCESS} All Passed` : `${EMODJI.FAILURE} ${r.failedCount} Failed`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Test Results</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      font-family:var(--vscode-font-family);
      color:var(--vscode-editor-foreground);
      background:var(--vscode-editor-background);
      padding:24px;
    }
    h1{font-size:18px;margin-bottom:4px}
    .meta{font-size:12px;opacity:.6;margin-bottom:20px}
    .summary{
      display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap;
    }
    .stat{
      background:var(--vscode-editor-inactiveSelectionBackground);
      border-radius:8px;padding:12px 20px;
      display:flex;flex-direction:column;gap:4px;min-width:110px;
    }
    .stat-val{font-size:28px;font-weight:700;line-height:1}
    .stat-label{font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:.5px}
    .stat-pass .stat-val{color:#4caf50}
    .stat-fail .stat-val{color:#f44336}
    .stat-total .stat-val{color:var(--vscode-editor-foreground)}
    .progress{
      height:6px;background:var(--vscode-editor-inactiveSelectionBackground);
      border-radius:3px;margin-bottom:24px;overflow:hidden;
    }
    .progress-bar{height:100%;border-radius:3px;transition:width .3s;
      background:${statusColor};width:${passRate}%}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{
      text-align:left;padding:8px 10px;font-weight:600;font-size:11px;
      text-transform:uppercase;letter-spacing:.5px;opacity:.6;
      border-bottom:1px solid var(--vscode-input-border);
    }
    td{
      padding:10px 10px;border-bottom:1px solid var(--vscode-input-border);
      vertical-align:top;
    }
    tr:hover td{background:var(--vscode-editor-inactiveSelectionBackground)}
    .badge{
      display:inline-flex;align-items:center;gap:4px;
      font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;
    }
    .badge-pass{background:#4caf5022;color:#4caf50}
    .badge-fail{background:#f4433622;color:#f44336}
    .msg{
      font-family:monospace;font-size:11px;white-space:pre-wrap;
      margin-top:4px;opacity:.75;
    }
    .latency{font-size:11px;opacity:.6}
    .toggle-raw{
      font-size:10px;cursor:pointer;opacity:.5;text-decoration:underline;
      background:none;border:none;color:inherit;margin-top:4px;padding:0;
    }
    .toggle-raw:hover{opacity:1}
    .raw{
      display:none;margin-top:6px;padding:6px 8px;
      background:var(--vscode-input-background);border-radius:4px;
      font-family:monospace;font-size:11px;white-space:pre-wrap;
      word-break:break-all;max-height:160px;overflow:auto;
    }
    .suite-status{
      font-size:16px;font-weight:700;color:${statusColor};margin-bottom:16px;
    }
  </style>
</head>
<body>
  <h1>📋 ${escHtml(r.collectionName)}</h1>
  <div class="meta">
    Run at ${new Date(r.runAt).toLocaleString()} &nbsp;·&nbsp; Duration: ${r.durationMs}ms
  </div>
  <div class="suite-status">${statusLabel}</div>

  <div class="summary">
    <div class="stat stat-total"><span class="stat-val">${r.totalCount}</span><span class="stat-label">Total</span></div>
    <div class="stat stat-pass"><span class="stat-val">${r.passedCount}</span><span class="stat-label">Passed</span></div>
    <div class="stat stat-fail"><span class="stat-val">${r.failedCount}</span><span class="stat-label">Failed</span></div>
    <div class="stat"><span class="stat-val">${passRate}%</span><span class="stat-label">Pass rate</span></div>
  </div>
  <div class="progress"><div class="progress-bar"></div></div>

  <table>
    <thead><tr>
      <th>#</th><th>Test case</th><th>Result</th><th>Latency</th><th>Message</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <script>
    function toggleRaw(id){
      const el=document.getElementById('raw-'+id);
      el.style.display=el.style.display==='block'?'none':'block';
    }
  </script>
</body>
</html>`;
  }

  private static _buildRow(res: TestCaseResult, idx?: number): string {
    const badge = res.passed
      ? '<span class="badge badge-pass">' + EMODJI.SUCCESS + ' PASS</span>'
      : '<span class="badge badge-fail">' + EMODJI.FAILURE + ' FAIL</span>';

    const rawBtn = res.rawResponse
      ? `<button class="toggle-raw" onclick="toggleRaw('${res.testCaseId}')">show raw response</button>
         <pre class="raw" id="raw-${res.testCaseId}">${escHtml(res.rawResponse)}</pre>`
      : '';

    return `<tr>
      <td style="opacity:.4;font-size:11px">${(idx ?? 0) + 1}</td>
      <td>${escHtml(res.testCaseName)}</td>
      <td>${badge}</td>
      <td class="latency">${res.latencyMs}ms</td>
      <td>
        <div class="msg">${escHtml(res.message)}</div>
        ${rawBtn}
      </td>
    </tr>`;
  }
}

// Must be outside class for template usage — inline helper
function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
