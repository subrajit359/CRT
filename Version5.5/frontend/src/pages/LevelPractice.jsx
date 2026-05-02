import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Circle, ChevronRight, TrendingUp, Target, BookOpen } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Pagination from "../components/Pagination.jsx";
import Skeleton, { SkeletonStack } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const PAGE_SIZE = 20;

export default function LevelPractice() {
  const [, navigate] = useLocation();
  const toast = useToast();

  const [progress, setProgress] = useState(null);
  const [progressErr, setProgressErr] = useState(null);
  const [cases, setCases] = useState(null);
  const [casesErr, setCasesErr] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(null);

  function loadProgress() {
    setProgressErr(null);
    api.get("/api/eval/level-progress")
      .then(setProgress)
      .catch((e) => setProgressErr(e.message));
  }

  function loadCases(p = 1) {
    setCasesErr(null);
    setCases(null);
    api.get(`/api/eval/level-cases?page=${p}`)
      .then((r) => {
        setCases(r.cases);
        setTotal(r.total);
        setMeta({ userLevel: r.userLevel, minLevel: r.minLevel, maxLevel: r.maxLevel });
      })
      .catch((e) => setCasesErr(e.message));
  }

  useEffect(() => {
    loadProgress();
    loadCases(1);
  }, []);

  function handlePageChange(p) {
    setPage(p);
    loadCases(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startCase(id) {
    navigate(`/case/${id}`);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 860 }}>
        <div style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>Level Practice</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Cases matched to your current level. Complete them to advance.
          </p>
        </div>

        <div className="spacer-7" />

        {progressErr && <ErrorState message={progressErr} onRetry={loadProgress} />}
        {!progress && !progressErr && <SkeletonStack count={2} />}
        {progress && <LevelProgressCard progress={progress} />}

        <div className="spacer-7" />

        <h3 style={{ margin: "0 0 14px" }}>
          {meta ? `Cases — Levels ${meta.minLevel}–${meta.maxLevel}` : "Your Cases"}
          {total > 0 && <span className="muted" style={{ fontWeight: 400, fontSize: 15, marginLeft: 10 }}>({total} total)</span>}
        </h3>

        {casesErr && <ErrorState message={casesErr} onRetry={() => loadCases(page)} />}
        {!cases && !casesErr && <SkeletonStack count={6} />}
        {cases && cases.length === 0 && (
          <EmptyState
            icon={<BookOpen size={36} strokeWidth={1.5} />}
            title="No cases at your level yet"
            body="New cases are added weekly. Try the Practice page for any specialty in the meantime."
          />
        )}
        {cases && cases.length > 0 && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {cases.map((c) => (
                <CaseRow key={c.id} c={c} onStart={() => startCase(c.id)} />
              ))}
            </div>
            <div style={{ marginTop: 20 }}>
              <Pagination page={page} totalPages={totalPages} total={total} onChange={handlePageChange} />
            </div>
          </>
        )}
      </div>

      <style>{`
        .lp-condition {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--line, #e5e3da);
          background: var(--bg-1, #fff);
        }
        .lp-condition.met {
          border-color: rgba(5,150,105,0.45);
          background: rgba(5,150,105,0.05);
        }
        .lp-pbar {
          height: 7px;
          border-radius: 99px;
          background: rgba(0,0,0,0.08);
          overflow: hidden;
          margin-top: 7px;
        }
        .lp-pbar-fill {
          height: 100%;
          border-radius: 99px;
          transition: width 0.6s cubic-bezier(0.34,1.56,0.64,1);
        }
        .case-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid var(--line, #e5e3da);
          background: var(--bg-1, #fff);
          cursor: pointer;
          transition: box-shadow 140ms ease, border-color 140ms ease, transform 140ms ease;
          text-align: left;
          width: 100%;
        }
        .case-row:hover {
          box-shadow: 0 6px 20px rgba(20,20,30,0.07);
          border-color: var(--accent, #c8a96a);
          transform: translateY(-1px);
        }
        .case-row.attempted {
          background: rgba(5,150,105,0.04);
          border-color: rgba(5,150,105,0.3);
        }
        .level-chip {
          display: inline-flex;
          align-items: center;
          padding: 2px 9px;
          border-radius: 99px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .level-chip.low   { background: rgba(100,116,139,0.12); color: var(--muted); }
        .level-chip.mid   { background: rgba(200,169,106,0.18); color: #7a5c1e; }
        .level-chip.high  { background: rgba(239,68,68,0.12);   color: #b91c1c; }
      `}</style>
    </AppShell>
  );
}

