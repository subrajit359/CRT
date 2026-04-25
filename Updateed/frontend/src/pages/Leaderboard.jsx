import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import Counter from "../components/Counter.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const PERIODS = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

const GOLD = "#D4A574";
const SILVER = "#B0B0B0";
const BRONZE = "#B07842";

function relativeTime(d) {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function rankColor(rank) {
  if (rank === 1) return GOLD;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  return null;
}

function PodiumCard({ entry, rank, leader, onOpen }) {
  if (!entry) {
    return (
      <div
        className="lb-podium-empty"
        style={{
          minHeight: leader ? 240 : 200,
          borderRadius: 16,
          background: "var(--bg-elev)",
          border: "1px dashed var(--line)",
          display: "grid",
          placeItems: "center",
          padding: 24,
          color: "var(--muted)",
          fontStyle: "italic",
          textAlign: "center",
        }}
      >
        Open rank #{rank}<br />
        <span style={{ fontSize: 12 }}>Be the first to climb here.</span>
      </div>
    );
  }
  const color = rankColor(rank);
  const big = leader;
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1 * rank, ease: [0.2, 0.7, 0.2, 1] }}
      whileHover={{ y: -4 }}
      style={{
        appearance: "none",
        textAlign: "center",
        cursor: "pointer",
        border: "1px solid var(--line)",
        borderRadius: 16,
        padding: big ? "28px 22px 24px" : "22px 18px",
        background: big
          ? `radial-gradient(circle at 50% 0%, rgba(212,165,116,0.22), transparent 70%), var(--bg-elev)`
          : "var(--bg-elev)",
        boxShadow: big
          ? "0 14px 38px rgba(212,165,116,0.22), 0 4px 20px rgba(15,76,58,0.10)"
          : "0 4px 20px rgba(15,76,58,0.08)",
        position: "relative",
        transform: big ? "translateY(-12px)" : undefined,
        transition: "box-shadow 200ms ease",
        fontFamily: "inherit",
      }}
    >
      <div style={{ position: "relative", display: "inline-block", marginBottom: 14 }}>
        <Avatar url={entry.avatarUrl} name={entry.name} size={big ? 80 : 60} />
        <span
          style={{
            position: "absolute", right: -6, bottom: -6,
            background: color, color: "#fff", fontWeight: 700,
            width: big ? 32 : 26, height: big ? 32 : 26,
            borderRadius: "50%", display: "grid", placeItems: "center",
            fontSize: big ? 14 : 12, boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
            border: "2px solid var(--bg-elev)",
            fontFamily: "var(--font-display)",
          }}
        >
          {rank}
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--ink-900)" }}>
        {entry.name}
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: "var(--font-display)",
          color: "var(--primary)",
          fontWeight: 700,
          fontSize: big ? 36 : 30,
          lineHeight: 1.05,
        }}
      >
        {entry.score.toFixed(1)}
      </div>
      <div className="muted small" style={{ marginTop: 4 }}>
        🔥 {entry.currentStreak}-day streak · Best {entry.bestStreak}
      </div>
      {entry.topSpecialty && (
        <div
          style={{
            marginTop: 10, display: "inline-block",
            padding: "4px 10px", borderRadius: 999,
            background: "var(--bg-muted)", color: "var(--ink-700)",
            fontSize: 11, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}
        >
          {entry.topSpecialty} specialist
        </div>
      )}
    </motion.button>
  );
}

