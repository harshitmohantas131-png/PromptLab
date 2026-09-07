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

interface Criterion {
  name: string;
  score: number;
}

interface EvaluationRecord {
  id: string;
  executionId: string;
  criteria: Criterion[];
  overallScore: number;
  createdAt: string;
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
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [evaluatingExecution, setEvaluatingExecution] = useState<ExecutionRecord | null>(null);
  const [modalCriteria, setModalCriteria] = useState<Criterion[]>([
    { name: 'Accuracy', score: 5 },
    { name: 'Clarity', score: 4 },
  ]);
  const [newCriterionName, setNewCriterionName] = useState<string>('');
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [isSubmittingEval, setIsSubmittingEval] = useState<boolean>(false);

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

    fetch(`${apiBaseUrl}/api/evaluations`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.evaluations)) {
          setEvaluations(data.evaluations);
        }
      })
      .catch((err) => console.error('Failed to load evaluations:', err));
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

  const getEvaluationForExecution = (executionId: string): EvaluationRecord | undefined => {
    return evaluations.find((ev) => ev.executionId === executionId);
  };

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
      // L2.3: Clearing history cascades to clear evaluations
      setEvaluations([]);
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

  // L2.3: Manual Evaluation Modal Handlers
  const handleOpenEvaluationModal = (execution: ExecutionRecord) => {
    const existing = getEvaluationForExecution(execution.id);
    if (existing && existing.criteria.length > 0) {
      setModalCriteria(existing.criteria.map((c) => ({ ...c })));
    } else {
      setModalCriteria([
        { name: 'Accuracy', score: 5 },
        { name: 'Clarity', score: 4 },
      ]);
    }
    setNewCriterionName('');
    setEvaluationError(null);
    setEvaluatingExecution(execution);
  };

  const handleCloseEvaluationModal = () => {
    setEvaluatingExecution(null);
    setEvaluationError(null);
  };

  const handleScoreChange = (index: number, score: number) => {
    setModalCriteria((prev) =>
      prev.map((c, i) => (i === index ? { ...c, score } : c))
    );
  };

  const handleRemoveCriterion = (index: number) => {
    if (modalCriteria.length <= 1) return;
    setModalCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddCriterion = (nameToAdd?: string) => {
    const name = (nameToAdd || newCriterionName).trim();
    if (!name) return;

    if (modalCriteria.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setEvaluationError(`Criterion '${name}' is already added.`);
      return;
    }

    setModalCriteria((prev) => [...prev, { name, score: 5 }]);
    if (!nameToAdd) {
      setNewCriterionName('');
    }
    setEvaluationError(null);
  };

  const handleSubmitEvaluation = async () => {
    if (!evaluatingExecution || isSubmittingEval) return;
    if (modalCriteria.length === 0) {
      setEvaluationError('At least one criterion is required.');
      return;
    }

    if (modalCriteria.some((c) => !c.name.trim())) {
      setEvaluationError('Criterion names cannot be empty.');
      return;
    }

    setIsSubmittingEval(true);
    setEvaluationError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/evaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executionId: evaluatingExecution.id,
          criteria: modalCriteria,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit evaluation.');
      }

      const savedEval = data as EvaluationRecord;
      setEvaluations((prev) => {
        const idx = prev.findIndex((e) => e.executionId === savedEval.executionId);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = savedEval;
          return updated;
        }
        return [savedEval, ...prev];
      });

      handleCloseEvaluationModal();
    } catch (err: any) {
      setEvaluationError(err.message || 'Failed to submit evaluation.');
    } finally {
      setIsSubmittingEval(false);
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

                {/* L2.3 Evaluation Summary for Run A */}
                <div className="comparison-field">
                  <div className="result-section-label">Manual Evaluation</div>
                  {getEvaluationForExecution(comparedExecutions[0].id) ? (
                    <div className="comparison-eval-block">
                      <div className="comparison-eval-header">
                        <span className="eval-score-pill">
                          ★ {getEvaluationForExecution(comparedExecutions[0].id)!.overallScore} / 5
                        </span>
                        <button
                          type="button"
                          className="btn-eval-link"
                          onClick={() => handleOpenEvaluationModal(comparedExecutions[0])}
                        >
                          Edit Evaluation
                        </button>
                      </div>
                      <div className="eval-criteria-breakdown">
                        {getEvaluationForExecution(comparedExecutions[0].id)!.criteria.map((c) => (
                          <div key={c.name} className="eval-criterion-row">
                            <span className="criterion-name">{c.name}:</span>
                            <span className="criterion-score">{c.score} / 5</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="comparison-eval-empty">
                      <span>Not evaluated yet</span>
                      <button
                        type="button"
                        className="btn-eval-action"
                        onClick={() => handleOpenEvaluationModal(comparedExecutions[0])}
                      >
                        + Evaluate Run A
                      </button>
                    </div>
                  )}
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

                {/* L2.3 Evaluation Summary for Run B */}
                <div className="comparison-field">
                  <div className="result-section-label">Manual Evaluation</div>
                  {getEvaluationForExecution(comparedExecutions[1].id) ? (
                    <div className="comparison-eval-block">
                      <div className="comparison-eval-header">
                        <span className="eval-score-pill">
                          ★ {getEvaluationForExecution(comparedExecutions[1].id)!.overallScore} / 5
                        </span>
                        <button
                          type="button"
                          className="btn-eval-link"
                          onClick={() => handleOpenEvaluationModal(comparedExecutions[1])}
                        >
                          Edit Evaluation
                        </button>
                      </div>
                      <div className="eval-criteria-breakdown">
                        {getEvaluationForExecution(comparedExecutions[1].id)!.criteria.map((c) => (
                          <div key={c.name} className="eval-criterion-row">
                            <span className="criterion-name">{c.name}:</span>
                            <span className="criterion-score">{c.score} / 5</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="comparison-eval-empty">
                      <span>Not evaluated yet</span>
                      <button
                        type="button"
                        className="btn-eval-action"
                        onClick={() => handleOpenEvaluationModal(comparedExecutions[1])}
                      >
                        + Evaluate Run B
                      </button>
                    </div>
                  )}
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
                const itemEvaluation = getEvaluationForExecution(item.id);

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

                      <div className="history-item-right">
                        {itemEvaluation ? (
                          <div className="history-eval-group">
                            <span className="eval-score-pill" title="Calculated overall evaluation score">
                              ★ {itemEvaluation.overallScore} / 5
                            </span>
                            <button
                              type="button"
                              className="btn-eval-edit"
                              onClick={() => handleOpenEvaluationModal(item)}
                              title="Edit evaluation criteria and scores"
                            >
                              Edit Eval
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-eval-action"
                            onClick={() => handleOpenEvaluationModal(item)}
                            title="Evaluate this execution"
                          >
                            + Evaluate
                          </button>
                        )}

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

        {/* L2.3 Manual Evaluation Modal Dialog */}
        {evaluatingExecution && (
          <div className="modal-overlay" onClick={handleCloseEvaluationModal}>
            <div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Manual Evaluation Modal"
            >
              <div className="modal-header">
                <div>
                  <h2 className="modal-title">Manual Evaluation</h2>
                  <span className="modal-subtitle">
                    Execution ID: <code>{evaluatingExecution.id.slice(0, 8)}</code>
                  </span>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={handleCloseEvaluationModal}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              {/* Execution Output Preview */}
              <div className="eval-modal-preview">
                <div className="history-label">Output to Evaluate:</div>
                <div className="history-text output-preview modal-output-box">
                  {evaluatingExecution.output}
                </div>
              </div>

              {/* Suggested Presets */}
              <div className="eval-presets-row">
                <span className="presets-label">Quick Add Criteria:</span>
                {['Accuracy', 'Clarity', 'Relevance', 'Completeness'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="preset-chip"
                    onClick={() => handleAddCriterion(preset)}
                    disabled={modalCriteria.some((c) => c.name.toLowerCase() === preset.toLowerCase())}
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              {/* Criteria List */}
              <div className="eval-criteria-list">
                {modalCriteria.map((c, index) => (
                  <div key={index} className="eval-criteria-row">
                    <span className="eval-criterion-title">{c.name}</span>
                    <div className="score-selector" role="group" aria-label={`Score for ${c.name}`}>
                      {[1, 2, 3, 4, 5].map((num) => (
                        <button
                          key={num}
                          type="button"
                          className={`score-pill ${c.score === num ? 'active' : ''}`}
                          onClick={() => handleScoreChange(index, num)}
                          aria-label={`Score ${num} for ${c.name}`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                    {modalCriteria.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove-criterion"
                        onClick={() => handleRemoveCriterion(index)}
                        title="Remove criterion"
                        aria-label={`Remove ${c.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Custom Criterion Row */}
              <div className="add-criterion-row">
                <input
                  type="text"
                  className="variable-input add-criterion-input"
                  placeholder="Add custom criterion (e.g., Tone, Formatting)..."
                  value={newCriterionName}
                  onChange={(e) => setNewCriterionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCriterion();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleAddCriterion()}
                  disabled={!newCriterionName.trim()}
                >
                  Add
                </button>
              </div>

              {/* Evaluation Error */}
              {evaluationError && (
                <div className="eval-error-message">⚠️ {evaluationError}</div>
              )}

              {/* Modal Footer with Live Preview */}
              <div className="modal-footer">
                <div className="live-score-preview">
                  <span>Calculated Overall Score:</span>
                  <strong>
                    ★{' '}
                    {modalCriteria.length > 0
                      ? (modalCriteria.reduce((acc, c) => acc + c.score, 0) / modalCriteria.length).toFixed(2)
                      : '0.00'}{' '}
                    / 5.0
                  </strong>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCloseEvaluationModal}
                    disabled={isSubmittingEval}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSubmitEvaluation}
                    disabled={isSubmittingEval || modalCriteria.length === 0}
                  >
                    {isSubmittingEval ? 'Saving...' : 'Save Evaluation'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>PromptLab — Milestone 2.3 Manual Prompt Evaluation</p>
      </footer>
    </div>
  );
}
