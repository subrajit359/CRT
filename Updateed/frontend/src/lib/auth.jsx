import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api.js";

const AuthCtx = createContext(null);

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
    setUser(null);
    window.location.href = "/";
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, refresh, logout, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
