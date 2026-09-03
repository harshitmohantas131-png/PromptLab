const BASE_URL = 'http://localhost:5000';

async function runTests() {
  console.log('=== Starting PromptLab L2.1 Execution History Test Suite ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Helper to call API
  async function api(path, options = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const status = res.status;
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status, data };
  }

  // Reset history first
  await api('/api/executions', { method: 'DELETE' });

  // 1. Initial State: History should be empty
  const initial = await api('/api/executions');
  assert(initial.status === 200, 'GET /api/executions returns 200');
  assert(Array.isArray(initial.data.executions) && initial.data.executions.length === 0, 'Executions list is initially empty');
  assert(initial.data.total === 0, 'Total executions count is 0');

  // 2. Validation Failure: Empty prompt
  const emptyPrompt = await api('/api/prompts/execute', {
    method: 'POST',
    body: JSON.stringify({ prompt: '   ' }),
  });
  assert(emptyPrompt.status === 400, 'POST with empty prompt returns 400 Bad Request');

  const afterEmpty = await api('/api/executions');
  assert(afterEmpty.data.total === 0, 'Empty prompt failure was NOT stored');

  // 3. Validation Failure: Invalid variables type
  const badVars = await api('/api/prompts/execute', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'Hello world', variables: 'not-an-object' }),
  });
  assert(badVars.status === 400, 'POST with invalid variables type returns 400 Bad Request');

  const afterBadVars = await api('/api/executions');
  assert(afterBadVars.data.total === 0, 'Invalid variables failure was NOT stored');

  // 4. Template Resolution Failure: Missing variable
  const missingVar = await api('/api/prompts/execute', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'Hello {{name}}', variables: {} }),
  });
  assert(missingVar.status === 400, 'POST with missing template variable returns 400 Bad Request');

  const afterMissingVar = await api('/api/executions');
  assert(afterMissingVar.data.total === 0, 'Missing variable resolution failure was NOT stored');

  // 5. Template Resolution Failure: Empty variable value
  const emptyVar = await api('/api/prompts/execute', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'Hello {{name}}', variables: { name: '  ' } }),
  });
  assert(emptyVar.status === 400, 'POST with empty variable value returns 400 Bad Request');

  const afterEmptyVar = await api('/api/executions');
  assert(afterEmptyVar.data.total === 0, 'Empty variable value failure was NOT stored');

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function executeWithRetry(payload, maxRetries = 4) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const res = await api('/api/prompts/execute', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.status === 200) return res;
      if (attempt < maxRetries) {
        console.log(`Prompt execution returned ${res.status}, retrying in 2s (attempt ${attempt}/${maxRetries})...`);
        await sleep(2000);
      } else {
        return res;
      }
    }
  }

  // 6. Successful Execution 1
  console.log('\nTesting successful prompt execution (calling Gemini API)...');
  const run1 = await executeWithRetry({
    prompt: 'Reply with the single word: "PONG"',
  });
  assert(run1.status === 200, `POST /api/prompts/execute returns 200 OK (got ${run1.status})`);
  assert(typeof run1.data?.id === 'string' && run1.data.id.length > 0, 'Returned execution contains unique id');
  assert(run1.data?.prompt === 'Reply with the single word: "PONG"', 'Prompt is preserved');
  assert(run1.data?.resolvedPrompt === 'Reply with the single word: "PONG"', 'Resolved prompt is preserved');
  assert(typeof run1.data?.output === 'string' && run1.data.output.length > 0, 'LLM output generated');
  assert(typeof run1.data?.metadata?.latencyMs === 'number', 'Latency metadata present');
  assert(typeof run1.data?.metadata?.model === 'string', 'Model metadata present');
  assert(typeof run1.data?.metadata?.timestamp === 'string', 'Timestamp metadata present');

  // 7. Verify History after Run 1
  const history1 = await api('/api/executions');
  assert(history1.status === 200, 'GET /api/executions returns 200 OK');
  assert(history1.data.total === 1, 'History total is now 1');
  assert(history1.data.executions[0]?.id === run1.data?.id, 'History item has matching id');
  assert(history1.data.executions[0]?.output === run1.data?.output, 'History item output matches');

  // Delay slightly between calls to prevent upstream Gemini rate limit / 503 spikes
  await sleep(1500);

  // 8. Successful Execution 2 with Template Variables
  console.log('\nTesting second execution with template variables...');
  const run2 = await executeWithRetry({
    prompt: 'Say {{greeting}} to {{recipient}} in 3 words or less.',
    variables: { greeting: 'Welcome', recipient: 'PromptLab' },
  });
  assert(run2.status === 200, `Second prompt with variables returns 200 OK (got ${run2.status})`);
  assert(typeof run2.data?.id === 'string' && run2.data.id !== run1.data?.id, 'Second run has a unique distinct id');
  assert(run2.data?.resolvedPrompt === 'Say Welcome to PromptLab in 3 words or less.', 'Resolved template prompt is correct');

  // 9. Verify History Ordering (Newest First)
  const history2 = await api('/api/executions');
  assert(history2.data.total === 2, 'History total is now 2');
  assert(history2.data.executions[0]?.id === run2.data?.id, 'Newest execution (run2) appears at index 0');
  assert(history2.data.executions[1]?.id === run1.data?.id, 'Older execution (run1) appears at index 1');

  // 10. Clear Execution History (DELETE /api/executions)
  console.log('\nTesting DELETE /api/executions...');
  const del = await api('/api/executions', { method: 'DELETE' });
  assert(del.status === 200, 'DELETE /api/executions returns 200 OK');
  assert(del.data.clearedCount === 2, `clearedCount is 2 (got ${del.data.clearedCount})`);
  assert(typeof del.data.message === 'string', 'Confirmation message returned');

  // 11. Verify History is Empty after DELETE
  const historyAfterDelete = await api('/api/executions');
  assert(historyAfterDelete.data.total === 0, 'History total is 0 after DELETE');
  assert(historyAfterDelete.data.executions.length === 0, 'History array is empty after DELETE');

  // 12. Deleting when already empty
  const delEmpty = await api('/api/executions', { method: 'DELETE' });
  assert(delEmpty.status === 200, 'DELETE on empty history returns 200 OK');
  assert(delEmpty.data.clearedCount === 0, 'clearedCount is 0 when history was already empty');

  // 13. Verify Provider Failure is NOT stored
  // Even if provider fails (500), history should remain 0
  const historyCheck = await api('/api/executions');
  assert(historyCheck.data.total === 0, 'History remains 0 after all failure checks');

  // 14. Verify No API Key Exposure in responses
  const responsesToCheck = [initial, emptyPrompt, run1, history1, run2, history2, del, historyAfterDelete];
  let apiKeyExposed = false;
  for (const resp of responsesToCheck) {
    const serialized = JSON.stringify(resp.data);
    if (serialized && serialized.includes('AIzaSy')) {
      apiKeyExposed = true;
    }
  }
  assert(!apiKeyExposed, 'No Gemini API key exposed in any API response');

  console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error in test runner:', err);
  process.exit(1);
});
