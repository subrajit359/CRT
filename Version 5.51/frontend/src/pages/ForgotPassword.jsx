import { useState } from "react";
import { useLocation, Link } from "wouter";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const toast = useToast();
  const [stage, setStage] = useState("email");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  async function sendCode(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/api/auth/request-otp", { email, purpose: "reset" });
      toast.success("Reset code sent. Check your inbox.");
      setStage("reset");
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  async function reset(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/api/auth/reset-password", { email, code, password });
      toast.success("Password updated. Sign in with your new password.");
      navigate("/login");
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  const pwOk = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);

  return (
    <AppShell>
      <div className="auth-shell">
        <div className="auth-side">
          <div>
            <span className="hero-eyebrow" style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.16)", color: "white" }}>
              <span className="dot" /> Reset password
            </span>
            <h2 style={{ marginTop: 18 }}>We'll mail you a 6-digit code.</h2>
            <p style={{ opacity: 0.85, marginTop: 14, fontSize: 16 }}>
              Enter the code with your new password to take back the account.
            </p>
          </div>
          <div className="quote">"Forgetting is fine. Locking yourself out isn't."</div>
        </div>

        <div className="auth-form-wrap">
          <div className="auth-form fade-in">
            {stage === "email" && (
              <>
                <h2>Forgot password</h2>
                <p className="muted" style={{ marginBottom: 22 }}>Enter the email on your account.</p>
                <form onSubmit={sendCode}>
                  <div className="field">
                    <label className="label">Email</label>
                    <input className="input" type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus autoComplete="email" />
                  </div>
                  <button className="btn btn-primary btn-block btn-lg" disabled={busy || !email}>
                    {busy ? <span className="spinner" /> : "Send reset code"}
                  </button>
                  <p className="help" style={{ marginTop: 14 }}>
                    Remembered it? <Link href="/login" style={{ fontWeight: 600 }}>Back to sign in</Link>
                  </p>
                </form>
              </>
            )}

            {stage === "reset" && (
              <>
                <h2>Set a new password</h2>
                <p className="muted" style={{ marginBottom: 22 }}>Code sent to {email}. It expires in 10 minutes.</p>
                <form onSubmit={reset}>
                  <div className="field">
                    <label className="label">6-digit code</label>
                    <input className="input code-input" inputMode="numeric" autoComplete="one-time-code"
                      pattern="[0-9]{6}" maxLength={6} required value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
                  </div>
                  <div className="field">
                    <label className="label">New password</label>
                    <div style={{ position: "relative" }}>
                      <input className="input" type={showPw ? "text" : "password"} required value={password}
                        onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 chars, letters + numbers"
                        minLength={8} autoComplete="new-password" style={{ paddingRight: 64 }} />
                      <button type="button" onClick={() => setShowPw((v) => !v)}
                        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, cursor: "pointer", fontSize: 12, color: "var(--muted, #7A8194)", padding: "6px 8px" }}>
                        {showPw ? "Hide" : "Show"}
                      </button>
                    </div>
                    <div className="help">Min 8 characters with at least one letter and one number.</div>
                  </div>
                  <button className="btn btn-primary btn-block btn-lg" disabled={busy || code.length !== 6 || !pwOk}>
                    {busy ? <span className="spinner" /> : "Update password"}
                  </button>
                  <p className="help" style={{ marginTop: 12 }}>
                    Wrong email? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStage("email")}>Change</button>
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
