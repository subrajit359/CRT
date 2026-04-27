import { useEffect, useState } from "react";
import { Link } from "wouter";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";

export default function Progress() {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  useEffect(() => {
    api.get("/api/eval/stats").then(setStats);
    api.get("/api/eval/history").then((r) => setHistory(r.responses || []));
  }, []);

  return (
    <AppShell>
      <div className="container fade-in">
        <h2>Your progress</h2>
        <p className="muted" style={{ marginTop: 4 }}>Reasoning quality across specialties. Private to you.</p>
        <div className="spacer-7" />
        <div className="stat-row">
          <div className="stat"><div className="stat-label">Total attempts</div><div className="stat-value">{stats?.attempts ?? 0}</div></div>
          <div className="stat"><div className="stat-label">Average score</div><div className="stat-value">{stats?.averageScore != null ? stats.averageScore.toFixed(1) : "—"}/10</div></div>
        </div>

        <div className="spacer-7" />
        <div className="dash-grid">
          <div className="card">
            <h3>By specialty</h3>
            <div className="spacer-7" />
            {!stats?.bySpecialty?.length ? <div className="empty">No data yet.</div> : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {stats.bySpecialty.map((s) => (
                  <li key={s.specialty} className="row-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <strong>{s.specialty}</strong>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="muted small">{s.attempts} attempts</span>
                      <span className={`badge ${s.avg_score >= 8 ? "badge-success" : s.avg_score >= 5 ? "badge-warning" : "badge-danger"}`}>
                        {s.avg_score?.toFixed(1)}/10
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3>Recent attempts</h3>
            <div className="spacer-7" />
            {history.length === 0 ? <div className="empty">No attempts yet.</div> : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {history.slice(0, 20).map((r) => (
                  <li key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <div className="row-between">
                      <Link href={`/case/${r.case_id}`}><strong>{r.title}</strong></Link>
                      <span className={`badge ${r.score >= 8 ? "badge-success" : r.score >= 5 ? "badge-warning" : "badge-danger"}`}>{r.score ?? "—"}/10</span>
                    </div>
                    <div className="muted small">{r.specialty} · {new Date(r.created_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
