import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { CheckCircle2, Lock, RotateCcw, X } from "lucide-react";
import { api } from "../lib/api.js";
import { useRioCase } from "../lib/rioContext.jsx";
import drRioAvatar from "../assets/dr-rio.png";

const STORAGE_KEY = "rio:history:v1";
const POS_KEY = "rio:launcherPos:v1";
const LAUNCHER_SIZE = 64;
const EDGE_PAD = 8;

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x === "number" && typeof p?.y === "number") return p;
  } catch {}
  return null;
}
function savePos(p) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
}
function clampPos(x, y) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  return {
    x: Math.max(EDGE_PAD, Math.min(vw - LAUNCHER_SIZE - EDGE_PAD, x)),
    y: Math.max(EDGE_PAD, Math.min(vh - LAUNCHER_SIZE - EDGE_PAD, y)),
  };
}
function defaultPos() {
  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  return clampPos(vw - LAUNCHER_SIZE - 22, vh - LAUNCHER_SIZE - 22);
}

function loadHistory(caseId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${caseId || "global"}`);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-30) : [];
  } catch { return []; }
}
function saveHistory(caseId, msgs) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${caseId || "global"}`, JSON.stringify(msgs.slice(-30)));
  } catch {}
}

const SUGGESTIONS = [
  "Is this case verified, and by whom?",
  "Where was this case taken from?",
  "Give me a hint without revealing the diagnosis",
  "How do I enable browser notifications?",
];

