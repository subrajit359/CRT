import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../lib/auth.jsx";

function fmtTime(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DoctorLounge() {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const stuckBottomRef = useRef(true);

  async function load() {
    try {
      const r = await api.get("/api/lounge");
      setMessages(r.messages || []);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!stuckBottomRef.current) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stuckBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    stuckBottomRef.current = true;
    try {
      const r = await api.post("/api/lounge", { body });
      setMessages((prev) => [...prev, r.message]);
      setText("");
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  }

  return (
    <AppShell>
      <div className="container fade-in">
        <div className="row-between">
          <div>
            <h2>Doctor Lounge</h2>
            <p className="muted small">A global, real-time conversation for verified doctors and admins.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
        </div>
        <div className="spacer-7" />

        <div className="lounge-shell">
          <div className="lounge-thread" ref={scrollRef} onScroll={onScroll}>
            {messages.length === 0 && <div className="empty" style={{ margin: "auto" }}>Be the first to say hello.</div>}
            {messages.map((m) => {
              const mine = m.user_id === user?.id;
              return (
                <div key={m.id} className={`bubble-row ${mine ? "mine" : ""}`}>
                  {!mine && <Avatar url={m.avatar_url} name={m.full_name || m.username} size={32} />}
                  <div className="bubble">
                    {!mine && (
                      <div className="bubble-meta">
                        <Link href={`/u/${m.username}`}><strong>@{m.username}</strong></Link>
                        {m.specialty && <span className="muted small"> · {m.specialty}</span>}
                        {m.role === "admin" && <span className="badge badge-primary" style={{ marginLeft: 6 }}>admin</span>}
                      </div>
                    )}
                    <div className="bubble-body">{m.body}</div>
                    <div className="bubble-time">{fmtTime(m.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <form className="lounge-composer" onSubmit={send}>
            <textarea
              className="textarea"
              rows={2}
              placeholder="Share a clinical pearl, ask the room, or coordinate verifications…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e); }}
            />
            <button className="btn btn-primary" disabled={sending || !text.trim()}>
              {sending ? <span className="spinner" /> : "Send"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
