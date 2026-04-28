import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Inbox, CheckCircle2, XCircle, Clock, MessageSquare, Send, RefreshCw,
  Edit3, FileText,
} from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { api } from "../lib/api.js";
import DisappearMenu from "../components/DisappearMenu.jsx";
import { useToast } from "../components/Toast.jsx";
import { relativeTime } from "../lib/date.js";
import Avatar from "../components/Avatar.jsx";

const SPECIALTIES = [
  "General Medicine", "Cardiology", "Neurology", "Pediatrics", "Surgery",
  "Obstetrics & Gynecology", "Psychiatry", "Emergency Medicine", "Endocrinology",
  "Pulmonology", "Gastroenterology", "Nephrology", "Infectious Disease", "Dermatology",
];

export default function PendingDoctorInbox() {
  const { user, refresh, logout } = useAuth();
  const toast = useToast();
  const [data, setData] = useState({ profile: null, messages: [], thread: null, loading: true, error: null });
  const [chatOpen, setChatOpen] = useState(false);
  const [reapplyOpen, setReapplyOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef(null);

  async function load() {
    try {
      const r = await api.get("/api/support/me");
      setData({
        profile: r.profile,
        messages: r.messages || [],
        thread: r.thread || null,
        loading: false,
        error: null,
      });
    } catch (e) {
      setData((d) => ({ ...d, loading: false, error: e?.message || "Could not load inbox" }));
    }
  }

  useEffect(() => { load(); }, []);

  // Poll every 15s so admin replies appear without needing a manual refresh.
  // Pause polling while the re-application form is open — otherwise the
  // background refresh re-renders the form on mobile, which can collapse
  // the on-screen keyboard between keystrokes.
  useEffect(() => {
    if (reapplyOpen) return;
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [reapplyOpen]);

  // If admin has approved while this page is mounted, refresh the auth context
  // so the app re-routes to the full doctor experience.
  useEffect(() => {
    if (data.profile?.status === "approved") {
      refresh();
    }
  }, [data.profile?.status, refresh]);

  // Auto-scroll chat to bottom when messages arrive.
  useEffect(() => {
    if (!chatOpen) return;
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data.messages, chatOpen]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const r = await api.post("/api/support/me/messages", { body });
      setData((d) => ({ ...d, messages: [...d.messages, r.message] }));
      setDraft("");
    } catch (e) {
      toast.error(e?.message || "Could not send");
    } finally {
      setSending(false);
    }
  }

  const status = data.profile?.status || "pending";
  const reviewerNote = data.profile?.reviewer_note;

  // Stable callbacks so memoized children (ReapplyForm) don't re-render every
  // time the parent re-renders (e.g., when typing in the chat textarea).
  const handleReapplyCancel = useCallback(() => setReapplyOpen(false), []);
  const handleReapplySubmitted = useCallback(async () => {
    setReapplyOpen(false);
    toast.success("Application resubmitted. Pending review.");
    await load();
    await refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  return (
    <div className="app-shell">
      {/* Minimal header: only the brand and a sign-out button. No nav links,
          no notifications/messages icons — pending doctors only see the inbox. */}
      <header className="nav">
        <div className="container nav-inner">
          <div className="brand" style={{ cursor: "default" }}>
            <img src="/logo.png" alt="Reasonal" className="brand-mark-img" />
            <span className="brand-text">Reasonal</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span className="muted small" style={{ display: "none" }}>@{user?.username}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="container fade-in" style={{ maxWidth: 720 }}>
          <div style={{ marginTop: 16 }}>
            <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Inbox size={22} strokeWidth={1.75} aria-hidden="true" /> Inbox
            </h2>
            <p className="muted" style={{ marginTop: 4 }}>
              Welcome, {user?.full_name || user?.username}. Your application status will appear here.
            </p>
          </div>

          <div className="spacer-7" />

          {data.loading ? (
            <div className="card"><div className="muted small">Loading…</div></div>
          ) : data.error ? (
            <div className="card">
              <div style={{ color: "var(--danger)", marginBottom: 8 }}>{data.error}</div>
              <button className="btn btn-ghost btn-sm" onClick={load}>
                <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" /> Retry
              </button>
            </div>
          ) : (
            <>
              {/* Status card */}
              <StatusCard
                status={status}
                reviewerNote={reviewerNote}
                profile={data.profile}
                onContactAdmin={() => setChatOpen(true)}
              />

              {/* Reapply form (rejected doctors only) */}
              {status === "rejected" && reapplyOpen && (
                <>
                  <div className="spacer-7" />
                  <ReapplyForm
                    profile={data.profile}
                    reviewerNote={reviewerNote}
                    onCancel={handleReapplyCancel}
                    onSubmitted={handleReapplySubmitted}
                  />
                </>
              )}

              {/* Contact admin */}
              <div className="spacer-7" />
              <div className="card">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <MessageSquare size={18} strokeWidth={1.75} aria-hidden="true" /> Talk to admin
                    </h3>
                    <p className="muted small" style={{ marginTop: 4 }}>
                      Have a question, want to provide more proof, or want to reapply? Send a message — every admin will see it and someone will reply here.
                    </p>
                  </div>
                  {!chatOpen && (
                    <button className="btn btn-primary btn-sm" onClick={() => setChatOpen(true)}>
                      <MessageSquare size={14} strokeWidth={1.75} aria-hidden="true" /> Contact Admin
                    </button>
                  )}
                </div>

                {chatOpen && (
                  <>
                    <div className="spacer-7" />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 6 }}>
                      <DisappearMenu
                        value={data.thread?.disappear_seconds ?? null}
                        onChange={async (seconds) => {
                          try {
                            const r = await api.patch("/api/support/me/disappear", { seconds });
                            setData((d) => ({ ...d, thread: { ...(d.thread || {}), disappear_seconds: r.disappear_seconds } }));
                            toast.success(seconds == null
                              ? "Disappearing messages turned off"
                              : "Disappearing-message timer updated");
                          } catch (e) {
                            toast.error(e?.message || "Could not update timer");
                          }
                        }}
                      />
                    </div>
                    <div
                      ref={scrollerRef}
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: 12,
                        padding: 12,
                        minHeight: 240,
                        maxHeight: 420,
                        overflowY: "auto",
                        background: "var(--paper)",
                      }}
                    >
                      {data.messages.length === 0 ? (
                        <div className="muted small" style={{ textAlign: "center", padding: 24 }}>
                          No messages yet. Send the first one below.
                        </div>
                      ) : (
                        data.messages.map((m) => (
                          <ChatMessage
                            key={m.id}
                            message={m}
                            mine={m.sender_id === user?.id}
                            canReapply={status === "rejected"}
                            onReapply={() => setReapplyOpen(true)}
                          />
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
                        placeholder="Write your message to the admins…"
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
                  </>
                )}
              </div>

              <div className="spacer-7" />
              <div style={{ textAlign: "center" }}>
                <button className="btn btn-ghost btn-sm" onClick={load}>
                  <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" /> Refresh
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ChatMessage({ message: m, mine, canReapply, onReapply }) {
  const isInvite = m.kind === "reapply_invite";
  const isResubmit = m.kind === "reapply_submitted";

  if (isInvite) {
    return (
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexDirection: "row" }}>
        <Avatar url={m.sender_avatar_url} name={m.sender_full_name || m.sender_username} size={28} />
        <div style={{ maxWidth: "85%", flex: 1 }}>
          <div className="muted small" style={{ marginBottom: 2 }}>
            {m.sender_full_name || m.sender_username} · admin · <span title={new Date(m.created_at).toLocaleString()}>{relativeTime(m.created_at)}</span>
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
              Reapply invitation
            </div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
            {canReapply ? (
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: 10 }}
                onClick={onReapply}
              >
                <FileText size={14} strokeWidth={1.75} aria-hidden="true" /> Open re-application form
              </button>
            ) : (
              <div className="muted small" style={{ marginTop: 8 }}>
                This invitation is no longer active.
              </div>
            )}
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
          }}
        >
          {m.body} · <span title={new Date(m.created_at).toLocaleString()}>{relativeTime(m.created_at)}</span>
        </div>
      </div>
    );
  }

  // Default: text message
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
          {mine ? "You" : `${m.sender_full_name || m.sender_username}${m.sender_role === "admin" ? " · admin" : ""}`}
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

function StatusCard({ status, reviewerNote, profile, onContactAdmin }) {
  if (status === "approved") {
    return (
      <div className="card" style={{ borderLeft: "4px solid var(--green-700, #15803d)" }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--green-700, #15803d)" }} />
          Application approved
        </h3>
        <p className="muted small" style={{ marginTop: 6 }}>
          Your account has been approved. The full doctor experience will load momentarily — if not, refresh the page.
        </p>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="card" style={{ borderLeft: "4px solid var(--rose-700, #be123c)" }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <XCircle size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--rose-700, #be123c)" }} />
          Application rejected
        </h3>
        <p className="muted small" style={{ marginTop: 6 }}>
          Your application was not approved. The reason is below.
        </p>
        <div
          style={{
            marginTop: 10,
            padding: 12,
            background: "var(--rose-100, #ffe4e6)",
            color: "var(--rose-700, #be123c)",
            borderRadius: 10,
            whiteSpace: "pre-wrap",
          }}
        >
          {reviewerNote || "No reason was provided. You can ask the admin below for more details."}
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          If you want to ask questions or reapply, please contact the admin.
        </p>
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={onContactAdmin}>
            <MessageSquare size={14} strokeWidth={1.75} aria-hidden="true" /> Contact Admin
          </button>
        </div>
      </div>
    );
  }
  // pending (default)
  return (
    <div className="card" style={{ borderLeft: "4px solid var(--amber-700, #b45309)" }}>
      <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Clock size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--amber-700, #b45309)" }} />
        Application submitted
      </h3>
      <p className="muted small" style={{ marginTop: 6 }}>
        Thanks for applying. Your application is being reviewed by our admins. You will see updates here as soon as they happen.
      </p>
      {profile && (
        <div className="muted small" style={{ marginTop: 10 }}>
          <strong>Specialty:</strong> {profile.specialty || "—"}
          {profile.license_number && <> · <strong>License:</strong> {profile.license_number}</>}
          {profile.hospital && <> · <strong>Hospital:</strong> {profile.hospital}</>}
        </div>
      )}
    </div>
  );
}

const ReapplyForm = memo(function ReapplyForm({ profile, reviewerNote, onCancel, onSubmitted }) {
  const toast = useToast();
  // Uncontrolled inputs (browser-owned values, read via refs on submit).
  // This avoids any per-keystroke React re-render of the form, which on some
  // mobile browsers caused the on-screen keyboard to collapse and reopen
  // between characters.
  const degreeRef = useRef(null);
  const specialtyRef = useRef(null);
  const yearsExpRef = useRef(null);
  const licenseNumberRef = useRef(null);
  const hospitalRef = useRef(null);
  const proofTextRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const degree = degreeRef.current?.value?.trim() || "";
    const specialty = specialtyRef.current?.value?.trim() || "";
    const yearsExp = yearsExpRef.current?.value?.trim() || "";
    const licenseNumber = licenseNumberRef.current?.value?.trim() || "";
    const hospital = hospitalRef.current?.value?.trim() || "";
    const proofText = proofTextRef.current?.value?.trim() || "";

    if (!specialty || !licenseNumber) {
      toast.error("Specialty and license number are required.");
      return;
    }
    setBusy(true);
    try {
      await api.patch("/api/auth/reapply-doctor", {
        degree,
        specialty,
        yearsExp: parseInt(yearsExp || "0", 10),
        licenseNumber,
        hospital,
        proofText,
      });
      onSubmitted?.();
    } catch (err) {
      toast.error(err?.message || "Could not resubmit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="card"
      style={{ borderLeft: "4px solid var(--primary, #6366f1)" }}
      autoComplete="off"
    >
      <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Edit3 size={18} strokeWidth={1.75} aria-hidden="true" /> Re-application
      </h3>

      {/* Clear guidance: tell the doctor exactly what to fix. Surface the
          admin's rejection reason inside the form so they don't have to scroll
          back up to read it. */}
      <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
        <strong>What to correct:</strong> review the admin's rejection reason
        below and update any fields they asked you to fix. Common things to
        update are your <strong>license / registration number</strong>,{" "}
        <strong>hospital</strong>, <strong>specialty</strong>, or the{" "}
        <strong>proof of identity</strong> text (a verifiable link works best).
        Your name, username, email, and password stay the same.
      </p>
      {reviewerNote ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            background: "var(--rose-100, #ffe4e6)",
            color: "var(--rose-700, #be123c)",
            borderRadius: 8,
            whiteSpace: "pre-wrap",
            fontSize: 13,
          }}
        >
          <strong>Admin's reason:</strong> {reviewerNote}
        </div>
      ) : null}

      <div className="spacer-7" />

      <div className="field">
        <label className="label" htmlFor="reapply-degree">Degree</label>
        <input
          id="reapply-degree"
          name="degree"
          className="input"
          ref={degreeRef}
          defaultValue={profile?.degree || ""}
          placeholder="MBBS, MD, etc."
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="reapply-specialty">Primary specialty</label>
        <select
          id="reapply-specialty"
          name="specialty"
          className="select"
          ref={specialtyRef}
          defaultValue={profile?.specialty || SPECIALTIES[0]}
        >
          {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="reapply-years">Years of experience</label>
        <input
          id="reapply-years"
          name="yearsExp"
          className="input"
          type="number"
          min="0"
          inputMode="numeric"
          ref={yearsExpRef}
          defaultValue={profile?.years_exp != null ? String(profile.years_exp) : ""}
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="reapply-license">License / registration number</label>
        <input
          id="reapply-license"
          name="licenseNumber"
          className="input"
          required
          ref={licenseNumberRef}
          defaultValue={profile?.license_number || ""}
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="reapply-hospital">Hospital / institution</label>
        <input
          id="reapply-hospital"
          name="hospital"
          className="input"
          ref={hospitalRef}
          defaultValue={profile?.hospital || ""}
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="reapply-proof">Proof of identity (text)</label>
        <textarea
          id="reapply-proof"
          name="proofText"
          className="textarea"
          ref={proofTextRef}
          defaultValue={profile?.proof_text || ""}
          placeholder="Paste a link to your registration record, or describe verifiable evidence."
          autoComplete="off"
        />
      </div>

      <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spinner" /> : "Resubmit application"}
        </button>
      </div>
    </form>
  );
});
