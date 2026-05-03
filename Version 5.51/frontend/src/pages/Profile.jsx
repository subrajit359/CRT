import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  MessageSquare, Trophy, Zap,
  Hospital, Search, ClipboardList, Award, Star, Target, TrendingUp,
  Flame, Dumbbell, Globe, Layers, GraduationCap, RefreshCw, Brain,
  Sparkles, Moon, Sunrise,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import Pagination from "../components/Pagination.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import Skeleton, { SkeletonStack } from "../components/Skeleton.jsx";
import useUrlPaging from "../lib/usePaging.js";
import { shortDate } from "../lib/date.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const ACHIEVEMENT_META = {
  first_steps:      { Icon: Hospital,      title: "First Steps",        xp: 100  },
  case_explorer:    { Icon: Search,        title: "Case Explorer",      xp: 200  },
  case_veteran:     { Icon: ClipboardList, title: "Case Veteran",       xp: 500  },
  centurion:        { Icon: Award,         title: "Centurion",          xp: 1000 },
  perfect_score:    { Icon: Star,          title: "Perfect Score",      xp: 300  },
  high_achiever:    { Icon: Target,        title: "High Achiever",      xp: 300  },
  consistent:       { Icon: TrendingUp,    title: "Consistent",         xp: 400  },
  three_day_streak: { Icon: Flame,         title: "On Fire",            xp: 150  },
  week_warrior:     { Icon: Dumbbell,      title: "Week Warrior",       xp: 300  },
  monthly_legend:   { Icon: Trophy,        title: "Monthly Legend",     xp: 1000 },
  all_rounder:      { Icon: Globe,         title: "All-Rounder",        xp: 250  },
  jack_of_all:      { Icon: Layers,        title: "Jack of All Trades", xp: 400  },
  specialist:       { Icon: GraduationCap, title: "Specialist",         xp: 500  },
  first_review:     { Icon: RefreshCw,     title: "Recall Ready",       xp: 100  },
  memory_master:    { Icon: Brain,         title: "Memory Master",      xp: 500  },
  comeback:         { Icon: Sparkles,      title: "Comeback Kid",       xp: 300  },
  night_owl:        { Icon: Moon,          title: "Night Owl",          xp: 50   },
  early_bird:       { Icon: Sunrise,       title: "Early Bird",         xp: 50   },
};

