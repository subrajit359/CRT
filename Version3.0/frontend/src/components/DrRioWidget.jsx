import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { api } from "../lib/api.js";
import { useRioCase } from "../lib/rioContext.jsx";
import drRioAvatar from "../assets/dr-rio.png";

const STORAGE_KEY = "rio:history:v1";

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
      {/* Floating launcher */}
      {!open && (
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          aria-label="Ask Dr. Rio"
          style={{
            position: "fixed",
            right: 22,
            bottom: 22,
            zIndex: 1300,
            width: 64,
            height: 64,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            padding: 0,
            background: "linear-gradient(135deg, #0f4c3a 0%, #1d8a6e 100%)",
            color: "#fff",
            boxShadow: "0 12px 30px rgba(15,76,58,0.35), 0 0 0 4px rgba(167,232,201,0.25)",
            display: "grid",
            placeItems: "center",
            fontFamily: "inherit",
            overflow: "visible",
          }}
        >
          <span style={{ position: "relative", display: "block", width: 56, height: 56 }}>
            <img
              src={drRioAvatar}
              alt="Dr. Rio"
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                objectFit: "cover",
                display: "block",
                background: "#fff",
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
              right: 22,
              bottom: 22,
              zIndex: 1300,
              width: "min(380px, calc(100vw - 28px))",
              height: "min(560px, calc(100vh - 100px))",
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
                      ✓ DIAGNOSIS UNLOCKED
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
                      🔒 SUBMIT TO UNLOCK
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
                style={{
                  background: "rgba(255,255,255,0.16)",
                  border: "none", color: "#fff",
                  width: 28, height: 28, borderRadius: 8,
                  cursor: "pointer", fontSize: 14,
                }}
              >
                ↺
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close"
                style={{
                  background: "rgba(255,255,255,0.16)",
                  border: "none", color: "#fff",
                  width: 28, height: 28, borderRadius: 8,
                  cursor: "pointer", fontSize: 14,
                }}
              >
                ✕
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
