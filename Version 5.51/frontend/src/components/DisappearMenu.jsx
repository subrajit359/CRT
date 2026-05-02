import { useEffect, useRef, useState } from "react";
import { Clock, Check } from "lucide-react";

// Disappearing-message timer options. `null` means OFF (messages never expire).
// Keep the values aligned with the server's accepted range (60s – 90 days).
export const DISAPPEAR_OPTIONS = [
  { value: null,          label: "Off",      short: "Off" },
  { value: 60 * 60,       label: "1 hour",   short: "1h"  },
  { value: 8 * 60 * 60,   label: "8 hours",  short: "8h"  },
  { value: 24 * 60 * 60,  label: "24 hours (default)", short: "24h" },
  { value: 7  * 24 * 60 * 60, label: "7 days",  short: "7d"  },
  { value: 30 * 24 * 60 * 60, label: "30 days", short: "30d" },
];

export function disappearShortLabel(seconds) {
  const opt = DISAPPEAR_OPTIONS.find((o) => o.value === (seconds ?? null));
  if (opt) return opt.short;
  // Custom value — fall back to a compact h/d string.
  if (!seconds) return "Off";
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  return `${Math.round(seconds / 60)}m`;
}

/**
 * Inline button that opens a small popover for picking a disappearing-message
 * timer. Designed to sit in chat headers next to the participant name.
 *
 * Props:
 *   value     — current `disappear_seconds` (null = OFF, integer = seconds)
 *   onChange  — async (seconds|null) => void (server call); receives the new value
 *   disabled  — disable the trigger
 *   title     — tooltip override
 */
export default function DisappearMenu({ value, onChange, disabled = false, title }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const current = value ?? null;
  const isOn = current !== null;

  async function pick(seconds) {
    if (busy) return;
    if ((seconds ?? null) === current) { setOpen(false); return; }
    setBusy(true);
    try {
      await onChange(seconds);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy}
        title={title || (isOn ? `Disappearing messages: ${disappearShortLabel(current)}` : "Disappearing messages: off")}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          color: isOn ? "var(--primary, #2563eb)" : "var(--text-muted, #64748b)",
          padding: "4px 8px",
        }}
      >
        <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
        <span style={{ fontSize: 12, fontWeight: 600 }}>{disappearShortLabel(current)}</span>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 50,
            minWidth: 220,
            background: "var(--bg, #fff)",
            border: "1px solid var(--line, #e2e8f0)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
            padding: 6,
          }}
        >
          <div className="muted small" style={{ padding: "6px 10px 4px", fontWeight: 600 }}>
            Disappearing messages
          </div>
          <div className="muted" style={{ padding: "0 10px 6px", fontSize: 11, lineHeight: 1.35 }}>
            New messages disappear after the chosen time. Existing messages are not affected.
          </div>
          {DISAPPEAR_OPTIONS.map((o) => {
            const active = (o.value ?? null) === current;
            return (
              <button
                key={String(o.value)}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => pick(o.value)}
                disabled={busy}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "8px 10px",
                  background: active ? "var(--primary-soft, #eff6ff)" : "transparent",
                  color: active ? "var(--primary-ink, #1e3a8a)" : "var(--text)",
                  border: "none",
                  borderRadius: 6,
                  cursor: busy ? "default" : "pointer",
                  fontSize: 13,
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { if (!active && !busy) e.currentTarget.style.background = "var(--bg-soft, #f1f5f9)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <span>{o.label}</span>
                {active && <Check size={14} strokeWidth={2.25} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
