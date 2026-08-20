import { useState, useEffect } from 'react';

interface HealthResponse {
  status: string;
  message: string;
}

export default function App() {
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/health`);
      if (!response.ok) {
        throw new Error(`HTTP error status: ${response.status}`);
      }
      const data: HealthResponse = await response.json();
      setHealthData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="container">
      <header className="header">
        <h1 className="title">PromptLab</h1>
        <p className="subtitle">LLM Prompt Engineering & Evaluation Platform</p>
      </header>

      <main>
        <section className="card">
          <div className="card-title">
            <span>System Health Overview</span>
            {loading && (
              <span className="status-badge loading">
                <span className="status-dot"></span> Checking...
              </span>
            )}
            {!loading && healthData && (
              <span className="status-badge healthy">
                <span className="status-dot"></span> Healthy
              </span>
            )}
            {!loading && error && (
              <span className="status-badge error">
                <span className="status-dot"></span> Disconnected
              </span>
            )}
          </div>

          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Testing frontend-to-backend communication on endpoint <code>/api/health</code>.
          </p>

          {loading && <p style={{ color: 'var(--text-muted)' }}>Fetching health status from backend...</p>}

          {!loading && error && (
            <div className="response-box" style={{ borderColor: 'var(--status-error-border)' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {!loading && healthData && (
            <div>
              <div className="response-box">
                <pre>{JSON.stringify(healthData, null, 2)}</pre>
              </div>
            </div>
          )}

          <button className="btn" onClick={checkHealth} disabled={loading}>
            {loading ? 'Checking...' : 'Re-check Health'}
          </button>
        </section>
      </main>

      <footer className="footer">
        <p>PromptLab — Milestone 1.1 Project Foundation</p>
      </footer>
    </div>
  );
}
