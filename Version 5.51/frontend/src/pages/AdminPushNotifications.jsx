import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bell, Send, Users, ArrowLeft } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

export default function AdminPushNotifications() {
  const toast = useToast();

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("/");
  const [role, setRole] = useState("all");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  function loadStats() {
    setStatsLoading(true);
    api.get("/api/admin/push/stats")
      .then((r) => { setStats(r); setStatsLoading(false); })
      .catch(() => { setStats(null); setStatsLoading(false); });
  }

  useEffect(() => { loadStats(); }, []);

  async function handleSend(e) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!body.trim())  { toast.error("Message is required"); return; }
    setSending(true);
    setLastResult(null);
    try {
      const r = await api.post("/api/admin/push/broadcast", { title: title.trim(), body: body.trim(), link: link.trim() || "/", role });
      setLastResult(r);
      if (r.sent > 0) {
        toast.success(`Sent to ${r.sent} of ${r.total} device${r.total !== 1 ? "s" : ""}`);
        setTitle("");
        setBody("");
        setLink("/");
        setRole("all");
      } else {
        toast.error(r.error || `No devices received the notification (${r.total} subscribed)`);
      }
    } catch (err) {
      toast.error(err.message || "Failed to send");
    } finally {
      setSending(false);
      loadStats();
    }
  }

  const targetCount = stats
    ? role === "all"
      ? stats.total
      : (stats.byRole?.find((r) => r.role === role)?.subs ?? 0)
    : null;

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 680 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Link href="/admin" className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" /> Admin
          </Link>
        </div>

        <h2 style={{ margin: 0 }}>Push Notifications</h2>
        <p className="muted" style={{ marginTop: 4 }}>Broadcast a message to all subscribed devices.</p>

        <div className="spacer-7" />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
          {["all", "student", "doctor", "admin"].map((key) => {
            const count = statsLoading ? null
              : key === "all" ? (stats?.total ?? 0)
              : (stats?.byRole?.find((r) => r.role === key)?.subs ?? 0);
            return (
              <div key={key} className="card" style={{ textAlign: "center", padding: "16px 12px" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: key === "all" ? "var(--primary)" : undefined }}>
                  {count === null ? "…" : count}
                </div>
                <div className="muted small" style={{ marginTop: 4, textTransform: "capitalize" }}>
                  {key === "all" ? "Total devices" : `${key}s`}
                </div>
              </div>
            );
          })}
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 4px" }}>
            <Bell size={18} strokeWidth={1.75} style={{ verticalAlign: "middle", marginRight: 8 }} aria-hidden="true" />
            Compose notification
          </h3>
          <p className="muted small" style={{ marginBottom: 20 }}>
            Sent immediately to all matching subscribed devices.
          </p>

          <form onSubmit={handleSend}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label className="label">Audience</label>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)} disabled={sending}>
                <option value="all">Everyone ({statsLoading ? "…" : (stats?.total ?? 0)} devices)</option>
                {["student", "doctor", "admin"].map((key) => {
                  const count = stats?.byRole?.find((r) => r.role === key)?.subs ?? 0;
                  return (
                    <option key={key} value={key}>
                      {key.charAt(0).toUpperCase() + key.slice(1)}s only ({statsLoading ? "…" : count} devices)
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label className="label">Title</label>
              <input
                className="input"
                type="text"
                maxLength={80}
                placeholder="e.g. New cases added!"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={sending}
                required
              />
              <div className="muted small" style={{ marginTop: 4, textAlign: "right" }}>{title.length}/80</div>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label className="label">Message</label>
              <textarea
                className="input"
                rows={3}
                maxLength={200}
                placeholder="e.g. 50 new cardiology cases are live. Start practicing now."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={sending}
                required
                style={{ resize: "vertical" }}
              />
              <div className="muted small" style={{ marginTop: 4, textAlign: "right" }}>{body.length}/200</div>
            </div>

            <div className="field" style={{ marginBottom: 20 }}>
              <label className="label">Link (where tapping opens)</label>
              <input
                className="input"
                type="text"
                placeholder="/practice"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                disabled={sending}
              />
              <div className="muted small" style={{ marginTop: 4 }}>Use a path like /practice or /blog</div>
            </div>

            {targetCount !== null && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px", borderRadius: 10,
                background: "var(--bg-soft, #f1f5f9)",
                marginBottom: 16, fontSize: 14,
              }}>
                <Users size={16} strokeWidth={1.75} aria-hidden="true" className="muted" />
                <span>Will reach <strong>{targetCount}</strong> device{targetCount !== 1 ? "s" : ""}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={sending || !title.trim() || !body.trim()}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {sending
                ? <><span className="spinner" /> Sending…</>
                : <><Send size={16} strokeWidth={1.75} aria-hidden="true" /> Send notification</>}
            </button>
          </form>

          {lastResult && (
            <div style={{
              marginTop: 16, padding: "12px 16px", borderRadius: 10,
              background: lastResult.sent > 0 ? "rgba(0,168,107,0.08)" : "rgba(220,38,38,0.07)",
              border: `1px solid ${lastResult.sent > 0 ? "rgba(0,168,107,0.2)" : "rgba(220,38,38,0.2)"}`,
              fontSize: 14,
            }}>
              {lastResult.sent > 0
                ? `✓ Delivered to ${lastResult.sent} of ${lastResult.total} subscribed device${lastResult.total !== 1 ? "s" : ""}`
                : `No devices received the push. ${lastResult.total === 0 ? "No subscribed devices in this audience." : `${lastResult.total} subscribed but all failed.`}`}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
