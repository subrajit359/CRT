import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "wouter";
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

export default function CaseDiscussion() {
  const params = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const [data, setData] = useState({});
  const [caseInfo, setCaseInfo] = useState(null);
  const [tab, setTab] = useState("doctor");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const stuckBottomRef = useRef(true);
  const isStudent = user?.role === "student";
  const isDoc = user?.role === "doctor" || user?.role === "admin";

  const refresh = useCallback(() => {
    api.get(`/api/discussions/case/${params.caseId}`).then(setData).catch((e) => toast.error(e.message));
    api.get(`/api/cases/${params.caseId}`).then((r) => setCaseInfo(r.case)).catch(() => {});
  }, [params.caseId, toast]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 8000);
    return () => clearInterval(iv);
  }, [refresh]);

  const messages = data[tab]?.messages || [];

  useEffect(() => {
    if (stuckBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, tab]);

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
      await api.post(`/api/discussions/case/${params.caseId}`, { body, kind: tab });
      setText("");
      refresh();
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  }

  const canPostHere = tab === "doctor" ? true : isDoc;

  return (
    <AppShell>
      <div className="container fade-in">
        <Link href={`/case/${params.caseId}`} className="nav-link">← Back to case</Link>
        <h2 style={{ marginTop: 8 }}>{caseInfo?.title || "Case discussion"}</h2>
        <p className="muted small" style={{ marginTop: 4 }}>{caseInfo?.specialty}</p>

        <div className="spacer-7" />

        <div className="disc-tabs">
          <button
            className={`disc-tab ${tab === "doctor" ? "active" : ""}`}
            onClick={() => { setTab("doctor"); stuckBottomRef.current = true; }}
          >
            💬 Case discussion
            {data.doctor?.messages?.length > 0 && <span className="badge">{data.doctor.messages.length}</span>}
          </button>
          {!isStudent && (
            <button
              className={`disc-tab ${tab === "delete-request" ? "active" : ""}`}
              onClick={() => { setTab("delete-request"); stuckBottomRef.current = true; }}
            >
              🗑 Delete request
              {data["delete-request"]?.messages?.length > 0 && <span className="badge">{data["delete-request"].messages.length}</span>}
            </button>
          )}
        </div>

        <div className="lounge-shell" style={{ height: "calc(100vh - 320px)" }}>
          <div className="lounge-thread" ref={scrollRef} onScroll={onScroll}>
            {messages.length === 0 && (
              <div className="empty" style={{ margin: "auto" }}>
                {tab === "doctor"
                  ? "No replies yet. Start the discussion — anyone can ask, doctors and admins can clarify."
                  : "No messages yet."}
              </div>
            )}
            {messages.map((m) => {
              const mine = m.user_id === user?.id;
              return (
                <div key={m.id} className={`bubble-row ${mine ? "mine" : ""}`}>
                  {!mine && <Avatar url={m.avatar_url} name={m.full_name || m.username} size={32} />}
                  <div className="bubble">
                    {!mine && (
                      <div className="bubble-meta">
                        <Link href={`/u/${m.username}`}><strong>@{m.username}</strong></Link>
                        <span className="badge" style={{ marginLeft: 6 }}>{m.role}</span>
                        {m.specialty && <span className="muted small"> · {m.specialty}</span>}
                        {m.year_of_study && <span className="muted small"> · {m.year_of_study}</span>}
                      </div>
                    )}
                    <div className="bubble-body">{m.body}</div>
                    <div className="bubble-time">{fmtTime(m.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {canPostHere ? (
            <form className="lounge-composer" onSubmit={send}>
              <textarea
                className="textarea"
                rows={2}
                placeholder={
                  tab === "doctor"
                    ? "Ask a doubt, suggest an edit, or share a clinical pearl…"
                    : "Argue for delete, edit, or keep…"
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
              />
              <button className="btn btn-primary" disabled={sending || !text.trim()}>
                {sending ? <span className="spinner" /> : "Send"}
              </button>
            </form>
          ) : (
            <div className="lounge-composer" style={{ justifyContent: "center" }}>
              <span className="muted small">Only doctors and admins can post in delete-request threads.</span>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
