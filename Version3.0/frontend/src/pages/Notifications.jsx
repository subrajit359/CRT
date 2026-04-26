import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { List } from "react-window";
import AppShell from "../components/AppShell.jsx";
import Skeleton, { SkeletonStack } from "../components/Skeleton.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const ROW_HEIGHT = 96;

function NotifRow({ index, style, items, onOpen }) {
  const n = items[index];
  if (!n) return null;
  return (
    <div style={style} className="notif-row-wrap">
      <div className="case-item notif-row">
        <div>
          <strong>{n.title}</strong>
          {n.body && <div className="muted small" style={{ marginTop: 4 }}>{n.body}</div>}
          <div className="muted small" style={{ marginTop: 6 }}>{new Date(n.created_at).toLocaleString()}</div>
        </div>
        {n.link && (
          <Link href={n.link} className="btn btn-secondary btn-sm" onClick={() => onOpen(n.id)}>
            Open
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Notifications() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);
  const [height, setHeight] = useState(640);
  const toast = useToast();

  useEffect(() => {
    api.get("/api/notifications").then((r) => setItems(r.notifications || []));
  }, []);

  function markRead(id) {
    setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
    api.post(`/api/notifications/${id}/read`, {}).catch(() => {});
  }

  async function clearAll() {
    if (!items || items.length === 0) return;
    setBusy(true);
    try {
      await api.post("/api/notifications/read-all", {});
      setItems([]);
    } catch (e) {
      toast.error(e.message || "Couldn't clear notifications");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function measure() {
      if (!wrapRef.current) return;
      const top = wrapRef.current.getBoundingClientRect().top;
      setHeight(Math.max(360, window.innerHeight - top - 40));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [items]);

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 760 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Inbox</h2>
            <p className="muted" style={{ marginTop: 4 }}>Verification updates, replies, and admin decisions.</p>
          </div>
          {items && items.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={clearAll} disabled={busy}>
              {busy ? "Clearing…" : "Clear all"}
            </button>
          )}
        </div>
        <div className="spacer-7" />
        {items === null ? (
          <SkeletonStack rows={6} height={64} />
        ) : items.length === 0 ? (
          <div className="empty">You're all caught up.</div>
        ) : (
          <div ref={wrapRef} className="notif-virtual">
            <List
              rowComponent={NotifRow}
              rowCount={items.length}
              rowHeight={ROW_HEIGHT}
              rowProps={{ items, onOpen: markRead }}
              overscanCount={6}
              style={{ height, width: "100%" }}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
