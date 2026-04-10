export interface RequestHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface SavedRequest {
  id: string;
  name: string;
  description?: string;
  url: string;
  message: string;
  headers: RequestHeader[];
  createdAt: number;
  updatedAt: number;
}

// ─── Test types ───────────────────────────────────────────────────────────────

/** Types of assertion a single test case can perform */
export type TestAssertionType =
  | 'response_contains'      // response text includes a substring
  | 'response_equals'        // response text equals exactly
  | 'json_field_equals'      // JSONPath-style: data.status === value
  | 'json_field_exists'      // JSONPath field exists in response
  | 'json_schema_valid'      // response matches a JSON schema snippet
  | 'latency_below'          // response arrived within N ms
  | 'connection_success'     // connection was established without error
  | 'custom_script';         // arbitrary JS returning { passed, message }

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;

  /** Which saved request this test case sends (references SavedRequest.id) */
  requestId: string;

  assertion: TestAssertionType;

  /** For contains / equals / json_field_equals / json_schema_valid */
  expectedValue?: string;

  /** For json_field_equals / json_field_exists — dot-notation path, e.g. "data.status" */
  jsonPath?: string;

  /** For latency_below — milliseconds */
  latencyMs?: number;

  /**
   * For custom_script — JS source.
   * The script receives:
   *   response : string   — raw response text
   *   latency  : number   — ms
   *   parsed   : any      — JSON.parse(response) or null
   * Must call: pass(message?) or fail(message)
   */
  script?: string;

  createdAt: number;
  updatedAt: number;
}

/** Result of running one TestCase */
export interface TestCaseResult {
  testCaseId: string;
  testCaseName: string;
  passed: boolean;
  message: string;       // human-readable verdict
  latencyMs: number;
  rawResponse: string;
  runAt: number;
}

/** Result of running all tests in a collection */
export interface TestSuiteResult {
  collectionId: string;
  collectionName: string;
  results: TestCaseResult[];
  passedCount: number;
  failedCount: number;
  totalCount: number;
  runAt: number;
  durationMs: number;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  requests: SavedRequest[];
  testCases: TestCase[];          // ← new
  lastTestResult?: TestSuiteResult; // ← cached last run
  createdAt: number;
  updatedAt: number;
}
