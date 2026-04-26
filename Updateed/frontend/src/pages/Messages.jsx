import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useParams, useLocation } from "wouter";
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
  const week = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - d.getTime() < week) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const ONLINE_WINDOW_MS = 2 * 60 * 1000;
function isOnline(iso) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t < ONLINE_WINDOW_MS;
}
function fmtLastSeen(iso) {
  if (!iso) return "Offline";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "Offline";
  const diff = Date.now() - t;
  if (diff < ONLINE_WINDOW_MS) return "Online";
  const min = Math.floor(diff / 60000);
  if (min < 60) return `Last seen ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Last seen ${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `Last seen ${day}d ago`;
  return `Last seen ${new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

const PAGE_SIZE = 10;
const OLDER_PAGE = 20;

export default function Messages() {
  const params = useParams();
  const [, navigate] = useLocation();
  const toast = useToast();
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [active, setActive] = useState(null);
  const [activeMsgs, setActiveMsgs] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const lastTypingPing = useRef(0);
  const username = params?.username;

  async function loadThreads() {
    try {
      const r = await api.get("/api/messages/threads");
      setThreads(r.threads || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoadingThreads(false); }
  }

  const loadConversation = useCallback(async (uname) => {
    if (!uname) { setActive(null); setActiveMsgs([]); setHasMore(false); return; }
    try {
      const r = await api.get(`/api/messages/with/${uname}?limit=${PAGE_SIZE}`);
      setActive(r.thread);
      setActiveMsgs(r.messages || []);
      setHasMore(!!r.hasMore);
      loadThreads();
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    } catch (e) { toast.error(e.message); }
  }, [toast]);

  async function pollNew() {
    if (!username) return;
    try {
      const r = await api.get(`/api/messages/with/${username}?limit=${PAGE_SIZE}`);
      if (r.thread) setActive(r.thread);
      const ids = new Set(activeMsgs.map((m) => m.id));
      const newOnes = (r.messages || []).filter((m) => !ids.has(m.id));
      if (newOnes.length) {
        setActiveMsgs((prev) => {
          const merged = [...prev, ...newOnes].filter((m, i, a) => a.findIndex((x) => x.id === m.id) === i);
          merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          return merged;
        });
        const el = scrollRef.current;
        if (el) {
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (nearBottom) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
        }
      }
    } catch {}
  }

  function pingTyping() {
    if (!username) return;
    const now = Date.now();
    if (now - lastTypingPing.current < 3000) return;
    lastTypingPing.current = now;
    api.post(`/api/messages/with/${username}/typing`, {}).catch(() => {});
  }

  async function loadOlder() {
    if (!username || loadingOlder || !hasMore || activeMsgs.length === 0) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el ? el.scrollHeight : 0;
    const prevTop = el ? el.scrollTop : 0;
    try {
      const oldest = activeMsgs[0].created_at;
      const r = await api.get(`/api/messages/with/${username}?limit=${OLDER_PAGE}&before=${encodeURIComponent(oldest)}`);
      const older = r.messages || [];
      if (older.length) {
        setActiveMsgs((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !ids.has(m.id)), ...prev];
        });
      }
      setHasMore(!!r.hasMore);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop;
      });
    } catch (e) { toast.error(e.message); }
    finally { setLoadingOlder(false); }
  }

  function onScroll() {
    if (!scrollRef.current) return;
    if (scrollRef.current.scrollTop < 60) loadOlder();
  }

  useEffect(() => {
    loadThreads();
    const iv = setInterval(loadThreads, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadConversation(username);
  }, [username, loadConversation]);

  useEffect(() => {
    if (!username) return;
    const iv = setInterval(pollNew, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, activeMsgs]);

  // When the on-screen keyboard opens (visual viewport shrinks), jump to the latest message.
  useEffect(() => {
    if (!username) return;
    const scrollToBottom = () => {
      const el = scrollRef.current;
      if (!el) return;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    };
    let lastH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const onResize = () => {
      const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      if (h < lastH - 80) {
        scrollToBottom();
        setTimeout(scrollToBottom, 150);
        setTimeout(scrollToBottom, 350);
      }
      lastH = h;
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onResize);
    } else {
      window.addEventListener("resize", onResize);
    }
    return () => {
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", onResize);
      else window.removeEventListener("resize", onResize);
    };
  }, [username]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !username) return;
    setSending(true);
    try {
      const r = await api.post(`/api/messages/with/${username}`, { body });
      setActiveMsgs((prev) => [...prev, r.message]);
      setText("");
      loadThreads();
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  }

  return (
    <AppShell>
      <div className="container fade-in">
        <h2>Messages</h2>
        <div className="spacer-7" />
        <div className="dm-shell">
          <aside className={`dm-sidebar ${username ? "has-active" : ""}`}>
            <div className="dm-sidebar-head">Chats</div>
            {loadingThreads && <div className="empty">Loading…</div>}
            {!loadingThreads && threads.length === 0 && (
              <div className="empty" style={{ padding: 16 }}>
                No conversations yet. Open someone's profile and tap "Message".
              </div>
            )}
            <ul className="dm-thread-list">
              {threads.map((t) => {
                const sel = t.other_username === username;
                return (
                  <li key={t.thread_id}>
                    <button
                      className={`dm-thread ${sel ? "selected" : ""}`}
                      onClick={() => navigate(`/messages/u/${t.other_username}`)}
                    >
                      <div className="dm-avatar-wrap">
                        <Avatar url={t.other_avatar_url} name={t.other_full_name || t.other_username} size={44} />
                        {isOnline(t.other_last_seen_at) && <span className="online-dot" title="Online" />}
                      </div>
                      <div className="dm-thread-body">
                        <div className="dm-thread-row1">
                          <span className="dm-thread-name">{t.other_full_name || `@${t.other_username}`}</span>
                          <span className="dm-thread-time muted small">{t.last_created ? fmtTime(t.last_created) : ""}</span>
                        </div>
                        <div className="dm-thread-row2">
                          {t.other_is_typing ? (
                            <span className="dm-thread-preview typing-text">typing<span className="typing-dots"><span/><span/><span/></span></span>
                          ) : (
                            <span className="dm-thread-preview muted">{t.last_body || "No messages yet"}</span>
                          )}
                          {t.unread > 0 && <span className="badge badge-dot">{t.unread}</span>}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className={`dm-main ${username ? "has-active" : ""}`}>
            {!username && (
              <div className="empty dm-empty">
                <div>Select a chat, or visit a user's profile and tap <strong>Message</strong>.</div>
              </div>
            )}
            {username && active && (
              <>
                <header className="dm-header">
                  <button className="btn btn-ghost btn-sm dm-back" onClick={() => navigate("/messages")} aria-label="Back">←</button>
                  <Link href={`/u/${active.other.username}`} className="dm-header-link">
                    <div className="dm-avatar-wrap">
                      <Avatar url={active.other.avatar_url} name={active.other.full_name || active.other.username} size={40} />
                      {isOnline(active.other.last_seen_at) && <span className="online-dot" title="Online" />}
                    </div>
                    <div>
                      <div className="dm-header-name">{active.other.full_name || `@${active.other.username}`}</div>
                      {active.other.is_typing ? (
                        <div className="small typing-text">
                          typing<span className="typing-dots"><span/><span/><span/></span>
                        </div>
                      ) : (
                        <div className={`small ${isOnline(active.other.last_seen_at) ? "online-text" : "muted"}`}>
                          {fmtLastSeen(active.other.last_seen_at)} · {active.other.role}
                        </div>
                      )}
                    </div>
                  </Link>
                </header>
                <div className="dm-thread-pane" ref={scrollRef} onScroll={onScroll}>
                  {hasMore && (
                    <div className="dm-load-older">
                      <button className="btn btn-ghost btn-sm" onClick={loadOlder} disabled={loadingOlder}>
                        {loadingOlder ? <span className="spinner" /> : "Load older messages"}
                      </button>
                    </div>
                  )}
                  {activeMsgs.length === 0 && (
                    <div className="empty" style={{ margin: "auto" }}>Say hello — your messages are private.</div>
                  )}
                  {activeMsgs.map((m, i) => {
                    const mine = m.sender_id === user?.id;
                    const prev = activeMsgs[i - 1];
                    const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                    return (
                      <div key={m.id}>
                        {newDay && (
                          <div className="dm-day-divider">
                            <span>{new Date(m.created_at).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</span>
                          </div>
                        )}
                        <div className={`bubble-row ${mine ? "mine" : ""}`}>
                          <div className="bubble">
                            <div className="bubble-body">{m.body}</div>
                            <div className="bubble-time">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              {mine && <span className="bubble-ticks" title={m.read_at ? "Read" : "Sent"}>{m.read_at ? " ✓✓" : " ✓"}</span>}
                            </div>
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
                    placeholder={`Message ${active.other.full_name || "@" + active.other.username}…`}
                    value={text}
                    onChange={(e) => { setText(e.target.value); pingTyping(); }}
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
