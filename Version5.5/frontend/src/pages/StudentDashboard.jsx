import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, Sparkles, Compass } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import Sparkline from "../components/Sparkline.jsx";
import Counter from "../components/Counter.jsx";
import RadialProgress from "../components/RadialProgress.jsx";
import SpecialtyHeatmap from "../components/SpecialtyHeatmap.jsx";
import Skeleton, { SkeletonStack } from "../components/Skeleton.jsx";
import Timeline from "../components/Timeline.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { ConfettiBurst } from "../components/Confetti.jsx";

const STREAK_KEY = "crt:streak:last";
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

function milestoneLabel(n) {
  if (n >= 100) return `${n}-day streak — Iron habit`;
  if (n >= 60) return `${n}-day streak — Marathon mind`;
  if (n >= 30) return `${n}-day streak — One full month`;
  if (n >= 14) return `${n}-day streak — Two weeks strong`;
  if (n >= 7) return `${n}-day streak — A full week`;
  return `${n}-day streak — Nice start`;
}

const SPECIALTIES = [
  "General Medicine", "Cardiology", "Neurology", "Pediatrics", "Surgery",
  "Obstetrics & Gynecology", "Psychiatry", "Emergency Medicine", "Endocrinology",
  "Pulmonology", "Gastroenterology", "Nephrology", "Infectious Disease", "Dermatology",
];

