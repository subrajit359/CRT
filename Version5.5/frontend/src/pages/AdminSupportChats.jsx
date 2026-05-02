import { useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, MessageSquare, Send, RefreshCw, Inbox, Edit3, FileText } from "lucide-react";
import DisappearMenu from "../components/DisappearMenu.jsx";
import AppShell from "../components/AppShell.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import Pagination from "../components/Pagination.jsx";
import { SkeletonRows } from "../components/Skeleton.jsx";
import Avatar from "../components/Avatar.jsx";
import Modal from "../components/Modal.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useToast } from "../components/Toast.jsx";
import { relativeTime } from "../lib/date.js";

const THREAD_PAGE_SIZE = 10;

export default function AdminSupportChats() {
  const [, params] = useRoute("/admin/support/:threadId");
  const threadId = params?.threadId || null;

  if (threadId) return <SupportChatView threadId={threadId} />;
  return <SupportChatList />;
}

function SupportChatList() {
  const [data, setData] = useState({ threads: [], loading: true, error: null });
  const [page, setPage] = useState(1);

  function load() {
    setData((d) => ({ ...d, loading: true, error: null }));
    api.get("/api/support")
      .then((r) => { setData({ threads: r.threads || [], loading: false, error: null }); setPage(1); })
      .catch((e) => setData({ threads: [], loading: false, error: e?.message || "Could not load support chats" }));
  }
  useEffect(() => { load(); }, []);

  return (
    <AppShell>
      <div className="container fade-in">
        <div>
          <Link href="/admin" className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" /> Back to admin
          </Link>
          <h2 style={{ margin: 0 }}>Doctor support chats</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            Conversations with applying doctors. Every admin can see and reply here.
          </p>
        </div>

        <div className="spacer-7" />
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0 }}>
              Threads
              <span className="muted small" style={{ marginLeft: 8 }}>({data.threads.length})</span>
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={load}>
              <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" /> Refresh
            </button>
          </div>
          <div className="spacer-7" />
          {data.loading ? (
            <SkeletonRows n={4} avatar />
          ) : data.error ? (
            <ErrorState body={data.error} onRetry={load} />
          ) : data.threads.length === 0 ? (
            <EmptyState
              icon={<Inbox size={24} strokeWidth={1.75} aria-hidden="true" />}
              title="No support chats yet"
              body="When a doctor messages an admin from their inbox, the conversation will appear here."
            />
          ) : (() => {
            const totalPages = Math.max(1, Math.ceil(data.threads.length / THREAD_PAGE_SIZE));
            const safePage = Math.min(page, totalPages);
            const slice = data.threads.slice((safePage - 1) * THREAD_PAGE_SIZE, safePage * THREAD_PAGE_SIZE);
            return (
            <div>
              {slice.map((t) => (
                <Link
                  key={t.thread_id}
                  href={`/admin/support/${t.thread_id}`}
                  className="admin-card-row"
                  style={{ display: "block", textDecoration: "none", color: "inherit", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <Avatar url={t.doctor_avatar_url} name={t.doctor_full_name || t.doctor_username} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong className="clamp-2" style={{ display: "block" }}>{t.doctor_full_name || t.doctor_username}</strong>
                          <div className="muted small">
                            @{t.doctor_username} · {t.specialty || "—"}
                            {t.doctor_status && (
                              <> · <span style={{
                                color: t.doctor_status === "rejected" ? "var(--rose-700)" :
                                       t.doctor_status === "approved" ? "var(--green-700)" :
                                       "var(--amber-700)",
                              }}>{t.doctor_status}</span></>
                            )}
                          </div>
                        </div>
                        <div className="muted small" style={{ flexShrink: 0 }} title={t.last_at ? new Date(t.last_at).toLocaleString() : ""}>
                          {relativeTime(t.last_at) || "—"}
                          {t.unread > 0 && (
                            <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: 11 }}>
                              {t.unread} new
                            </span>
                          )}
                        </div>
                      </div>
                      {t.last_body && (
                        <div className="muted small clamp-2" style={{ marginTop: 6 }}>{t.last_body}</div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              <Pagination
                page={safePage}
                totalPages={totalPages}
                total={data.threads.length}
                onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              />
            </div>
            );
          })()}
        </div>
      </div>
    </AppShell>
  );
}

function SupportChatView({ threadId }) {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState({ thread: null, messages: [], loading: true, error: null });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const inviteNoteRef = useRef(null);
  const scrollerRef = useRef(null);

  async function load() {
    try {
      const r = await api.get(`/api/support/${threadId}`);
      setData({ thread: r.thread, messages: r.messages || [], loading: false, error: null });
    } catch (e) {
      setData({ thread: null, messages: [], loading: false, error: e?.message || "Could not load chat" });
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [threadId]);

  // Poll for new doctor replies.
  useEffect(() => {
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, [threadId]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data.messages]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const r = await api.post(`/api/support/${threadId}/messages`, { body });
      setData((d) => ({ ...d, messages: [...d.messages, r.message] }));
      setDraft("");
    } catch (e) {
      toast.error(e?.message || "Could not send");
    } finally {
      setSending(false);
    }
  }

  async function sendReapplyInvite() {
    setInviteBusy(true);
    try {
      const note = inviteNoteRef.current?.value?.trim() || "";
      const r = await api.post(`/api/support/${threadId}/reapply-invite`, { note });
      setData((d) => ({ ...d, messages: [...d.messages, r.message] }));
      setInviteOpen(false);
      if (inviteNoteRef.current) inviteNoteRef.current.value = "";
      toast.success("Reapply invitation sent");
    } catch (e) {
      toast.error(e?.message || "Could not send invitation");
    } finally {
      setInviteBusy(false);
    }
  }

  const status = data.thread?.doctor_status;
  const canInvite = status === "rejected";

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 820 }}>
        <Link href="/admin/support" className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" /> All support chats
        </Link>

        {data.loading ? (
          <div className="card"><div className="muted small">Loading…</div></div>
        ) : data.error ? (
          <ErrorState body={data.error} onRetry={load} />
        ) : !data.thread ? (
          <ErrorState body="Thread not found" />
        ) : (
          <>
            <div className="card">
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Avatar url={data.thread.doctor_avatar_url} name={data.thread.doctor_full_name || data.thread.doctor_username} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>
                    <Link href={`/u/${data.thread.doctor_username}`}>{data.thread.doctor_full_name || data.thread.doctor_username}</Link>
                  </h3>
                  <div className="muted small" style={{ marginTop: 2 }}>
                    @{data.thread.doctor_username} · {data.thread.doctor_email}
                  </div>
                  <div className="muted small" style={{ marginTop: 6 }}>
                    <strong>Status:</strong>{" "}
                    <span style={{
                      color: data.thread.doctor_status === "rejected" ? "var(--rose-700)" :
                             data.thread.doctor_status === "approved" ? "var(--green-700)" :
                             "var(--amber-700)",
                      fontWeight: 600,
                    }}>{data.thread.doctor_status || "—"}</span>
                    {data.thread.specialty && <> · <strong>Specialty:</strong> {data.thread.specialty}</>}
                    {data.thread.license_number && <> · <strong>License:</strong> {data.thread.license_number}</>}
                  </div>
                  {data.thread.reviewer_note && (
                    <div className="muted small" style={{ marginTop: 6, padding: 8, background: "var(--paper)", borderRadius: 8 }}>
                      <strong>Review note:</strong> {data.thread.reviewer_note}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <Link href="/admin/doctor-approvals" className="btn btn-ghost btn-sm">View applications</Link>
                  {canInvite && (
                    <button className="btn btn-primary btn-sm" onClick={() => setInviteOpen(true)}>
                      <Edit3 size={14} strokeWidth={1.75} aria-hidden="true" /> Send reapply invite
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="spacer-7" />
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <MessageSquare size={18} strokeWidth={1.75} aria-hidden="true" /> Conversation
                </h3>
                <div style={{ marginLeft: "auto" }}>
                  <DisappearMenu
                    value={data.thread.disappear_seconds ?? null}
                    onChange={async (seconds) => {
                      try {
                        const r = await api.patch(`/api/support/${threadId}/disappear`, { seconds });
                        setData((d) => ({ ...d, thread: { ...d.thread, disappear_seconds: r.disappear_seconds } }));
                        toast.success(seconds == null
                          ? "Disappearing messages turned off"
                          : "Disappearing-message timer updated");
                      } catch (e) {
                        toast.error(e?.message || "Could not update timer");
                      }
                    }}
                  />
                </div>
              </div>
              <div className="spacer-7" />
              <div
                ref={scrollerRef}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: 12,
                  minHeight: 280,
                  maxHeight: 480,
                  overflowY: "auto",
                  background: "var(--paper)",
                }}
              >
                {data.messages.length === 0 ? (
                  <div className="muted small" style={{ textAlign: "center", padding: 24 }}>
                    No messages yet.
                  </div>
                ) : (
                  data.messages.map((m) => (
                    <AdminChatMessage key={m.id} message={m} mine={m.sender_id === user?.id} />
                  ))
                )}
              </div>
              <div className="spacer-7" />
              <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
                <textarea
                  className="input"
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Reply to the doctor…"
                  style={{ flex: 1, resize: "vertical", minHeight: 44 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={send}
                  disabled={!draft.trim() || sending}
                >
                  <Send size={14} strokeWidth={1.75} aria-hidden="true" /> {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite this doctor to reapply"
      >
        <p className="muted small" style={{ marginTop: 0 }}>
          The doctor will see a button in the chat that opens a prefilled re-application form. Their name, username, and password remain unchanged.
        </p>
        <label className="label">What should they correct? (optional)</label>
        <textarea
          className="input"
          rows={4}
          ref={inviteNoteRef}
          defaultValue=""
          placeholder="e.g. Please attach a clearer copy of your registration certificate."
          style={{ width: "100%", resize: "vertical" }}
        />
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={() => setInviteOpen(false)} disabled={inviteBusy}>Cancel</button>
          <button className="btn btn-primary" onClick={sendReapplyInvite} disabled={inviteBusy}>
            {inviteBusy ? <span className="spinner" /> : "Send invitation"}
          </button>
        </div>
      </Modal>
    </AppShell>
  );
}

function AdminChatMessage({ message: m, mine }) {
  const isInvite = m.kind === "reapply_invite";
  const isResubmit = m.kind === "reapply_submitted";

  if (isInvite) {
    return (
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexDirection: mine ? "row-reverse" : "row" }}>
        <Avatar url={m.sender_avatar_url} name={m.sender_full_name || m.sender_username} size={28} />
        <div style={{ maxWidth: "85%", flex: 1 }}>
          <div className="muted small" style={{ marginBottom: 2, textAlign: mine ? "right" : "left" }}>
            {mine ? "You" : m.sender_full_name || m.sender_username} · admin · <span title={new Date(m.created_at).toLocaleString()}>{relativeTime(m.created_at)}</span>
          </div>
          <div
            style={{
              background: "var(--primary-soft, #eef2ff)",
              border: "1px solid var(--primary, #6366f1)",
              padding: 12,
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Edit3 size={16} strokeWidth={1.75} aria-hidden="true" />
              Reapply invitation sent
            </div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
          </div>
        </div>
      </div>
    );
  }

  if (isResubmit) {
    return (
      <div style={{ display: "flex", marginBottom: 10, justifyContent: "center" }}>
        <div
          className="muted small"
          style={{
            background: "var(--bg-soft, #f1f5f9)",
            padding: "6px 12px",
            borderRadius: 999,
            fontStyle: "italic",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <FileText size={12} strokeWidth={1.75} aria-hidden="true" />
          {m.body} · <span title={new Date(m.created_at).toLocaleString()}>{relativeTime(m.created_at)}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 10,
        flexDirection: mine ? "row-reverse" : "row",
      }}
    >
      <Avatar url={m.sender_avatar_url} name={m.sender_full_name || m.sender_username} size={28} />
      <div style={{ maxWidth: "75%" }}>
        <div className="muted small" style={{ marginBottom: 2, textAlign: mine ? "right" : "left" }}>
          {mine ? "You" : `${m.sender_full_name || m.sender_username}${m.sender_role === "admin" ? " · admin" : m.sender_role === "doctor" ? " · doctor" : ""}`}
          {" · "}
          <span title={new Date(m.created_at).toLocaleString()}>{relativeTime(m.created_at)}</span>
        </div>
        <div
          style={{
            background: mine ? "var(--primary-soft)" : "var(--bg-elev)",
            color: mine ? "var(--primary-ink)" : "var(--text)",
            border: "1px solid var(--line)",
            padding: "8px 12px",
            borderRadius: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {m.body}
        </div>
      </div>
    </div>
  );
}