function FilterPills({ value, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        background: "var(--bg-muted)",
        padding: 4,
        borderRadius: 999,
        border: "1px solid var(--line)",
        overflowX: "auto",
      }}
    >
      {PERIODS.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            style={{
              position: "relative",
              border: "none",
              background: "transparent",
              padding: "8px 16px",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: 600,
              fontSize: 13,
              color: active ? "#fff" : "var(--ink-800)",
              whiteSpace: "nowrap",
              zIndex: 1,
            }}
          >
            {active && (
              <motion.div
                layoutId="activePill"
                transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                style={{
                  position: "absolute", inset: 0,
                  background: "var(--primary)",
                  borderRadius: 999,
                  zIndex: -1,
                }}
              />
            )}
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function CurrentUserStrip({ data }) {
  if (!data?.row) return null;
  const r = data.row;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
      style={{
        marginTop: 28,
        padding: "16px 20px",
        background: "rgba(167,232,201,0.18)",
        borderLeft: "3px solid var(--primary)",
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        boxShadow: "0 4px 20px rgba(15,76,58,0.06)",
      }}
    >
      <Avatar url={r.avatarUrl} name={r.name} size={40} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>
          You · #{data.rank} · Score {r.score.toFixed(1)}
        </strong>
        <span className="muted small">
          🔥 {r.currentStreak} day streak · Best {r.bestStreak}{r.topSpecialty ? ` · ${r.topSpecialty}` : ""}
        </span>
      </div>
      <span
        style={{
          marginLeft: "auto",
          background: "var(--primary)", color: "#fff",
          padding: "6px 12px", borderRadius: 999,
          fontSize: 11, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}
      >
        Your position
      </span>
    </motion.div>
  );
}

function SkeletonRows({ n = 8 }) {
  return (
    <div>
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 80px",
            gap: 12,
            padding: "14px 12px",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <div className="shimmer" style={{ height: 16, borderRadius: 6 }} />
          <div className="shimmer" style={{ height: 16, borderRadius: 6 }} />
          <div className="shimmer" style={{ height: 16, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get(`/api/leaderboard?period=${period}&page=${page}&pageSize=25`)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData(null); setLoading(false); } });
    return () => { alive = false; };
  }, [period, page]);

  function changePeriod(p) {
    setPeriod(p);
    setPage(1);
  }

  const podiumOrder = data ? [data.topThree[1], data.topThree[0], data.topThree[2]] : [null, null, null];

  return (
    <AppShell>
      <motion.div
        className="container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, margin: 0, color: "var(--ink-900)" }}>
              Leaderboard
            </h1>
            <p className="muted" style={{ marginTop: 6 }}>
              Top minds on Reasonal — ranked by overall score
            </p>
          </div>
          <FilterPills value={period} onChange={changePeriod} />
        </div>

        <div className="spacer-7" />

        {loading && !data ? (
          <div className="card" style={{ minHeight: 260 }}>
            <SkeletonRows n={6} />
          </div>
        ) : !data || data.totalUsers === 0 ? (
          <div className="card lift">
            <EmptyState
              icon="✦"
              title="Be the first on the board"
              body="Finish a case to enter the rankings."
              action={<button className="btn btn-primary" onClick={() => navigate("/practice")}>Browse cases</button>}
            />
          </div>
        ) : (
          <>
            {/* Podium */}
            <div
              className="lb-podium"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.15fr 1fr",
                gap: 18,
                alignItems: "end",
              }}
            >
              <PodiumCard
                entry={podiumOrder[0]}
                rank={2}
                leader={false}
                onOpen={() => podiumOrder[0] && navigate(`/u/${podiumOrder[0].username}`)}
              />
              <PodiumCard
                entry={podiumOrder[1]}
                rank={1}
                leader
                onOpen={() => podiumOrder[1] && navigate(`/u/${podiumOrder[1].username}`)}
              />
              <PodiumCard
                entry={podiumOrder[2]}
                rank={3}
                leader={false}
                onOpen={() => podiumOrder[2] && navigate(`/u/${podiumOrder[2].username}`)}
              />
            </div>

            {/* Current user strip */}
            <CurrentUserStrip data={data.currentUser} />

            {/* Rankings table */}
            <div className="spacer-7" />
            <div
              className="card"
              style={{
                padding: 0,
                overflow: "hidden",
                borderRadius: 16,
                boxShadow: "0 4px 20px rgba(15,76,58,0.08)",
              }}
            >
              <div
                className="lb-table-head"
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px 2fr 100px 90px 80px 80px 1fr 110px",
                  padding: "14px 18px",
                  background: "var(--bg-muted)",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  color: "var(--muted)",
                }}
              >
                <div>Rank</div>
                <div>User</div>
                <div>Score</div>
                <div>Streak</div>
                <div>Best</div>
                <div>Cases</div>
                <div className="lb-col-spec">Specialty</div>
                <div className="lb-col-joined">Joined</div>
              </div>
              <AnimatePresence mode="popLayout">
                {data.rows.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", fontStyle: "italic" }}>
                    Only the podium so far — keep practicing to grow the field.
                  </div>
                ) : (
                  data.rows.map((row, i) => (
                    <motion.div
                      key={row.userId}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: Math.min(i, 10) * 0.05 }}
                      onClick={() => navigate(`/u/${row.username}`)}
                      className="lb-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "70px 2fr 100px 90px 80px 80px 1fr 110px",
                        alignItems: "center",
                        padding: "14px 18px",
                        borderBottom: "1px solid rgba(0,0,0,0.06)",
                        cursor: "pointer",
                        transition: "background 160ms ease",
                      }}
                    >
                      <div style={{ color: "var(--muted)", fontWeight: 600 }}>#{row.rank}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <Avatar url={row.avatarUrl} name={row.name} size={32} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: "var(--ink-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
                          <div className="muted small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{row.username}</div>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--font-display)", color: "var(--primary)", fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
                          {row.score.toFixed(1)}
                        </div>
                        <div className="muted" style={{ fontSize: 10, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {row.tier}
                        </div>
                      </div>
                      <div>🔥 {row.currentStreak}</div>
                      <div>🏆 {row.bestStreak}</div>
                      <div>{row.casesCompleted}</div>
                      <div className="lb-col-spec">
                        {row.topSpecialty ? (
                          <span style={{
                            display: "inline-block", padding: "3px 9px", borderRadius: 999,
                            background: "var(--bg-muted)", color: "var(--ink-700)",
                            fontSize: 11, fontWeight: 600,
                          }}>{row.topSpecialty}</span>
                        ) : <span className="muted small">—</span>}
                      </div>
                      <div className="muted small lb-col-joined">{relativeTime(row.joinedAt)}</div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, padding: "20px 0" }}>
                <button
                  className="btn btn-ghost"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Previous
                </button>
                <span className="muted small">Page {page} of {data.totalPages}</span>
                <button
                  className="btn btn-ghost"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </AppShell>
  );
}