export default function DrRioWidget(props = {}) {
  // Read case context (set by case pages) so Rio is page-aware everywhere.
  const ctx = useRioCase();
  const caseId = props.caseId ?? ctx.caseId ?? null;
  const caseTitle = props.caseTitle ?? ctx.caseTitle ?? null;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminContact, setAdminContact] = useState(null);
  const [revealAllowed, setRevealAllowed] = useState(false);
  const scrollerRef = useRef(null);

  // Draggable launcher state
  const [pos, setPos] = useState(() => loadPos() || defaultPos());
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0, offX: 0, offY: 0, pointerId: null });

  // Re-clamp on viewport resize so the button never escapes the screen.
  useEffect(() => {
    function onResize() {
      setPos((p) => {
        const np = clampPos(p.x, p.y);
        if (np.x !== p.x || np.y !== p.y) savePos(np);
        return np;
      });
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  function onLauncherPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const d = dragRef.current;
    d.active = true;
    d.moved = false;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.offX = e.clientX - pos.x;
    d.offY = e.clientY - pos.y;
    d.pointerId = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }
  function onLauncherPointerMove(e) {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > 5) {
      d.moved = true;
      setDragging(true);
    }
    if (d.moved) {
      e.preventDefault();
      const np = clampPos(e.clientX - d.offX, e.clientY - d.offY);
      setPos(np);
    }
  }
  function onLauncherPointerUp(e) {
    const d = dragRef.current;
    if (!d.active) return;
    try { e.currentTarget.releasePointerCapture(d.pointerId); } catch {}
    const wasDrag = d.moved;
    d.active = false;
    d.moved = false;
    setDragging(false);
    if (wasDrag) {
      savePos(pos);
    } else {
      setOpen(true);
    }
  }

  // Load history when caseId changes.
  useEffect(() => {
    setMessages(loadHistory(caseId));
    setAdminContact(null);
    setRevealAllowed(false);
  }, [caseId]);

  // When the panel is open with a case, ask the server whether Rio is unlocked
  // for this case (i.e. the student already submitted). This way the badge is
  // correct from the moment the panel opens.
  useEffect(() => {
    if (!open || !caseId) return;
    let cancelled = false;
    api
      .get(`/api/assistant/rio/status?caseId=${encodeURIComponent(caseId)}`)
      .then((r) => { if (!cancelled) setRevealAllowed(!!r.revealAllowed); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, caseId]);

  // Auto-scroll to latest message.
  useEffect(() => {
    if (open && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, open, busy]);

  // Persist history.
  useEffect(() => {
    if (messages.length) saveHistory(caseId, messages);
  }, [messages, caseId]);

  async function send(text) {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    const next = [...messages, { role: "user", content: t }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const r = await api.post("/api/assistant/rio", {
        caseId: caseId || null,
        message: t,
        history: next.slice(-10, -1), // exclude the current user msg; backend appends it
      });
      const reply = r.reply || "I'm not sure how to help with that.";
      setMessages((m) => [...m, { role: "assistant", content: reply, suggestAdmin: !!r.suggestAdmin }]);
      if (r.suggestAdmin && r.adminContact) setAdminContact(r.adminContact);
      if (typeof r.revealAllowed === "boolean") setRevealAllowed(r.revealAllowed);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Sorry — I couldn't reach the AI (${e.message}).`, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function clearChat() {
    setMessages([]);
    saveHistory(caseId, []);
    setAdminContact(null);
  }

  return (
    <>
      {/* Floating launcher (draggable) */}
      {!open && (
        <motion.button
          type="button"
          onPointerDown={onLauncherPointerDown}
          onPointerMove={onLauncherPointerMove}
          onPointerUp={onLauncherPointerUp}
          onPointerCancel={onLauncherPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={dragging ? undefined : { scale: 1.05 }}
          whileTap={dragging ? undefined : { scale: 0.96 }}
          aria-label="Ask Dr. Rio (drag to move)"
          title="Tap to chat • drag to move"
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            zIndex: 1300,
            width: LAUNCHER_SIZE,
            height: LAUNCHER_SIZE,
            borderRadius: "50%",
            border: "none",
            cursor: dragging ? "grabbing" : "grab",
            padding: 0,
            background: "linear-gradient(135deg, #0f4c3a 0%, #1d8a6e 100%)",
            color: "#fff",
            boxShadow: dragging
              ? "0 18px 40px rgba(15,76,58,0.5), 0 0 0 4px rgba(167,232,201,0.4)"
              : "0 12px 30px rgba(15,76,58,0.35), 0 0 0 4px rgba(167,232,201,0.25)",
            display: "grid",
            placeItems: "center",
            fontFamily: "inherit",
            overflow: "visible",
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
            transition: dragging ? "none" : "box-shadow 150ms ease",
          }}
        >
          <span style={{ position: "relative", display: "block", width: 56, height: 56, pointerEvents: "none" }}>
            <img
              src={drRioAvatar}
              alt="Dr. Rio"
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                objectFit: "cover",
                display: "block",
                background: "#fff",
                pointerEvents: "none",
                WebkitUserDrag: "none",
              }}
            />
            <span
              style={{
                position: "absolute", top: -4, right: -8,
                background: "#ff6b6b", color: "#fff",
                borderRadius: 999, fontSize: 9, fontWeight: 800,
                padding: "2px 6px", border: "2px solid #fff",
                letterSpacing: "0.04em",
              }}
            >
              AI
            </span>
          </span>
        </motion.button>
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            style={{
              position: "fixed",
              right: "max(22px, env(safe-area-inset-right))",
              bottom: "max(22px, calc(env(safe-area-inset-bottom) + 76px))",
              zIndex: 1300,
              width: "min(380px, calc(100vw - 28px))",
              height: "min(560px, calc(100vh - 160px))",
              background: "var(--bg-elev, #fff)",
              borderRadius: 18,
              boxShadow: "0 24px 60px rgba(15,76,58,0.28), 0 0 0 1px rgba(0,0,0,0.06)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "14px 16px",
                background: "linear-gradient(135deg, #0f4c3a 0%, #1d8a6e 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <img
                src={drRioAvatar}
                alt="Dr. Rio"
                style={{
                  width: 42, height: 42, borderRadius: "50%",
                  objectFit: "cover",
                  background: "#fff",
                  border: "2px solid rgba(255,255,255,0.6)",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-display, inherit)", fontWeight: 700, fontSize: 15 }}>Dr. Rio</span>
                  {caseId && revealAllowed && (
                    <span
                      title="You've submitted this case — Rio can explain the diagnosis."
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        padding: "2px 6px",
                        borderRadius: 999,
                        background: "rgba(34, 197, 94, 0.95)",
                        color: "#fff",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span className="row" style={{ gap: 3, alignItems: "center", display: "inline-flex" }}>
                        <CheckCircle2 size={11} strokeWidth={2} aria-hidden="true" />
                        DIAGNOSIS UNLOCKED
                      </span>
                    </span>
                  )}
                  {caseId && !revealAllowed && (
                    <span
                      title="Submit your answer on the case page to unlock Rio's explanation."
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        padding: "2px 6px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.2)",
                        color: "#fff",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span className="row" style={{ gap: 3, alignItems: "center", display: "inline-flex" }}>
                        <Lock size={11} strokeWidth={2} aria-hidden="true" />
                        SUBMIT TO UNLOCK
                      </span>
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {caseTitle ? `On: ${caseTitle}` : "Your study buddy"}
                </div>
              </div>
              <button
                type="button"
                onClick={clearChat}
                title="Clear conversation"
                aria-label="Clear conversation"
                style={{
                  background: "rgba(255,255,255,0.16)",
                  border: "none", color: "#fff",
                  width: 28, height: 28, borderRadius: 8,
                  cursor: "pointer", display: "inline-flex",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close"
                style={{
                  background: "rgba(255,255,255,0.16)",
                  border: "none", color: "#fff",
                  width: 28, height: 28, borderRadius: 8,
                  cursor: "pointer", display: "inline-flex",
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollerRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "14px 14px 8px",
                background: "var(--bg-muted, #fafafa)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {messages.length === 0 && (
                <div style={{ padding: "10px 4px" }}>
                  <div style={{ fontSize: 13, color: "var(--ink-700, #333)", lineHeight: 1.5, marginBottom: 10 }}>
                    Hi — I'm <strong>Dr. Rio</strong>. Ask me about this case (without spoilers if you haven't answered yet),
                    test your diagnosis against the answer, or anything about how the app works. If I can't help, I'll point you to an admin.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        style={{
                          textAlign: "left",
                          background: "var(--bg-elev, #fff)",
                          border: "1px solid var(--line, #e2e2e2)",
                          borderRadius: 10,
                          padding: "8px 10px",
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          color: "var(--ink-800, #222)",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    background: m.role === "user"
                      ? "var(--primary, #0f4c3a)"
                      : (m.error ? "#fde2e2" : "var(--bg-elev, #fff)"),
                    color: m.role === "user" ? "#fff" : "var(--ink-900, #111)",
                    padding: "10px 12px",
                    borderRadius: 14,
                    borderTopRightRadius: m.role === "user" ? 4 : 14,
                    borderTopLeftRadius: m.role === "user" ? 14 : 4,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                >
                  {m.content}
                  {m.suggestAdmin && adminContact && (
                    <div style={{ marginTop: 8 }}>
                      <Link
                        to={adminContact.link}
                        onClick={() => setOpen(false)}
                        style={{
                          display: "inline-block",
                          background: "#fff",
                          color: "var(--primary, #0f4c3a)",
                          border: "1px solid var(--primary, #0f4c3a)",
                          padding: "6px 12px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        Message {adminContact.fullName || `@${adminContact.username}`} →
                      </Link>
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    background: "var(--bg-elev, #fff)",
                    padding: "10px 14px",
                    borderRadius: 14,
                    fontSize: 13,
                    color: "var(--muted, #666)",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span className="rio-dot" />
                  <span className="rio-dot" />
                  <span className="rio-dot" />
                </div>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              style={{
                padding: "10px 12px",
                borderTop: "1px solid var(--line, #e2e2e2)",
                background: "var(--bg-elev, #fff)",
                display: "flex",
                gap: 8,
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={caseId ? "Ask about this case…" : "Ask Dr. Rio anything…"}
                disabled={busy}
                style={{
                  flex: 1,
                  border: "1px solid var(--line, #e2e2e2)",
                  borderRadius: 999,
                  padding: "8px 14px",
                  fontSize: 13.5,
                  fontFamily: "inherit",
                  outline: "none",
                  background: "var(--bg, #fff)",
                  color: "var(--ink-900, #111)",
                }}
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                style={{
                  background: "var(--primary, #0f4c3a)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 999,
                  padding: "0 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: busy || !input.trim() ? "default" : "pointer",
                  opacity: busy || !input.trim() ? 0.55 : 1,
                  fontFamily: "inherit",
                }}
              >
                Send
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline styles for the typing dots */}
      <style>{`
        .rio-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--primary, #0f4c3a);
          display: inline-block; opacity: 0.6;
          animation: rioBlink 1.2s infinite ease-in-out;
        }
        .rio-dot:nth-child(2) { animation-delay: 0.2s; }
        .rio-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes rioBlink {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </>
  );
}
