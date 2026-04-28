import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import {
  Search, MessageSquare, Bell,
  Home, Stethoscope, User, Plus, Check,
} from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { api, apiUrl } from "../lib/api.js";
import Avatar from "./Avatar.jsx";
import KbdShortcuts from "./KbdShortcuts.jsx";
import CommandPalette from "./CommandPalette.jsx";
import { useToast } from "./Toast.jsx";
import { isPushSupported, getPermission, subscribeToPush } from "../lib/push.js";

function isActive(location, href) {
  if (!href) return false;
  if (href === "/") return location === "/";
  return location === href || location.startsWith(href + "/") || location.startsWith(href + "?");
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
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
      } catch (e) {
        // Background poll: log for visibility but don't surface.
        if (alive) console.warn("DM unread poll failed:", e?.message || e);
      }
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
      } catch (e) {
        if (alive) console.warn("Notifications fetch failed:", e?.message || e);
      }
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
              <Search size={20} strokeWidth={1.75} aria-hidden="true" />
            </Link>
            {user && (
              <Link href="/messages" className="icon-btn" aria-label="Messages" title="Messages">
                <MessageSquare size={20} strokeWidth={1.75} aria-hidden="true" />
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
                subscribeToPush().catch((e) => console.warn("push subscribe failed:", e?.message || e));
              }}
            >
              <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
              {unread > 0 && <span className="icon-badge">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          </div>

          <button className="nav-burger" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <span /><span /><span />
          </button>
          <nav className={`nav-links ${open ? "open" : ""}`} onClick={() => setOpen(false)}>
            {isStudent && <Link href="/practice" className={`nav-link ${isActive(location, "/practice") ? "is-active" : ""}`}>Practice</Link>}
            {isStudent && <Link href="/progress" className={`nav-link ${isActive(location, "/progress") ? "is-active" : ""}`}>Progress</Link>}
            {isDoc && <Link href="/verify" className={`nav-link ${isActive(location, "/verify") ? "is-active" : ""}`}>Verify</Link>}
            {isDoc && <Link href="/upload" className={`nav-link ${isActive(location, "/upload") ? "is-active" : ""}`}>Upload</Link>}
            {isDoc && <Link href="/lounge" className={`nav-link ${isActive(location, "/lounge") ? "is-active" : ""}`}>Lounge</Link>}
            {isDoc && <Link href="/delete-requests" className={`nav-link ${isActive(location, "/delete-requests") ? "is-active" : ""}`}>Delete reqs</Link>}
            {isAdmin && <Link href="/admin" className={`nav-link ${isActive(location, "/admin") ? "is-active" : ""}`}>Admin</Link>}
            {user ? (
              <div className="nav-user">
                <Link href={`/u/${user.username}`} className={`nav-link nav-username ${isActive(location, `/u/${user.username}`) ? "is-active" : ""}`}>
                  <Avatar url={user.avatar_url} name={user.full_name || user.username} size={26} />
                  <span style={{ marginLeft: 8 }}>@{user.username}</span>
                </Link>
                <Link href="/settings" className={`nav-link ${isActive(location, "/settings") ? "is-active" : ""}`}>Settings</Link>
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

      {/* Footer is rendered INSIDE app-main so the bottom-padding that the
          mobile tab bar adds also pushes the footer above the tabbar. */}
      <main className="app-main">
        {children}
        <footer className="footer">
          <div className="container footer-inner">
            <div>
              <strong>Reasonal</strong> — Trains thinking, not memory.
            </div>
            <div className="muted small">© {new Date().getFullYear()} Reasonal · For educational use</div>
          </div>
        </footer>
      </main>

      <KbdShortcuts />
      <CommandPalette />
      {user && (
        <MobileTabBar
          location={location}
          isDoc={isDoc}
          isStudent={isStudent}
          username={user.username}
          dmUnread={dmUnread}
          unread={unread}
        />
      )}
    </div>
  );
}

function MobileTabBar({ location, isDoc, isStudent, username, dmUnread, unread }) {
  // Order per spec: Home · Practice · Search · Notifications · Profile.
  // For doctors / admins, "Practice" is replaced by a role-relevant action
  // (Verify) and Profile collapses to the user's own profile route.
  const tabs = [
    { href: "/", label: "Home", Icon: Home },
    isStudent
      ? { href: "/practice", label: "Practice", Icon: Stethoscope }
      : isDoc
        ? { href: "/verify", label: "Verify", Icon: Check }
        : { href: "/practice", label: "Practice", Icon: Stethoscope },
    { href: "/search", label: "Search", Icon: Search },
    { href: "/notifications", label: "Alerts", Icon: Bell, badge: unread },
    { href: `/u/${username}`, label: "Profile", Icon: User },
  ];

  // Doctors / admins also benefit from a quick "Upload" jump and Messages —
  // those remain reachable from the top bar on mobile via the burger menu and
  // the icon row, so the 5-tab bar stays focused on primary navigation.
  // (dmUnread badge is shown on the Messages icon-btn in the top bar.)
  void dmUnread;

  return (
    <nav className="mobile-tabbar" aria-label="Primary">
      <ul className="mobile-tabbar-list">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className={`mobile-tab ${isActive(location, t.href) ? "is-active" : ""}`}
              aria-label={t.label}
              aria-current={isActive(location, t.href) ? "page" : undefined}
            >
              <span className="mt-icon">
                <t.Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span style={{ position: "relative" }}>
                {t.label}
                {t.badge > 0 && (
                  <span style={{
                    position: "absolute", top: -8, right: -16,
                    background: "var(--danger)", color: "#fff",
                    fontSize: 9, fontWeight: 700, lineHeight: "14px",
                    minWidth: 14, height: 14, padding: "0 4px",
                    borderRadius: 10, textAlign: "center",
                  }}>{t.badge > 9 ? "9+" : t.badge}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Re-exported so other components can compose the same five-tab pattern if
// they ever need to render a context-specific bottom nav.
// eslint-disable-next-line no-unused-vars
const __PrimaryIcons = { Home, Stethoscope, Search, Bell, User, Plus };
