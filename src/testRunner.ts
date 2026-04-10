import * as vscode from 'vscode';
import WebSocket from 'ws';
import {
  Collection, TestCase, TestCaseResult, TestSuiteResult,
} from './types';

const TIMEOUT_MS = 10_000; // max wait for a WS response

// ─── JSON-path resolver (dot-notation, no external deps) ──────────────────────

function resolvePath(obj: any, path: string): { found: boolean; value: any } {
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) { return { found: false, value: undefined }; }
    // support array index: items[0]
    const arrMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrMatch) {
      cur = cur[arrMatch[1]];
      if (!Array.isArray(cur)) { return { found: false, value: undefined }; }
      cur = cur[Number(arrMatch[2])];
    } else {
      cur = cur[part];
    }
  }
  return { found: cur !== undefined, value: cur };
}

// ─── Custom script runner ─────────────────────────────────────────────────────

function runCustomScript(
  script: string,
  response: string,
  latency: number
): { passed: boolean; message: string } {
  let passed = false;
  let message = 'Script did not call pass() or fail()';

  const api = {
    pass: (msg?: string) => { passed = true;  message = msg ?? 'Passed'; },
    fail: (msg?: string) => { passed = false; message = msg ?? 'Failed'; },
    response,
    latency,
    parsed: (() => { try { return JSON.parse(response); } catch { return null; } })(),
  };

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'response', 'latency', 'parsed', 'pass', 'fail',
      script
    );
    fn(api.response, api.latency, api.parsed, api.pass, api.fail);
  } catch (e: any) {
    passed = false;
    message = `Script error: ${e?.message ?? String(e)}`;
  }

  return { passed, message };
}

// ─── Single test-case evaluator ───────────────────────────────────────────────

function evaluate(
  tc: TestCase,
  response: string,
  latency: number,
  connectionError?: string
): { passed: boolean; message: string } {
  if (connectionError && tc.assertion !== 'connection_success') {
    return { passed: false, message: `Connection error: ${connectionError}` };
  }

  let parsed: any = null;
  try { parsed = JSON.parse(response); } catch { /* ok */ }

  switch (tc.assertion) {
    case 'connection_success':
      return connectionError
        ? { passed: false, message: `Connection failed: ${connectionError}` }
        : { passed: true,  message: 'Connection established successfully' };

    case 'response_contains':
      if (!tc.expectedValue) { return { passed: false, message: 'expectedValue not set' }; }
      return response.includes(tc.expectedValue)
        ? { passed: true,  message: `Response contains "${tc.expectedValue}"` }
        : { passed: false, message: `Response does not contain "${tc.expectedValue}"` };

    case 'response_equals':
      if (!tc.expectedValue) { return { passed: false, message: 'expectedValue not set' }; }
      return response.trim() === tc.expectedValue.trim()
        ? { passed: true,  message: 'Response matches expected value' }
        : { passed: false, message: `Expected:\n${tc.expectedValue}\n\nGot:\n${response}` };

    case 'json_field_equals': {
      if (!tc.jsonPath)       { return { passed: false, message: 'jsonPath not set' }; }
      if (!tc.expectedValue)  { return { passed: false, message: 'expectedValue not set' }; }
      if (parsed === null)    { return { passed: false, message: 'Response is not valid JSON' }; }
      const { found, value } = resolvePath(parsed, tc.jsonPath);
      if (!found)             { return { passed: false, message: `Path "${tc.jsonPath}" not found in response` }; }
      const actual = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return actual === tc.expectedValue
        ? { passed: true,  message: `${tc.jsonPath} === "${tc.expectedValue}"` }
        : { passed: false, message: `${tc.jsonPath}: expected "${tc.expectedValue}", got "${actual}"` };
    }

    case 'json_field_exists': {
      if (!tc.jsonPath) { return { passed: false, message: 'jsonPath not set' }; }
      if (parsed === null) { return { passed: false, message: 'Response is not valid JSON' }; }
      const { found } = resolvePath(parsed, tc.jsonPath);
      return found
        ? { passed: true,  message: `Field "${tc.jsonPath}" exists` }
        : { passed: false, message: `Field "${tc.jsonPath}" not found` };
    }

    case 'json_schema_valid': {
      if (!tc.expectedValue) { return { passed: false, message: 'JSON schema not set' }; }
      if (parsed === null)   { return { passed: false, message: 'Response is not valid JSON' }; }
      try {
        const schema = JSON.parse(tc.expectedValue);
        const issues = validateSchema(parsed, schema, '');
        return issues.length === 0
          ? { passed: true,  message: 'Response matches schema' }
          : { passed: false, message: `Schema violations:\n${issues.join('\n')}` };
      } catch {
        return { passed: false, message: 'Schema is not valid JSON' };
      }
    }

    case 'latency_below':
      if (!tc.latencyMs) { return { passed: false, message: 'latencyMs not set' }; }
      return latency <= tc.latencyMs
        ? { passed: true,  message: `Latency ${latency}ms ≤ ${tc.latencyMs}ms` }
        : { passed: false, message: `Latency ${latency}ms > threshold ${tc.latencyMs}ms` };

    case 'custom_script':
      if (!tc.script) { return { passed: false, message: 'Script is empty' }; }
      return runCustomScript(tc.script, response, latency);

    default:
      return { passed: false, message: `Unknown assertion type: ${tc.assertion}` };
  }
}

