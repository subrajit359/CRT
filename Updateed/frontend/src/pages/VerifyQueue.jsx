import { useEffect, useState } from "react";
import { Link } from "wouter";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";

export default function VerifyQueue() {
  const [cases, setCases] = useState([]);

  useEffect(() => { api.get("/api/verify/queue").then((r) => setCases(r.cases || [])); }, []);

  return (
    <AppShell>
      <div className="container fade-in">
        <h2>Verify queue</h2>
        <p className="muted" style={{ marginTop: 4 }}>Cases that haven't yet been verified by you. Lowest verification count first.</p>
        <div className="spacer-7" />
        {cases.length === 0 ? <div className="empty">All caught up.</div> : (
          <div className="case-list">
            {cases.map((c) => (
              <div key={c.id} className="case-item">
                <div>
                  <Link href={`/case/${c.id}`}><h4>{c.title}</h4></Link>
                  <div className="case-meta">
                    <span className="badge badge-primary">{c.specialty}</span>
                    <span className="badge">L{c.level}</span>
                    <span className="badge">{c.source_kind}</span>
                    <span className="muted small">✓{c.verify_count}</span>
                  </div>
                </div>
                <Link href={`/case/${c.id}`} className="btn btn-secondary btn-sm">Review</Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
