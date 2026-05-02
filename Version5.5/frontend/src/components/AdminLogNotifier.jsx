import { useEffect, useRef } from "react";
import { useAuth } from "../lib/auth.jsx";
import { api } from "../lib/api.js";

// Polls for unseen warn/error log entries and broadcasts the count via a
// CustomEvent so the dashboard badge stays current. Actual desktop alerts
// are delivered by the server via web push (handled by /sw.js), so this
// component intentionally does NOT call the Notification API directly —
// otherwise the same event would notify the user twice when the tab is open.

const POLL_MS = 5000;
const LAST_SEEN_KEY = "admin:logs:lastSeenId";

export default function AdminLogNotifier() {
  const { user } = useAuth();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user || user.role !== "admin") return;

    let cancelled = false;

    async function poll() {
      try {
        const lastSeen = parseInt(localStorage.getItem(LAST_SEEN_KEY) || "0", 10) || 0;
        const r = await api.get(
          `/api/admin/logs?level=warn,error&sinceId=${lastSeen}&limit=50`
        );
        if (cancelled) return;
        const entries = r.entries || [];
        const detail = {
          count: entries.length,
          hasError: entries.some((e) => e.level === "error"),
        };
        try {
          window.dispatchEvent(new CustomEvent("admin:logs:status", { detail }));
        } catch {}
      } catch {
        // Stay silent during polling.
      }
    }

    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user]);

  return null;
}