function LevelProgressBar({ level, overallPct }) {
  return (
    <div style={{ marginTop: 10, maxWidth: 360 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--emerald, #059669)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Level {level}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted, #64748b)", fontVariantNumeric: "tabular-nums" }}>
          {overallPct}% complete
        </span>
      </div>
      <div style={{
        height: 8, borderRadius: 99, background: "var(--bg-muted, #f1f5f9)",
        overflow: "hidden", border: "1px solid var(--line, #e2e8f0)"
      }}>
        <div style={{
          height: "100%",
          width: `${overallPct}%`,
          borderRadius: 99,
          background: "linear-gradient(90deg, var(--emerald-600, #059669), var(--emerald-400, #34d399))",
          transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
          boxShadow: overallPct > 0 ? "0 0 6px rgba(52,211,153,0.4)" : "none",
        }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted, #94a3b8)", marginTop: 3 }}>
        {overallPct}% toward Level {level + 1}
      </div>
    </div>
  );
}

function paginate(arr, page, pageSize) {
  const total = arr?.length || 0;
  const start = (page - 1) * pageSize;
  return { items: (arr || []).slice(start, start + pageSize), total };
}

function getAchievementIcon(meta) {
  if (typeof meta?.Icon === "function") return meta.Icon;
  if (typeof meta?.icon === "function") return meta.icon;
  return Trophy;
}

export default function Profile() {
  const params = useParams();
  const [, navigate] = useLocation();
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [levelProgress, setLevelProgress] = useState(null);

  const uploadedPaging = useUrlPaging({ enabled: false, defaultPageSize: 10 });
  const verificationsPaging = useUrlPaging({ enabled: false, defaultPageSize: 10 });
  const [showAllBadges, setShowAllBadges] = useState(false);

  const BADGE_PREVIEW = 6;

  function load() {
    setError(null); setData(null);
    api.get(`/api/profiles/${params.username}`).then((d) => {
      setData(d);
      if (me && d.user?.username === me.username && d.user?.role === "student") {
        api.get("/api/eval/level-progress").then(setLevelProgress).catch(() => {});
      }
    }).catch((e) => setError(e.message));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [params.username]);

  const uploaded = useMemo(
    () => paginate(data?.uploaded, uploadedPaging.page, uploadedPaging.pageSize),
    [data, uploadedPaging.page, uploadedPaging.pageSize],
  );
  const verifications = useMemo(
    () => paginate(data?.verifications, verificationsPaging.page, verificationsPaging.pageSize),
    [data, verificationsPaging.page, verificationsPaging.pageSize],
  );

  if (error) return <AppShell><div className="container"><ErrorState message={error} onRetry={load} /></div></AppShell>;
  if (!data) return (
    <AppShell>
      <div className="container">
        <SkeletonStack count={4} />
      </div>
    </AppShell>
  );

  const u = data.user;
  const isMe = me && me.username === u.username;

  return (
    <AppShell>
      <div className="container fade-in">
        <div className="profile-head">
          <Avatar
            url={u.avatar_url}
            name={u.full_name || u.username}
            size={84}
          />
          <div style={{ flex: 1 }}>
            <div className="row-between" style={{ alignItems: "flex-start" }}>
              <h2 style={{ marginRight: 12 }}>{u.full_name}</h2>
              {!isMe && me && (
                <button
                  className="btn btn-secondary btn-sm row"
                  style={{ gap: 6, alignItems: "center", display: "inline-flex" }}
                  onClick={() => navigate(`/messages/u/${u.username}`)}
                >
                  <MessageSquare size={16} strokeWidth={1.75} aria-hidden="true" />
                  Message
                </button>
              )}
            </div>
            <div className="muted">@{u.username} · {u.role}{u.country ? ` · ${u.country}` : ""}</div>
            {u.role === "doctor" && data.doctor && (
              <div className="row" style={{ marginTop: 10 }}>
                <span className="badge badge-primary">{data.doctor.specialty}</span>
                <span className="badge">{data.doctor.years_exp || 0}y experience</span>
                {data.doctor.hospital && <span className="badge">{data.doctor.hospital}</span>}
                <span className={`badge ${data.doctor.status === "approved" ? "badge-success" : "badge-warning"}`}>{data.doctor.status}</span>
              </div>
            )}
            {u.role === "student" && data.student && (
              <>
                <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  <span className="badge badge-primary">{data.student.year_of_study || "Student"}</span>
                  <span className="badge">Level {data.student.global_level}</span>
                  <span className="badge">{data.attempts} attempts</span>
                  {data.showScores && data.averageScore != null && (
                    <span className="badge badge-success">{data.averageScore.toFixed(1)}/5 avg</span>
                  )}
                </div>
                <LevelProgressBar level={data.student.global_level ?? 1} overallPct={levelProgress?.overallPct ?? 0} />
              </>
            )}
          </div>
        </div>

        {/* ── Student achievements section ─────────────────────────────── */}
        {u.role === "student" && (data.achievements?.length > 0 || data.xp > 0) && (
          <div className="card" style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Trophy size={16} color="var(--primary)" />
                <strong>Achievements</strong>
                {data.achievements?.length > 0 && (
                  <span className="badge" style={{ background: "var(--primary)", color: "white" }}>
                    {data.achievements.length}
                  </span>
                )}
              </div>
              {data.xp > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Zap size={13} color="#d97706" />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{data.xp.toLocaleString()} XP</span>
                </div>
              )}
            </div>
            {data.achievements?.length > 0 ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(showAllBadges ? data.achievements : data.achievements.slice(0, BADGE_PREVIEW)).map((a) => {
                    const meta = ACHIEVEMENT_META[a.key];
                    if (!meta) return null;
                    const Icon = getAchievementIcon(meta);
                    return (
                      <div
                        key={a.key}
                        title={`${meta.title} — unlocked ${new Date(a.unlocked_at).toLocaleDateString()}`}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "6px 10px", borderRadius: 8,
                          border: "1.5px solid var(--primary)",
                          background: "var(--primary-tint, rgba(99,102,241,0.07))",
                          fontSize: 13, fontWeight: 600,
                        }}
                      >
                        <Icon size={15} strokeWidth={2} color="var(--primary)" />
                        {meta.title}
                      </div>
                    );
                  })}
                </div>
                {data.achievements.length > BADGE_PREVIEW && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowAllBadges((v) => !v)}
                    style={{ marginTop: 10, fontSize: 12 }}
                  >
                    {showAllBadges
                      ? "Show less"
                      : `Show ${data.achievements.length - BADGE_PREVIEW} more badge${data.achievements.length - BADGE_PREVIEW !== 1 ? "s" : ""}`}
                  </button>
                )}
              </>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>No achievements unlocked yet.</p>
            )}
          </div>
        )}

        {u.role === "doctor" && (
          <div className="dash-grid">
            <div className="card">
              <h3>Uploaded cases ({uploaded.total})</h3>
              <div className="spacer-7" />
              {uploaded.total === 0 ? (
                <EmptyState title="No uploads yet" body="Cases this doctor uploads will appear here." />
              ) : (
                <>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {uploaded.items.map((c) => (
                      <li key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                        <Link href={`/case/${c.id}`} className="clamp-2">{c.title}</Link>
                        <div className="muted small">{c.specialty} · {shortDate(c.created_at)}</div>
                      </li>
                    ))}
                  </ul>
                  <Pagination
                    page={uploadedPaging.page}
                    pageSize={uploadedPaging.pageSize}
                    total={uploaded.total}
                    onPageChange={uploadedPaging.setPage}
                    onPageSizeChange={uploadedPaging.setPageSize}
                    pageSizeOptions={[10, 25, 50]}
                  />
                </>
              )}
            </div>
            <div className="card">
              <h3>Verifications ({verifications.total})</h3>
              <div className="spacer-7" />
              {verifications.total === 0 ? (
                <EmptyState title="No verifications yet" body="Verify or un-verify actions will appear here." />
              ) : (
                <>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {verifications.items.map((v, i) => (
                      <li key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                        <span className={`badge ${v.action === "verify" ? "badge-success" : "badge-danger"}`}>{v.action}</span>
                        <Link href={`/case/${v.case_id}`} style={{ marginLeft: 10 }} className="clamp-2">{v.title}</Link>
                        <div className="muted small">{v.specialty} · {shortDate(v.created_at)}</div>
                      </li>
                    ))}
                  </ul>
                  <Pagination
                    page={verificationsPaging.page}
                    pageSize={verificationsPaging.pageSize}
                    total={verifications.total}
                    onPageChange={verificationsPaging.setPage}
                    onPageSizeChange={verificationsPaging.setPageSize}
                    pageSizeOptions={[10, 25, 50]}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
