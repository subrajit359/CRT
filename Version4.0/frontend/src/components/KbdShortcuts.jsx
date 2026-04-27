import { useEffect, useState } from "react";
import { useLocation } from "wouter";

const SHORTCUTS = [
  { keys: "g p", desc: "Go to Practice" },
  { keys: "g d", desc: "Go to Dashboard" },
  { keys: "g v", desc: "Go to Verify queue (doctors)" },
  { keys: "g l", desc: "Go to Lounge" },
  { keys: "g r", desc: "Go to Progress" },
  { keys: "/", desc: "Focus search (where available)" },
  { keys: "?", desc: "Show this cheat sheet" },
  { keys: "Esc", desc: "Close modals" },
];

export default function KbdShortcuts() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    let pendingTimer = null;
    const isTyping = (e) => {
      const t = e.target;
      if (!t) return false;
      const tag = (t.tagName || "").toLowerCase();
      if (t.isContentEditable) return true;
      return tag === "input" || tag === "textarea" || tag === "select";
    };

    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e)) return;

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") {
        if (open) { e.preventDefault(); setOpen(false); }
        return;
      }

      if (pending === "g") {
        const k = e.key.toLowerCase();
        if (k === "p") navigate("/practice");
        else if (k === "d") navigate("/dashboard");
        else if (k === "v") navigate("/dashboard");
        else if (k === "l") navigate("/lounge");
        else if (k === "r") navigate("/progress");
        setPending(null);
        clearTimeout(pendingTimer);
        return;
      }

      if (e.key.toLowerCase() === "g") {
        setPending("g");
        clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => setPending(null), 1200);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(pendingTimer);
    };
  }, [navigate, pending, open]);

  return (
    <>
      {pending === "g" && (
        <div className="kbd-hint" aria-hidden>
          <span className="kbd">g</span> waiting for next key…
        </div>
      )}
      {open && (
        <div className="kbd-modal" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="kbd-card">
            <div className="kbd-head">
              <h3>Keyboard shortcuts</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="kbd-list">
              {SHORTCUTS.map((s) => (
                <div className="kbd-row" key={s.keys}>
                  <span className="kbd-keys">
                    {s.keys.split(" ").map((k, i) => (
                      <kbd key={i} className="kbd">{k}</kbd>
                    ))}
                  </span>
                  <span className="muted">{s.desc}</span>
                </div>
              ))}
            </div>
            <div className="kbd-foot muted small">Tip: press <kbd className="kbd">?</kbd> anywhere to open this.</div>
          </div>
        </div>
      )}
    </>
  );
}
