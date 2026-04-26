import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { List } from "react-window";
import AppShell from "../components/AppShell.jsx";
import Skeleton, { SkeletonStack } from "../components/Skeleton.jsx";
import { api } from "../lib/api.js";

const ROW_HEIGHT = 96;

function NotifRow({ index, style, items }) {
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
        {n.link && <Link href={n.link} className="btn btn-secondary btn-sm">Open</Link>}
      </div>
    </div>
  );
}

export default function Notifications() {
  const [items, setItems] = useState(null);
  const wrapRef = useRef(null);
  const [height, setHeight] = useState(640);

  useEffect(() => {
    api.get("/api/notifications").then((r) => setItems(r.notifications || []));
    api.post("/api/notifications/read-all", {}).catch(() => {});
  }, []);

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
        <h2>Inbox</h2>
        <p className="muted" style={{ marginTop: 4 }}>Verification updates, replies, and admin decisions.</p>
        <div className="spacer-7" />
        {items === null ? (
          <SkeletonStack rows={6} height={64} />
        ) : items.length === 0 ? (
          <div className="empty">No notifications yet.</div>
        ) : (
          <div ref={wrapRef} className="notif-virtual">
            <List
              rowComponent={NotifRow}
              rowCount={items.length}
              rowHeight={ROW_HEIGHT}
              rowProps={{ items }}
              overscanCount={6}
              style={{ height, width: "100%" }}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
