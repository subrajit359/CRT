import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Flame, Target, BookOpen, Stethoscope, Sparkles,
  LayoutGrid, Brain, ChevronLeft, ChevronRight,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import { api } from "../lib/api.js";

/* ─── rank badge helpers ─────────────────────────────────────────────────── */
function getRankTier(rank) {
  if (rank === 1) return { emoji: "👑", bg: "#FFD700", border: "#B8960C", title: "Champion" };
  if (rank === 2) return { emoji: "🥈", bg: "#C0C0C0", border: "#8A8A8A", title: "Runner-up" };
  if (rank === 3) return { emoji: "🥉", bg: "#CD7F32", border: "#8B5A1A", title: "3rd Place" };
  if (rank <= 10) return { emoji: "💎", bg: "#6366F1", border: "#4338CA", title: `Top 10 · #${rank}` };
  if (rank <= 25) return { emoji: "⚡", bg: "#06B6D4", border: "#0284C7", title: `Top 25 · #${rank}` };
  if (rank <= 50) return { emoji: "🔥", bg: "#F59E0B", border: "#B45309", title: `Top 50 · #${rank}` };
  if (rank <= 100) return { emoji: "⭐", bg: "#8B5CF6", border: "#6D28D9", title: `Top 100 · #${rank}` };
  return { emoji: "🎯", bg: "#6B7280", border: "#4B5563", title: `#${rank}` };
}

