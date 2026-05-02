import AppShell from "../components/AppShell.jsx";
import { Link } from "wouter";

const LAST_UPDATED = "May 2, 2026";

function Section({ title, children }) {
  return (
    <section style={{ background: "var(--bg-elev)", borderRadius: 18, border: "1px solid var(--line)", padding: "26px 28px" }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 700, color: "var(--ink-900)" }}>{title}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.85, color: "var(--ink-700)" }}>{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <AppShell>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 80px" }}>
        <div style={{ marginBottom: 32 }}>
          <Link href="/" style={{ fontSize: 13, color: "var(--ink-400)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            ← Back to home
          </Link>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: "linear-gradient(135deg, #059669, #065f46)",
            display: "grid", placeItems: "center", flexShrink: 0,
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "var(--ink-900)" }}>Privacy Policy</h1>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-400)" }}>Last updated: {LAST_UPDATED}</p>
          </div>
        </div>

        <p style={{ fontSize: 14, color: "var(--ink-500)", lineHeight: 1.7, marginBottom: 28 }}>
          CrLearn ("we", "our", "us") is committed to protecting your privacy. This policy explains
          what data we collect, how we use it, and your rights.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Section title="1. Information we collect">
            <p style={{ margin: "0 0 10px" }}>When you create an account and use CrLearn, we collect:</p>
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li><strong>Account data</strong> — name, email address, username, role (student/doctor), and profile photo if provided.</li>
              <li><strong>Usage data</strong> — cases attempted, answers submitted, scores, progress, and practice history.</li>
              <li><strong>Communications</strong> — messages sent through our in-app messaging system.</li>
              <li><strong>Technical data</strong> — browser type, IP address, device information, and session logs for security.</li>
            </ul>
          </Section>

          <Section title="2. How we use your data">
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>To provide and improve the CrLearn platform and its features.</li>
              <li>To evaluate and score your clinical reasoning using AI.</li>
              <li>To display your progress, leaderboard position, and profile (as per your privacy settings).</li>
              <li>To send important account notifications and updates.</li>
              <li>To detect and prevent abuse, fraud, or security incidents.</li>
            </ul>
          </Section>

          <Section title="3. Data sharing">
            <p style={{ margin: "0 0 10px" }}>We do <strong>not</strong> sell your personal data. We may share limited data with:</p>
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li><strong>AI providers</strong> — your case answers are sent to AI APIs (Groq/Gemini) solely for evaluation. They are not used for AI training.</li>
              <li><strong>Cloud storage</strong> — files you or doctors upload are stored on Cloudinary.</li>
              <li><strong>Legal requirements</strong> — if required by law or to protect users' safety.</li>
            </ul>
          </Section>

          <Section title="4. Data retention">
            <p style={{ margin: 0 }}>
              We retain your account data for as long as your account is active. You may request account
              deletion at any time from the Settings page. Upon deletion, your personal data is removed
              within 30 days. Anonymised usage statistics may be retained for platform analytics.
            </p>
          </Section>

          <Section title="5. Cookies & local storage">
            <p style={{ margin: 0 }}>
              CrLearn uses a session cookie to keep you logged in. We also use browser local storage
              to remember your recently viewed resources and viewed items. We do not use third-party
              advertising cookies or tracking pixels.
            </p>
          </Section>

          <Section title="6. Your rights">
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li><strong>Access</strong> — request a copy of the data we hold about you.</li>
              <li><strong>Correction</strong> — update your profile information at any time in Settings.</li>
              <li><strong>Deletion</strong> — request account and data deletion via Settings or by contacting us.</li>
              <li><strong>Portability</strong> — request an export of your practice history and scores.</li>
            </ul>
          </Section>

          <Section title="7. Security">
            <p style={{ margin: 0 }}>
              Passwords are hashed using bcrypt and never stored in plain text. Sessions use
              HTTP-only, SameSite cookies. All data is transmitted over HTTPS. We follow
              industry-standard security practices and review them regularly.
            </p>
          </Section>

          <Section title="8. Contact">
            <p style={{ margin: 0 }}>
              For any privacy-related questions or requests, email us at{" "}
              <a href="mailto:support@crlearn.in" style={{ color: "#4f46e5", fontWeight: 600 }}>support@crlearn.in</a>
              {" "}or use the <Link href="/contact" style={{ color: "#4f46e5", fontWeight: 600 }}>Contact page</Link>.
            </p>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
