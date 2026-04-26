import { useEffect, useState } from "react";
import { Link } from "wouter";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

export default function AdminDashboard() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [reports, setReports] = useState([]);
  const [drs, setDrs] = useState([]);
  const [genCount, setGenCount] = useState(5);
  const [genLevel, setGenLevel] = useState(3);
  const [genSpecialty, setGenSpecialty] = useState("");
  const [specialtyList, setSpecialtyList] = useState([]);
  const [genBusy, setGenBusy] = useState(false);
  const [unseenLogs, setUnseenLogs] = useState({ count: 0, hasError: false });

  async function refresh() {
    const [s, p, r, d] = await Promise.all([
      api.get("/api/admin/stats"),
      api.get("/api/admin/doctors/pending"),
      api.get("/api/admin/reports"),
      api.get("/api/discussions/delete-requests"),
    ]);
    setStats(s); setPending(p.doctors); setReports(r.reports); setDrs(d.requests);
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    api.get("/api/cases/specialties").then((r) => setSpecialtyList(r.specialties || [])).catch(() => {});
  }, []);

  // The global AdminLogNotifier polls and emits status — just listen here.
  useEffect(() => {
    function onStatus(e) {
      const d = e.detail || {};
      setUnseenLogs({ count: d.count || 0, hasError: !!d.hasError });
    }
    window.addEventListener("admin:logs:status", onStatus);
    return () => window.removeEventListener("admin:logs:status", onStatus);
  }, []);

  async function generateCases() {
    setGenBusy(true);
    try {
      const r = await api.post("/api/admin/cases/generate", {
        count: genCount,
        level: genLevel,
        specialty: genSpecialty || null,
      });
      const okN = r.inserted?.length || 0;
      if (okN === 0) toast.error("AI generation failed — check server logs");
      else if (r.failedCount) toast.success(`Generated ${okN} of ${genCount} cases (${r.failedCount} failed)`);
      else toast.success(`Generated ${okN} cases with diagnoses`);
      refresh();
    } catch (e) { toast.error(e.message); }
    finally { setGenBusy(false); }
  }

  async function decide(userId, action) {
    try {
      await api.patch(`/api/admin/doctors/${userId}/${action}`, {});
      toast.success(`Doctor ${action}d`);
      refresh();
    } catch (e) { toast.error(e.message); }
  }

  async function decideDr(id, decision) {
    try {
      await api.patch(`/api/admin/delete-requests/${id}`, { decision });
      toast.success("Decision recorded");
      refresh();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <AppShell>
      <div className="container fade-in">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Admin</h2>
            <p className="muted" style={{ marginTop: 4 }}>Approvals, reports, and platform health.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Link href="/admin/logs" className="btn" style={{ position: "relative" }}>
            📜 Server logs
            {unseenLogs.count > 0 && (
              <span
                title={`${unseenLogs.count} new ${unseenLogs.hasError ? "error/warning" : "warning"}${unseenLogs.count > 1 ? "s" : ""}`}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  borderRadius: 999,
                  background: unseenLogs.hasError ? "#dc2626" : "#d97706",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: "18px",
                  textAlign: "center",
                  boxShadow: "0 0 0 2px var(--bg, #fff)",
                  animation: "pulseDot 1.6s ease-in-out infinite",
                }}
              >
                {unseenLogs.count > 99 ? "99+" : unseenLogs.count}
              </span>
            )}
          </Link>
          </div>
        </div>

        <div className="spacer-7" />
        <div className="stat-row">
          <div className="stat"><div className="stat-label">Cases</div><div className="stat-value">{stats?.cases ?? "—"}</div></div>
          <div className="stat"><div className="stat-label">Responses</div><div className="stat-value">{stats?.responses ?? "—"}</div></div>
          <div className="stat"><div className="stat-label">Pending doctors</div><div className="stat-value">{stats?.pendingDoctors ?? "—"}</div></div>
          <div className="stat"><div className="stat-label">Open delete reqs</div><div className="stat-value">{stats?.openDeleteRequests ?? "—"}</div></div>
        </div>

        <div className="spacer-7" />

        <div className="card">
          <h3>Generate cases with AI</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            Generates clinical cases with diagnoses and accepted-answer aliases. Cases are tagged as AI-generated. Review and verify before relying on them clinically.
          </p>
          <div className="spacer-7" />
          <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ minWidth: 140 }}>
              <label className="label">How many?</label>
              <select className="select" value={genCount} onChange={(e) => setGenCount(parseInt(e.target.value, 10))} disabled={genBusy}>
                <option value={1}>1 case</option>
                <option value={3}>3 cases</option>
                <option value={5}>5 cases</option>
                <option value={10}>10 cases</option>
              </select>
            </div>
            <div className="field" style={{ minWidth: 180 }}>
              <label className="label">Level (difficulty)</label>
              <select className="select" value={genLevel} onChange={(e) => setGenLevel(parseInt(e.target.value, 10))} disabled={genBusy}>
                <option value={1}>Level 1 — easiest (1st year)</option>
                <option value={2}>Level 2 — 2nd year</option>
                <option value={3}>Level 3 — 3rd year</option>
                <option value={4}>Level 4 — 4th year</option>
                <option value={5}>Level 5 — intern</option>
                <option value={6}>Level 6 — resident</option>
                <option value={7}>Level 7 — hardest (advanced resident)</option>
              </select>
            </div>
            <div className="field" style={{ minWidth: 220 }}>
              <label className="label">Specialty</label>
              <select className="select" value={genSpecialty} onChange={(e) => setGenSpecialty(e.target.value)} disabled={genBusy}>
                <option value="">Mixed (random per case)</option>
                {specialtyList.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={generateCases} disabled={genBusy} style={{ height: 40 }}>
              {genBusy ? <><span className="spinner" /> Generating… (may take 30–90s)</> : `Generate ${genCount} case${genCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>

        <div className="spacer-7" />

        <div className="card">
          <h3>Doctor approvals</h3>
          <div className="spacer-7" />
          {pending.length === 0 ? <div className="empty">No pending doctor applications.</div> : (
            <table className="table">
              <thead><tr><th>Name</th><th>Specialty</th><th>License</th><th>Hospital</th><th>Proof</th><th></th></tr></thead>
              <tbody>
                {pending.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.full_name}</strong><div className="muted small">@{d.username} · {d.email}</div></td>
                    <td>{d.specialty}<div className="muted small">{d.years_exp || 0}y</div></td>
                    <td>{d.license_number}</td>
                    <td>{d.hospital || "—"}</td>
                    <td className="muted small" style={{ maxWidth: 280 }}>{d.proof_text || "—"}</td>
                    <td>
                      <div className="row">
                        <button className="btn btn-primary btn-sm" onClick={() => decide(d.id, "approve")}>Approve</button>
                        <button className="btn btn-danger btn-sm" onClick={() => decide(d.id, "reject")}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="spacer-7" />
        <div className="card">
          <h3>Open delete requests</h3>
          <div className="spacer-7" />
          {drs.filter((d) => d.status === "open").length === 0 ? <div className="empty">No open delete requests.</div> : (
            <table className="table">
              <thead><tr><th>Case</th><th>Specialty</th><th>Requester</th><th>Reason</th><th></th></tr></thead>
              <tbody>
                {drs.filter((d) => d.status === "open").map((d) => (
                  <tr key={d.id}>
                    <td><Link href={`/case/${d.case_id}`}><strong>{d.case_title}</strong></Link></td>
                    <td>{d.specialty}</td>
                    <td><Link href={`/u/${d.requester_username}`}>@{d.requester_username}</Link></td>
                    <td className="muted small" style={{ maxWidth: 320 }}>{d.reason}</td>
                    <td>
                      <div className="row">
                        <button className="btn btn-danger btn-sm" onClick={() => decideDr(d.id, "approved")}>Delete</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => decideDr(d.id, "edit_instead")}>Edit instead</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => decideDr(d.id, "rejected")}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="spacer-7" />
        <div className="card">
          <h3>Reports</h3>
          <div className="spacer-7" />
          {reports.length === 0 ? <div className="empty">No reports.</div> : (
            <table className="table">
              <thead><tr><th>Case</th><th>By</th><th>Reason</th><th>When</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/case/${r.case_id}`}><strong>{r.title}</strong></Link></td>
                    <td>@{r.username}</td>
                    <td className="muted small">{r.reason}</td>
                    <td className="muted small">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
