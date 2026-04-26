import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../lib/auth.jsx";

const SPECIALTIES = [
  "General Medicine", "Cardiology", "Neurology", "Pediatrics", "Surgery",
  "Obstetrics & Gynecology", "Psychiatry", "Emergency Medicine", "Endocrinology",
  "Pulmonology", "Gastroenterology", "Nephrology", "Infectious Disease", "Dermatology",
];

export default function Register() {
  const [, navigate] = useLocation();
  const toast = useToast();
  const { refresh } = useAuth();
  const [role, setRole] = useState("student");
  const [stage, setStage] = useState("email");
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("Final year");
  const [degree, setDegree] = useState("");
  const [specialty, setSpecialty] = useState(SPECIALTIES[0]);
  const [yearsExp, setYearsExp] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [hospital, setHospital] = useState("");
  const [proofText, setProofText] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("email");
    if (e) { setEmail(e); setStage("details"); }
  }, []);

  async function sendCode(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/api/auth/request-otp", { email });
      setStage("code");
      toast.success("Code sent. Check your inbox.");
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  async function verifyCode(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/api/auth/verify-otp", { email, code, purpose: "register" });
      setStage("details");
      toast.success("Email verified");
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (role === "student") {
        await api.post("/api/auth/register-student", { email, username, fullName, country, yearOfStudy, password });
        await refresh();
        toast.success("Welcome to Reasonal");
        navigate("/");
      } else {
        await api.post("/api/auth/register-doctor", {
          email, username, fullName, country, degree, specialty,
          yearsExp: parseInt(yearsExp || "0", 10),
          licenseNumber, hospital, proofText, password,
        });
        toast.success("Submitted. Admin will review your application.");
        navigate("/login");
      }
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  const pwRules = {
    length: password.length >= 8,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password),
    upper: /[A-Z]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const pwScore = Object.values(pwRules).filter(Boolean).length;
  const pwOk = pwRules.length && pwRules.letter && pwRules.number;
  const pwLabel = !password
    ? ""
    : pwScore <= 2
      ? "Too weak"
      : pwScore === 3
        ? "Weak"
        : pwScore === 4
          ? "Good"
          : "Strong";
  const pwLevel = pwScore <= 2 ? "weak" : pwScore === 3 ? "fair" : pwScore === 4 ? "good" : "strong";

  return (
    <AppShell>
      <div className="auth-shell">
        <div className="auth-side">
          <div>
            <span className="hero-eyebrow" style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.16)", color: "white" }}>
              <span className="dot" /> Join Reasonal
            </span>
            <h2 style={{ marginTop: 18 }}>Create your account</h2>
            <p style={{ opacity: 0.85, marginTop: 14, fontSize: 16 }}>
              Students start practicing immediately. Doctors get reviewed before being able to verify cases.
            </p>
          </div>
          <div className="quote">"Memory expires. Reasoning compounds."</div>
        </div>

        <div className="auth-form-wrap">
          <div className="auth-form fade-in">
            {stage === "email" && (
              <>
                <h2>Sign up</h2>
                <p className="muted" style={{ marginBottom: 18 }}>We'll send a 6-digit code to confirm your email.</p>
                <div className="auth-tabs">
                  <div className={`auth-tab ${role === "student" ? "active" : ""}`} onClick={() => setRole("student")}>Student</div>
                  <div className={`auth-tab ${role === "doctor" ? "active" : ""}`} onClick={() => setRole("doctor")}>Doctor</div>
                </div>
                <form onSubmit={sendCode}>
                  <div className="field">
                    <label className="label">Email</label>
                    <input className="input" type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
                  </div>
                  <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
                    {busy ? <span className="spinner" /> : "Send code"}
                  </button>
                </form>
              </>
            )}

            {stage === "code" && (
              <>
                <h2>Verify your email</h2>
                <p className="muted" style={{ marginBottom: 18 }}>Enter the 6-digit code we sent to {email}.</p>
                <form onSubmit={verifyCode}>
                  <input className="input code-input" inputMode="numeric" pattern="[0-9]{6}"
                    maxLength={6} required value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
                  <div style={{ height: 16 }} />
                  <button className="btn btn-primary btn-block btn-lg" disabled={busy || code.length !== 6}>
                    {busy ? <span className="spinner" /> : "Verify"}
                  </button>
                </form>
              </>
            )}

            {stage === "details" && (
              <form onSubmit={submit}>
                <h2>{role === "doctor" ? "Doctor profile" : "Student profile"}</h2>
                <p className="muted" style={{ marginBottom: 18 }}>
                  {role === "doctor"
                    ? "Your account will be reviewed by an admin before you can verify cases."
                    : "Tell us a bit so we can tune the experience."}
                </p>

                <div className="field">
                  <label className="label">Full name</label>
                  <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label">Username</label>
                  <input className="input" required pattern="[a-z0-9_]{3,24}" value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="lowercase letters, digits, underscore" />
                  <div className="help">3–24 chars. This becomes your public profile link.</div>
                </div>
                <div className="field">
                  <label className="label">Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      className={`input ${password && !pwOk ? "input-error" : ""}`}
                      type={showPw ? "text" : "password"} required value={password}
                      onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 chars, letters + numbers"
                      minLength={8} autoComplete="new-password" style={{ paddingRight: 64 }} />
                    <button type="button" onClick={() => setShowPw((v) => !v)}
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, cursor: "pointer", fontSize: 12, color: "var(--muted, #7A8194)", padding: "6px 8px" }}>
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                  {password && (
                    <>
                      <div className={`pw-meter pw-${pwLevel}`}>
                        <div className="pw-meter-bar"><span /><span /><span /><span /></div>
                        <span className="pw-meter-label">{pwLabel}</span>
                      </div>
                      <ul className="pw-rules">
                        <li className={pwRules.length ? "ok" : "bad"}>{pwRules.length ? "✓" : "✗"} At least 8 characters</li>
                        <li className={pwRules.letter ? "ok" : "bad"}>{pwRules.letter ? "✓" : "✗"} Contains a letter</li>
                        <li className={pwRules.number ? "ok" : "bad"}>{pwRules.number ? "✓" : "✗"} Contains a number</li>
                        <li className={pwRules.upper ? "ok" : "soft"}>{pwRules.upper ? "✓" : "○"} Uppercase letter (recommended)</li>
                        <li className={pwRules.special ? "ok" : "soft"}>{pwRules.special ? "✓" : "○"} Special character (recommended)</li>
                      </ul>
                    </>
                  )}
                  {!password && (
                    <div className="help">Min 8 characters with at least one letter and one number.</div>
                  )}
                </div>
                <div className="field">
                  <label className="label">Country</label>
                  <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. India" />
                </div>

                {role === "student" && (
                  <div className="field">
                    <label className="label">Year of study</label>
                    <select className="select" value={yearOfStudy} onChange={(e) => setYearOfStudy(e.target.value)}>
                      <option>1st year</option>
                      <option>2nd year</option>
                      <option>3rd year</option>
                      <option>Final year</option>
                      <option>Internship</option>
                    </select>
                  </div>
                )}

                {role === "doctor" && (
                  <>
                    <div className="field">
                      <label className="label">Degree</label>
                      <input className="input" value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="MBBS, MD, etc." />
                    </div>
                    <div className="field">
                      <label className="label">Primary specialty</label>
                      <select className="select" value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                        {SPECIALTIES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Years of experience</label>
                      <input className="input" type="number" min="0" value={yearsExp} onChange={(e) => setYearsExp(e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="label">License / registration number</label>
                      <input className="input" required value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="label">Hospital / institution</label>
                      <input className="input" value={hospital} onChange={(e) => setHospital(e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="label">Proof of identity (text)</label>
                      <textarea className="textarea" value={proofText} onChange={(e) => setProofText(e.target.value)}
                        placeholder="Paste a link to your registration record, or describe verifiable evidence (admin may follow up)." />
                    </div>
                  </>
                )}

                <button className="btn btn-primary btn-block btn-lg" disabled={busy || !pwOk}>
                  {busy ? <span className="spinner" /> : (role === "doctor" ? "Submit for review" : "Create account")}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
