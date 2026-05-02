import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, clearToken } from "./api.js";

const AuthCtx = createContext(null);
const ThemeCtx = createContext(null);

const THEME_KEY = "reasonal:theme";

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
}

export function ThemeProvider({ children }) {
  const initial = (() => {
    if (typeof window === "undefined") return "light";
    try {
      const v = localStorage.getItem(THEME_KEY);
      if (v === "dark") return "dark";
      if (v === "light") return "light";
      // migrate old "system" value → "light"
    } catch {}
    return "light";
  })();
  const [theme, setThemeState] = useState(initial);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const setTheme = useCallback((next) => {
    const safe = next === "dark" ? "dark" : "light";
    setThemeState(safe);
    try {
      localStorage.setItem(THEME_KEY, safe);
    } catch {}
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) {
    return { theme: "light", setTheme: () => {} };
  }
  return v;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (retrying = false) => {
    try {
      const r = await api.get("/api/auth/me");
      setUser(r.user);
      setLoading(false);
    } catch (e) {
      // Only clear the user on a real auth rejection (401/403).
      // Network errors (no e.status) are transient — retry once before
      // deciding the user is logged out, so a brief proxy hiccup doesn't
      // flash the landing page.
      if (e.status === 401 || e.status === 403) {
        setUser(null);
        setLoading(false);
      } else if (!retrying) {
        // Network / unknown error — wait 1.5 s and try again once
        setTimeout(() => refresh(true), 1500);
      } else {
        // Second failure — give up, treat as logged out
        setUser(null);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.post("/api/auth/logout", {}); } catch {}
    clearToken();
    setUser(null);
    window.location.href = "/";
  }, []);

  return (
    <ThemeProvider>
      <AuthCtx.Provider value={{ user, loading, refresh, logout, setUser }}>
        {children}
      </AuthCtx.Provider>
    </ThemeProvider>
  );
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
