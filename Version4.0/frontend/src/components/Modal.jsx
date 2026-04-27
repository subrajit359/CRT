import { useEffect, useRef } from "react";

/**
 * Reusable modal dialog. Lightweight wrapper that:
 *   - locks body scroll while open
 *   - closes on Escape and on backdrop click
 *   - returns focus to the previously focused element when it unmounts
 *   - traps Tab/Shift-Tab focus inside the dialog
 *   - autofocuses the first focusable element
 *
 * Children are responsible for the inner layout and any action buttons.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function Modal({
  open,
  onClose,
  title,
  children,
  width = 480,
  closeOnBackdrop = true,
}) {
  const previouslyFocused = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog on the next tick — let children mount first.
    const focusTimer = setTimeout(() => {
      const node = dialogRef.current;
      if (!node) return;
      const target = node.querySelector("[data-autofocus]") || node.querySelector(FOCUSABLE) || node;
      try { target.focus({ preventScroll: true }); } catch {}
    }, 30);

    function onKey(e) {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
      );
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      try { previouslyFocused.current?.focus?.(); } catch {}
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        // dvh shrinks with the visible viewport when the mobile keyboard is up,
        // so the modal stays inside what the user can actually see.
        height: "100dvh",
        zIndex: 200,
        background: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Dialog"}
        tabIndex={-1}
        style={{
          background: "var(--bg-elev, #fff)",
          color: "var(--text, #0f172a)",
          borderRadius: 12,
          width: "100%",
          maxWidth: width,
          // Match the wrapper: dvh-based so focused inputs stay visible above
          // the on-screen keyboard. Falls back to vh on older browsers.
          maxHeight: "min(90vh, calc(100dvh - 32px))",
          overflow: "auto",
          WebkitOverflowScrolling: "touch",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          border: "1px solid var(--line, #e2e8f0)",
          outline: "none",
        }}
      >
        {title && (
          <div style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--line, #e2e8f0)",
            fontWeight: 600,
            fontSize: 16,
          }}>
            {title}
          </div>
        )}
        <div style={{ padding: 20 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
