import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const STATIC_PAGES = [
  { kind: "page", label: "Dashboard", href: "/", hint: "Home" },
  { kind: "page", label: "Practice", href: "/practice", hint: "Pick a case", roles: ["student"] },
  { kind: "page", label: "Progress", href: "/progress", hint: "Stats", roles: ["student"] },
  { kind: "page", label: "Verify queue", href: "/verify", hint: "Review", roles: ["doctor", "admin"] },
  { kind: "page", label: "Upload case", href: "/upload", hint: "New case", roles: ["doctor", "admin"] },
  { kind: "page", label: "Doctor lounge", href: "/lounge", hint: "Chat", roles: ["doctor", "admin"] },
  { kind: "page", label: "Delete requests", href: "/delete-requests", hint: "Triage", roles: ["doctor", "admin"] },
  { kind: "page", label: "Admin", href: "/admin", hint: "Admin panel", roles: ["admin"] },
  { kind: "page", label: "Messages", href: "/messages", hint: "DMs" },
  { kind: "page", label: "Notifications", href: "/notifications", hint: "Inbox" },
  { kind: "page", label: "Search", href: "/search", hint: "Full search" },
  { kind: "page", label: "Settings", href: "/settings", hint: "Profile & prefs" },
];

function fuzzyScore(q, text) {
  if (!q) return 0;
  const t = text.toLowerCase();
  const ql = q.toLowerCase();
  if (t.includes(ql)) return 100 - t.indexOf(ql);
  let i = 0, score = 0, last = -1;
  for (const ch of ql) {
    const found = t.indexOf(ch, i);
    if (found === -1) return -1;
    score += found - last <= 1 ? 5 : 1;
    last = found;
    i = found + 1;
  }
  return score;
}

export default function CommandPalette() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState({ users: [], cases: [] });
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (isCmdK) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      setActive(0);
    } else {
      setQ("");
      setRemote({ users: [], cases: [] });
    }
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    if (!q.trim()) {
      setRemote({ users: [], cases: [] });
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.get(`/api/search?q=${encodeURIComponent(q)}`);
        setRemote({ users: r.users || [], cases: r.cases || [] });
      } catch {
        setRemote({ users: [], cases: [] });
      }
    }, 180);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [q, open, user]);

  const items = useMemo(() => {
    const role = user?.role;
    const pages = STATIC_PAGES
      .filter((p) => !p.roles || p.roles.includes(role))
      .map((p) => ({ ...p, score: q ? fuzzyScore(q, p.label) : 80 }))
      .filter((p) => p.score >= 0)
      .sort((a, b) => b.score - a.score);

    const cases = (remote.cases || []).map((c) => ({
      kind: "case",
      label: c.title,
      hint: `${c.specialty} · L${c.level}`,
      href: `/case/${c.id}`,
      score: 60,
    }));
    const people = (remote.users || []).map((u) => ({
      kind: "user",
      label: u.full_name || `@${u.username}`,
      hint: `@${u.username} · ${u.role}${u.specialty ? ` · ${u.specialty}` : ""}`,
      href: `/u/${u.username}`,
      score: 50,
    }));

    return [...pages, ...cases, ...people];
  }, [q, remote, user]);

  useEffect(() => { setActive(0); }, [items.length]);

  function choose(item) {
    if (!item) return;
    setOpen(false);
    if (item.href) navigate(item.href);
  }

  function onInputKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="cmdk-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <motion.div
            className="cmdk-panel"
            initial={{ y: -16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -8, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="cmdk-input-row">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                className="cmdk-input"
                placeholder="Jump to a page, case, or person…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                aria-label="Command palette search"
              />
              <kbd className="kbd cmdk-kbd">esc</kbd>
            </div>
            <div className="cmdk-list" role="listbox">
              {items.length === 0 ? (
                <div className="cmdk-empty muted">No matches. Try a different term.</div>
              ) : items.map((item, idx) => (
                <button
                  key={`${item.kind}-${item.href}-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={idx === active}
                  className={`cmdk-item ${idx === active ? "is-active" : ""}`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(item)}
                >
                  <span className={`cmdk-kind cmdk-kind-${item.kind}`}>
                    {item.kind === "page" ? "↦" : item.kind === "case" ? "◧" : "@"}
                  </span>
                  <span className="cmdk-label">{item.label}</span>
                  {item.hint && <span className="cmdk-hint muted">{item.hint}</span>}
                </button>
              ))}
            </div>
            <div className="cmdk-foot muted small">
              <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
              <span><kbd className="kbd">↵</kbd> open</span>
              <span><kbd className="kbd">⌘</kbd>/<kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">K</kbd> to toggle</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
