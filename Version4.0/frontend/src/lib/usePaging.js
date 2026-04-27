import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

/**
 * URL-synced paging state.
 *  - Reads ?page= and ?pageSize= from the location on mount.
 *  - Writes them back via wouter's setLocation when they change.
 *  - Multiple instances on the same page can share the URL by passing distinct
 *    `prefix` values (e.g. "u" for users, "c" for cases) — the keys become
 *    `uPage`, `uSize`, etc.
 *  - When `enabled` is false, behaves as a plain useState pair (no URL sync).
 *    Use this for nested lists where URL coupling would be confusing.
 */
export default function useUrlPaging({
  initialPage = 1,
  initialPageSize = 10,
  prefix = "",
  enabled = true,
} = {}) {
  const [location, setLocation] = useLocation();
  const pageKey = prefix ? `${prefix}Page` : "page";
  const sizeKey = prefix ? `${prefix}Size` : "pageSize";

  const initial = (() => {
    if (!enabled || typeof window === "undefined") {
      return { page: initialPage, pageSize: initialPageSize };
    }
    try {
      const sp = new URLSearchParams(window.location.search);
      const p = parseInt(sp.get(pageKey) || "", 10);
      const s = parseInt(sp.get(sizeKey) || "", 10);
      return {
        page: Number.isFinite(p) && p > 0 ? p : initialPage,
        pageSize: Number.isFinite(s) && s > 0 ? s : initialPageSize,
      };
    } catch {
      return { page: initialPage, pageSize: initialPageSize };
    }
  })();

  const [page, setPage] = useState(initial.page);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const firstRunRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    if (firstRunRef.current) { firstRunRef.current = false; return; }
    try {
      const sp = new URLSearchParams(window.location.search);
      if (page === initialPage) sp.delete(pageKey); else sp.set(pageKey, String(page));
      if (pageSize === initialPageSize) sp.delete(sizeKey); else sp.set(sizeKey, String(pageSize));
      const qs = sp.toString();
      const path = window.location.pathname + (qs ? `?${qs}` : "");
      setLocation(path, { replace: true });
    } catch {}
    // location change is the side-effect we want; don't re-run on every loc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, enabled]);

  function setSize(n) {
    setPageSize(n);
    setPage(1);
  }

  return { page, pageSize, setPage, setPageSize: setSize };
}
