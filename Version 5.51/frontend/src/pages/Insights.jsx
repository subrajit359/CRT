import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  TrendingUp, TrendingDown, Minus, Brain, RefreshCw,
  Target, ChevronRight, ChevronLeft, Flame, BookOpen,
  Lightbulb, Key,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import Skeleton, { SkeletonStack } from "../components/Skeleton.jsx";

// ── Helpers ──────────────────────────────────────────────────────────────────
function trendMeta(trend) {
  if (trend === "improving") return { Icon: TrendingUp,   color: "#16a34a", label: "Improving" };
  if (trend === "declining") return { Icon: TrendingDown, color: "#dc2626", label: "Declining" };
  return { Icon: Minus, color: "var(--ink-400)", label: "Stable" };
}

const TIP_ICONS = [Lightbulb, Target, TrendingUp, Key];

// ── Heatmap helpers ───────────────────────────────────────────────────────────
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function tileColor(n) {
  if (n <= 3)  return "var(--line, #e2e8f0)";
  if (n <= 8)  return "rgba(99,102,241,0.22)";
  if (n <= 15) return "rgba(99,102,241,0.48)";
  if (n <= 25) return "rgba(99,102,241,0.72)";
  return            "rgba(99,102,241,1.00)";
}

const LEGEND = [
  { color: "var(--line)", label: "0–3" },
  { color: "rgba(99,102,241,0.22)", label: "4–8" },
  { color: "rgba(99,102,241,0.48)", label: "9–15" },
  { color: "rgba(99,102,241,0.72)", label: "16–25" },
  { color: "rgba(99,102,241,1.00)", label: "26+" },
];

// ── Activity Heatmap ─────────────────────────────────────────────────────────
function Heatmap({ heatmap }) {
  const [monthOffset, setMonthOffset] = useState(0); // 0=current, -1, -2, -3
  const [selected, setSelected] = useState(null);

  const now = new Date(); now.setHours(0, 0, 0, 0);
  const dayMap = new Map((heatmap || []).map((h) => [String(h.day).slice(0, 10), h.n]));

  const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year  = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow    = new Date(year, month, 1).getDay();

  const cells = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const key  = date.toISOString().slice(0, 10);
    cells.push({ date, key, n: dayMap.get(key) || 0, isFuture: date > now });
  }
  const padded = [...Array(firstDow).fill(null), ...cells];

  const monthLabel = targetDate.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button
          className="btn btn-ghost btn-sm"
          disabled={monthOffset <= -3}
          onClick={() => { setMonthOffset((o) => o - 1); setSelected(null); }}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <strong style={{ fontSize: 14 }}>{monthLabel}</strong>
        <button
          className="btn btn-ghost btn-sm"
          disabled={monthOffset >= 0}
          onClick={() => { setMonthOffset((o) => o + 1); setSelected(null); }}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {DAY_LABELS.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--ink-400)", paddingBottom: 2 }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {padded.map((cell, i) =>
          cell === null ? (
            <div key={`pad-${i}`} style={{ aspectRatio: "1" }} />
          ) : (
            <div
              key={cell.key}
              onClick={() => !cell.isFuture && setSelected((s) => s?.key === cell.key ? null : cell)}
              style={{
                aspectRatio: "1",
                borderRadius: 6,
                background: cell.isFuture ? "var(--line, #e2e8f0)" : tileColor(cell.n),
                border: selected?.key === cell.key
                  ? "2px solid var(--primary)"
                  : "2px solid transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: cell.isFuture ? "default" : "pointer",
                opacity: cell.isFuture ? 0.3 : 1,
                fontSize: 12,
                fontWeight: 600,
                color: cell.n > 15 ? "white" : "var(--ink)",
                userSelect: "none",
                transition: "border-color 0.15s",
              }}
            >
              {cell.date.getDate()}
            </div>
          )
        )}
      </div>

      {/* Selected day detail */}
      {selected && (
        <div style={{
          marginTop: 12, padding: "10px 16px", borderRadius: 8,
          background: "var(--surface, #f8fafc)", border: "1px solid var(--line)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: tileColor(selected.n), flexShrink: 0, border: "1px solid rgba(0,0,0,0.08)" }} />
          <div>
            <strong style={{ fontSize: 13 }}>
              {selected.date.toLocaleDateString("default", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </strong>
            <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>
              {selected.n === 0
                ? "No cases attempted"
                : `${selected.n} unique case${selected.n !== 1 ? "s" : ""} attempted`}
            </span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        {LEGEND.map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 13, height: 13, borderRadius: 3, background: color, flexShrink: 0, border: "1px solid rgba(0,0,0,0.06)" }} />
            <span className="muted small">{label}</span>
          </div>
        ))}
        <span className="muted small">unique cases/day</span>
      </div>
    </div>
  );
}

