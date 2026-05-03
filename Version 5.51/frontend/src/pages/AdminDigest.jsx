import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import {
  CalendarClock, Mail, Bell, Play, RefreshCw, CheckCircle2,
  XCircle, Clock, Users, Send, ChevronLeft, AlertTriangle,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Skeleton, { SkeletonRows } from "../components/Skeleton.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { relativeTime } from "../lib/date.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${String(h).padStart(2, "0")}:00 UTC`,
}));

function StatusBadge({ run }) {
  if (!run) return null;
  if (!run.finished_at) return <span className="badge badge-warning">Running…</span>;
  if (run.errors > 0 && run.emails_sent === 0 && run.pushes_sent === 0)
    return <span className="badge badge-danger">Failed</span>;
  return <span className="badge badge-success">Done</span>;
}

function StatCard({ icon, label, value, sub, color = "var(--primary)" }) {
  return (
    <div style={{
      background: "var(--bg-elev)",
      border: "1px solid var(--line)",
      borderRadius: 12,
      padding: "16px 20px",
      display: "flex",
      alignItems: "flex-start",
      gap: 14,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: `${color}18`,
        display: "grid", placeItems: "center", flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink-900)", lineHeight: 1.1 }}>
          {value ?? <Skeleton width={50} height={26} />}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-600)", marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "var(--ink-400)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function AdminDigest() {
  const toast = useToast();

  const [status, setStatus]   = useState(null);
  const [runs,   setRuns]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving,  setSaving]  = useState(false);

  // Settings form state (synced from API)
  const [enabled, setEnabled]   = useState(true);
  const [dayUtc,  setDayUtc]    = useState(1);
  const [hourUtc, setHourUtc]   = useState(9);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        api.get("/api/admin/digest/status"),
        api.get("/api/admin/digest/runs"),
      ]);
      setStatus(s);
      setRuns(r.runs || []);
      setEnabled(s.enabled);
      setDayUtc(s.dayUtc ?? 1);
      setHourUtc(s.hourUtc ?? 9);
    } catch (e) {
      toast.error(e?.message || "Failed to load digest status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function saveSettings() {
    setSaving(true);
    try {
      await api.patch("/api/admin/digest/settings", { enabled, hourUtc, dayUtc });
      toast.success("Settings saved");
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function sendNow() {
    if (!window.confirm(
      `Send the weekly digest to all eligible students right now?\n\nThis will send both email (if configured) and push notifications.`
    )) return;
    setSending(true);
    try {
      await api.post("/api/admin/digest/send-now", {});
      toast.success("Digest run started — check Recent Runs in a moment");
      // Reload after 3 s to show the new run
      setTimeout(() => loadAll(), 3000);
    } catch (e) {
      toast.error(e?.message || "Failed to start digest");
    } finally {
      setSending(false);
    }
  }

  const lastRun = status?.lastRun || null;

  // Compute next scheduled send
  function nextScheduledLabel() {
    const now = new Date();
    let d = new Date();
    d.setUTCHours(hourUtc, 0, 0, 0);
    // Find the next matching weekday
    const currentDay = now.getUTCDay();
    let daysUntil = (dayUtc - currentDay + 7) % 7;
    if (daysUntil === 0 && now.getUTCHours() >= hourUtc) daysUntil = 7;
    d.setUTCDate(d.getUTCDate() + daysUntil);
    const diff = d - now;
    const h = Math.floor(diff / 3600000);
    const days = Math.floor(h / 24);
    if (days > 0) return `in ${days} day${days > 1 ? "s" : ""}`;
    if (h > 0)    return `in ${h} hour${h > 1 ? "s" : ""}`;
    return "very soon";
  }

  return (
    <AppShell title="Weekly Digest">
      <div style={{ maxWidth: 820, margin: "0 auto" }}>

        {/* Back + heading */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--ink-500)", textDecoration: "none", fontSize: 14 }}>
            <ChevronLeft size={16} /> Admin
          </Link>
          <span style={{ color: "var(--ink-300)" }}>/</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Weekly Digest</span>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Weekly Digest</h1>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              Automated Monday email + push digest for every student with 3+ completed cases.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={loadAll}
              disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              Refresh
            </button>
            <button
              className="btn btn-primary"
              onClick={sendNow}
              disabled={sending || loading}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <Send size={15} />
              {sending ? "Sending…" : "Send Now"}
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
          <StatCard
            icon={<Users size={20} color="var(--primary)" />}
            label="Eligible students"
            value={loading ? null : (status?.eligibleStudents ?? "—")}
            sub="Have 3+ completed cases"
            color="var(--primary)"
          />
          <StatCard
            icon={<Mail size={20} color="#059669" />}
            label="Emails last run"
            value={loading ? null : (lastRun?.emails_sent ?? "—")}
            sub={lastRun ? relativeTime(lastRun.started_at) : "No runs yet"}
            color="#059669"
          />
          <StatCard
            icon={<Bell size={20} color="#d97706" />}
            label="Pushes last run"
            value={loading ? null : (lastRun?.pushes_sent ?? "—")}
            sub={lastRun ? `of ${lastRun.total_students} students` : "No runs yet"}
            color="#d97706"
          />
          <StatCard
            icon={<CalendarClock size={20} color="#6366f1" />}
            label="Next scheduled"
            value={!enabled ? "Off" : (!loading ? nextScheduledLabel() : null)}
            sub={!enabled ? "Digest is disabled" : `${DAY_NAMES[dayUtc]} at ${String(hourUtc).padStart(2, "0")}:00 UTC`}
            color="#6366f1"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

          {/* Settings card */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Schedule settings</h3>

            {/* Enable toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Digest enabled</div>
                <div className="muted small">Turn the automatic weekly digest on or off</div>
              </div>
              <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "var(--primary)" }}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{enabled ? "On" : "Off"}</span>
              </label>
            </div>

            {/* Day picker */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Day of week (UTC)
              </label>
              <select
                value={dayUtc}
                onChange={(e) => setDayUtc(Number(e.target.value))}
                className="input"
                style={{ width: "100%" }}
              >
                {DAY_NAMES.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
            </div>

            {/* Hour picker */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Send time (UTC)
              </label>
              <select
                value={hourUtc}
                onChange={(e) => setHourUtc(Number(e.target.value))}
                className="input"
                style={{ width: "100%" }}
              >
                {HOUR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div style={{ background: "rgba(99,102,241,0.07)", borderRadius: 8, padding: "10px 12px", marginBottom: 18, fontSize: 13, color: "var(--ink-600)" }}>
              Digest will fire on <strong>{DAY_NAMES[dayUtc]}</strong> at{" "}
              <strong>{String(hourUtc).padStart(2, "0")}:00 UTC</strong> each week.
              The server checks every 5 minutes so delivery may be up to 5 min late.
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              onClick={saveSettings}
              disabled={saving}
            >
              {saving ? <><RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving…</> : "Save settings"}
            </button>
          </div>

          {/* Digest contents card */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>What the digest includes</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { icon: <CheckCircle2 size={16} color="#059669" />, text: "Personalised readiness score bars for each specialty (top 3)" },
                { icon: <CheckCircle2 size={16} color="#059669" />, text: "Weakest specialty highlighted as the weekly focus area" },
                { icon: <CheckCircle2 size={16} color="#059669" />, text: "Top AI coaching tip from the student's cached insights" },
                { icon: <CheckCircle2 size={16} color="#059669" />, text: "Total cases completed + current practice streak" },
                { icon: <CheckCircle2 size={16} color="#059669" />, text: "Call-to-action button linking to Practice page" },
                { icon: <Bell size={16} color="#d97706" />, text: "Web push notification summarising top specialty readiness" },
              ].map(({ icon, text }, i) => (
                <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5 }}>
                  <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 18, padding: "10px 12px", background: "#FEF3C7", borderRadius: 8, border: "1px solid #FDE68A", fontSize: 13, color: "#92400E", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Email is only sent if BREVO_API_KEY or SMTP credentials are configured.
                Push is sent to all devices the student has subscribed on.
              </span>
            </div>
          </div>
        </div>

        {/* Recent runs */}
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ marginTop: 0 }}>Recent runs</h3>

          {loading && runs === null ? (
            <SkeletonRows n={4} avatar={false} />
          ) : !runs || runs.length === 0 ? (
            <p className="muted small">No digest runs yet. Use "Send Now" to trigger the first one.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--line)" }}>
                    {["Started", "Triggered by", "Status", "Students", "Emails", "Pushes", "Errors", "Duration"].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "var(--ink-500)", fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const durationMs = run.finished_at
                      ? new Date(run.finished_at) - new Date(run.started_at)
                      : null;
                    const durationSec = durationMs ? Math.round(durationMs / 1000) : null;
                    return (
                      <tr key={run.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          <span title={new Date(run.started_at).toLocaleString()}>
                            {relativeTime(run.started_at)}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span className="muted">
                            {run.triggered_by.startsWith("admin:") ? "Admin (manual)" : "Scheduler"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <StatusBadge run={run} />
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{run.total_students}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <Mail size={13} color="#059669" />
                            {run.emails_sent}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <Bell size={13} color="#d97706" />
                            {run.pushes_sent}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {run.errors > 0 ? (
                            <span style={{ color: "#dc2626", fontWeight: 600 }}>{run.errors}</span>
                          ) : (
                            <span className="muted">0</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--ink-400)" }}>
                          {durationSec !== null ? `${durationSec}s` : run.finished_at ? "—" : <span className="badge badge-warning" style={{ fontSize: 11 }}>Running</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
