import { useEffect, useRef, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const LEVEL_COLORS = {
  error: "#dc2626",
  warn: "#d97706",
  info: "#2563eb",
};

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

export default function AdminLogs() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [level, setLevel] = useState("all");
  const [q, setQ] = useState("");
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [info, setInfo] = useState({ total: 0, capacity: 0 });
  const lastIdRef = useRef(0);
  const scrollerRef = useRef(null);
  const filterRef = useRef({ level: "all", q: "" });

  // Keep latest filter values in a ref so the polling loop doesn't restart on every keystroke.
  useEffect(() => { filterRef.current = { level, q }; }, [level, q]);

  // Re-fetch from scratch when filters change.
  useEffect(() => {
    lastIdRef.current = 0;
    setEntries([]);
    fetchOnce(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, q]);

  // Polling loop.
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => fetchOnce(false), 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // Auto-scroll to bottom on new entries.
  useEffect(() => {
    if (!autoScroll || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [entries, autoScroll]);

  async function fetchOnce(reset) {
    try {
      const f = filterRef.current;
      const params = new URLSearchParams({
        sinceId: reset ? "0" : String(lastIdRef.current),
        level: f.level,
        q: f.q,
        limit: "500",
      });
      const r = await api.get(`/api/admin/logs?${params.toString()}`);
      if (r.lastId) {
        lastIdRef.current = r.lastId;
        // Mark everything up to here as seen so the red dot on the
        // dashboard clears while this page is open.
        try { localStorage.setItem("admin:logs:lastSeenId", String(r.lastId)); } catch {}
      }
      setInfo({ total: r.total || 0, capacity: r.capacity || 0 });
      if (reset) {
        setEntries(r.entries || []);
      } else if (r.entries && r.entries.length) {
        setEntries((prev) => [...prev, ...r.entries].slice(-2000));
      }
    } catch (e) {
      // silent — don't spam toasts during polling
    }
  }

  async function clearAll() {
    if (!confirm("Clear all captured server logs?")) return;
    try {
      await api.del("/api/admin/logs");
      lastIdRef.current = 0;
      setEntries([]);
      toast.success("Logs cleared");
    } catch (e) { toast.error(e.message); }
  }

  return (
    <AppShell>
      <div className="container fade-in">
        <h2>Server logs</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Live tail of recent server activity (in-memory ring buffer, last {info.capacity || "—"} entries). Refreshes every 2 seconds.
        </p>

        <div className="spacer-7" />

        <div className="card" style={{ padding: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="input" style={{ maxWidth: 140 }}>
              <option value="all">All levels</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
            <input
              className="input"
              style={{ flex: "1 1 240px", minWidth: 180 }}
              placeholder="Filter text (e.g. rate, 429, rio)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn" onClick={() => setPaused((p) => !p)}>
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <label className="muted small" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
              Auto-scroll
            </label>
            <button className="btn" onClick={() => { lastIdRef.current = 0; setEntries([]); fetchOnce(true); }}>
              ↺ Refresh
            </button>
            <button className="btn danger" onClick={clearAll}>Clear</button>
            <span className="muted small" style={{ marginLeft: "auto" }}>
              Showing {entries.length} · buffer {info.total}/{info.capacity}
            </span>
          </div>

          <div className="spacer-5" />

          <div
            ref={scrollerRef}
            style={{
              background: "#0b0f17",
              color: "#e5e7eb",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              lineHeight: 1.45,
              padding: 12,
              borderRadius: 8,
              height: "60vh",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {entries.length === 0 ? (
              <div style={{ opacity: 0.6 }}>No log entries yet. Activity in the app will appear here.</div>
            ) : entries.map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "#94a3b8", flexShrink: 0 }}>{fmtTime(e.ts)}</span>
                <span style={{
                  color: LEVEL_COLORS[e.level] || "#9ca3af",
                  fontWeight: 700,
                  width: 46,
                  flexShrink: 0,
                  textTransform: "uppercase",
                }}>
                  {e.level}
                </span>
                <span style={{ flex: 1 }}>{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
