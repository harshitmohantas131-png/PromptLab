import { useState, useEffect, useMemo, KeyboardEvent } from 'react';

interface ExecutionMetadata {
  model: string;
  latencyMs: number;
  timestamp: string;
}

interface ExecutionRecord {
  id: string;
  prompt: string;
  resolvedPrompt: string;
  output: string;
  metadata: ExecutionMetadata;
}

const extractVariables = (template: string): string[] => {
  const matches = template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  const variableNames = Array.from(matches, (m) => m[1]);
  return Array.from(new Set(variableNames));
};

export default function App() {
  const [prompt, setPrompt] = useState<string>('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ExecutionRecord | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [isClearingHistory, setIsClearingHistory] = useState<boolean>(false);
  const [selectedExecutionIds, setSelectedExecutionIds] = useState<string[]>([]);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/health`)
      .then((res) => (res.ok ? setIsHealthy(true) : setIsHealthy(false)))
      .catch(() => setIsHealthy(false));

    fetch(`${apiBaseUrl}/api/executions`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.executions)) {
          setExecutions(data.executions);
        }
      })
      .catch((err) => console.error('Failed to load execution history:', err));
  }, [apiBaseUrl]);

  const detectedVariables = useMemo(() => extractVariables(prompt), [prompt]);

  // L2.2: Derive exactly two compared executions from existing executions state
  const comparedExecutions = useMemo(() => {
    if (selectedExecutionIds.length !== 2) return null;
    const [idA, idB] = selectedExecutionIds;
    const execA = executions.find((e) => e.id === idA);
    const execB = executions.find((e) => e.id === idB);
    if (!execA || !execB) return null;
    return [execA, execB] as [ExecutionRecord, ExecutionRecord];
  }, [selectedExecutionIds, executions]);

  const handleVariableChange = (name: string, value: string) => {
    setVariables((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleExecute = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isExecuting) return;

    setIsExecuting(true);
    setExecutionError(null);

    // Construct variables payload for all detected variables
    const payloadVariables: Record<string, string> = {};
    for (const varName of detectedVariables) {
      payloadVariables[varName] = variables[varName] ?? '';
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/prompts/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          variables: payloadVariables,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Execution failed with status ${response.status}`);
      }

      const executionData = data as ExecutionRecord;
      setResult(executionData);
      // L2.1: Use returned execution record to update local history without an extra GET request
      setExecutions((prev) => [executionData, ...prev]);
    } catch (err: any) {
      setExecutionError(err.message || 'Failed to execute prompt.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClearHistory = async () => {
    if (isClearingHistory || executions.length === 0) return;

    setIsClearingHistory(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/executions`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`Failed to clear history with status ${response.status}`);
      }
      // L2.1: Clear local history after successful API response
      setExecutions([]);
      // L2.2: Clearing history must also reset selection state
      setSelectedExecutionIds([]);
    } catch (err: any) {
      console.error('Failed to clear execution history:', err);
    } finally {
      setIsClearingHistory(false);
    }
  };

  // L2.2: Toggle execution selection, strictly enforcing a 2-selection limit
  const handleToggleSelect = (id: string) => {
    setSelectedExecutionIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((selectedId) => selectedId !== id);
      }
      if (prev.length >= 2) {
        return prev; // Prevent third selection
      }
      return [...prev, id];
    });
  };

  // L2.2: Clear comparison selection
  const handleClearSelection = () => {
    setSelectedExecutionIds([]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleClear = () => {
    setPrompt('');
    setVariables({});
    setResult(null);
    setExecutionError(null);
  };

  return (
    <div className="container">
      <header className="header">
        <div className="header-top">
          <h1 className="title">PromptLab</h1>
          {isHealthy !== null && (
            <span className={`status-badge ${isHealthy ? 'healthy' : 'error'}`}>
              <span className="status-dot"></span>
              {isHealthy ? 'Backend Connected' : 'Backend Offline'}
            </span>
          )}
        </div>
        <p className="subtitle">Prompt Engineering & Experimentation Playground</p>
      </header>

      <main>
        {/* Prompt Input Section */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Prompt Template</h2>
            <span className="shortcut-hint">Ctrl+Enter to run</span>
          </div>

          <textarea
            className="prompt-textarea"
            rows={5}
            placeholder="Enter your prompt or template here... (e.g., Explain {{topic}} in {{style}} terms.)"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isExecuting}
          />

          <div className="action-row">
            <button
              className="btn btn-primary"
              onClick={handleExecute}
              disabled={isExecuting || prompt.trim().length === 0}
            >
              {isExecuting ? (
                <>
                  <span className="spinner"></span>
                  Executing...
                </>
              ) : (
                'Execute Prompt'
              )}
            </button>
            {prompt.trim().length > 0 && (
              <button
                className="btn btn-secondary"
                onClick={handleClear}
                disabled={isExecuting}
              >
                Clear
              </button>
            )}
          </div>
        </section>

        {/* Dynamic Variables Section */}
        {detectedVariables.length > 0 && (
          <section className="card variables-card">
            <div className="variables-header">
              <h2 className="card-title">Template Variables</h2>
              <span className="variables-count-badge">
                {detectedVariables.length} {detectedVariables.length === 1 ? 'variable' : 'variables'} detected
              </span>
            </div>

            <div className="variables-grid">
              {detectedVariables.map((varName) => (
                <div key={varName} className="variable-item">
                  <label className="variable-label" htmlFor={`var-${varName}`}>
                    <span>Variable:</span>
                    <span className="variable-tag">{`{{${varName}}}`}</span>
                  </label>
                  <input
                    id={`var-${varName}`}
                    type="text"
                    className="variable-input"
                    placeholder={`Enter value for ${varName}...`}
                    value={variables[varName] ?? ''}
                    onChange={(e) => handleVariableChange(varName, e.target.value)}
                    disabled={isExecuting}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Execution Error Banner */}
        {executionError && (
          <div className="error-banner">
            <div className="error-icon">⚠️</div>
            <div className="error-message">
              <strong>Execution Error:</strong> {executionError}
            </div>
          </div>
        )}

        {/* Result Section */}
        {result && (
          <section className="card result-card">
            <div className="card-header">
              <div className="result-title-group">
                <h2 className="card-title">Execution Result</h2>
                <span className="execution-id-tag" title={result.id}>
                  ID: <code>{result.id.slice(0, 8)}</code>
                </span>
              </div>
              <div className="telemetry-badges">
                <span className="meta-badge model-badge" title="Model Identifier">
                  🏷️ {result.metadata.model}
                </span>
                <span className="meta-badge latency-badge" title="Execution Latency">
                  ⚡ {result.metadata.latencyMs} ms
                </span>
                <span className="meta-badge timestamp-badge" title="Execution Timestamp">
                  🕒 {new Date(result.metadata.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>

            <div className="result-block">
              <div className="result-section-label">Original Template</div>
              <div className="prompt-display-box">{result.prompt}</div>
            </div>

            <div className="result-block">
              <div className="result-section-label">Resolved Prompt</div>
              <div className="prompt-display-box resolved-display-box">{result.resolvedPrompt}</div>
            </div>

            <div className="result-block">
              <div className="result-section-label">Generated Output</div>
              <div className="output-content">{result.output}</div>
            </div>
          </section>
        )}

        {/* L2.2 Read-Only Side-by-Side Prompt Comparison Section */}
        {comparedExecutions && (
          <section className="card comparison-card" aria-label="Prompt Comparison">
            <div className="card-header">
              <div className="comparison-title-group">
                <h2 className="card-title">Prompt Comparison</h2>
                <span className="comparison-badge">Side-by-Side</span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleClearSelection}
                aria-label="Close comparison view"
              >
                Clear Comparison ✕
              </button>
            </div>

            <div className="comparison-grid">
              {/* Column 1: Run A */}
              <div className="comparison-column column-a">
                <div className="comparison-column-header">
                  <div className="comparison-run-tag tag-a">Run A (First Selected)</div>
                  <div className="history-id-badge" title={comparedExecutions[0].id}>
                    <span className="history-id-label">ID:</span>
                    <code>{comparedExecutions[0].id.slice(0, 8)}</code>
                  </div>
                </div>

                <div className="telemetry-badges comparison-telemetry">
                  <span className="meta-badge model-badge" title="Model Identifier">
                    🏷️ {comparedExecutions[0].metadata.model}
                  </span>
                  <span className="meta-badge latency-badge" title="Execution Latency">
                    ⚡ {comparedExecutions[0].metadata.latencyMs} ms
                  </span>
                  <span className="meta-badge timestamp-badge" title="Execution Timestamp">
                    🕒 {new Date(comparedExecutions[0].metadata.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="comparison-field">
                  <div className="result-section-label">Original Template</div>
                  <div className="prompt-display-box">{comparedExecutions[0].prompt}</div>
                </div>

                <div className="comparison-field">
                  <div className="result-section-label">Resolved Prompt</div>
                  <div className="prompt-display-box resolved-display-box">{comparedExecutions[0].resolvedPrompt}</div>
                </div>

                <div className="comparison-field">
                  <div className="result-section-label">Generated Output</div>
                  <div className="output-content">{comparedExecutions[0].output}</div>
                </div>
              </div>

              {/* Column 2: Run B */}
              <div className="comparison-column column-b">
                <div className="comparison-column-header">
                  <div className="comparison-run-tag tag-b">Run B (Second Selected)</div>
                  <div className="history-id-badge" title={comparedExecutions[1].id}>
                    <span className="history-id-label">ID:</span>
                    <code>{comparedExecutions[1].id.slice(0, 8)}</code>
                  </div>
                </div>

                <div className="telemetry-badges comparison-telemetry">
                  <span className="meta-badge model-badge" title="Model Identifier">
                    🏷️ {comparedExecutions[1].metadata.model}
                  </span>
                  <span className="meta-badge latency-badge" title="Execution Latency">
                    ⚡ {comparedExecutions[1].metadata.latencyMs} ms
                  </span>
                  <span className="meta-badge timestamp-badge" title="Execution Timestamp">
                    🕒 {new Date(comparedExecutions[1].metadata.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="comparison-field">
                  <div className="result-section-label">Original Template</div>
                  <div className="prompt-display-box">{comparedExecutions[1].prompt}</div>
                </div>

                <div className="comparison-field">
                  <div className="result-section-label">Resolved Prompt</div>
                  <div className="prompt-display-box resolved-display-box">{comparedExecutions[1].resolvedPrompt}</div>
                </div>

                <div className="comparison-field">
                  <div className="result-section-label">Generated Output</div>
                  <div className="output-content">{comparedExecutions[1].output}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* L2.1 Execution History Section */}
        <section className="card history-card">
          <div className="card-header">
            <div className="history-title-group">
              <h2 className="card-title">Execution History</h2>
              <span className="count-badge">
                {executions.length} {executions.length === 1 ? 'run' : 'runs'}
              </span>
              {executions.length >= 2 && (
                <span className="selection-status-badge">
                  {selectedExecutionIds.length === 0 && 'Select 2 to compare'}
                  {selectedExecutionIds.length === 1 && '1 of 2 selected — choose 1 more'}
                  {selectedExecutionIds.length === 2 && '2 of 2 selected (comparing above)'}
                </span>
              )}
            </div>
            {executions.length > 0 && (
              <button
                className="btn btn-danger-outline"
                onClick={handleClearHistory}
                disabled={isClearingHistory}
              >
                {isClearingHistory ? 'Clearing...' : 'Clear History'}
              </button>
            )}
          </div>

          {executions.length === 0 ? (
            <div className="history-empty">
              No executions recorded in this session yet. Run a prompt above to view execution logs.
            </div>
          ) : (
            <div className="history-list">
              {executions.map((item) => {
                const isSelected = selectedExecutionIds.includes(item.id);
                const isSelectionFull = selectedExecutionIds.length >= 2;
                const isDisabled = !isSelected && isSelectionFull;
                const selectionIndex = selectedExecutionIds.indexOf(item.id);

                return (
                  <div
                    key={item.id}
                    className={`history-item ${isSelected ? 'item-selected' : ''}`}
                  >
                    <div className="history-item-header">
                      <div className="history-item-left">
                        <label
                          className={`compare-checkbox-label ${isDisabled ? 'disabled' : ''} ${isSelected ? 'active' : ''}`}
                          title={isDisabled ? 'Maximum of 2 executions can be compared. Deselect one to choose this execution.' : undefined}
                        >
                          <input
                            type="checkbox"
                            className="compare-checkbox"
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={() => handleToggleSelect(item.id)}
                            aria-label={`Select execution ${item.id.slice(0, 8)} for comparison`}
                          />
                          <span>Compare</span>
                        </label>
                        {isSelected && (
                          <span className={`selected-run-tag ${selectionIndex === 0 ? 'tag-a' : 'tag-b'}`}>
                            {selectionIndex === 0 ? 'Run A' : 'Run B'}
                          </span>
                        )}
                        <div className="history-id-badge" title={item.id}>
                          <span className="history-id-label">ID:</span>
                          <code>{item.id.slice(0, 8)}</code>
                        </div>
                      </div>

                      <div className="telemetry-badges">
                        <span className="meta-badge model-badge" title="Model Identifier">
                          🏷️ {item.metadata.model}
                        </span>
                        <span className="meta-badge latency-badge" title="Execution Latency">
                          ⚡ {item.metadata.latencyMs} ms
                        </span>
                        <span className="meta-badge timestamp-badge" title="Execution Timestamp">
                          🕒 {new Date(item.metadata.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    <div className="history-item-body">
                      <div className="history-item-block">
                        <div className="history-label">Prompt:</div>
                        <div className="history-text prompt-preview">{item.resolvedPrompt || item.prompt}</div>
                      </div>
                      <div className="history-item-block">
                        <div className="history-label">Output:</div>
                        <div className="history-text output-preview">{item.output}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>PromptLab — Milestone 2.2 Prompt Comparison</p>
      </footer>
    </div>
  );
}
