import { useState, useEffect, KeyboardEvent } from 'react';

interface ExecutionMetadata {
  model: string;
  latencyMs: number;
  timestamp: string;
}

interface ExecutionResult {
  output: string;
  metadata: ExecutionMetadata;
}

export default function App() {
  const [prompt, setPrompt] = useState<string>('');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/health`)
      .then((res) => (res.ok ? setIsHealthy(true) : setIsHealthy(false)))
      .catch(() => setIsHealthy(false));
  }, [apiBaseUrl]);

  const handleExecute = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isExecuting) return;

    setIsExecuting(true);
    setExecutionError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/prompts/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Execution failed with status ${response.status}`);
      }

      setResult(data as ExecutionResult);
    } catch (err: any) {
      setExecutionError(err.message || 'Failed to execute prompt.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
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
            <h2 className="card-title">Prompt Input</h2>
            <span className="shortcut-hint">Ctrl+Enter to run</span>
          </div>

          <textarea
            className="prompt-textarea"
            rows={5}
            placeholder="Enter your prompt here... (e.g., Explain the difference between synchronous and asynchronous execution in 2 sentences)"
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
                onClick={() => {
                  setPrompt('');
                  setResult(null);
                  setExecutionError(null);
                }}
                disabled={isExecuting}
              >
                Clear
              </button>
            )}
          </div>
        </section>

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
              <h2 className="card-title">Execution Result</h2>
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

            <div className="output-content">{result.output}</div>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>PromptLab — Milestone 1.3 Prompt Execution</p>
      </footer>
    </div>
  );
}
