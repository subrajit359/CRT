import { useEffect, useState } from "react";
import { Link } from "wouter";
import { TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight, Award, AlertCircle, BarChart2, BookOpen, Star, RefreshCw, Trophy, Zap, Hospital, Search, ClipboardList, Target, Flame, Dumbbell, Globe, Layers, GraduationCap, Brain, Sparkles, Moon, Sunrise } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";

const PAGE_SIZE = 10;

const CATEGORY_ORDER = ["Milestone", "Score", "Streak", "Specialty", "Mastery", "Improvement", "Time"];

const ACHIEVEMENT_ICONS = {
  Hospital,
  Search,
  ClipboardList,
  Award,
  Star,
  Target,
  TrendingUp,
  Flame,
  Dumbbell,
  Trophy,
  Globe,
  Layers,
  GraduationCap,
  RefreshCw,
  Brain,
  Sparkles,
  Moon,
  Sunrise,
};

function ScoreBadge({ score }) {
  const cls = score >= 8 ? "badge-success" : score >= 5 ? "badge-warning" : "badge-danger";
  return <span className={`badge ${cls}`}>{score ?? "—"}/10</span>;
}

function ScoreBar({ value, max = 10 }) {
  const pct = Math.max(0, Math.min(100, ((value ?? 0) / max) * 100));
  const color = value >= 8 ? "var(--success, #16a34a)" : value >= 5 ? "#d97706" : "var(--danger, #dc2626)";
  return (
    <div style={{ flex: 1, height: 6, borderRadius: 99, background: "var(--line)", overflow: "hidden", minWidth: 60 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.4s ease" }} />
    </div>
  );
}

function TrendIcon({ current, previous }) {
  if (previous == null || current == null) return <Minus size={14} color="var(--ink-400)" />;
  if (current > previous) return <TrendingUp size={14} color="var(--success, #16a34a)" />;
  if (current < previous) return <TrendingDown size={14} color="var(--danger, #dc2626)" />;
  return <Minus size={14} color="var(--ink-400)" />;
}

export default function Progress() {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [achieveData, setAchieveData] = useState(null);

  useEffect(() => {
    api.get("/api/eval/stats").then(setStats).catch(() => {});
    api.get("/api/eval/history").then((r) => setHistory(r.responses || [])).catch(() => {});
    api.get("/api/achievements").then(setAchieveData).catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageSlice = history.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const bySpecialty = stats?.bySpecialty || [];
  const sorted = [...bySpecialty].sort((a, b) => (b.avg_score ?? 0) - (a.avg_score ?? 0));
  const strongSubjects = sorted.filter((s) => s.avg_score >= 7).slice(0, 4);
  const weakSubjects = [...sorted].reverse().filter((s) => s.avg_score < 6).slice(0, 4);

  const recentScores = history.slice(0, 10).map((r) => r.score).reverse();
  const avgRecent = recentScores.length
    ? (recentScores.reduce((a, b) => a + (b ?? 0), 0) / recentScores.length).toFixed(1)
    : null;
  const prevAvg = history.slice(10, 20).length
    ? history.slice(10, 20).reduce((a, b) => a + (b.score ?? 0), 0) / history.slice(10, 20).length
    : null;

  const passRate = history.length
    ? Math.round((history.filter((r) => (r.score ?? 0) >= 5).length / history.length) * 100)
    : null;

  const uniqueCases = new Set(history.map((r) => r.case_id)).size;

  return (
    <AppShell>
      <div className="container fade-in">
        <h2 style={{ margin: 0 }}>Your Progress</h2>
        <p className="muted" style={{ marginTop: 4 }}>Reasoning quality across specialties. Private to you.</p>

        <div className="spacer-7" />

        {/* Top stats */}
        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">Total attempts</div>
            <div className="stat-value">{stats?.attempts ?? 0}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Average score</div>
            <div className="stat-value">{stats?.averageScore != null ? stats.averageScore.toFixed(1) : "—"}/10</div>
          </div>
          <div className="stat">
            <div className="stat-label">Unique cases</div>
            <div className="stat-value">{uniqueCases}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Pass rate</div>
            <div className="stat-value">{passRate != null ? `${passRate}%` : "—"}</div>
          </div>
        </div>

        <div className="spacer-7" />

        {/* Score trend mini */}
        {recentScores.length >= 2 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BarChart2 size={16} color="var(--primary)" />
                <strong>Recent trend</strong>
                <span className="muted small">(last {recentScores.length} attempts)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <TrendIcon current={parseFloat(avgRecent)} previous={prevAvg} />
                <span style={{ fontWeight: 700, fontSize: 15 }}>{avgRecent}/10</span>
                <span className="muted small">avg</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 48 }}>
              {recentScores.map((score, i) => {
                const h = Math.max(8, ((score ?? 0) / 10) * 48);
                const color = score >= 8 ? "var(--success, #16a34a)" : score >= 5 ? "#d97706" : "var(--danger, #dc2626)";
                return (
                  <div key={i} title={`${score}/10`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <div style={{ width: "100%", height: h, background: color, borderRadius: "4px 4px 0 0", opacity: 0.85, transition: "height 0.3s ease" }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span className="muted small">Oldest</span>
              <span className="muted small">Latest</span>
            </div>
          </div>
        )}

        <div className="dash-grid">
          {/* Strong subjects */}
          {strongSubjects.length > 0 && (
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Award size={16} color="var(--success, #16a34a)" />
                <h3 style={{ margin: 0 }}>Strong subjects</h3>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {strongSubjects.map((s) => (
                  <li key={s.specialty} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <strong style={{ fontSize: 13 }}>{s.specialty}</strong>
                      <ScoreBadge score={s.avg_score?.toFixed(1)} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ScoreBar value={s.avg_score} />
                      <span className="muted small" style={{ flexShrink: 0 }}>{s.attempts} attempts</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Weak subjects */}
          {weakSubjects.length > 0 && (
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <AlertCircle size={16} color="var(--danger, #dc2626)" />
                <h3 style={{ margin: 0 }}>Needs improvement</h3>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {weakSubjects.map((s) => (
                  <li key={s.specialty} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <strong style={{ fontSize: 13 }}>{s.specialty}</strong>
                      <ScoreBadge score={s.avg_score?.toFixed(1)} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ScoreBar value={s.avg_score} />
                      <span className="muted small" style={{ flexShrink: 0 }}>{s.attempts} attempts</span>
                    </div>
                  </li>
                ))}
              </ul>
              {weakSubjects.length > 0 && (
                <Link href="/study" className="btn btn-ghost btn-sm" style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <BookOpen size={13} /> Study resources
                </Link>
              )}
            </div>
          )}

          {/* By specialty — full breakdown */}
          <div className="card">
            <h3 style={{ margin: "0 0 12px" }}>All specialties</h3>
            {!bySpecialty.length ? (
              <div className="empty">No data yet.</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {bySpecialty.map((s) => (
                  <li key={s.specialty} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <strong style={{ fontSize: 13 }}>{s.specialty}</strong>
                      <ScoreBadge score={s.avg_score?.toFixed(1)} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ScoreBar value={s.avg_score} />
                      <span className="muted small" style={{ flexShrink: 0 }}>{s.attempts} attempts</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent attempts with pagination */}
          <div className="card">
            <h3 style={{ margin: "0 0 12px" }}>Recent attempts</h3>
            {history.length === 0 ? (
              <div className="empty">No attempts yet.</div>
            ) : (
              <>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {pageSlice.map((r) => (
                    <li key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                      <div className="row-between">
                        <Link href={`/case/${r.case_id}`} style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
                          <strong className="clamp-2" style={{ display: "block" }}>{r.title}</strong>
                        </Link>
                        <ScoreBadge score={r.score} />
                      </div>
                      <div className="muted small" style={{ marginTop: 3 }}>
                        {r.specialty} · {new Date(r.created_at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, gap: 8 }}>
                    <span className="muted small">
                      {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, history.length)} of {history.length}
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{ padding: "4px 8px" }}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 600, padding: "4px 10px", alignSelf: "center" }}>
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        style={{ padding: "4px 8px" }}
                        aria-label="Next page"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Achievements ─────────────────────────────────────────────── */}
        {achieveData && (
          <>
            <div className="spacer-7" />
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Trophy size={18} color="var(--primary)" />
                  <h3 style={{ margin: 0 }}>Achievements</h3>
                  <span className="badge" style={{ background: "var(--primary)", color: "white" }}>
                    {achieveData.unlockedCount} / {achieveData.totalCount}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Zap size={14} color="#d97706" />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{(achieveData.xp ?? 0).toLocaleString()} XP</span>
                </div>
              </div>

              {/* XP progress bar */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ height: 6, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${achieveData.totalCount > 0 ? Math.round((achieveData.unlockedCount / achieveData.totalCount) * 100) : 0}%`,
                      height: "100%",
                      background: "var(--primary)",
                      borderRadius: 99,
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  {achieveData.totalCount > 0
                    ? `${Math.round((achieveData.unlockedCount / achieveData.totalCount) * 100)}% complete`
                    : "0% complete"}
                </div>
              </div>

              {/* Grid grouped by category */}
              {CATEGORY_ORDER.map((cat) => {
                const group = (achieveData.achievements || []).filter((a) => a.category === cat);
                if (!group.length) return null;
                return (
                  <div key={cat} style={{ marginBottom: 20 }}>
                    <div className="muted small" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>{cat}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                      {group.map((a) => (
                        <div
                          key={a.key}
                          title={a.unlocked ? `Unlocked ${new Date(a.unlocked_at).toLocaleDateString()}` : a.desc}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: `1.5px solid ${a.unlocked ? "var(--primary)" : "var(--line)"}`,
                            background: a.unlocked ? "var(--primary-tint, rgba(99,102,241,0.07))" : "var(--surface-2, var(--bg))",
                            opacity: a.unlocked ? 1 : 0.5,
                            transition: "opacity 0.2s",
                            position: "relative",
                          }}
                        >
                          <div style={{ marginBottom: 4 }}>
                            {(() => {
                              const Icon = ACHIEVEMENT_ICONS[a.icon] || Trophy;
                              return <Icon size={22} strokeWidth={2} color="var(--primary)" />;
                            })()}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{a.title}</div>
                          <div className="muted small" style={{ fontSize: 11, lineHeight: 1.3 }}>{a.desc}</div>
                          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: a.unlocked ? "var(--primary)" : "var(--ink-400)" }}>
                            +{a.xp} XP
                          </div>
                          {a.unlocked && (
                            <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: "var(--primary)" }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
