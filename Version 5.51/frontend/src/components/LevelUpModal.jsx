import { useEffect, useRef, useState } from "react";
import { Trophy, Star, Sparkles, Dumbbell } from "lucide-react";
import Confetti from "./Confetti.jsx";

export default function LevelUpModal({ open, newLevel, onClose }) {
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!open) { closedRef.current = false; return; }
    closedRef.current = false;
    setConfettiTrigger((n) => n + 1);
    const t = setTimeout(() => {
      if (!closedRef.current) onClose?.();
    }, 7000);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  function dismiss() {
    closedRef.current = true;
    onClose?.();
  }

  const starIcons = [Star, Sparkles, Star];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Level up!"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        padding: 20,
      }}
    >
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <Confetti trigger={confettiTrigger} count={120} duration={5000} />
      </div>

      <div
        style={{
          position: "relative",
          background: "var(--bg-elev, #fff)",
          borderRadius: 20,
          padding: "40px 36px 32px",
          maxWidth: 400,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 32px 80px rgba(0,0,0,0.35)",
          border: "1px solid var(--line, #e2e8f0)",
          animation: "levelUpPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
        }}
      >
        <style>{`
          @keyframes levelUpPop {
            from { opacity: 0; transform: scale(0.7) translateY(24px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes levelUpFloat {
            0%,100% { transform: translateY(0); }
            50%      { transform: translateY(-8px); }
          }
          .levelup-badge {
            animation: levelUpFloat 2.4s ease-in-out infinite;
          }
          .levelup-close-btn {
            margin-top: 20px;
            width: 100%;
            padding: 13px;
            border-radius: 10px;
            border: none;
            background: linear-gradient(135deg, var(--emerald-600, #059669), var(--emerald-700, #047857));
            color: #fff;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            letter-spacing: 0.01em;
            transition: opacity 0.15s, transform 0.15s;
          }
          .levelup-close-btn:hover { opacity: 0.88; transform: translateY(-1px); }
          .levelup-close-btn:active { transform: translateY(0); opacity: 1; }
        `}</style>

        <div style={{ lineHeight: 1, marginBottom: 8, color: "#d97706" }} className="levelup-badge">
          <Trophy size={64} strokeWidth={1.5} />
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--emerald, #059669)", marginBottom: 6 }}>
          Level Up!
        </div>

        <div style={{ fontSize: 30, fontWeight: 800, color: "var(--ink-900, #0f172a)", fontFamily: "var(--font-display)", lineHeight: 1.15, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <span>You reached Level {newLevel}</span>
          <Sparkles size={26} color="#d97706" />
        </div>

        <div style={{ fontSize: 15, color: "var(--text-muted, #64748b)", marginTop: 10, lineHeight: 1.55 }}>
          Your clinical reasoning is sharper than ever.<br />
          Keep solving cases to climb higher!
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 18 }}>
          {starIcons.map((Icon, i) => (
            <span key={i} style={{ animation: `levelUpFloat ${1.8 + i * 0.3}s ease-in-out ${i * 0.15}s infinite`, color: "#d97706", display: "flex" }}>
              <Icon size={22} strokeWidth={1.75} />
            </span>
          ))}
        </div>

        <button className="levelup-close-btn" onClick={dismiss} autoFocus style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Dumbbell size={16} /> Keep Going!
        </button>
      </div>
    </div>
  );
}
