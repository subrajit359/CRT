import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useLocation, Link } from "wouter";
import { ArrowLeft, MessageSquare, Trash2, ChevronUp } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import EditInsteadModal from "../components/EditInsteadModal.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
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

const PAGE_LIMIT = 100;

export default function CaseDiscussion() {
  const params = useParams();
  const [location] = useLocation();
  const toast = useToast();
  const { user } = useAuth();
  const [confirmEl, askConfirm] = useConfirm();

  // URL query params let other pages (e.g. the admin dashboard's delete-request
  // list) deep-link into a specific tab and pre-seed which delete request the
  // admin is acting on.
  const queryParams = useMemo(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    return new URLSearchParams(search);
  }, [location]);
  const initialTab = queryParams.get("tab") === "delete-request" ? "delete-request" : "doctor";
  const initialDrId = queryParams.get("dr");

  const [data, setData] = useState({});
  const [hasMore, setHasMore] = useState({ doctor: false, "delete-request": false });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [caseInfo, setCaseInfo] = useState(null);
  const [tab, setTab] = useState(initialTab);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [openDr, setOpenDr] = useState(initialDrId ? { id: Number(initialDrId), case_id: params.caseId } : null);
  const [drLoading, setDrLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const scrollRef = useRef(null);
  const stuckBottomRef = useRef(true);
  const isStudent = user?.role === "student";
  const isDoc = user?.role === "doctor" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

  const refresh = useCallback(async () => {
    try {
      const r = await api.get(`/api/discussions/case/${params.caseId}?limit=${PAGE_LIMIT}`);
      // Server returns { doctor: { id, messages, hasMore }, "delete-request": {...} }
      const next = {};
      const more = { doctor: false, "delete-request": false };
      for (const k of Object.keys(r || {})) {
        next[k] = r[k];
        more[k] = !!r[k]?.hasMore;
      }
      setData(next);
      setHasMore(more);
    } catch (e) {
      toast.error(e.message);
    }
    // Case info is informational; failing to load shouldn't block the thread.
    api.get(`/api/cases/${params.caseId}`)
      .then((r) => setCaseInfo(r.case))
      .catch((err) => console.warn("Case info fetch failed:", err?.message || err));
  }, [params.caseId, toast]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 8000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Fetch the open delete request for this case (so admins can act on it from
  // the discussion page even when arriving without a `dr` query param).
  const refreshOpenDr = useCallback(async () => {
    if (!isDoc) return;
    setDrLoading(true);
    try {
      const r = await api.get(`/api/discussions/delete-requests/by-case/${params.caseId}`);
      setOpenDr(r?.request || null);
    } catch (e) {
      // Non-fatal — discussion page still works without an actionable dr.
      console.warn("Could not load open delete request:", e?.message || e);
    } finally {
      setDrLoading(false);
    }
  }, [params.caseId, isDoc]);

  useEffect(() => { refreshOpenDr(); }, [refreshOpenDr]);

  async function approveDelete() {
    if (!openDr) return;
    const ok = await askConfirm({
      title: "Approve delete request?",
      body: <>This will permanently hide <strong>"{caseInfo?.title || `Case #${params.caseId}`}"</strong> from learners. Their attempt history is preserved.</>,
      confirmLabel: "Delete case",
      cancelLabel: "Cancel",
      tone: "danger",
      requireText: "DELETE",
    });
    if (!ok) return;
    try {
      await api.patch(`/api/admin/delete-requests/${openDr.id}`, { decision: "approved" });
      toast.success("Case deleted");
      setOpenDr(null);
    } catch (e) { toast.error(e.message); }
  }

  async function rejectDelete() {
    if (!openDr) return;
    const ok = await askConfirm({
      title: "Reject delete request?",
      body: "The case stays live. The requester will be notified the request was declined.",
      confirmLabel: "Reject request",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    try {
      await api.patch(`/api/admin/delete-requests/${openDr.id}`, { decision: "rejected" });
      toast.success("Request rejected");
      setOpenDr(null);
    } catch (e) { toast.error(e.message); }
  }

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

  async function loadOlder() {
    const current = data[tab]?.messages || [];
    if (current.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    const oldest = current[0]?.created_at;
    const el = scrollRef.current;
    const prevScrollHeight = el?.scrollHeight || 0;
    const prevScrollTop = el?.scrollTop || 0;
    try {
      const r = await api.get(
        `/api/discussions/case/${params.caseId}?limit=${PAGE_LIMIT}&kind=${encodeURIComponent(tab)}&before=${encodeURIComponent(oldest)}`
      );
      const olderBlock = r[tab];
      const older = olderBlock?.messages || [];
      if (older.length === 0) {
        setHasMore((m) => ({ ...m, [tab]: false }));
      } else {
        setData((prev) => ({
          ...prev,
          [tab]: {
            ...(prev[tab] || {}),
            id: olderBlock?.id ?? prev[tab]?.id,
            messages: [...older, ...current],
          },
        }));
        setHasMore((m) => ({ ...m, [tab]: !!olderBlock?.hasMore }));
        stuckBottomRef.current = false;
        requestAnimationFrame(() => {
          const el2 = scrollRef.current;
          if (!el2) return;
          el2.scrollTop = prevScrollTop + (el2.scrollHeight - prevScrollHeight);
        });
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingOlder(false);
    }
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
        <Link href={`/case/${params.caseId}`} className="nav-link" aria-label="Back to case">
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          <span style={{ marginLeft: 6 }}>Back to case</span>
        </Link>
        <h2 style={{ marginTop: 8 }}>{caseInfo?.title || "Case discussion"}</h2>
        <p className="muted small" style={{ marginTop: 4 }}>{caseInfo?.specialty}</p>

        <div className="spacer-7" />

        <div className="disc-tabs">
          <button
            className={`disc-tab ${tab === "doctor" ? "active" : ""}`}
            onClick={() => { setTab("doctor"); stuckBottomRef.current = true; }}
          >
            <MessageSquare size={16} strokeWidth={1.75} aria-hidden="true" />
            <span style={{ marginLeft: 6 }}>Case discussion</span>
            {data.doctor?.messages?.length > 0 && <span className="badge">{data.doctor.messages.length}</span>}
          </button>
          {!isStudent && (
            <button
              className={`disc-tab ${tab === "delete-request" ? "active" : ""}`}
              onClick={() => { setTab("delete-request"); stuckBottomRef.current = true; }}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
              <span style={{ marginLeft: 6 }}>Delete request</span>
              {data["delete-request"]?.messages?.length > 0 && <span className="badge">{data["delete-request"].messages.length}</span>}
            </button>
          )}
        </div>

        {tab === "delete-request" && isAdmin && (
          openDr ? (
            <div
              className="card"
              style={{ marginBottom: 12, padding: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Open delete request</div>
                <div className="muted small">
                  <strong>Reason:</strong> {openDr.reason || <em>(no reason given)</em>}
                </div>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-danger btn-sm" onClick={approveDelete}>Approve delete</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditModalOpen(true)}>Edit instead</button>
                <button className="btn btn-ghost btn-sm" onClick={rejectDelete}>Reject</button>
              </div>
            </div>
          ) : !drLoading ? (
            <div className="muted small" style={{ marginBottom: 12 }}>
              No open delete request for this case.
            </div>
          ) : null
        )}

        <div className="lounge-shell" style={{ height: "calc(100vh - 320px)" }}>
          <div className="lounge-thread" ref={scrollRef} onScroll={onScroll}>
            {hasMore[tab] && messages.length > 0 && (
              <div style={{ textAlign: "center", padding: "8px 0 12px" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  aria-label="Load older messages"
                >
                  {loadingOlder
                    ? <span className="spinner" />
                    : <ChevronUp size={16} strokeWidth={1.75} aria-hidden="true" />}
                  <span style={{ marginLeft: 6 }}>
                    {loadingOlder ? "Loading…" : "Load older messages"}
                  </span>
                </button>
              </div>
            )}
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

      <EditInsteadModal
        open={editModalOpen}
        request={openDr}
        onClose={() => setEditModalOpen(false)}
        onResolved={() => { setOpenDr(null); refresh(); }}
      />
      {confirmEl}
    </AppShell>
  );
}