// ── Readiness Bar ────────────────────────────────────────────────────────────
function ReadinessBar({ specialty, avg_score, readiness, n }) {
  const color = readiness >= 75 ? "#16a34a" : readiness >= 50 ? "#d97706" : "#dc2626";
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 13 }}>{specialty}</strong>
          <span className="muted small">{n} case{n !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color }}>{readiness}% ready</span>
          <span className="muted small">{(avg_score ?? 0).toFixed(1)}/10</span>
        </div>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
        <div
          style={{
            width: `${readiness}%`, height: "100%", background: color,
            borderRadius: 99, transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        />
      </div>
    </div>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────
function StatTile({ label, value, sub, color }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : {}}>{value}</div>
      {sub && <div className="muted small" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Insights() {
  const [, navigate] = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get("/api/insights")
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRefreshTips() {
    setRefreshing(true);
    try {
      await api.post("/api/insights/refresh-tips", {});
      await new Promise((r) => setTimeout(r, 300));
      load();
    } catch { /* non-fatal */ } finally {
      setRefreshing(false);
    }
  }

  const tm = data ? trendMeta(data.trend) : null;
  const hasData = data && data.totalCases > 0;

  return (
    <AppShell>
      <div className="container fade-in">

        {/* Header */}
        <div className="row-between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0 }}>Study Insights</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              AI-powered analysis of your learning patterns.
            </p>
          </div>
          {!loading && tm && hasData && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              border: "1.5px solid var(--line)",
              background: "var(--bg)",
            }}>
              <tm.Icon size={15} color={tm.color} />
              <span style={{ fontSize: 13, fontWeight: 700, color: tm.color }}>{tm.label}</span>
              <span className="muted small">trend</span>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && <SkeletonStack rows={8} height={18} />}

        {/* Error */}
        {!loading && error && (
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <p className="muted">{error}</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={load}>Retry</button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !hasData && (
          <div className="card" style={{ textAlign: "center", padding: 52 }}>
            <Brain size={36} color="var(--ink-300)" style={{ margin: "0 auto 16px", display: "block" }} />
            <h3 style={{ margin: "0 0 8px" }}>No insights yet</h3>
            <p className="muted" style={{ margin: "0 0 20px" }}>
              Complete at least 3 cases to unlock your personalised AI coaching tips, activity heatmap, and specialty readiness scores.
            </p>
            <button className="btn btn-primary" onClick={() => navigate("/practice")}>
              Start practicing <ChevronRight size={16} style={{ display: "inline", verticalAlign: "middle" }} />
            </button>
          </div>
        )}

        {/* Main content */}
        {!loading && !error && hasData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Stats strip */}
            <div className="stat-row">
              <StatTile label="Cases done"    value={data.totalCases} sub="lifetime" />
              <StatTile label="Average score" value={`${data.overallAvg.toFixed(1)}/10`} />
              <StatTile label="Streak"        value={`${data.streak}d`} sub="current" color={data.streak >= 7 ? "#d97706" : undefined} />
              <StatTile label="Total XP"      value={data.xp.toLocaleString()} color="var(--primary)" />
            </div>

            {/* AI Coach */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Brain size={18} color="var(--primary)" />
                  <strong>AI Coach</strong>
                  <span className="muted small">— refreshes every 6 hours</span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleRefreshTips}
                  disabled={refreshing}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}
                >
                  <RefreshCw size={13} style={refreshing ? { animation: "spin 1s linear infinite" } : {}} />
                  {refreshing ? "Generating…" : "Refresh tips"}
                </button>
              </div>

              {data.tips?.length > 0 ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                  {data.tips.map((tip, i) => (
                    <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <span style={{ flexShrink: 0, marginTop: 2, color: "var(--primary)" }}>
                        {(() => { const TipIcon = TIP_ICONS[i]; return TipIcon ? <TipIcon size={18} strokeWidth={2} /> : <span style={{ fontWeight: 700 }}>•</span>; })()}
                      </span>
                      <span style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink)" }}>{tip}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p className="muted small" style={{ margin: "0 0 12px" }}>
                    {data.totalCases < 3
                      ? "Complete 3+ cases to unlock AI coaching tips."
                      : "No tips cached yet — click Refresh to generate your personalised advice."}
                  </p>
                  {data.totalCases >= 3 && (
                    <button className="btn btn-secondary btn-sm" onClick={handleRefreshTips} disabled={refreshing}>
                      Generate tips
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Activity heatmap */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Flame size={16} color="var(--primary)" />
                <strong>Activity</strong>
                <span className="muted small">— last 12 weeks</span>
              </div>
              <Heatmap heatmap={data.heatmap} />
            </div>

            {/* Specialty readiness */}
            {data.specialties?.length > 0 && (
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <Target size={16} color="var(--primary)" />
                  <strong>Specialty Readiness</strong>
                  <span className="muted small">— recency-weighted · worst first</span>
                </div>
                {data.specialties.map((s) => (
                  <ReadinessBar key={s.specialty} {...s} />
                ))}

                {data.strongest && data.weakest && data.strongest.specialty !== data.weakest.specialty && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 120, padding: "8px 12px", borderRadius: 8, background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)" }}>
                      <div className="muted small" style={{ marginBottom: 2 }}>Strongest</div>
                      <strong style={{ fontSize: 13 }}>{data.strongest.specialty}</strong>
                      <span className="muted small" style={{ marginLeft: 6 }}>{data.strongest.readiness}%</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 120, padding: "8px 12px", borderRadius: 8, background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)" }}>
                      <div className="muted small" style={{ marginBottom: 2 }}>Needs work</div>
                      <strong style={{ fontSize: 13 }}>{data.weakest.specialty}</strong>
                      <span className="muted small" style={{ marginLeft: 6 }}>{data.weakest.readiness}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Focus recommendation CTA */}
            {data.weakest && (
              <div className="card" style={{
                background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
                color: "white", border: "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                      Focus recommendation
                    </div>
                    <h3 style={{ margin: "0 0 6px", color: "white", fontSize: 18 }}>
                      Practice {data.weakest.specialty}
                    </h3>
                    <p style={{ margin: 0, opacity: 0.85, fontSize: 14, lineHeight: 1.5 }}>
                      {data.weakest.readiness}% readiness · avg {(data.weakest.avg_score ?? 0).toFixed(1)}/10 · {data.weakest.n} case{data.weakest.n !== 1 ? "s" : ""} done.
                      {data.weakest.readiness < 50 && " This is your biggest growth opportunity."}
                    </p>
                  </div>
                  <button
                    className="btn"
                    style={{ background: "white", color: "#4f46e5", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                    onClick={() => navigate(`/practice?specialty=${encodeURIComponent(data.weakest.specialty)}`)}
                  >
                    <BookOpen size={15} />
                    Practice now
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </AppShell>
  );
}
