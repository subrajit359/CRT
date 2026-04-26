import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { api, apiUrl } from "../lib/api.js";
import Avatar from "./Avatar.jsx";
import KbdShortcuts from "./KbdShortcuts.jsx";
import CommandPalette from "./CommandPalette.jsx";
import { useToast } from "./Toast.jsx";
import { isPushSupported, getPermission, subscribeToPush } from "../lib/push.js";

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [dmUnread, setDmUnread] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const esRef = useRef(null);
  const reconnectTimer = useRef(null);
  const seenRef = useRef(new Set());

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // DM unread polls (kept short-poll for now; SSE replaces notifications poll)
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await api.get("/api/messages/unread");
        if (alive) setDmUnread(r.unread || 0);
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, [user]);

  // Initial notifications count + SSE stream
  useEffect(() => {
    if (!user) return;
    let alive = true;

    (async () => {
      try {
        const r = await api.get("/api/notifications");
        if (alive) setUnread(r.unread || 0);
      } catch {}
    })();

    function connect() {
      try {
        const es = new EventSource(apiUrl("/api/notifications/stream"), { withCredentials: true });
        esRef.current = es;
        es.addEventListener("hello", (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (typeof data.unread === "number" && alive) setUnread(data.unread);
          } catch {}
        });
        es.addEventListener("notification", (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data?.id && seenRef.current.has(data.id)) return;
            if (data?.id) seenRef.current.add(data.id);
            if (alive) {
              setUnread((u) => u + 1);
              if (data?.title) {
                toast.info(data.title, {
                  action: data?.link ? "Open" : null,
                  onAction: data?.link ? () => navigate(data.link) : null,
                  duration: 5000,
                });
              }
            }
          } catch {}
        });
        es.addEventListener("unread", (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (typeof data.unread === "number" && alive) setUnread(data.unread);
          } catch {}
        });
        es.onerror = () => {
          es.close();
          esRef.current = null;
          if (!alive) return;
          if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
          reconnectTimer.current = setTimeout(connect, 4000);
        };
      } catch {
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(connect, 4000);
      }
    }
    connect();

    return () => {
      alive = false;
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [user, toast, navigate]);

  const isStudent = user?.role === "student";
  const isDoc = user?.role === "doctor" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

  return (
    <div className="app-shell">
      <header className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <img src="/logo.png" alt="Reasonal" className="brand-mark-img" />
            <span className="brand-text">Reasonal</span>
          </Link>

          <div className="nav-icons">
            <Link href="/search" className="icon-btn" aria-label="Search" title="Search (⌘K)">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </Link>
            {user && (
              <Link href="/messages" className="icon-btn" aria-label="Messages" title="Messages">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {dmUnread > 0 && <span className="icon-badge">{dmUnread > 99 ? "99+" : dmUnread}</span>}
              </Link>
            )}
            <Link
              href="/notifications"
              className="icon-btn"
              aria-label="Notifications"
              title="Notifications"
              onClick={() => {
                if (!user) return;
                if (!isPushSupported()) return;
                if (getPermission() !== "default") return;
                subscribeToPush().catch(() => {});
              }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unread > 0 && <span className="icon-badge">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          </div>

          <button className="nav-burger" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <span /><span /><span />
          </button>
          <nav className={`nav-links ${open ? "open" : ""}`} onClick={() => setOpen(false)}>
            {isStudent && <Link href="/practice" className="nav-link">Practice</Link>}
            {isStudent && <Link href="/progress" className="nav-link">Progress</Link>}
            {isDoc && <Link href="/verify" className="nav-link">Verify</Link>}
            {isDoc && <Link href="/upload" className="nav-link">Upload</Link>}
            {isDoc && <Link href="/lounge" className="nav-link">Lounge</Link>}
            {isDoc && <Link href="/delete-requests" className="nav-link">Delete reqs</Link>}
            {isAdmin && <Link href="/admin" className="nav-link">Admin</Link>}
            {user ? (
              <div className="nav-user">
                <Link href={`/u/${user.username}`} className="nav-link nav-username">
                  <Avatar url={user.avatar_url} name={user.full_name || user.username} size={26} />
                  <span style={{ marginLeft: 8 }}>@{user.username}</span>
                </Link>
                <Link href="/settings" className="nav-link">Settings</Link>
                <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
              </div>
            ) : (
              <div className="nav-user">
                <button className="btn btn-ghost btn-sm" onClick={() => navigate("/login")}>Log in</button>
                <button className="btn btn-primary btn-sm" onClick={() => navigate("/register")}>Get started</button>
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <KbdShortcuts />
      <CommandPalette />
      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <strong>Reasonal</strong> — Trains thinking, not memory.
          </div>
          <div className="muted small">© {new Date().getFullYear()} Reasonal · For educational use</div>
        </div>
      </footer>
    </div>
  );
}
