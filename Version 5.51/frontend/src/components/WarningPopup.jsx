import { useEffect, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "./Modal.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

// Polls for unread admin warnings and shows them as a center-screen modal.
// Once the user dismisses one, it's marked read and the next pending warning
// (if any) takes its place.
export default function WarningPopup() {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);

  const fetchPending = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api.get("/api/notifications/pending-warnings");
      if (Array.isArray(r.warnings) && r.warnings.length) {
        setQueue((prev) => {
          const seen = new Set(prev.map((w) => w.id));
          const merged = [...prev];
          for (const w of r.warnings) if (!seen.has(w.id)) merged.push(w);
          return merged;
        });
      }
    } catch {
      // silent — popup is non-critical
    }
  }, [user]);

  // Fetch on login + every 60s while the tab is open.
  useEffect(() => {
    if (!user) { setQueue([]); return; }
    fetchPending();
    const t = setInterval(fetchPending, 60_000);
    const onFocus = () => fetchPending();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [user, fetchPending]);

  const current = queue[0] || null;

  async function dismiss() {
    if (!current || busy) return;
    setBusy(true);
    try {
      await api.post(`/api/notifications/${current.id}/read`, {});
    } catch {
      // even if marking read fails server-side, drop from local queue so we don't loop
    } finally {
      setQueue((prev) => prev.slice(1));
      setBusy(false);
    }
  }

  if (!current) return null;

  return (
    <Modal
      open
      onClose={dismiss}
      title=""
      width={460}
      closeOnBackdrop={false}
    >
      <div style={{ textAlign: "center", padding: "4px 6px 0" }}>
        <div
          style={{
            width: 56, height: 56, margin: "0 auto 14px",
            borderRadius: "50%", background: "#fffbeb",
            border: "1px solid #fde68a", display: "grid", placeItems: "center",
          }}
        >
          <AlertTriangle size={28} color="#b45309" strokeWidth={1.75} />
        </div>
        <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>{current.title}</h3>
        <p style={{ margin: 0, color: "var(--text-soft, #4A5160)", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
          {current.body}
        </p>
        <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={dismiss}
            disabled={busy}
            data-autofocus
          >
            {busy ? <span className="spinner" /> : "I understand"}
          </button>
        </div>
        {queue.length > 1 && (
          <div className="muted small" style={{ marginTop: 10 }}>
            {queue.length - 1} more message{queue.length - 1 === 1 ? "" : "s"} after this
          </div>
        )}
      </div>
    </Modal>
  );
}
