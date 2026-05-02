import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { List } from "react-window";
import AppShell from "../components/AppShell.jsx";
import Skeleton, { SkeletonStack } from "../components/Skeleton.jsx";
import Pagination from "../components/Pagination.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const ROW_GAP = 5;
const CARD_HEIGHT = 96;
const ROW_HEIGHT = CARD_HEIGHT + ROW_GAP;
const HISTORY_PAGE_SIZE = 20;

function NotifRow({ index, style, items, onOpen, onNavigate }) {
  const n = items[index];
  if (!n) return null;
  return (
    <div style={{ ...style, paddingBottom: ROW_GAP, boxSizing: "border-box" }} className="notif-row-wrap">
      <div
        className="case-item notif-row"
        style={{ height: "100%", ...(n.link ? { cursor: "pointer" } : null) }}
        onClick={() => { if (n.link) { onOpen(n.id); onNavigate(n.link); } }}
      >
        <div>
          <strong>{n.title}</strong>
          {n.body && <div className="muted small" style={{ marginTop: 4 }}>{n.body}</div>}
          <div className="muted small" style={{ marginTop: 6 }}>{new Date(n.created_at).toLocaleString()}</div>
        </div>
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
  const [, navigate] = useLocation();

  // Mode toggle: "unread" keeps the original virtualized inbox; "history"
  // shows everything (read + unread) with simple pagination so users can
  // page through long histories without dumping thousands of rows at once.
  const [mode, setMode] = useState("unread");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  function loadUnread() {
    setItems(null);
    api
      .get("/api/notifications")
      .then((r) => setItems(r.items || r.notifications || []))
      .catch(() => setItems([]));
  }

  function loadHistory(page = historyPage) {
    setItems(null);
    api
      .get(`/api/notifications?all=true&page=${page}&pageSize=${HISTORY_PAGE_SIZE}`)
      .then((r) => {
        setItems(r.items || r.notifications || []);
        setHistoryTotal(r.total || 0);
        setHistoryTotalPages(r.totalPages || 1);
      })
      .catch(() => setItems([]));
  }

  useEffect(() => {
    if (mode === "unread") loadUnread();
    else loadHistory(historyPage);
    // eslint-disable-next-line
  }, [mode, historyPage]);

  function markRead(id) {
    setItems((prev) => (prev ? prev.map((x) => x.id === id ? { ...x, read_at: new Date().toISOString() } : x) : prev));
    if (mode === "unread") {
      // Drop from the unread inbox right away.
      setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
    }
    api.post(`/api/notifications/${id}/read`, {}).catch((e) => {
      // Best-effort: server is the source of truth; the next refresh will
      // reconcile if this fails. Surface to logs for visibility.
      console.warn("Mark-notification-read failed:", e?.message || e);
    });
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
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <div className="row" style={{ gap: 4 }}>
              <button
                className={`btn btn-sm ${mode === "unread" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => { setMode("unread"); setHistoryPage(1); }}
              >Unread</button>
              <button
                className={`btn btn-sm ${mode === "history" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => { setMode("history"); setHistoryPage(1); }}
              >All</button>
            </div>
            {mode === "unread" && items && items.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={clearAll} disabled={busy}>
                {busy ? "Clearing…" : "Clear all"}
              </button>
            )}
          </div>
        </div>
        <div className="spacer-7" />
        {items === null ? (
          <SkeletonStack rows={6} height={64} />
        ) : items.length === 0 ? (
          <div className="empty">{mode === "unread" ? "You're all caught up." : "No notifications yet."}</div>
        ) : mode === "unread" ? (
          <div ref={wrapRef} className="notif-virtual">
            <List
              rowComponent={NotifRow}
              rowCount={items.length}
              rowHeight={ROW_HEIGHT}
              rowProps={{ items, onOpen: markRead, onNavigate: navigate }}
              overscanCount={6}
              style={{ height, width: "100%" }}
            />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {items.map((n) => (
                <div
                  key={n.id}
                  className="case-item notif-row"
                  style={{
                    opacity: n.read_at ? 0.7 : 1,
                    cursor: n.link ? "pointer" : undefined,
                  }}
                  onClick={() => { if (n.link) { markRead(n.id); navigate(n.link); } }}
                >
                  <div>
                    <strong>{n.title}</strong>
                    {n.body && <div className="muted small" style={{ marginTop: 4 }}>{n.body}</div>}
                    <div className="muted small" style={{ marginTop: 6 }}>
                      {new Date(n.created_at).toLocaleString()}
                      {n.read_at ? " · read" : " · unread"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              page={historyPage}
              totalPages={historyTotalPages}
              total={historyTotal}
              onChange={setHistoryPage}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
