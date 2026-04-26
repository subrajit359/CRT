import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../lib/auth.jsx";

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const week = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - d.getTime() < week) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function DeleteRequests() {
  const toast = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [data, setData] = useState({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const stuckBottomRef = useRef(true);

  const active = items.find((d) => d.case_id === activeId) || null;

  async function loadList() {
    try {
      const r = await api.get("/api/discussions/delete-requests");
      setItems(r.requests || []);
      if (!activeId && r.requests?.[0]) setActiveId(r.requests[0].case_id);
    } catch (e) { toast.error(e.message); }
  }

  const loadThread = useCallback(async () => {
    if (!activeId) return;
    try {
      const d = await api.get(`/api/discussions/case/${activeId}`);
      setData(d || {});
      requestAnimationFrame(() => {
        if (stuckBottomRef.current && scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    } catch (e) { toast.error(e.message); }
  }, [activeId, toast]);

  useEffect(() => {
    loadList();
    const iv = setInterval(loadList, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadThread();
    const iv = setInterval(loadThread, 8000);
    return () => clearInterval(iv);
  }, [loadThread]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stuckBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !activeId) return;
    setSending(true);
    stuckBottomRef.current = true;
    try {
      await api.post(`/api/discussions/case/${activeId}`, { body, kind: "delete-request" });
      setText("");
      loadThread();
      loadList();
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  }

  const messages = data["delete-request"]?.messages || [];

  return (
    <AppShell>
      <div className="container fade-in">
        <h2>Delete requests</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Cases flagged for removal. Discuss with the requester, the uploader, and other doctors before any decision.
        </p>
        <div className="spacer-7" />

        <div className="dm-shell">
          <aside className={`dm-sidebar ${activeId ? "has-active" : ""}`}>
            <div className="dm-sidebar-head">Open requests ({items.length})</div>
            {items.length === 0 && <div className="empty" style={{ padding: 16 }}>No delete requests.</div>}
            <ul className="dm-thread-list">
              {items.map((d) => {
                const sel = d.case_id === activeId;
                const lastTs = d.last_reply_at || d.created_at;
                return (
                  <li key={d.id}>
                    <button className={`dm-thread ${sel ? "selected" : ""}`} onClick={() => setActiveId(d.case_id)}>
                      <Avatar url={d.requester_avatar_url} name={d.requester_name || d.requester_username} size={44} />
                      <div className="dm-thread-body">
                        <div className="dm-thread-row1">
                          <span className="dm-thread-name">{d.case_title}</span>
                          <span className="dm-thread-time muted small">{fmtTime(lastTs)}</span>
                        </div>
                        <div className="dm-thread-row2">
                          <span className="dm-thread-preview muted">
                            <span className={`badge ${d.status === "open" ? "badge-warning" : ""}`} style={{ marginRight: 6 }}>{d.status}</span>
                            {d.specialty} · @{d.requester_username}
                          </span>
                          {d.reply_count > 0 && <span className="badge badge-dot">{d.reply_count}</span>}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className={`dm-main ${activeId ? "has-active" : ""}`}>
            {!active && (
              <div className="empty dm-empty">
                <div>Select a delete request from the list.</div>
              </div>
            )}
            {active && (
              <>
                <header className="dm-header">
                  <button className="btn btn-ghost btn-sm dm-back" onClick={() => setActiveId(null)} aria-label="Back">←</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/case/${active.case_id}`} className="dm-header-name">{active.case_title}</Link>
                    <div className="muted small">
                      {active.specialty} · requested by{" "}
                      <Link href={`/u/${active.requester_username}`}>@{active.requester_username}</Link>{" "}
                      · <span className={`badge ${active.status === "open" ? "badge-warning" : ""}`}>{active.status}</span>
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/case/${active.case_id}`)}>Open case</button>
                </header>

                <div className="reason-strip">
                  <strong>Reason:</strong> <span className="muted">{active.reason}</span>
                </div>

                <div className="dm-thread-pane" ref={scrollRef} onScroll={onScroll}>
                  {messages.length === 0 && (
                    <div className="empty" style={{ margin: "auto" }}>No replies yet. Open the discussion.</div>
                  )}
                  {messages.map((m, i) => {
                    const mine = m.user_id === user?.id;
                    const prev = messages[i - 1];
                    const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                    return (
                      <div key={m.id}>
                        {newDay && (
                          <div className="dm-day-divider">
                            <span>{new Date(m.created_at).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</span>
                          </div>
                        )}
                        <div className={`bubble-row ${mine ? "mine" : ""}`}>
                          {!mine && <Avatar url={m.avatar_url} name={m.full_name || m.username} size={32} />}
                          <div className="bubble">
                            {!mine && (
                              <div className="bubble-meta">
                                <Link href={`/u/${m.username}`}><strong>@{m.username}</strong></Link>
                                <span className="badge" style={{ marginLeft: 6 }}>{m.role}</span>
                                {m.specialty && <span className="muted small"> · {m.specialty}</span>}
                              </div>
                            )}
                            <div className="bubble-body">{m.body}</div>
                            <div className="bubble-time">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form className="dm-composer" onSubmit={send}>
                  <textarea
                    className="textarea"
                    rows={2}
                    placeholder="Argue for delete, edit, or keep…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
                  />
                  <button className="btn btn-primary" disabled={sending || !text.trim()}>
                    {sending ? <span className="spinner" /> : "Send"}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
