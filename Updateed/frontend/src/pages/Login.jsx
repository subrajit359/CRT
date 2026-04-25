import { useState } from "react";
import { useLocation, Link } from "wouter";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../lib/auth.jsx";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const toast = useToast();
  const { refresh } = useAuth();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/api/auth/login", { email, password });
      await refresh();
      toast.success("Welcome back");
      navigate("/");
    } catch (err) {
      toast.error(err.message);
    } finally { setBusy(false); }
  }

  return (
    <AppShell>
      <div className="auth-shell">
        <div className="auth-side">
          <div>
            <span className="hero-eyebrow" style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.16)", color: "white" }}>
              <span className="dot" /> Reasonal
            </span>
            <h2 style={{ marginTop: 18 }}>One case at a time. One sharp question. One honest grade.</h2>
            <p style={{ opacity: 0.85, marginTop: 14, fontSize: 16 }}>
              You're here to think better, not memorize more. We'll meet you in the middle of a case.
            </p>
          </div>
          <div className="quote">"If you can't reason it, you don't know it."</div>
        </div>

        <div className="auth-form-wrap">
          <div className="auth-form fade-in">
            <h2>Sign in</h2>
            <p className="muted" style={{ marginBottom: 22 }}>Use your email and password.</p>

            <form onSubmit={submit}>
              <div className="field">
                <label className="label">Email</label>
                <input className="input" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus autoComplete="email" />
              </div>
              <div className="field">
                <label className="label">Password</label>
                <div style={{ position: "relative" }}>
                  <input className="input" type={showPw ? "text" : "password"} required value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" minLength={8} style={{ paddingRight: 64 }} />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, cursor: "pointer", fontSize: 12, color: "var(--muted, #7A8194)", padding: "6px 8px" }}>
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <button className="btn btn-primary btn-block btn-lg" disabled={busy || !email || password.length < 8}>
                {busy ? <span className="spinner" /> : "Sign in"}
              </button>
              <p className="help" style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span>No account? <Link href="/register" style={{ fontWeight: 600 }}>Create one</Link></span>
                <Link href="/forgot" style={{ fontWeight: 600 }}>Forgot password?</Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
