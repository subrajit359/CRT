import { useState } from "react";
import { Link } from "wouter";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [cases, setCases] = useState([]);
  const [busy, setBusy] = useState(false);

  async function doSearch(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
      setUsers(r.users); setCases(r.cases);
    } finally { setBusy(false); }
  }

  return (
    <AppShell>
      <div className="container fade-in">
        <h2>Search</h2>
        <p className="muted" style={{ marginTop: 4 }}>Find users by name or username, or cases by title or content.</p>
        <div className="spacer-7" />
        <form onSubmit={doSearch} className="row">
          <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={busy || !q.trim()}>Search</button>
        </form>
        <div className="spacer-7" />
        <div className="dash-grid">
          <div className="card">
            <h3>People</h3><div className="spacer-7" />
            {users.length === 0 ? <div className="empty">No matching people.</div> : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {users.map((u) => (
                  <li key={u.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <Link href={`/u/${u.username}`}><strong>{u.full_name}</strong></Link>
                    <div className="muted small">@{u.username} · {u.role} · {u.specialty || u.year_of_study || ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <h3>Cases</h3><div className="spacer-7" />
            {cases.length === 0 ? <div className="empty">No matching cases.</div> : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {cases.map((c) => (
                  <li key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <Link href={`/case/${c.id}`}><strong>{c.title}</strong></Link>
                    <div className="muted small">{c.specialty} · L{c.level}</div>
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
