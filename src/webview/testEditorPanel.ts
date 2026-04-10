import * as vscode from 'vscode';
import { CollectionsManager } from '../manage/collectionsManager';
import { CollectionsProvider } from '../collectionsProvider';
import { Collection, TestCase, TestAssertionType } from '../types';
import { COLORS, EMODJI } from '../config';

/**
 * Full-screen webview editor for managing test cases of one collection.
 * Opens as an editor tab: "Tests — <CollectionName>"
 */
export class TestEditorPanel {
  private static _panels = new Map<string, TestEditorPanel>();

  private readonly _panel: vscode.WebviewPanel;
  private _collection: Collection;

  private constructor(
    private collectionId: string,
    private readonly manager: CollectionsManager,
    private readonly provider: CollectionsProvider,
    private readonly extensionUri: vscode.Uri,
  ) {
    this._collection = manager.getCollection(collectionId)!;

    this._panel = vscode.window.createWebviewPanel(
      'ws-client.testEditor',
      `Tests — ${this._collection.name}`,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this._panel.onDidDispose(() => {
      TestEditorPanel._panels.delete(collectionId);
    });

    this._panel.webview.onDidReceiveMessage(this._handleMessage.bind(this));
    this._render();
  }

  static open(
    collectionId: string,
    manager: CollectionsManager,
    provider: CollectionsProvider,
    extensionUri: vscode.Uri,
  ): void {
    const existing = this._panels.get(collectionId);
    if (existing) {
      existing._panel.reveal();
      return;
    }
    const instance = new TestEditorPanel(collectionId, manager, provider, extensionUri);
    this._panels.set(collectionId, instance);
  }

  // ─── Message bus ──────────────────────────────────────────────────────────

  private async _handleMessage(msg: any) {
    switch (msg.type) {
      case 'addTestCase':
        await this._addTestCase(msg.data);
        break;
      case 'updateTestCase':
        await this._updateTestCase(msg.id, msg.data);
        break;
      case 'deleteTestCase':
        await this._deleteTestCase(msg.id);
        break;
      case 'duplicateTestCase':
        await this._duplicateTestCase(msg.id);
        break;
      case 'toggleEnabled':
        await this.manager.updateTestCase(this.collectionId, msg.id, { enabled: msg.enabled });
        this._reload();
        break;
      case 'reorder':
        await this._reorder(msg.fromIdx, msg.toIdx);
        break;
    }
  }

  private async _addTestCase(data: Omit<TestCase, 'id' | 'createdAt' | 'updatedAt'>) {
    await this.manager.addTestCase(this.collectionId, data);
    this.provider.refresh();
    this._reload();
  }

  private async _updateTestCase(id: string, data: Partial<Omit<TestCase, 'id' | 'createdAt' | 'updatedAt'>>) {
    await this.manager.updateTestCase(this.collectionId, id, data);
    this.provider.refresh();
    this._reload();
  }

  private async _deleteTestCase(id: string) {
    const answer = await vscode.window.showWarningMessage('Delete this test case?', { modal: true }, 'Delete');
    if (answer !== 'Delete') { return; }
    await this.manager.deleteTestCase(this.collectionId, id);
    this.provider.refresh();
    this._reload();
  }

  private async _duplicateTestCase(id: string) {
    await this.manager.duplicateTestCase(this.collectionId, id);
    this.provider.refresh();
    this._reload();
  }

  private async _reorder(fromIdx: number, toIdx: number) {
    const collections = this.manager.getCollections();
    const col = collections.find((c) => c.id === this.collectionId);
    if (!col) { return; }
    const [item] = col.testCases.splice(fromIdx, 1);
    col.testCases.splice(toIdx, 0, item);
    // direct save via internal access — acceptable since we own the data
    await (this.manager as any).save(collections);
    this._reload();
  }

  private _reload() {
    this._collection = this.manager.getCollection(this.collectionId)!;
    this._render();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  private _render() {
    this._panel.webview.html = buildHtml(this._collection);
  }
}

// ─── HTML builder (kept outside class to reduce nesting) ──────────────────────

function buildHtml(col: Collection): string {
  const requestOptions = col.requests
    .map((r) => `<option value="${esc(r.id)}">${esc(r.name)} — ${esc(r.url)}</option>`)
    .join('');

  const testCaseRows = col.testCases.length === 0
    ? `<div class="empty">No test cases yet. Click <strong>+ New Test Case</strong> to add one.</div>`
    : col.testCases.map((tc, i) => buildTestCaseCard(tc, i, col)).join('');

  const passed = col.lastTestResult?.passedCount ?? null;
  const total  = col.lastTestResult?.totalCount  ?? null;
  const badge  = passed !== null
    ? `<span class="run-badge ${passed === total ? 'pass' : 'fail'}">${passed}/${total} passed</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Tests</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      font-family:var(--vscode-font-family);
      color:var(--vscode-editor-foreground);
      background:var(--vscode-editor-background);
      padding:0;
    }
    .toolbar{
      display:flex;align-items:center;gap:10px;padding:12px 20px;
      background:var(--vscode-editor-inactiveSelectionBackground);
      border-bottom:1px solid var(--vscode-input-border);
      position:sticky;top:0;z-index:10;
    }
    .toolbar h1{font-size:15px;font-weight:600;flex:1}
    .run-badge{
      font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;
    }
    .run-badge.pass{background:#4caf5022;color:#4caf50}
    .run-badge.fail{background:#f4433622;color:#f44336}

    button{
      background:var(--vscode-button-background);
      color:var(--vscode-button-foreground);
      border:none;padding:6px 14px;border-radius:4px;
      cursor:pointer;font-size:12px;font-weight:500;white-space:nowrap;
    }
    button:hover{background:var(--vscode-button-hoverBackground)}
    button.secondary{
      background:var(--vscode-button-secondaryBackground);
      color:var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
    button.danger{background:#c0392b22;color:#e74c3c;border:1px solid #e74c3c33}
    button.danger:hover{background:#e74c3c33}
    button.icon-btn{
      background:transparent;padding:4px 6px;font-size:14px;
      border:none;opacity:.5;color:inherit;
    }
    button.icon-btn:hover{opacity:1;background:var(--vscode-editor-inactiveSelectionBackground)}

    .content{padding:20px;display:flex;flex-direction:column;gap:12px}
    .empty{
      text-align:center;padding:48px;opacity:.5;font-size:13px;
      border:2px dashed var(--vscode-input-border);border-radius:8px;
    }

    /* ── Test case card ── */
    .tc-card{
      border:1px solid var(--vscode-input-border);
      border-radius:8px;overflow:hidden;
    }
    .tc-card.disabled{opacity:.55}

    .tc-header{
      display:flex;align-items:center;gap:8px;
      padding:10px 12px;
      background:var(--vscode-editor-inactiveSelectionBackground);
      cursor:pointer;user-select:none;
    }
    .tc-header:hover{filter:brightness(1.05)}
    .tc-chevron{font-size:10px;transition:transform .15s;flex-shrink:0}
    .tc-chevron.open{transform:rotate(90deg)}
    .tc-status{font-size:14px;flex-shrink:0}
    .tc-name{font-weight:600;font-size:13px;flex:1;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tc-assertion-badge{
      font-size:10px;padding:1px 7px;border-radius:8px;
      background:var(--vscode-input-background);opacity:.8;flex-shrink:0;
    }
    .tc-actions{display:flex;gap:2px;flex-shrink:0}

    .tc-body{display:none;padding:14px;border-top:1px solid var(--vscode-input-border)}
    .tc-body.open{display:block}

    /* ── Form ── */
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
    .form-grid.full{grid-template-columns:1fr}
    .field{display:flex;flex-direction:column;gap:4px}
    label{font-size:11px;opacity:.65;text-transform:uppercase;letter-spacing:.4px}
    input,select,textarea{
      background:var(--vscode-input-background);
      color:var(--vscode-input-foreground);
      border:1px solid var(--vscode-input-border);
      padding:7px 9px;border-radius:4px;
      font-family:var(--vscode-font-family);font-size:12px;width:100%;
    }
    input:focus,select:focus,textarea:focus{
      outline:1px solid var(--vscode-focusBorder);
    }
    textarea{resize:vertical;min-height:80px;font-family:monospace}
    .field-hint{font-size:10px;opacity:.5;margin-top:2px}
    .form-actions{display:flex;gap:8px;margin-top:12px}

    /* ── New test case form ── */
    .new-form{
      border:1px dashed var(--vscode-focusBorder);
      border-radius:8px;padding:16px;
    }
    .new-form h3{font-size:13px;margin-bottom:12px;opacity:.8}
    .hidden{display:none!important}
  </style>
</head>
<body>
<div class="toolbar">
  <h1>🧪 Tests — ${esc(col.name)}</h1>
  ${badge}
  <button class="secondary" onclick="showNewForm()">+ New Test Case</button>
</div>

<div class="content">

  <!-- ── New test case form ── -->
  <div class="new-form hidden" id="newForm">
    <h3>New Test Case</h3>
    ${buildForm('new', null, col.requests)}
  </div>

  <!-- ── Existing test cases ── -->
  <div id="testCases">${testCaseRows}</div>

</div>
<script>
const vscode = acquireVsCodeApi();

// ─── New form ────────────────────────────────────────────────────────────────

function showNewForm(){
  document.getElementById('newForm').classList.remove('hidden');
  document.getElementById('newForm').scrollIntoView({behavior:'smooth'});
}
function hideNewForm(){
  document.getElementById('newForm').classList.add('hidden');
  document.getElementById('newForm').reset?.();
}

function submitNew(){
  const f = document.getElementById('form-new');
  const data = collectFormData(f);
  if(!data.name){alert('Name is required');return;}
  if(!data.requestId){alert('Select a linked request');return;}
  vscode.postMessage({type:'addTestCase', data});
}

// ─── Expand / collapse ───────────────────────────────────────────────────────

function toggleCard(id){
  const body = document.getElementById('body-'+id);
  const chevron = document.getElementById('chevron-'+id);
  const open = body.classList.toggle('open');
  chevron.classList.toggle('open', open);
}

// ─── Edit & save ─────────────────────────────────────────────────────────────

function saveEdit(id){
  const f = document.getElementById('form-'+id);
  const data = collectFormData(f);
  if(!data.name){alert('Name is required');return;}
  vscode.postMessage({type:'updateTestCase', id, data});
}

function deleteTC(id){
  vscode.postMessage({type:'deleteTestCase', id});
}

function duplicateTC(id){
  vscode.postMessage({type:'duplicateTestCase', id});
}

function toggleEnabled(id, checkbox){
  vscode.postMessage({type:'toggleEnabled', id, enabled: checkbox.checked});
}

// ─── Assertion type → show/hide fields ───────────────────────────────────────

function onAssertionChange(formId){
  const f = document.getElementById('form-'+formId);
  const val = f.querySelector('[name=assertion]').value;
  const show = (sel, v) => {
    const el = f.querySelector(sel);
    if(el) el.closest('.field').style.display = v ? 'flex' : 'none';
  };
  show('[name=expectedValue]',
    ['response_contains','response_equals','json_field_equals','json_schema_valid'].includes(val));
  show('[name=jsonPath]',
    ['json_field_equals','json_field_exists'].includes(val));
  show('[name=latencyMs]',  val==='latency_below');
  show('[name=script]',     val==='custom_script');
}

// ─── Collect form data ────────────────────────────────────────────────────────

function collectFormData(form){
  const get = name => form.querySelector('[name='+name+']')?.value ?? '';
  return {
    name:          get('name').trim(),
    description:   get('description').trim() || undefined,
    enabled:       form.querySelector('[name=enabled]')?.checked ?? true,
    requestId:     get('requestId'),
    assertion:     get('assertion'),
    expectedValue: get('expectedValue').trim() || undefined,
    jsonPath:      get('jsonPath').trim() || undefined,
    latencyMs:     get('latencyMs') ? Number(get('latencyMs')) : undefined,
    script:        get('script').trim() || undefined,
  };
}

// ─── Init: trigger assertion visibility on all existing forms ────────────────

document.querySelectorAll('[name=assertion]').forEach(el => {
  onAssertionChange(el.closest('form').id.replace('form-',''));
});
</script>
</body>
</html>`;
}

function buildTestCaseCard(tc: TestCase, idx: number, col: Collection): string {
  const lastResult = col.lastTestResult?.results.find((r) => r.testCaseId === tc.id);
  const statusIcon = lastResult == null ? EMODJI.DISABLE : lastResult.passed ? EMODJI.SUCCESS : EMODJI.FAILURE;
  const disabledClass = tc.enabled ? '' : ' disabled';
  const assertionLabel = ASSERTION_LABELS[tc.assertion] ?? tc.assertion;

  return `
<div class="tc-card${disabledClass}" id="card-${esc(tc.id)}">
  <div class="tc-header" onclick="toggleCard('${esc(tc.id)}')">
    <span class="tc-chevron" id="chevron-${esc(tc.id)}">▶</span>
    <span class="tc-status">${statusIcon}</span>
    <span class="tc-name">${esc(tc.name)}</span>
    <span class="tc-assertion-badge">${esc(assertionLabel)}</span>
    <div class="tc-actions" onclick="event.stopPropagation()">
      <input type="checkbox" title="Enable/disable" ${tc.enabled ? 'checked' : ''}
             onchange="toggleEnabled('${esc(tc.id)}',this)" style="cursor:pointer">
      <button class="icon-btn" title="Duplicate" onclick="duplicateTC('${esc(tc.id)}')">⎘</button>
      <button class="icon-btn danger" title="Delete" onclick="deleteTC('${esc(tc.id)}')">🗑</button>
    </div>
  </div>
  <div class="tc-body" id="body-${esc(tc.id)}">
    ${buildForm(tc.id, tc, col.requests)}
    ${lastResult ? buildLastResult(lastResult) : ''}
  </div>
</div>`;
}

function buildForm(formId: string, tc: TestCase | null, requests: { id: string; name: string; url: string }[]): string {
  const v = (key: keyof TestCase) => tc ? esc(String(tc[key] ?? '')) : '';
  const checked = (key: keyof TestCase, def = true) =>
    (tc ? (tc[key] as boolean) : def) ? 'checked' : '';

  const requestOptions = requests
    .map((r) => `<option value="${esc(r.id)}" ${tc?.requestId === r.id ? 'selected' : ''}>${esc(r.name)} — ${esc(r.url)}</option>`)
    .join('');

  const assertionOptions = Object.entries(ASSERTION_LABELS)
    .map(([val, label]) => `<option value="${val}" ${tc?.assertion === val ? 'selected' : ''}>${label}</option>`)
    .join('');

  return `
<form id="form-${formId}" onsubmit="return false">
  <div class="form-grid">
    <div class="field">
      <label>Name *</label>
      <input name="name" value="${v('name')}" placeholder="e.g. Status is OK" required>
    </div>
    <div class="field">
      <label>Description</label>
      <input name="description" value="${v('description')}" placeholder="Optional">
    </div>
  </div>

  <div class="form-grid" style="margin-top:10px">
    <div class="field">
      <label>Linked Request *</label>
      <select name="requestId" onchange="">
        <option value="">— select request —</option>
        ${requestOptions}
      </select>
    </div>
    <div class="field">
      <label>Assertion type</label>
      <select name="assertion" onchange="onAssertionChange('${formId}')">
        ${assertionOptions}
      </select>
    </div>
  </div>

  <div class="form-grid" style="margin-top:10px">
    <div class="field" id="">
      <label>Expected value</label>
      <input name="expectedValue" value="${v('expectedValue')}" placeholder='e.g. "ok" or {"status":200}'>
      <span class="field-hint">For JSON schema: paste a schema object</span>
    </div>
    <div class="field">
      <label>JSON path</label>
      <input name="jsonPath" value="${v('jsonPath')}" placeholder='e.g. data.status or items[0].id'>
      <span class="field-hint">Dot-notation, supports array index [N]</span>
    </div>
  </div>

  <div class="form-grid" style="margin-top:10px">
    <div class="field">
      <label>Latency threshold (ms)</label>
      <input name="latencyMs" type="number" min="1" value="${v('latencyMs')}" placeholder="e.g. 500">
    </div>
    <div class="field" style="display:none"><!-- spacer --></div>
  </div>

  <div class="form-grid full" style="margin-top:10px">
    <div class="field">
      <label>Custom script</label>
      <textarea name="script" placeholder="// response, latency, parsed are available
// call pass() or fail('reason')
if (parsed?.status === 'ok') {
  pass('Status is ok');
} else {
  fail('Expected status ok, got: ' + parsed?.status);
}">${v('script')}</textarea>
      <span class="field-hint">Variables: <code>response</code> (string), <code>parsed</code> (JSON or null), <code>latency</code> (ms)</span>
    </div>
  </div>

  <div class="form-actions">
    ${tc
      ? `<button onclick="saveEdit('${formId}')">💾 Save</button>
         <button class="secondary" onclick="toggleCard('${formId}')">Cancel</button>`
      : `<button onclick="submitNew()">+ Add Test Case</button>
         <button class="secondary" onclick="hideNewForm()">Cancel</button>`
    }
  </div>
</form>`;
}

function buildLastResult(r: import('../types').TestCaseResult): string {
  const icon  = r.passed ? EMODJI.SUCCESS : EMODJI.FAILURE;
  const color = r.passed ? COLORS.SUCCESS : COLORS.FAILURE;
  return `
<div style="margin-top:12px;padding:10px;border-radius:6px;
  background:var(--vscode-input-background);font-size:11px;">
  <div style="font-weight:600;color:${color};margin-bottom:4px">
    ${icon} Last run · ${new Date(r.runAt).toLocaleString()} · ${r.latencyMs}ms
  </div>
  <div style="opacity:.8;white-space:pre-wrap;font-family:monospace">${esc(r.message)}</div>
</div>`;
}

const ASSERTION_LABELS: Record<TestAssertionType, string> = {
  response_contains:   'Response contains',
  response_equals:     'Response equals',
  json_field_equals:   'JSON field equals',
  json_field_exists:   'JSON field exists',
  json_schema_valid:   'JSON schema valid',
  latency_below:       'Latency below',
  connection_success:  'Connection success',
  custom_script:       'Custom script',
};

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
