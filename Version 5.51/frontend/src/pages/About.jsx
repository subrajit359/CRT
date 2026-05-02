import AppShell from "../components/AppShell.jsx";
import { Link } from "wouter";

export default function About() {
  return (
    <AppShell>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 80px" }}>
        <div style={{ marginBottom: 32 }}>
          <Link href="/" style={{ fontSize: 13, color: "var(--ink-400)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            ← Back to home
          </Link>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            display: "grid", placeItems: "center", flexShrink: 0,
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "var(--ink-900)" }}>About CrLearn</h1>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-400)" }}>Our mission & story</p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <section style={{ background: "var(--bg-elev)", borderRadius: 18, border: "1px solid var(--line)", padding: "28px 28px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700, color: "var(--ink-900)" }}>What is CrLearn?</h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: "var(--ink-700)" }}>
              CrLearn (CRT) is a clinical reasoning training platform built specifically for final-year medical
              students preparing for real-world clinical decisions. Instead of multiple-choice recall tests,
              CrLearn presents you with authentic patient scenarios and asks you to reason through them —
              then gives you structured AI feedback on exactly where your thinking succeeded or broke down.
            </p>
          </section>

          <section style={{ background: "var(--bg-elev)", borderRadius: 18, border: "1px solid var(--line)", padding: "28px 28px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700, color: "var(--ink-900)" }}>Our Mission</h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: "var(--ink-700)" }}>
              Medical education often rewards memorization over understanding. We believe the most important
              skill a doctor can develop is structured clinical reasoning — knowing not just <em>what</em> to do,
              but <em>why</em>. CrLearn exists to train that skill systematically, through deliberate practice with
              real cases, doctor-verified content, and honest AI evaluation.
            </p>
          </section>

          <section style={{ background: "var(--bg-elev)", borderRadius: 18, border: "1px solid var(--line)", padding: "28px 28px" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: "var(--ink-900)" }}>What we offer</h2>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["Clinical Case Practice", "Doctor-verified cases across 8+ specialties with AI-evaluated open reasoning."],
                ["Mock Tests", "Timed NEET-style assessments to benchmark exam readiness."],
                ["Study Resources & Blog", "Curated notes, slides, PDFs and articles — free and open to all."],
                ["Diagnostic Flowcharts", "Interactive visual frameworks for systematic clinical thinking."],
                ["Leaderboard & Progress", "Track your reasoning quality over time, specialty by specialty."],
              ].map(([title, desc]) => (
                <li key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span style={{
                    marginTop: 3, width: 20, height: 20, borderRadius: 99,
                    background: "rgba(79,70,229,0.12)", display: "grid", placeItems: "center", flexShrink: 0,
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                  <span style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink-700)" }}>
                    <strong style={{ color: "var(--ink-900)" }}>{title}</strong> — {desc}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section style={{ background: "var(--bg-elev)", borderRadius: 18, border: "1px solid var(--line)", padding: "28px 28px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700, color: "var(--ink-900)" }}>Built by doctors, for doctors-in-training</h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: "var(--ink-700)" }}>
              Every case on CrLearn is written or reviewed by verified doctors. We believe students deserve
              content held to clinical standards — not textbook regurgitation repurposed as questions.
              Our doctor community contributes cases, verifies answers, and engages in case-specific discussions
              to ensure every learning interaction is grounded in real clinical practice.
            </p>
          </section>

          <div style={{ textAlign: "center", paddingTop: 8 }}>
            <Link href="/register" className="btn btn-primary btn-lg">
              Start practicing free →
            </Link>
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--ink-400)" }}>
              Have a question? <Link href="/contact" style={{ color: "var(--primary-600, #4f46e5)" }}>Contact us</Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
