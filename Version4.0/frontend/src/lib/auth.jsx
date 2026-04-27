import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, clearToken } from "./api.js";

const AuthCtx = createContext(null);
const ThemeCtx = createContext(null);

const THEME_KEY = "reasonal:theme";

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark" || theme === "light") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

export function ThemeProvider({ children }) {
  const initial = (() => {
    if (typeof window === "undefined") return "system";
    try {
      const v = localStorage.getItem(THEME_KEY);
      if (v === "dark" || v === "light" || v === "system") return v;
    } catch {}
    return "system";
  })();
  const [theme, setThemeState] = useState(initial);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
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
    // Fallback so callers outside the provider don't crash.
    return { theme: "system", setTheme: () => {} };
  }
  return v;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get("/api/auth/me");
      setUser(r.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
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