function AvatarWithBadge({ url, name, size = 36, rank }) {
  const tier = rank != null ? getRankTier(rank) : null;
  const badgeSize = Math.max(14, Math.round(size * 0.38));
  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, height: size }}>
      <Avatar url={url} name={name} size={size} />
      {tier && (
        <span
          title={tier.title}
          style={{
            position: "absolute",
            bottom: -3,
            right: -3,
            width: badgeSize,
            height: badgeSize,
            borderRadius: "50%",
            background: tier.bg,
            border: `2px solid ${tier.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: Math.round(badgeSize * 0.58),
            lineHeight: 1,
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
            zIndex: 2,
          }}
        >
          {tier.emoji}
        </span>
      )}
    </div>
  );
}

/* ─── period pills ───────────────────────────────────────────────────────── */
function PeriodPills({ value, onChange, options }) {
  return (
    <div style={{
      display: "inline-flex", background: "var(--bg-muted)",
      borderRadius: 999, padding: 4, gap: 2, border: "1px solid var(--line)",
    }}>
      {options.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            style={{
              position: "relative", border: "none", background: "transparent",
              padding: "7px 15px", borderRadius: 999, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600, fontSize: 13,
              color: active ? "#fff" : "var(--ink-600)", whiteSpace: "nowrap",
              transition: "color 160ms ease", zIndex: 1,
            }}
          >
            {active && (
              <motion.span
                layoutId={`pill-${options.map((o) => o.id).join("")}`}
                style={{ position: "absolute", inset: 0, background: "var(--primary)", borderRadius: 999, zIndex: -1 }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── skeleton ───────────────────────────────────────────────────────────── */
function SkeletonRows({ n = 5 }) {
  return (
    <div>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--line)" }}>
          <div className="shimmer" style={{ height: 14, width: 30, borderRadius: 4, flexShrink: 0 }} />
          <div className="shimmer" style={{ height: 36, width: 36, borderRadius: 18, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="shimmer" style={{ height: 13, width: "55%", borderRadius: 6, marginBottom: 6 }} />
            <div className="shimmer" style={{ height: 10, width: "30%", borderRadius: 4 }} />
          </div>
          <div className="shimmer" style={{ height: 22, width: 56, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

/* ─── podium card ────────────────────────────────────────────────────────── */
const MEDAL_COLORS = ["#D4A017", "#9E9E9E", "#CD7F32"];
const MEDAL_ICONS = ["🥇", "🥈", "🥉"];

function PodiumCard({ entry, position, metricLabel, metricSub, leader }) {
  const [, navigate] = useLocation();
  const color = MEDAL_COLORS[position - 1] || "#aaa";

  if (!entry) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: 0.3 }}>
        <div style={{ width: leader ? 64 : 50, height: leader ? 64 : 50, borderRadius: "50%", background: "var(--ink-200)", marginBottom: 8 }} />
        <div style={{ height: leader ? 100 : 75, width: "100%", background: "var(--ink-100)", borderRadius: "10px 10px 0 0", display: "grid", placeItems: "center" }}>
          <span style={{ color: "var(--ink-300)", fontWeight: 700 }}>#{position}</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (position === 1 ? 0 : position === 2 ? 0.1 : 0.2), duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => navigate(`/u/${entry.username}`)}
      whileHover={{ y: -3 }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}
    >
      {/* Avatar */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        <div style={{
          width: leader ? 64 : 50, height: leader ? 64 : 50, borderRadius: "50%",
          border: `2.5px solid ${color}`,
          boxShadow: `0 0 0 3px ${color}28`,
          overflow: "visible",
        }}>
          <AvatarWithBadge url={entry.avatarUrl} name={entry.name} size={leader ? 64 : 50} rank={position} />
        </div>
      </div>

      {/* Name */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-800)", textAlign: "center", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
        {entry.name}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 8, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
        @{entry.username}
      </div>

      {/* Pedestal */}
      <div style={{
        width: "100%", minHeight: leader ? 90 : 65,
        borderRadius: "8px 8px 0 0",
        background: `linear-gradient(160deg, ${color}20 0%, ${color}08 100%)`,
        border: `1.5px solid ${color}55`, borderBottom: "none",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "10px 8px",
      }}>
        <div style={{ fontSize: leader ? 22 : 18, fontWeight: 800, fontFamily: "var(--font-display)", color, lineHeight: 1, marginBottom: 3 }}>
          {metricLabel}
        </div>
        <div style={{ fontSize: 10, color: "var(--ink-500)", textAlign: "center", lineHeight: 1.3 }}>{metricSub}</div>
      </div>
    </motion.div>
  );
}

/* ─── my strip ───────────────────────────────────────────────────────────── */
function MyStrip({ cu, metric }) {
  if (!cu) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      background: "rgba(15,76,58,0.06)", border: "1.5px solid var(--emerald-600)",
      borderRadius: 12, margin: "16px 0",
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--emerald-600)", whiteSpace: "nowrap" }}>#{cu.rank} · You</span>
      <AvatarWithBadge url={cu.row.avatarUrl} name={cu.row.name} size={30} rank={cu.rank} />
      <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: "var(--ink-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {cu.row.name}
      </span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--primary)", flexShrink: 0 }}>{metric}</span>
      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "var(--emerald-600)", color: "#fff", flexShrink: 0 }}>
        You
      </span>
    </div>
  );
}

/* ─── pagination ─────────────────────────────────────────────────────────── */
function Pager({ page, total, onChange }) {
  if (total <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 20 }}>
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={14} />
      </button>
      <span style={{ fontSize: 13, color: "var(--ink-500)" }}>Page {page} of {total}</span>
      <button className="btn btn-ghost btn-sm" disabled={page >= total} onClick={() => onChange(page + 1)}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

/* ─── empty board ────────────────────────────────────────────────────────── */
function EmptyBoard({ title, body, action, actionLabel }) {
  const [, navigate] = useLocation();
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", background: "var(--bg-elev)", borderRadius: 16, border: "1.5px dashed var(--line)" }}>
      <Trophy size={36} color="var(--ink-200)" style={{ marginBottom: 14 }} />
      <h3 style={{ margin: "0 0 8px", color: "var(--ink-700)", fontSize: 18 }}>{title}</h3>
      <p className="muted" style={{ marginBottom: action ? 20 : 0, maxWidth: 340, margin: "0 auto 20px" }}>{body}</p>
      {action && (
        <button className="btn btn-primary" onClick={() => navigate(action)}>{actionLabel}</button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OVERALL LEADERBOARD
═══════════════════════════════════════════════════════════════════════════ */
const OVERALL_PERIODS = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

const OVERALL_CATS = [
  { id: "streakScore", label: "Overall",      icon: Sparkles,    desc: "Streak strength score" },
  { id: "avgScore",    label: "Avg Score",    icon: Target,      desc: "Highest average score (3+ attempts)" },
  { id: "streakDays",  label: "Streak",       icon: Flame,       desc: "Longest active streak" },
  { id: "attempts",    label: "Cases",        icon: BookOpen,    desc: "Most cases solved" },
  { id: "specialty",   label: "By Specialty", icon: Stethoscope, desc: "Top scorer in a specialty" },
];

function OverallRow({ row, idx, category, specialty }) {
  const [, navigate] = useLocation();

  function metric() {
    if (category === "avgScore")   return { val: row.avgScore != null ? row.avgScore.toFixed(1) : "—", sub: `${row.avgScoreCount ?? 0} graded` };
    if (category === "streakDays") return { val: String(row.bestStreak ?? "—"), sub: `${row.currentStreak ?? 0} active` };
    if (category === "attempts")   return { val: String(row.casesCompleted ?? "—"), sub: "cases" };
    if (category === "specialty")  return { val: row.specialtyAvg != null ? row.specialtyAvg.toFixed(1) : "—", sub: `${row.specialtyAttempts ?? 0} in ${specialty}` };
    return { val: row.score != null ? row.score.toFixed(1) : "—", sub: row.tier ?? "" };
  }

  const m = metric();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(idx, 8) * 0.04 }}
      onClick={() => navigate(`/u/${row.username}`)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderBottom: "1px solid var(--line)",
        cursor: "pointer", transition: "background 120ms",
      }}
      whileHover={{ backgroundColor: "rgba(15,76,58,0.04)" }}
    >
      {/* Rank */}
      <span style={{ width: 36, flexShrink: 0, fontWeight: 700, fontSize: 13, color: "var(--ink-400)", textAlign: "right" }}>
        #{row.rank}
      </span>

      {/* Avatar */}
      <AvatarWithBadge url={row.avatarUrl} name={row.name} size={36} rank={row.rank} />

      {/* Name + username */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          @{row.username}
          {row.topSpecialty ? ` · ${row.topSpecialty}` : ""}
        </div>
      </div>

      {/* Streak badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, color: "var(--ink-500)", fontSize: 12 }}>
        <Flame size={13} />
        {row.currentStreak ?? 0}
      </div>

      {/* Primary metric */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 70 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--primary)", lineHeight: 1 }}>
          {m.val}
        </div>
        <div style={{ fontSize: 10, color: "var(--ink-400)", marginTop: 2 }}>{m.sub}</div>
      </div>
    </motion.div>
  );
}

function OverallLeaderboard() {
  const [period, setPeriod] = useState("all");
  const [category, setCategory] = useState("streakScore");
  const [specialty, setSpecialty] = useState("");
  const [specOptions, setSpecOptions] = useState([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/leaderboard/specialties")
      .then((r) => { setSpecOptions(r.specialties || []); if (r.specialties?.length) setSpecialty((s) => s || r.specialties[0]); })
      .catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    if (category === "specialty" && !specialty) return;
    let alive = true;
    setLoading(true);
    const p = new URLSearchParams({ period, category, page: String(page), pageSize: "20" });
    if (category === "specialty" && specialty) p.set("specialty", specialty);
    api.get(`/api/leaderboard?${p}`)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData(null); setLoading(false); } });
    return () => { alive = false; };
  }, [period, category, specialty, page]);

  useEffect(() => { loadData(); }, [loadData]);

  function rowMetric(row) {
    if (category === "avgScore")   return { val: row.avgScore != null ? row.avgScore.toFixed(1) : "—", sub: `${row.avgScoreCount ?? 0} graded` };
    if (category === "streakDays") return { val: String(row.bestStreak ?? "—"), sub: `${row.currentStreak ?? 0} active` };
    if (category === "attempts")   return { val: String(row.casesCompleted ?? "—"), sub: "cases" };
    if (category === "specialty")  return { val: row.specialtyAvg != null ? row.specialtyAvg.toFixed(1) : "—", sub: `${row.specialtyAttempts ?? 0} in ${specialty}` };
    return { val: row.score != null ? row.score.toFixed(1) : "—", sub: row.tier ?? "" };
  }

  const activeCategory = OVERALL_CATS.find((c) => c.id === category);
  const top = data?.topThree ?? [];
  const podiumOrder = [top[1] ?? null, top[0] ?? null, top[2] ?? null];
  const cu = data?.currentUser;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <p className="muted small" style={{ margin: 0 }}>{activeCategory?.desc}</p>
        <PeriodPills value={period} onChange={(p) => { setPeriod(p); setPage(1); }} options={OVERALL_PERIODS} />
      </div>

      {/* Category tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {OVERALL_CATS.map((c) => {
          const active = c.id === category;
          return (
            <button key={c.id} onClick={() => { setCategory(c.id); setPage(1); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 13px", borderRadius: 10,
                border: `1.5px solid ${active ? "var(--primary)" : "var(--line)"}`,
                background: active ? "var(--primary)" : "var(--bg-elev)",
                color: active ? "#fff" : "var(--ink-700)",
                fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                boxShadow: active ? "0 3px 10px rgba(15,76,58,0.2)" : "none",
                transition: "all 150ms ease",
              }}>
              <c.icon size={14} strokeWidth={1.75} />{c.label}
            </button>
          );
        })}
        {category === "specialty" && (
          <select className="input" value={specialty}
            onChange={(e) => { setSpecialty(e.target.value); setPage(1); }}
            style={{ minWidth: 180 }}>
            {specOptions.length === 0 && <option value="">No specialty data</option>}
            {specOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {loading && !data ? (
        <div style={{ background: "var(--bg-elev)", borderRadius: 16, border: "1px solid var(--line)", overflow: "hidden" }}>
          <SkeletonRows n={5} />
        </div>
      ) : !data || data.totalUsers === 0 ? (
        <EmptyBoard title="Be the first on the board" body="Finish a practice case to enter the rankings." />
      ) : (
        <>
          {/* Podium */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.18fr 1fr", gap: 14, alignItems: "flex-end", marginBottom: 12 }}>
            {podiumOrder.map((entry, pi) => {
              const positions = [2, 1, 3];
              const pos = positions[pi];
              const m = entry ? rowMetric(entry) : { val: "—", sub: "" };
              return (
                <PodiumCard key={pi} entry={entry} position={pos} leader={pos === 1}
                  metricLabel={m.val} metricSub={m.sub} />
              );
            })}
          </div>

          {/* My position */}
          {cu && <MyStrip cu={cu} metric={rowMetric(cu.row).val} />}

          {/* Table */}
          <div style={{ background: "var(--bg-elev)", borderRadius: 16, border: "1px solid var(--line)", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "var(--bg-muted)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 36, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "right" }}>Rank</span>
              <span style={{ width: 36, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: "0.07em" }}>User</span>
              <span style={{ width: 36, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "center" }}>
                <Flame size={12} />
              </span>
              <span style={{ minWidth: 70, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "right" }}>{activeCategory?.label}</span>
            </div>
            <AnimatePresence mode="popLayout">
              {data.rows.length === 0 ? (
                <div style={{ padding: 28, textAlign: "center", color: "var(--ink-400)", fontStyle: "italic", fontSize: 13 }}>
                  Only the podium so far — keep practicing.
                </div>
              ) : (
                data.rows.map((row, i) => (
                  <OverallRow key={row.userId} row={row} idx={i} category={category} specialty={specialty} />
                ))
              )}
            </AnimatePresence>
          </div>

          <Pager page={page} total={data.totalPages || 1} onChange={setPage} />
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MOCK TEST LEADERBOARD
═══════════════════════════════════════════════════════════════════════════ */
const MOCK_PERIODS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "all", label: "All time" },
];

function MockRow({ row, idx }) {
  const [, navigate] = useLocation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(idx, 8) * 0.04 }}
      onClick={() => navigate(`/u/${row.username}`)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderBottom: "1px solid var(--line)",
        cursor: "pointer", transition: "background 120ms",
      }}
      whileHover={{ backgroundColor: "rgba(15,76,58,0.04)" }}
    >
      <span style={{ width: 36, flexShrink: 0, fontWeight: 700, fontSize: 13, color: "var(--ink-400)", textAlign: "right" }}>
        #{row.rank}
      </span>
      <AvatarWithBadge url={row.avatarUrl} name={row.name} size={36} rank={row.rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-400)" }}>
          @{row.username} · {row.attempts ?? 0} test{row.attempts === 1 ? "" : "s"}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 1 }}>
          Best: {row.bestPct != null ? `${Number(row.bestPct).toFixed(1)}%` : "—"}
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--primary)", lineHeight: 1 }}>
          {row.avgPct != null ? `${row.avgPct.toFixed(1)}%` : "—"}
        </div>
        <div style={{ fontSize: 10, color: "var(--ink-400)", marginTop: 2 }}>avg score</div>
      </div>
    </motion.div>
  );
}

function MockLeaderboard() {
  const [period, setPeriod] = useState("all");
  const [specialty, setSpecialty] = useState("");
  const [topic, setTopic] = useState("");
  const [specOptions, setSpecOptions] = useState([]);
  const [topicOptions, setTopicOptions] = useState([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/mock/leaderboard/specialties")
      .then((r) => setSpecOptions(r.specialties || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setTopic("");
    if (!specialty) { setTopicOptions([]); return; }
    api.get(`/api/mock/leaderboard/topics?specialty=${encodeURIComponent(specialty)}`)
      .then((r) => setTopicOptions(r.topics || []))
      .catch(() => setTopicOptions([]));
  }, [specialty]);

  const loadData = useCallback(() => {
    let alive = true;
    setLoading(true);
    const p = new URLSearchParams({ period, page: String(page) });
    if (specialty) p.set("specialty", specialty);
    if (topic) p.set("topic", topic);
    api.get(`/api/mock/leaderboard?${p}`)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData(null); setLoading(false); } });
    return () => { alive = false; };
  }, [period, page, specialty, topic]);

  useEffect(() => { loadData(); }, [loadData]);

  const top = data?.topThree ?? [];
  const podiumOrder = [top[1] ?? null, top[0] ?? null, top[2] ?? null];
  const cu = data?.currentUser;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <p className="muted small" style={{ margin: 0 }}>Ranked by average % score across submitted mock exams</p>
        <PeriodPills value={period} onChange={(p) => { setPeriod(p); setPage(1); }} options={MOCK_PERIODS} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 24 }}>
        <select className="input" style={{ maxWidth: 200 }} value={specialty}
          onChange={(e) => { setSpecialty(e.target.value); setPage(1); }}>
          <option value="">All specialties</option>
          {specOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {specialty && (
          <select className="input" style={{ maxWidth: 200 }} value={topic}
            onChange={(e) => { setTopic(e.target.value); setPage(1); }}>
            <option value="">All topics</option>
            {topicOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {(specialty || topic) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSpecialty(""); setTopic(""); setPage(1); }}>
            Clear
          </button>
        )}
      </div>

      {loading && !data ? (
        <div style={{ background: "var(--bg-elev)", borderRadius: 16, border: "1px solid var(--line)", overflow: "hidden" }}>
          <SkeletonRows n={5} />
        </div>
      ) : !data || data.totalUsers === 0 ? (
        <EmptyBoard
          title="No mock tests yet"
          body={specialty || topic ? "No results for this filter." : "Complete a mock test to appear on this leaderboard."}
          action="/mock"
          actionLabel="Start mock test"
        />
      ) : (
        <>
          {/* Podium */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.18fr 1fr", gap: 14, alignItems: "flex-end", marginBottom: 12 }}>
            {podiumOrder.map((entry, pi) => {
              const positions = [2, 1, 3];
              const pos = positions[pi];
              const metricLabel = entry?.avgPct != null ? `${entry.avgPct.toFixed(1)}%` : "—";
              const metricSub = entry ? `${entry.attempts ?? 0} test${entry.attempts === 1 ? "" : "s"}` : "";
              return (
                <PodiumCard key={pi} entry={entry} position={pos} leader={pos === 1}
                  metricLabel={metricLabel} metricSub={metricSub} />
              );
            })}
          </div>

          {/* My strip */}
          {cu && <MyStrip cu={cu} metric={cu.row.avgPct != null ? `${cu.row.avgPct.toFixed(1)}%` : "—"} />}

          {/* Table */}
          <div style={{ background: "var(--bg-elev)", borderRadius: 16, border: "1px solid var(--line)", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "var(--bg-muted)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 36, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "right" }}>Rank</span>
              <span style={{ width: 36, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: "0.07em" }}>User</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "right" }}>Avg Score</span>
            </div>
            <AnimatePresence mode="popLayout">
              {data.rows.length === 0 ? (
                <div style={{ padding: 28, textAlign: "center", color: "var(--ink-400)", fontStyle: "italic", fontSize: 13 }}>
                  Only the podium so far — keep taking tests.
                </div>
              ) : (
                data.rows.map((row, i) => (
                  <MockRow key={row.userId} row={row} idx={i} />
                ))
              )}
            </AnimatePresence>
          </div>

          <Pager page={page} total={data.totalPages || 1} onChange={setPage} />
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════════════════════════ */
const BOARDS = [
  { id: "overall", label: "Overall",   icon: LayoutGrid },
  { id: "mock",    label: "Mock Test", icon: Brain },
];

export default function Leaderboard() {
  const [board, setBoard] = useState("overall");

  return (
    <AppShell>
      <motion.div
        className="container"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px 48px" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, var(--emerald-600), var(--emerald-800))", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Trophy size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--ink-900)", lineHeight: 1 }}>
              Leaderboard
            </h1>
          </div>
        </div>

        {/* Board toggle */}
        <div style={{
          display: "inline-flex", gap: 4, padding: 4,
          background: "var(--bg-elev)", borderRadius: 14,
          border: "1px solid var(--line)", marginBottom: 24,
          boxShadow: "0 2px 8px rgba(15,76,58,0.06)",
        }}>
          {BOARDS.map((b) => {
            const active = board === b.id;
            return (
              <button key={b.id} onClick={() => setBoard(b.id)}
                style={{
                  position: "relative", display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "9px 18px", borderRadius: 10, border: "none",
                  background: "transparent", fontFamily: "inherit",
                  fontWeight: 700, fontSize: 14, cursor: "pointer",
                  color: active ? "#fff" : "var(--ink-600)",
                  transition: "color 150ms ease", zIndex: 1,
                }}>
                {active && (
                  <motion.span
                    layoutId="boardActive"
                    style={{ position: "absolute", inset: 0, borderRadius: 10, background: "var(--primary)", boxShadow: "0 3px 10px rgba(15,76,58,0.25)", zIndex: -1 }}
                    transition={{ type: "spring", bounce: 0.18, duration: 0.38 }}
                  />
                )}
                <b.icon size={15} strokeWidth={1.75} />
                {b.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={board}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {board === "overall" ? <OverallLeaderboard /> : <MockLeaderboard />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </AppShell>
  );
}