function LevelProgressCard({ progress }) {
  const {
    level, total, minAttempts, window: win, requiredAvg, recentAvg,
    attemptsPct, scorePct, overallPct, attemptsReached, scoreReached,
  } = progress;

  const bothMet = attemptsReached && scoreReached;

  return (
    <div className="card" style={{ background: "linear-gradient(135deg, rgba(200,169,106,0.08), rgba(200,169,106,0.01))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 2 }}>
            Current Level
          </div>
          <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1, color: "var(--ink-900, #0f172a)" }}>
            Level {level}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: bothMet ? "var(--emerald, #059669)" : "var(--accent, #c8a96a)", lineHeight: 1 }}>
            {overallPct}%
          </div>
          <div className="muted small">overall progress</div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ height: 10, borderRadius: 99, background: "rgba(0,0,0,0.07)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 99,
            width: `${overallPct}%`,
            background: bothMet
              ? "linear-gradient(90deg, #059669, #34d399)"
              : "linear-gradient(90deg, var(--accent, #c8a96a), #d4b97a)",
            transition: "width 0.7s cubic-bezier(0.34,1.56,0.64,1)",
          }} />
        </div>
      </div>

      <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted, #64748b)" }}>
        {bothMet
          ? "You meet all conditions — you will level up on your next qualifying case submission!"
          : `Meet both conditions below to advance to Level ${level + 1}.`}
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        <Condition
          icon={<Target size={16} strokeWidth={1.75} />}
          label="Total Attempts"
          met={attemptsReached}
          pct={attemptsPct}
          detail={`${total} / ${minAttempts} cases submitted`}
          hint={attemptsReached ? "Condition met" : `${minAttempts - total} more needed`}
          color="#c8a96a"
        />
        <Condition
          icon={<TrendingUp size={16} strokeWidth={1.75} />}
          label={`Avg Score (last ${win} cases)`}
          met={scoreReached}
          pct={scorePct}
          detail={`${recentAvg.toFixed(1)} / ${requiredAvg.toFixed(1)} avg score`}
          hint={scoreReached ? "Condition met" : `Need ${requiredAvg.toFixed(1)} avg in last ${win} attempts`}
          color="#6366f1"
        />
      </div>
    </div>
  );
}

function Condition({ icon, label, met, pct, detail, hint, color }) {
  return (
    <div className={`lp-condition${met ? " met" : ""}`}>
      <div style={{ color: met ? "var(--emerald, #059669)" : color, marginTop: 1, flexShrink: 0 }}>
        {met ? <CheckCircle2 size={16} strokeWidth={2} /> : icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink, #1a1a1a)", marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)" }}>{detail}</div>
        <div className="lp-pbar">
          <div
            className="lp-pbar-fill"
            style={{
              width: `${pct}%`,
              background: met
                ? "linear-gradient(90deg, #059669, #34d399)"
                : `linear-gradient(90deg, ${color}, ${color}cc)`,
            }}
          />
        </div>
        <div style={{ fontSize: 11, marginTop: 4, color: met ? "var(--emerald, #059669)" : "var(--text-muted, #94a3b8)", fontWeight: met ? 600 : 400 }}>
          {hint}
        </div>
      </div>
    </div>
  );
}

function CaseRow({ c, onStart }) {
  const levelClass = c.level <= 2 ? "low" : c.level <= 4 ? "mid" : "high";
  const levelLabel = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert", "Master", "Elite"][c.level] || `Lv ${c.level}`;

  return (
    <button type="button" className={`case-row${c.attempted ? " attempted" : ""}`} onClick={onStart}>
      <div style={{ color: c.attempted ? "var(--emerald, #059669)" : "var(--muted, #aaa)", flexShrink: 0 }}>
        {c.attempted
          ? <CheckCircle2 size={20} strokeWidth={1.75} />
          : <Circle size={20} strokeWidth={1.5} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink, #1a1a1a)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {c.title || "Untitled Case"}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span className={`level-chip ${levelClass}`}>Lv {c.level} · {levelLabel}</span>
          <span className="muted small">{c.specialty}</span>
          {c.verify_count > 0 && <span className="muted small">✓ Verified</span>}
          {c.attempted && c.myAvg != null && (
            <span style={{ fontSize: 12, color: "var(--emerald, #059669)", fontWeight: 600 }}>
              {c.myAvg}/10 avg
            </span>
          )}
        </div>
      </div>
      <div style={{ color: "var(--muted)", flexShrink: 0 }}>
        <ChevronRight size={18} strokeWidth={1.75} />
      </div>
    </button>
  );
}