/** Minimal structural JSON schema validator (type + required + properties) */
function validateSchema(data: any, schema: any, path: string): string[] {
  const issues: string[] = [];
  const label = path || 'root';

  if (schema.type) {
    const actual = Array.isArray(data) ? 'array' : typeof data;
    if (actual !== schema.type) {
      issues.push(`${label}: expected type "${schema.type}", got "${actual}"`);
      return issues; // no point checking deeper
    }
  }

  if (schema.required && Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (data == null || !(key in data)) {
        issues.push(`${label}: required field "${key}" missing`);
      }
    }
  }

  if (schema.properties && typeof data === 'object' && data !== null) {
    for (const [key, subSchema] of Object.entries<any>(schema.properties)) {
      if (key in data) {
        issues.push(...validateSchema(data[key], subSchema, `${label}.${key}`));
      }
    }
  }

  return issues;
}

// ─── WS connector ─────────────────────────────────────────────────────────────

function connectAndSend(
  url: string,
  message: string,
  timeoutMs = TIMEOUT_MS
): Promise<{ response: string; latency: number }> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    let sendAt: number;
    const timer = setTimeout(() => {
      ws?.terminate();
      reject(new Error(`Timeout: no response within ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      ws = new WebSocket(url);
    } catch (e: any) {
      clearTimeout(timer);
      reject(e);
      return;
    }

    ws.on('open', () => {
      sendAt = Date.now();
      ws.send(message);
    });

    ws.on('message', (data) => {
      clearTimeout(timer);
      const latency = Date.now() - sendAt;
      ws.close();
      resolve({ response: String(data), latency });
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ─── Public runner ────────────────────────────────────────────────────────────

export async function runTestSuite(
  collection: Collection,
  onProgress?: (done: number, total: number, name: string) => void
): Promise<TestSuiteResult> {
  const suiteStart = Date.now();
  const results: TestCaseResult[] = [];

  const enabled = collection.testCases.filter((tc) => tc.enabled);

  for (let i = 0; i < enabled.length; i++) {
    const tc = enabled[i];
    onProgress?.(i, enabled.length, tc.name);

    const req = collection.requests.find((r) => r.id === tc.requestId);
    if (!req) {
      results.push({
        testCaseId: tc.id,
        testCaseName: tc.name,
        passed: false,
        message: `Linked request not found (id: ${tc.requestId})`,
        latencyMs: 0,
        rawResponse: '',
        runAt: Date.now(),
      });
      continue;
    }

    let response = '';
    let latency = 0;
    let connectionError: string | undefined;

    if (tc.assertion === 'connection_success') {
      // Just try to connect
      const start = Date.now();
      try {
        await connectAndSend(req.url, req.message, 5000);
        latency = Date.now() - start;
      } catch (e: any) {
        connectionError = e?.message ?? String(e);
        latency = Date.now() - start;
      }
    } else {
      try {
        const result = await connectAndSend(req.url, req.message);
        response = result.response;
        latency  = result.latency;
      } catch (e: any) {
        connectionError = e?.message ?? String(e);
      }
    }

    const { passed, message } = evaluate(tc, response, latency, connectionError);

    results.push({
      testCaseId: tc.id,
      testCaseName: tc.name,
      passed,
      message,
      latencyMs: latency,
      rawResponse: response,
      runAt: Date.now(),
    });
  }

  const passedCount = results.filter((r) => r.passed).length;

  return {
    collectionId:   collection.id,
    collectionName: collection.name,
    results,
    passedCount,
    failedCount:    results.length - passedCount,
    totalCount:     results.length,
    runAt:          suiteStart,
    durationMs:     Date.now() - suiteStart,
  };
}