function deltaBucket(d) {
  if (d == null) return "flat";
  if (d > 0.25) return "up";
  if (d < -0.25) return "down";
  return "flat";
}
function deltaText(d) {
  if (d == null) return "—";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(1)}`;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState(null);
  const [next, setNext] = useState(null);
  const [changes, setChanges] = useState(null);
  const [loading, setLoading] = useState(true);
  const [milestone, setMilestone] = useState(null);

  const [rankInfo, setRankInfo] = useState(null);
  const [totalCases, setTotalCases] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const softFetch = (path, fallback) =>
      api.get(path).catch((err) => {
        console.warn(`[StudentDashboard] optional fetch failed: ${path}`, err);
        return fallback;
      });
    Promise.all([
      softFetch("/api/eval/stats", null),
      softFetch("/api/eval/next", { case: null }),
      softFetch("/api/eval/changes", { events: [] }),
      softFetch("/api/leaderboard?period=all&page=1&pageSize=1", null),
      softFetch("/api/cases/count", { total: 0 }),
    ]).then(([s, n, c, lb, tc]) => {
      if (!alive) return;
      setStats(s);
      setNext(n);
      setChanges(c);
      setRankInfo(lb);
      setTotalCases(tc?.total ?? 0);
      setLoading(false);
      const cur = Number(s?.streak || 0);
      let prev = 0;
      try { prev = Number(localStorage.getItem(STREAK_KEY) || 0); } catch {}
      if (cur > prev && STREAK_MILESTONES.includes(cur)) {
        setMilestone({ n: cur, key: Date.now() });
      }
      try { localStorage.setItem(STREAK_KEY, String(cur)); } catch {}
    });
    return () => { alive = false; };
  }, []);

  const trendValues = useMemo(
    () => (stats?.trend || []).map((d) => d.avg_score),
    [stats]
  );
  const volumeValues = useMemo(
    () => (stats?.trend || []).map((d) => d.n),
    [stats]
  );
  const weeklyPct = stats ? Math.min(1, (stats.weeklyCount || 0) / (stats.weeklyTarget || 35)) : 0;

  // Streak strength is replayed day-by-day on the server (Live ↔ Decay state machine).
  const strengthPct = stats ? Math.max(0, Math.min(1, (stats.strength || 0) / 100)) : 0;
  const strengthState = stats?.strengthState || "live";
  const strengthFloor = stats?.strengthFloor || 0;
  const dBucket = deltaBucket(stats?.delta);

  return (
    <AppShell>
      <div className="container fade-in">
        {/* Greeting strip */}
        <div className="row-between" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Welcome back, {user?.full_name?.split(" ")[0] || "Student"}</h2>
            <p className="muted">One sharp case is enough today. Keep the streak alive.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => navigate("/progress")}>View progress</button>
            <button className="btn btn-secondary" onClick={() => navigate("/practice")}>Browse cases</button>
          </div>
        </div>

        <div className="spacer-7" />

        {/* TODAY hero card */}
        {loading ? (
          <div className="card" style={{ minHeight: 200 }}>
            <SkeletonStack rows={4} height={16} />
          </div>
        ) : next?.case ? (
          <div className="today-hero fade-in">
            <div>
              <span className="today-eyebrow"><span className="dot" />Today's case · picked for you</span>
              <h2 style={{ marginTop: 12 }}>{next.case.title}</h2>
              {next.why && <p className="today-why">{next.why}</p>}
              <div className="today-meta">
                <span className="badge">{next.case.specialty}</span>
                <span className="badge">Level {next.case.level}</span>
                {next.case.verify_count > 0 && (
                  <span className="badge row" style={{ gap: 4, alignItems: "center", display: "inline-flex" }}>
                    <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden="true" />
                    {next.case.verify_count} doctor{next.case.verify_count > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="today-cta">
                <button className="btn btn-primary btn-lg" onClick={() => navigate(`/case/${next.case.id}`)}>
                  Start now <span className="btn-arrow">→</span>
                </button>
                <button className="btn btn-ghost" onClick={() => navigate("/practice")}>Pick another</button>
              </div>
            </div>
            <div className="today-ring">
              <RadialProgress
                value={stats?.weeklyCount || 0}
                max={stats?.weeklyTarget || 35}
                size={120}
                thickness={11}
                color="white"
                trackColor="rgba(255,255,255,0.22)"
                label={`${stats?.weeklyCount || 0}/${stats?.weeklyTarget || 35}`}
                sublabel="this week"
              />
              <div className="ring-cap">{stats?.streak || 0}-day streak</div>
            </div>
          </div>
        ) : (
          <div className="card lift">
            <EmptyState
              icon={<Sparkles size={24} strokeWidth={1.75} aria-hidden="true" />}
              title="You've practiced everything"
              body="New cases land weekly. Sharpen old ones in the meantime."
              action={<button className="btn btn-primary" onClick={() => navigate("/practice")}>Browse library</button>}
            />
          </div>
        )}

        <div className="spacer-7" />

        {/* Stat sparklines row */}
        <div className="stat-row stagger">
          <StatCard
            label="Total cases available"
            value={totalCases ?? 0}
            sub="in the verified library"
            loading={loading}
            extra={
              <Link href="/practice" className="nav-link small" style={{ whiteSpace: "nowrap" }}>Browse →</Link>
            }
            asExtra
          />
          <StatCard
            label="Cases done"
            value={stats?.attempts ?? 0}
            sub="lifetime"
            sparkData={volumeValues}
            loading={loading}
            sparkColor="var(--primary)"
          />
          <StatCard
            label="Average score"
            value={stats?.averageScore != null ? Number(stats.averageScore.toFixed(1)) : null}
            decimals={1}
            suffix="/10"
            sub="last 50 attempts"
            sparkData={trendValues}
            delta={stats?.delta}
            deltaText={deltaText(stats?.delta)}
            deltaBucket={dBucket}
            loading={loading}
            sparkColor="var(--primary)"
          />
          <StatCard
            label="Weekly streak"
            value={stats?.streak ?? 0}
            sub={`best ${stats?.maxStreak || 0}d · ${strengthState === "decay" ? "decay" : "live"} · floor ${Math.round(strengthFloor)}%`}
            extra={
              <RadialProgress
                value={strengthPct}
                max={1}
                size={56}
                thickness={6}
                label={`${Math.round(strengthPct * 100)}%`}
                sublabel="strength"
                color={strengthState === "decay" ? "var(--warn, #c97a14)" : "var(--primary)"}
              />
            }
            loading={loading}
            asExtra
          />
          <RankCard
            rankInfo={rankInfo}
            loading={loading}
            onOpen={() => navigate("/leaderboard")}
          />
        </div>

        <div className="spacer-7" />

        {/* Two column: heatmap+focus | what changed */}
        <div className="dash-2col">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
            <div className="card lift">
              <div className="dash-section-head">
                <h3>Mastery by specialty</h3>
                <span className="muted small">avg score · all time</span>
              </div>
              {loading ? (
                <SkeletonStack rows={3} height={48} />
              ) : (stats?.mastery || []).length === 0 ? (
                <EmptyState
                  icon="◔"
                  title="Your map starts here"
                  body="As you practice across specialties, this heatmap shows where you're sharpest and where to focus next."
                />
              ) : (
                <SpecialtyHeatmap data={stats.mastery} specialties={SPECIALTIES} />
              )}
            </div>

            <div className="card lift">
              <div className="dash-section-head">
                <h3>Where to focus</h3>
                <Link href="/progress" className="nav-link small">See full progress →</Link>
              </div>
              {loading ? (
                <SkeletonStack rows={3} height={28} />
              ) : !stats?.weakAreas?.length ? (
                <EmptyState
                  icon={<Compass size={24} strokeWidth={1.75} aria-hidden="true" />}
                  title="No clear weak spots yet"
                  body="Once you've done at least 2 cases per specialty, we'll surface the ones to sharpen first."
                />
              ) : (
                <ul className="focus-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {stats.weakAreas.map((w) => (
                    <li
                      key={w.specialty}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto",
                        gap: 12,
                        alignItems: "center",
                        padding: "12px 0",
                        borderBottom: "1px solid var(--line)",
                      }}
                    >
                      <strong>{w.specialty}</strong>
                      <div style={{ width: 110, height: 6, background: "var(--ink-100)", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${Math.max(8, Math.min(100, (w.avg_score / 10) * 100))}%`,
                          background: w.avg_score < 5 ? "var(--rose-500, #DB3A3A)" : "var(--amber-500, #D99423)",
                          transition: "width 600ms var(--ease)",
                        }} />
                      </div>
                      <span className={`badge ${w.avg_score < 5 ? "badge-danger" : "badge-warning"}`}>
                        {w.avg_score?.toFixed(1)}/10
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card lift changes-card">
            <div className="dash-section-head">
              <h3>What's changed</h3>
              <Link href="/notifications" className="nav-link small">All →</Link>
            </div>
            {loading ? (
              <SkeletonStack rows={5} height={36} />
            ) : (
              <Timeline
                events={changes?.events || []}
                emptyText="A clean slate. Activity, replies, and verifications will land here."
              />
            )}
          </div>
        </div>

        <div className="spacer-7" />
      </div>
      <ConfettiBurst
        active={!!milestone}
        onDone={() => setMilestone(null)}
        label={milestone ? milestoneLabel(milestone.n) : null}
      />
    </AppShell>
  );
}

