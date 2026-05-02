import { useEffect, useRef, useState } from "react";
import Modal from "./Modal.jsx";

/**
 * Promise-style confirmation dialog. Two ways to use:
 *   1) Controlled: <ConfirmDialog open onConfirm onClose ... />
 *   2) Imperative via useConfirm() — see below.
 *
 * Defaults to a destructive (danger) action. Pass tone="primary" for safe
 * confirmations like "approve" or "publish".
 *
 * Pass `requireText="DELETE"` (or any phrase) to force the user to type the
 * exact phrase before the Confirm button enables. Useful for permanent
 * destructive operations.
 */
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  requireText,
  onConfirm,
  onClose,
}) {
  const confirmBtnRef = useRef(null);
  const inputRef = useRef(null);
  const [typed, setTyped] = useState("");

  // Reset typed text every time the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setTyped("");
      setTimeout(() => {
        if (requireText) inputRef.current?.focus?.();
        else confirmBtnRef.current?.focus?.();
      }, 50);
    }
  }, [open, requireText]);

  const textOk = !requireText || typed === requireText;
  const disabled = busy || !textOk;

  return (
    <Modal open={!!open} onClose={busy ? () => {} : onClose} title={title} width={460}>
      {body && (
        <div style={{ marginTop: 0, color: "var(--text-soft)", lineHeight: 1.5 }}>
          {typeof body === "string" ? <p style={{ margin: 0 }}>{body}</p> : body}
        </div>
      )}
      {requireText && (
        <div className="confirm-require-text">
          <label className="confirm-require-text-label" htmlFor="confirm-require-text-input">
            Type <code>{requireText}</code> to confirm.
          </label>
          <input
            ref={inputRef}
            id="confirm-require-text-input"
            className="confirm-require-text-input"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && textOk && !busy) onConfirm?.();
            }}
            autoComplete="off"
            spellCheck={false}
            aria-label={`Type ${requireText} to confirm`}
          />
        </div>
      )}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 20, gap: 8 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onClose}
          disabled={busy}
        >
          {cancelLabel}
        </button>
        <button
          ref={confirmBtnRef}
          type="button"
          className={`btn ${tone === "primary" ? "btn-primary" : "btn-danger"}`}
          onClick={onConfirm}
          disabled={disabled}
          aria-disabled={disabled}
        >
          {busy ? <span className="spinner" /> : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Imperative hook — returns [dialogElement, askConfirm].
 * Usage:
 *   const [confirmEl, confirm] = useConfirm();
 *   if (await confirm({ title, body, tone, confirmLabel, requireText })) { ... }
 *   return (<>{confirmEl}<button onClick={...}/></>);
 */
export function useConfirm() {
  const [state, setState] = useState({ open: false });
  const resolverRef = useRef(null);

  function ask(opts = {}) {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ open: true, ...opts });
    });
  }

  function close(result) {
    setState((s) => ({ ...s, open: false }));
    const r = resolverRef.current;
    resolverRef.current = null;
    if (r) r(result);
  }

  const el = (
    <ConfirmDialog
      {...state}
      open={!!state.open}
      onConfirm={() => close(true)}
      onClose={() => close(false)}
    />
  );
  return [el, ask];
}
