import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useParams, useLocation } from "wouter";
import { Check, CheckCheck, MoreVertical, Pencil, Trash2, X } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import DisappearMenu from "../components/DisappearMenu.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../lib/auth.jsx";

const HIDDEN_THREADS_KEY = "crt_hidden_threads";
function getHiddenThreads() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_THREADS_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveHiddenThreads(set) {
  try { localStorage.setItem(HIDDEN_THREADS_KEY, JSON.stringify([...set])); } catch {}
}

const HOLD_DURATION = 500;

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

// Inline bubble context menu
function BubbleMenu({ msgId, mine, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!mine) return null;

  return (
    <div ref={ref} className="bubble-menu" style={{ position: "relative" }}>
      <button
        className="bubble-menu-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Message actions"
        title="Message actions"
      >
        <MoreVertical size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div
          style={{
            position: "absolute", right: 0, bottom: "calc(100% + 4px)", zIndex: 300,
            background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.14)", minWidth: 140,
            animation: "fadeIn 100ms ease", overflow: "hidden",
          }}
        >
          <button
            className="dropdown-item"
            onClick={() => { setOpen(false); onEdit(msgId); }}
          >
            <Pencil size={13} strokeWidth={1.75} aria-hidden="true" /> Edit
          </button>
          <button
            className="dropdown-item is-danger"
            onClick={() => { setOpen(false); onDelete(msgId); }}
          >
            <Trash2 size={13} strokeWidth={1.75} aria-hidden="true" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

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

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const editRef = useRef(null);

  // Hidden threads (local-only, persisted in localStorage)
  const [hiddenThreads, setHiddenThreads] = useState(() => getHiddenThreads());
  // Selection mode for thread list
  const [selectMode, setSelectMode] = useState(false);
  const [selectedThreads, setSelectedThreads] = useState(new Set());

  // Add/remove body class so the mobile tabbar hides when chat is open
  useEffect(() => {
    if (username) {
      document.body.classList.add("dm-chat-active");
    } else {
      document.body.classList.remove("dm-chat-active");
    }
    return () => document.body.classList.remove("dm-chat-active");
  }, [username]);

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

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
    api.post(`/api/messages/with/${username}/typing`, {}).catch((e) => {
      console.warn("Typing ping failed:", e?.message || e);
    });
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

  function startEdit(msgId) {
    const m = activeMsgs.find((x) => x.id === msgId);
    if (!m || m.deleted_at) return;
    setEditingId(msgId);
    setEditText(m.body);
  }

  async function saveEdit(msgId) {
    const body = editText.trim();
    if (!body) return;
    try {
      const r = await api.patch(`/api/messages/msg/${msgId}`, { body });
      setActiveMsgs((prev) => prev.map((m) => m.id === msgId ? { ...m, ...r.message } : m));
      setEditingId(null);
    } catch (e) { toast.error(e.message); }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function deleteMsg(msgId) {
    try {
      const r = await api.del(`/api/messages/msg/${msgId}`);
      setActiveMsgs((prev) => prev.map((m) => m.id === msgId ? { ...m, ...r.message } : m));
    } catch (e) { toast.error(e.message); }
  }

  function hideThread(threadUsername) {
    const next = new Set(hiddenThreads);
    next.add(threadUsername);
    setHiddenThreads(next);
    saveHiddenThreads(next);
    if (username === threadUsername) navigate("/messages");
  }

  function removeSelected() {
    const next = new Set(hiddenThreads);
    selectedThreads.forEach((u) => next.add(u));
    setHiddenThreads(next);
    saveHiddenThreads(next);
    setSelectedThreads(new Set());
    setSelectMode(false);
    if (username && selectedThreads.has(username)) navigate("/messages");
  }

  function toggleSelectThread(u) {
    setSelectedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u); else next.add(u);
      return next;
    });
  }

  const visibleThreads = threads.filter((t) => !hiddenThreads.has(t.other_username));

  return (
    <AppShell>
      <div className="container fade-in" style={{ paddingBottom: 0, marginBottom: "calc(-1 * var(--s-7))" }}>
        <div className="dm-shell">
          <aside className={`dm-sidebar ${username ? "has-active" : ""}`}>
            <div className="dm-sidebar-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Chats</span>
              {selectMode ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {selectedThreads.size > 0 && (
                    <button
                      className="btn btn-sm"
                      style={{ background: "var(--danger, #ef4444)", color: "#fff", border: "none", borderRadius: 8, padding: "4px 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}
                      onClick={removeSelected}
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                      Remove {selectedThreads.size}
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 13 }}
                    onClick={() => { setSelectMode(false); setSelectedThreads(new Set()); }}
                  >
                    <X size={14} strokeWidth={1.75} /> Cancel
                  </button>
                </div>
              ) : (
                visibleThreads.length > 0 && (
                  <span className="muted small" style={{ fontSize: 11 }}>Hold to select</span>
                )
              )}
            </div>
            {loadingThreads && <div className="empty">Loading…</div>}
            {!loadingThreads && visibleThreads.length === 0 && (
              <div className="empty" style={{ padding: 16 }}>
                No conversations yet. Open someone's profile and tap "Message".
              </div>
            )}
            <ul className="dm-thread-list">
              {visibleThreads.map((t) => (
                <ThreadItem
                  key={t.thread_id}
                  t={t}
                  isActive={t.other_username === username}
                  selectMode={selectMode}
                  isSelected={selectedThreads.has(t.other_username)}
                  onActivate={() => {
                    if (selectMode) { toggleSelectThread(t.other_username); return; }
                    navigate(`/messages/u/${t.other_username}`);
                  }}
                  onHoldSelect={() => {
                    setSelectMode(true);
                    setSelectedThreads(new Set([t.other_username]));
                  }}
                  onQuickHide={() => hideThread(t.other_username)}
                />
              ))}
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
                  <div style={{ marginLeft: "auto" }}>
                    <DisappearMenu
                      value={active.disappear_seconds ?? null}
                      onChange={async (seconds) => {
                        try {
                          const r = await api.patch(`/api/messages/with/${username}/disappear`, { seconds });
                          setActive((a) => a ? { ...a, disappear_seconds: r.disappear_seconds } : a);
                          toast.success(seconds == null
                            ? "Disappearing messages turned off"
                            : "Disappearing-message timer updated");
                        } catch (e) {
                          toast.error(e?.message || "Could not update timer");
                        }
                      }}
                    />
                  </div>
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
                    const isDeleted = !!m.deleted_at;
                    const isEditing = editingId === m.id;

                    return (
                      <div key={m.id}>
                        {newDay && (
                          <div className="dm-day-divider">
                            <span>{new Date(m.created_at).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</span>
                          </div>
                        )}
                        <div className={`bubble-row ${mine ? "mine" : ""}`}>
                          <div className={`bubble ${isDeleted ? "bubble-deleted" : ""}`}>
                            {isEditing ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <textarea
                                  ref={editRef}
                                  className="textarea"
                                  rows={2}
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(m.id); }
                                    if (e.key === "Escape") cancelEdit();
                                  }}
                                  style={{ fontSize: 13, minWidth: 180, resize: "none" }}
                                />
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                                  <button className="btn btn-primary btn-sm" onClick={() => saveEdit(m.id)} disabled={!editText.trim()}>Save</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="bubble-body" style={isDeleted ? { fontStyle: "italic", opacity: 0.55 } : {}}>
                                  {isDeleted ? "This message was deleted" : m.body}
                                </div>
                                <div className="bubble-time">
                                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  {m.edited_at && !isDeleted && (
                                    <span className="muted" style={{ fontSize: 10, marginLeft: 4 }}>edited</span>
                                  )}
                                  {mine && !isDeleted && (
                                    <span
                                      className="bubble-ticks"
                                      title={m.read_at ? "Read" : "Sent"}
                                      style={{ display: "inline-flex", alignItems: "center", marginLeft: 4 }}
                                    >
                                      {m.read_at
                                        ? <CheckCheck size={12} strokeWidth={2} aria-hidden="true" />
                                        : <Check size={12} strokeWidth={2} aria-hidden="true" />}
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          {mine && !isDeleted && !isEditing && (
                            <BubbleMenu msgId={m.id} mine={mine} onEdit={startEdit} onDelete={deleteMsg} />
                          )}
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

function ThreadItem({ t, isActive, selectMode, isSelected, onActivate, onHoldSelect, onQuickHide }) {
  const holdTimer = useRef(null);
  const didHold = useRef(false);

  function startHold() {
    didHold.current = false;
    holdTimer.current = setTimeout(() => {
      didHold.current = true;
      if (navigator.vibrate) navigator.vibrate(40);
      onHoldSelect();
    }, HOLD_DURATION);
  }

  function cancelHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }

  function handleClick(e) {
    if (didHold.current) { e.preventDefault(); return; }
    cancelHold();
    onActivate();
  }

  return (
    <li style={{ position: "relative" }}>
      <button
        className={`dm-thread ${isActive && !selectMode ? "selected" : ""} ${isSelected ? "dm-thread-selected" : ""}`}
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        onTouchMove={cancelHold}
        onClick={handleClick}
        style={{ userSelect: "none", WebkitUserSelect: "none" }}
      >
        {selectMode && (
          <div className={`dm-select-circle ${isSelected ? "checked" : ""}`} aria-hidden="true">
            {isSelected && <span>✓</span>}
          </div>
        )}
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
              <span className="dm-thread-preview typing-text">typing<span className="typing-dots"><span /><span /><span /></span></span>
            ) : (
              <span className="dm-thread-preview muted">{t.last_body || "No messages yet"}</span>
            )}
            {t.unread > 0 && <span className="badge badge-dot">{t.unread}</span>}
          </div>
        </div>
        {!selectMode && (
          <button
            className="dm-quick-hide"
            title="Remove from list"
            onClick={(e) => { e.stopPropagation(); onQuickHide(); }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </button>
    </li>
  );
}