function RankCard({ rankInfo, loading, onOpen }) {
  const cu = rankInfo?.currentUser;
  const total = rankInfo?.totalUsers || 0;
  const rank = cu?.rank;
  const delta = cu?.delta;
  const hasRank = !loading && rank != null;

  let deltaNode = <span style={{ color: "var(--muted)" }}>—</span>;
  if (delta != null) {
    if (delta > 0) deltaNode = <span style={{ color: "var(--green-700, #16a34a)", fontWeight: 700 }}>▲ {delta} this week</span>;
    else if (delta < 0) deltaNode = <span style={{ color: "#B23A3A", fontWeight: 700 }}>▼ {Math.abs(delta)} this week</span>;
    else deltaNode = <span style={{ color: "var(--muted)" }}>— this week</span>;
  } else if (hasRank) {
    deltaNode = <span style={{ color: "var(--muted)" }}>— this week</span>;
  }

  return (
    <div
      className="stat-card rank-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{ cursor: "pointer", transition: "transform 200ms ease, box-shadow 200ms ease" }}
    >
      <div className="stat-card-top">
        <span className="stat-card-label">Global Rank</span>
        <span style={{ fontSize: 11 }}>{deltaNode}</span>
      </div>
      <div className="stat-card-value">
        {loading ? <Skeleton height={28} width={80} /> :
          hasRank ? <span style={{ fontFamily: "var(--font-display)", color: "var(--primary)" }}>#{rank}</span> :
          <span className="muted">—</span>}
      </div>
      <div className="stat-card-sub">
        {loading ? <Skeleton height={10} width={120} /> :
          total > 0 ? `out of ${total.toLocaleString()} student${total === 1 ? "" : "s"}` : "no rankings yet"}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>
        View leaderboard →
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, decimals = 0, suffix = "", sparkData,
  delta, deltaText, deltaBucket, loading, asExtra, extra, sparkColor,
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        {!loading && delta != null && (
          <span className={`stat-card-delta ${deltaBucket}`}>
            {deltaBucket === "up" ? "▲" : deltaBucket === "down" ? "▼" : "·"} {deltaText}
          </span>
        )}
        {!loading && sparkData && !asExtra && (
          <Sparkline data={sparkData} stroke={sparkColor} width={70} height={26} />
        )}
        {!loading && asExtra && extra}
      </div>
      <div className="stat-card-value">
        {loading ? <Skeleton height={28} width={80} /> : (
          value == null ? "—" : <Counter value={Number(value)} decimals={decimals} suffix={suffix} />
        )}
      </div>
      <div className="stat-card-sub">{loading ? <Skeleton height={10} width={120} /> : sub}</div>
    </div>
  );
}
