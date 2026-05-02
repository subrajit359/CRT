import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const [exiting, setExiting] = useState(new Set());
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setExiting((s) => { const n = new Set(s); n.add(id); return n; });
    setTimeout(() => {
      setItems((s) => s.filter((x) => x.id !== id));
      setExiting((s) => { const n = new Set(s); n.delete(id); return n; });
      timersRef.current.delete(id);
    }, 200);
    const t = timersRef.current.get(id);
    if (t) clearTimeout(t);
  }, []);

  const push = useCallback((kind, msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    const duration = opts.duration ?? 4500;
    const item = {
      id, kind, msg,
      action: opts.action || null,
      onAction: opts.onAction || null,
      onTimeout: opts.onTimeout || null,
      duration,
      startedAt: Date.now(),
    };
    setItems((s) => [...s, item]);
    if (duration > 0) {
      const t = setTimeout(() => {
        setItems((s) => {
          const it = s.find((x) => x.id === id);
          if (it && it.onTimeout) { try { it.onTimeout(); } catch {} }
          return s.filter((x) => x.id !== id);
        });
        timersRef.current.delete(id);
      }, duration);
      timersRef.current.set(id, t);
    }
    return id;
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
  }, []);

  const value = {
    success: (m, opts) => push("success", m, opts),
    error:   (m, opts) => push("error", m, opts),
    info:    (m, opts) => push("info", m, opts),
    push,
    dismiss,
  };

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}${t.action ? " has-action" : ""}${exiting.has(t.id) ? " toast-exit" : " toast-enter"}`}
          >
            <span className="toast-msg">{t.msg}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  if (t.onAction) { try { t.onAction(); } catch {} }
                  dismiss(t.id);
                }}
              >
                {t.action}
              </button>
            )}
            {t.duration > 0 && (
              <span className="toast-progress" style={{ animationDuration: `${t.duration}ms` }} />
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast outside provider");
  return v;
}
