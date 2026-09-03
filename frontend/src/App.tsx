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
    } catch (err: any) {
      console.error('Failed to clear execution history:', err);
    } finally {
      setIsClearingHistory(false);
    }
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

        {/* L2.1 Execution History Section */}
        <section className="card history-card">
          <div className="card-header">
            <div className="history-title-group">
              <h2 className="card-title">Execution History</h2>
              <span className="count-badge">
                {executions.length} {executions.length === 1 ? 'run' : 'runs'}
              </span>
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
              {executions.map((item) => (
                <div key={item.id} className="history-item">
                  <div className="history-item-header">
                    <div className="history-id-badge" title={item.id}>
                      <span className="history-id-label">ID:</span>
                      <code>{item.id.slice(0, 8)}</code>
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
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>PromptLab — Milestone 2.1 Execution History</p>
      </footer>
    </div>
  );
}
