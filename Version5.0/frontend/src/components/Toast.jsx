import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setItems((s) => s.filter((x) => x.id !== id));
    const t = timersRef.current.get(id);
    if (t) { clearTimeout(t); timersRef.current.delete(id); }
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
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
              className={`toast toast-${t.kind} ${t.action ? "has-action" : ""}`}
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
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast outside provider");
  return v;
}
