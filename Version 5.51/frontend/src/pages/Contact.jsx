import { useState } from "react";
import { Mail, Clock, CheckCircle } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { Link } from "wouter";
import { apiUrl } from "../lib/api.js";

const styles = `
.contact-wrap {
  max-width: 680px;
  margin: 0 auto;
  padding: 40px 20px 80px;
}
.contact-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 32px;
}
.contact-info-card {
  background: var(--bg-elev);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 18px 20px;
  min-width: 0;
}
.contact-info-value {
  font-size: 14px;
  color: var(--ink-800);
  font-weight: 600;
  word-break: break-all;
  overflow-wrap: anywhere;
}
.contact-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 520px) {
  .contact-wrap {
    padding: 24px 16px 64px;
  }
  .contact-info-grid {
    grid-template-columns: 1fr;
  }
  .contact-info-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
  }
  .contact-info-card-body {
    min-width: 0;
  }
  .contact-info-value {
    font-size: 13px;
  }
  .contact-form-row {
    grid-template-columns: 1fr;
  }
  .contact-title {
    font-size: 24px !important;
  }
}
`;

export default function Contact() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSent(true);
      } else {
        setError("Something went wrong. Please email us directly.");
      }
    } catch {
      setError("Could not send. Please email us directly at clinicalreasoningofficial@gmail.com");
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell>
      <style>{styles}</style>
      <div className="contact-wrap">
        <div style={{ marginBottom: 32 }}>
          <Link href="/" style={{ fontSize: 13, color: "var(--ink-400)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            ← Back to home
          </Link>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, flexShrink: 0,
            background: "linear-gradient(135deg, #0ea5e9, #0284c7)",
            display: "grid", placeItems: "center",
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <div>
            <h1 className="contact-title" style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "var(--ink-900)" }}>Contact Us</h1>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-400)" }}>We usually reply within 24 hours</p>
          </div>
        </div>

        <div className="contact-info-grid">
          {[
            { Icon: Mail,  label: "Email", value: "clinicalreasoningofficial@gmail.com" },
            { Icon: Clock, label: "Response time", value: "Within 24 hours" },
          ].map(({ Icon, label, value }) => (
            <div key={label} className="contact-info-card">
              <div style={{ color: "var(--primary)", flexShrink: 0, marginBottom: 6 }} className="contact-info-icon">
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="contact-info-card-body">
                <div style={{ fontSize: 12, color: "var(--ink-400)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  {label}
                </div>
                <div className="contact-info-value">{value}</div>
              </div>
            </div>
          ))}
        </div>

        {sent ? (
          <div style={{
            background: "rgba(5,150,105,0.08)", border: "1.5px solid rgba(5,150,105,0.25)",
            borderRadius: 18, padding: "36px 32px", textAlign: "center",
          }}>
            <div style={{ marginBottom: 12, color: "#059669" }}><CheckCircle size={40} strokeWidth={1.5} /></div>
            <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "var(--ink-900)" }}>Message sent!</h2>
            <p style={{ margin: 0, color: "var(--ink-500)", fontSize: 14 }}>
              Thanks for reaching out. We'll get back to you within 24 hours.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{
            background: "var(--bg-elev)", border: "1px solid var(--line)",
            borderRadius: 18, padding: "28px",
            display: "flex", flexDirection: "column", gap: 18,
          }}>
            <div className="contact-form-row">
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-700)", display: "block", marginBottom: 6 }}>
                  Name <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  className="input"
                  type="text"
                  placeholder="Your name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-700)", display: "block", marginBottom: 6 }}>
                  Email <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  className="input"
                  type="email"
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-700)", display: "block", marginBottom: 6 }}>
                Subject
              </label>
              <input
                className="input"
                type="text"
                placeholder="e.g. Bug report, Feature request, General query"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-700)", display: "block", marginBottom: 6 }}>
                Message <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <textarea
                className="input"
                rows={5}
                placeholder="Tell us what's on your mind..."
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 120 }}
              />
            </div>

            {error && (
              <div style={{ fontSize: 13, color: "var(--danger)", background: "rgba(220,38,38,0.07)", borderRadius: 8, padding: "10px 14px" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={sending}
              style={{ alignSelf: "flex-start", minWidth: 140 }}
            >
              {sending ? "Sending…" : "Send message →"}
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
