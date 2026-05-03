import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate, useInView, useReducedMotion } from "framer-motion";
import AppShell from "../components/AppShell.jsx";
import { usePWAInstall } from "../lib/usePWAInstall.js";

function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function BlogPreview() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();

  useEffect(() => {
    fetch("/neet-api/posts")
      .then((r) => r.json())
      .then((data) => { setPosts(Array.isArray(data) ? data.slice(0, 3) : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20, marginTop: 32 }}>
      {[1,2,3].map((i) => (
        <div key={i} style={{ borderRadius: 16, overflow: "hidden", background: "var(--paper-2)", border: "1px solid var(--line)" }}>
          <div className="shimmer" style={{ height: 160 }} />
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="shimmer" style={{ height: 12, width: "40%", borderRadius: 6 }} />
            <div className="shimmer" style={{ height: 18, width: "80%", borderRadius: 6 }} />
            <div className="shimmer" style={{ height: 13, width: "100%", borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );

  if (!posts.length) return null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20, marginTop: 32 }}>
        {posts.map((post) => (
          <div
            key={post.id}
            onClick={() => navigate("/blog")}
            style={{
              borderRadius: 16, overflow: "hidden", cursor: "pointer",
              background: "var(--paper-2)", border: "1px solid var(--line)",
              transition: "box-shadow 0.18s, transform 0.18s",
              display: "flex", flexDirection: "column",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 32px rgba(79,70,229,0.13)"; e.currentTarget.style.transform = "translateY(-3px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
          >
            <div style={{ height: 160, background: "var(--paper-3)", overflow: "hidden", flexShrink: 0 }}>
              {post.thumbnail_url ? (
                <img src={post.thumbnail_url} alt={post.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "linear-gradient(135deg, rgba(79,70,229,0.12), rgba(79,70,229,0.04))" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </div>
              )}
            </div>
            <div style={{ padding: "16px 18px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--ink-400)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {post.badge || "General"} · {formatDate(post.created_at)}
              </span>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {post.title}
              </h3>
              {post.description && (
                <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {post.description}
                </p>
              )}
              <span style={{ marginTop: "auto", paddingTop: 10, fontSize: 13, color: "#4f46e5", fontWeight: 600 }}>
                Read more →
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 32 }}>
        <Link href="/blog" className="btn btn-secondary btn-lg">
          View all posts<span className="btn-arrow" aria-hidden="true">→</span>
        </Link>
      </div>
    </>
  );
}

const CYCLE_WORDS = ["reasoning.", "diagnosis.", "decisions."];
const CASE_QUESTION = "What is your single most urgent next step, and why?";

function CyclingWord() {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(CYCLE_WORDS[0]);

  useEffect(() => {
    if (reduce) { setShown(CYCLE_WORDS[0]); return; }
    let cancelled = false;
    let timer;
    const TYPE = 60, ERASE = 40, HOLD = 2500, PAUSE = 220;
    let wordIdx = 0;

    const wait = (ms) => new Promise((res) => { timer = setTimeout(res, ms); });

    const typeIn = async (word) => {
      for (let i = 1; i <= word.length; i++) {
        if (cancelled) return;
        setShown(word.slice(0, i));
        await wait(TYPE);
      }
    };
    const eraseOut = async (word) => {
      for (let i = word.length - 1; i >= 0; i--) {
        if (cancelled) return;
        setShown(word.slice(0, i));
        await wait(ERASE);
      }
    };

    const loop = async () => {
      // Word 0 is already fully shown — start with hold
      while (!cancelled) {
        const current = CYCLE_WORDS[wordIdx];
        await wait(HOLD);
        if (cancelled) return;
        await eraseOut(current);
        if (cancelled) return;
        await wait(PAUSE);
        if (cancelled) return;
        wordIdx = (wordIdx + 1) % CYCLE_WORDS.length;
        await typeIn(CYCLE_WORDS[wordIdx]);
      }
    };
    loop();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [reduce]);

  return (
    <span className="cycle-word-wrap">
      <span className="cycle-word">{shown}</span>
    </span>
  );
}

function HeroCard() {
  const cardRef = useRef(null);
  const reduce = useReducedMotion();

  // Mouse tilt — instant on move, eased reset on leave (300ms)
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);

  const onMove = (e) => {
    if (reduce) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;   // -0.5 .. 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateX.set(-py * 8);   // -4° .. 4°
    rotateY.set(px * 8);
  };
  const onLeave = () => {
    animate(rotateX, 0, { duration: 0.3, ease: "easeOut" });
    animate(rotateY, 0, { duration: 0.3, ease: "easeOut" });
  };

  // Typewriter for question — fires on scroll into view
  const inView = useInView(cardRef, { once: true, margin: "-15% 0px" });
  const [typed, setTyped] = useState("");
  const [doneTyping, setDoneTyping] = useState(false);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setTyped(CASE_QUESTION);
      setDoneTyping(true);
      return;
    }
    let i = 0;
    const start = setTimeout(() => {
      const id = setInterval(() => {
        i += 1;
        setTyped(CASE_QUESTION.slice(0, i));
        if (i >= CASE_QUESTION.length) {
          clearInterval(id);
          setDoneTyping(true);
        }
      }, 30);
      return () => clearInterval(id);
    }, 400);
    return () => clearTimeout(start);
  }, [inView, reduce]);

  return (
    <div className="hero-card-perspective">
    <motion.div
      ref={cardRef}
      className="hero-card"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay: 0.2 }}
    >
      <span className="badge badge-primary">Cardiology · Level 4</span>
      <h4 style={{ marginTop: 10 }}>52-year-old man, sudden chest pain</h4>
      <div className="hero-case-body">{`A 52-year-old smoker presents to the ED with sudden, tearing chest pain radiating to the back. BP 188/102 right arm, 142/86 left arm. Pulse asymmetric. Heart sounds normal. No murmur. ECG: sinus rhythm, no ST changes. Troponin pending. He looks pale and diaphoretic.`}</div>
      <div className="hero-q">
        {typed}
        {!doneTyping && <span className="type-cursor" aria-hidden="true" />}
      </div>
      <div className="hero-mock-input">
        <span>Type your reasoning here</span>
        <span className="input-cursor" aria-hidden="true" />
      </div>
      {doneTyping && (
        <motion.div
          className="hero-card-eval"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <span className="pulse-dot" aria-hidden="true" />
          <span>AI evaluating…</span>
        </motion.div>
      )}
    </motion.div>
    </div>
  );
}

function Counter({ to, suffix = "", duration = 1.5 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const [val, setVal] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setVal(to); return; }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [inView, to, duration, reduce]);

  const formatted = to >= 1000 ? val.toLocaleString() : String(val);
  return <span ref={ref}>{formatted}{suffix}</span>;
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

function Section({ children, className = "", style }) {
  return (
    <motion.section
      className={`section ${className}`}
      style={style}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-12% 0px" }}
    >
      {children}
    </motion.section>
  );
}

export default function Landing() {
  const [, navigate] = useLocation();
  const { canInstall, install } = usePWAInstall();
  return (
    <AppShell>
      <section className="hero">
        <div className="container hero-grid">
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
          >
            <motion.span variants={fadeUp} className="hero-eyebrow">
              <span className="dot" /> For final-year medical students
            </motion.span>
            <motion.h1 variants={fadeUp}>
              Train your clinical <CyclingWord /><br />Not your memory.
            </motion.h1>
            <motion.p variants={fadeUp} className="hero-sub">
              CrLearn puts you in the room. A real case. One sharp question.
              An AI evaluator that tells you exactly where your thinking broke,
              what a good answer looks like, and one rule to think better next time.
            </motion.p>
            <motion.div variants={fadeUp} className="hero-ctas">
              <button className="btn btn-primary btn-lg" onClick={() => navigate("/register")}>
                Start practicing free<span className="btn-arrow" aria-hidden="true">→</span>
              </button>
              <Link href="/login" className="btn btn-secondary btn-lg">I already have an account</Link>
              {canInstall && (
                <button
                  className="btn btn-secondary btn-lg"
                  onClick={install}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Install App
                </button>
              )}
            </motion.div>
            <motion.div variants={fadeUp} className="hero-meta">
              <span>· Doctor-verified cases</span>
              <span>· Evaluated by AI, with structured feedback</span>
              <span>· No textbook regurgitation</span>
            </motion.div>
          </motion.div>

          <HeroCard />
        </div>
      </section>

      <motion.div
        className="container social-proof"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="social-proof-text">
          <span>Trusted by final-year students at</span>
          <span>AIIMS</span>
          <span className="social-proof-sep" aria-hidden="true" />
          <span>JIPMER</span>
          <span className="social-proof-sep" aria-hidden="true" />
          <span>KGMU</span>
          <span className="social-proof-sep" aria-hidden="true" />
          <span>MAMC</span>
          <span className="social-proof-sep" aria-hidden="true" />
          <span>CMC Vellore</span>
        </div>
      </motion.div>

      <div className="lp-stats-wrap">
        <div className="lp-stats">
          <div className="lp-stat">
            <div className="lp-stat-number"><Counter to={1200} suffix="+" /></div>
            <div className="lp-stat-label">verified clinical cases</div>
          </div>
          <div className="lp-stat">
            <div className="lp-stat-number"><Counter to={8} /></div>
            <div className="lp-stat-label">specialties covered</div>
          </div>
          <div className="lp-stat">
            <div className="lp-stat-number"><Counter to={4} suffix="-step" /></div>
            <div className="lp-stat-label">structured AI feedback</div>
          </div>
        </div>
      </div>

      <Section>
        <div className="container">
          <motion.h2 variants={fadeUp}>What CrLearn does differently</motion.h2>
          <motion.p variants={fadeUp} className="muted" style={{ maxWidth: 640, marginTop: 8 }}>
            Most platforms give you MCQs. CrLearn gives you a clinical scenario, asks one focused
            question, and grades your reasoning — not your recall.
          </motion.p>
          <div className="spacer-7" />
          <motion.div className="feat-grid" variants={stagger}>
            {[
              ["A", "One case, one question", "No noise. No filler. Real cases written or curated by clinicians, focused on the kind of decisions you'll make at 3am."],
              ["B", "Structured AI evaluation", "Score, verdict, what you got right, critical misses, expected answer, and one improvement rule. Sharp, not polite."],
              ["C", "Doctor-verified", "Cases are reviewed by verified doctors. You see who verified what and where they trained."],
              ["D", "Adaptive difficulty", "Your level rises with consistent quality reasoning. Specialty-by-specialty, not just one global score."],
              ["E", "Discuss with doctors", "Case-specific threads where verified doctors can debate, correct, or add nuance."],
              ["F", "Private by default", "Scores stay private unless you choose to show them on your profile. Your learning curve is yours."],
            ].map(([icon, title, body]) => (
              <motion.div key={icon} className="card feat" variants={fadeUp}>
                <div className="feat-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </Section>

      <hr className="section-divider" />

      <Section style={{ background: "linear-gradient(180deg, var(--bg) 0%, var(--primary-soft) 40%, var(--bg) 100%)" }}>
        <div className="container">
          <motion.div variants={fadeUp} style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: "var(--primary-soft)", color: "var(--primary)",
                fontSize: 12, fontWeight: 700, letterSpacing: 0.8,
                textTransform: "uppercase", padding: "5px 12px",
                borderRadius: "var(--r-pill)", marginBottom: 14,
                border: "1px solid rgba(79,70,229,0.18)",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Free to read
              </span>
              <h2 style={{ marginBottom: 10 }}>From the blog</h2>
              <p style={{ maxWidth: 500, marginTop: 0, fontSize: 17, color: "var(--ink-600)", lineHeight: 1.6 }}>
                Study notes, clinical tips and NEET resources —{" "}
                <strong style={{ color: "var(--ink-800)", fontWeight: 600 }}>no account needed.</strong>
              </p>
            </div>
            <Link href="/blog" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
              View all posts →
            </Link>
          </motion.div>
          <motion.div variants={fadeUp}>
            <BlogPreview />
          </motion.div>
        </div>
      </Section>

      <hr className="section-divider" />

      {canInstall && (
        <motion.div
          className="container"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={{ padding: "32px 20px" }}
        >
          <div style={{
            background: "linear-gradient(135deg, rgba(90,75,255,0.08), rgba(0,168,107,0.06))",
            border: "1.5px solid rgba(90,75,255,0.2)",
            borderRadius: 20, padding: "28px 32px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 24, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <img src="/logo.png" alt="CrLearn" style={{ width: 52, height: 52, borderRadius: 14 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: "var(--ink-900)", marginBottom: 4 }}>
                  Install CrLearn on your device
                </div>
                <div style={{ fontSize: 14, color: "var(--ink-500)" }}>
                  Access cases instantly — works offline, no app store needed.
                </div>
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={install}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", flexShrink: 0 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Install App
            </button>
          </div>
        </motion.div>
      )}

      <hr className="section-divider" />

      <Section style={{ background: "var(--paper-2)" }}>
        <div className="container">
          <motion.h2 variants={fadeUp}>How it works</motion.h2>
          <div className="spacer-7" />
          <motion.div className="steps" variants={stagger}>
            {[
              ["1", "Pick a path", "Random case or filter by specialty and level."],
              ["2", "Read & reason", "Read the case. Answer one focused reasoning question."],
              ["3", "Get evaluated", "Structured AI feedback. No vague praise."],
              ["4", "Level up", "Consistent quality reasoning unlocks harder cases."],
            ].map(([num, title, body]) => (
              <motion.div key={num} className="card step" variants={fadeUp}>
                <div className="step-num">{num}</div>
                <h4>{title}</h4>
                <p className="muted small">{body}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            className="cta-strip"
            variants={fadeUp}
          >
            <div>
              <h3 style={{ marginBottom: 6 }}>Ready to think like a clinician?</h3>
              <div style={{ opacity: 0.85 }}>Free to start. No credit card. Real cases, today.</div>
            </div>
            <button className="btn btn-primary btn-lg" onClick={() => navigate("/register")}>
              Create your account<span className="btn-arrow" aria-hidden="true">→</span>
            </button>
          </motion.div>
        </div>
      </Section>
    </AppShell>
  );
}
