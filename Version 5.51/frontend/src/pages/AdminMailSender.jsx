import { useEffect, useState, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, Mail, Search, Send, X } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

// Search users (debounced) using the existing admin users endpoint.
function useUserSearch(q) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.get(`/api/admin/all-users?q=${encodeURIComponent(q.trim())}&page=1&pageSize=8`);
        setResults(r.users || r.items || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  return { results, loading };
}

export default function AdminMailSender() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [target, setTarget] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const { results, loading } = useUserSearch(target ? "" : q);

  function pick(u) {
    setTarget(u);
    setQ("");
  }

  async function onSend(e) {
    e.preventDefault();
    if (!target) return toast.error("Choose a user first");
    if (!subject.trim()) return toast.error("Subject is required");
    if (!body.trim()) return toast.error("Body is required");
    setBusy(true);
    try {
      const r = await api.post(`/api/admin/users/${target.id}/email`, {
        subject: subject.trim(),
        body: body.trim(),
      });
      toast.success(`Email sent to ${r.sentTo || target.email || target.username}`);
      setSubject("");
      setBody("");
    } catch (err) {
      toast.error(err?.message || "Could not send email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="container fade-in upload-wrap">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Link href="/admin" className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} /> Back to admin
          </Link>
        </div>

        <h2 style={{ margin: "0 0 4px" }}>Send email</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Send an email straight to a user's registered address. They'll receive it in their normal inbox.
        </p>

        <form onSubmit={onSend} className="card" style={{ marginTop: 12 }}>
          <div className="field">
            <label className="label">Recipient</label>
            {target ? (
              <div
                style={{
                  display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between",
                  padding: 10, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg-soft)",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <Avatar user={target} size={36} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{target.full_name || target.username}</div>
                    <div className="muted small">@{target.username} · {target.email || "no email on file"}</div>
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTarget(null)}>
                  <X size={14} /> Change
                </button>
              </div>
            ) : (
              <>
                <div style={{ position: "relative" }}>
                  <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.6 }} />
                  <input
                    className="input"
                    placeholder="Search by name, username or email…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    style={{ paddingLeft: 32, width: "100%" }}
                  />
                </div>
                {q.trim() && (
                  <div
                    style={{
                      marginTop: 8, border: "1px solid var(--line)", borderRadius: 10,
                      maxHeight: 280, overflowY: "auto",
                    }}
                  >
                    {loading && <div className="muted small" style={{ padding: 12 }}>Searching…</div>}
                    {!loading && results.length === 0 && (
                      <div className="muted small" style={{ padding: 12 }}>No matches.</div>
                    )}
                    {!loading && results.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => pick(u)}
                        style={{
                          display: "flex", gap: 10, alignItems: "center", width: "100%",
                          background: "transparent", border: "none", padding: 10, cursor: "pointer",
                          borderTop: "1px solid var(--line)", textAlign: "left",
                        }}
                      >
                        <Avatar user={u} size={32} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>{u.full_name || u.username}</div>
                          <div className="muted small">@{u.username} · {u.email || "no email"}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="field">
            <label className="label">Subject</label>
            <input
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line of the email"
              required
            />
          </div>

          <div className="field">
            <label className="label">Description / body</label>
            <textarea
              className="textarea"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the message you want to send…"
              required
            />
            <div className="help">Plain text. Line breaks are preserved.</div>
          </div>

          <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !target}>
            {busy ? <span className="spinner" /> : <><Send size={16} /> Send email</>}
          </button>
        </form>

        <div className="card" style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Mail size={18} style={{ marginTop: 2, opacity: 0.7 }} />
          <div className="muted small" style={{ flex: 1 }}>
            Email delivery requires SMTP credentials on the server. If you see "Email is not configured",
            ask the operator to set <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>,
            <code> SMTP_PASS</code> and <code>SMTP_FROM</code>.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
