import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  FileText, Stethoscope, FolderOpen, Flag, BarChart3, Users,
  MessageSquare, User as UserIcon, ChevronRight,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Pagination from "../components/Pagination.jsx";
import Skeleton, { SkeletonRows } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import useUrlPaging from "../lib/usePaging.js";
import { relativeTime } from "../lib/date.js";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const PAGE_SIZE = 10;

// Used in place of "—" while stats are loading so the row doesn't look broken.
function StatValue({ value }) {
  if (value === null || value === undefined) {
    return <Skeleton width="60%" height={26} />;
  }
  return <span>{value}</span>;
}

function NavCard({ href, icon, title, body, badge }) {
  return (
    <Link
      href={href}
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: "var(--bg-soft, #f1f5f9)",
        display: "grid", placeItems: "center",
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong>{title}</strong>
          {badge != null && badge > 0 && (
            <span className="badge badge-warning" style={{ fontSize: 11 }}>{badge}</span>
          )}
        </div>
        <div className="muted small" style={{ marginTop: 2 }}>{body}</div>
      </div>
      <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" className="muted" />
    </Link>
  );
}

export default function AdminDashboard() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);

  // Practice activity — by learner
  const [studentAttempts, setStudentAttempts] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(null);
  const studentAttemptsPg = useUrlPaging({ initialPage: 1, initialPageSize: 25, prefix: "ua", enabled: false });

  // AI generate
  const [genCount, setGenCount] = useState(5);
  const [genLevel, setGenLevel] = useState(3);
  const [genSpecialty, setGenSpecialty] = useState("");
  const [specialtyList, setSpecialtyList] = useState([]);
  const [genBusy, setGenBusy] = useState(false);

  // Server logs badge
  const [unseenLogs, setUnseenLogs] = useState({ count: 0, hasError: false });

  // Doctor support unread badge
  const [supportUnread, setSupportUnread] = useState(0);

  // Applied Applications (recent pending doctor applications)
  const [appliedApps, setAppliedApps] = useState({ items: [], total: 0, loading: true, error: null });

  function loadStats() {
    setStats(null);
    setStatsError(null);
    api.get("/api/admin/stats").then(setStats).catch((e) => { setStats({}); setStatsError(e?.message || "Could not load stats"); });
  }

  function loadAppliedApps() {
    setAppliedApps((s) => ({ ...s, loading: true, error: null }));
    api.get("/api/admin/doctors/pending?page=1&pageSize=5")
      .then((r) => setAppliedApps({
        items: r.items || r.doctors || [],
        total: r.total || 0,
        loading: false,
        error: null,
      }))
      .catch((e) => setAppliedApps({
        items: [], total: 0, loading: false, error: e?.message || "Could not load applications",
      }));
  }

  function loadActivity() {
    setActivityLoading(true);
    setActivityError(null);
    api.get("/api/admin/student-attempts?limit=200")
      .then((sa) => {
        setStudentAttempts(sa.users || []);
        setActivityLoading(false);
      })
      .catch((e) => {
        setActivityError(e?.message || "Could not load practice activity");
        setActivityLoading(false);
      });
  }

  function loadSupportUnread() {
    api.get("/api/support/unread")
      .then((r) => setSupportUnread(r.unread || 0))
      .catch(() => {});
  }

  // Initial load
  useEffect(() => {
    loadStats();
    loadActivity();
    loadAppliedApps();
    loadSupportUnread();
    api.get("/api/cases/specialties")
      .then((r) => setSpecialtyList(r.specialties || []))
      .catch((e) => console.warn("Specialty list fetch failed:", e?.message || e));
    const iv = setInterval(loadSupportUnread, 30000);
    return () => clearInterval(iv);
  }, []);

  // Server-logs badge listener
  useEffect(() => {
    function onStatus(e) {
      const d = e.detail || {};
      setUnseenLogs({ count: d.count || 0, hasError: !!d.hasError });
    }
    window.addEventListener("admin:logs:status", onStatus);
    return () => window.removeEventListener("admin:logs:status", onStatus);
  }, []);

  async function generateCases() {
    setGenBusy(true);
    try {
      const r = await api.post("/api/admin/cases/generate", {
        count: genCount,
        level: genLevel,
        specialty: genSpecialty || null,
      });
      const okN = r.inserted?.length || 0;
      if (okN === 0) toast.error("AI generation failed — check server logs");
      else if (r.failedCount) toast.success(`Generated ${okN} of ${genCount} cases (${r.failedCount} failed)`);
      else toast.success(`Generated ${okN} cases with diagnoses`);
      loadStats();
    } catch (e) { toast.error(e.message); }
    finally { setGenBusy(false); }
  }

  const pendingDoctorBadge = useMemo(() => stats?.pendingDoctors ?? null, [stats]);
  const openDeleteBadge = useMemo(() => stats?.openDeleteRequests ?? null, [stats]);
  const openReportsBadge = useMemo(() => stats?.openReports ?? null, [stats]);

  return (
    <AppShell>
      <div className="container fade-in">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Admin</h2>
            <p className="muted" style={{ marginTop: 4 }}>Approvals, reports, and platform health.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Link href="/admin/logs" className="btn" style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FileText size={16} strokeWidth={1.75} aria-hidden="true" /> Server logs
              {unseenLogs.count > 0 && (
                <span
                  title={`${unseenLogs.count} new ${unseenLogs.hasError ? "error/warning" : "warning"}${unseenLogs.count > 1 ? "s" : ""}`}
                  style={{
                    position: "absolute", top: -6, right: -6,
                    minWidth: 18, height: 18, padding: "0 5px",
                    borderRadius: 999,
                    background: unseenLogs.hasError ? "#dc2626" : "#d97706",
                    color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: "18px",
                    textAlign: "center", boxShadow: "0 0 0 2px var(--bg, #fff)",
                    animation: "pulseDot 1.6s ease-in-out infinite",
                  }}
                >
                  {unseenLogs.count > 99 ? "99+" : unseenLogs.count}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="spacer-7" />
        <div className="stat-row">
          <div className="stat"><div className="stat-label">Cases</div><div className="stat-value"><StatValue value={stats?.cases} /></div></div>
          <div className="stat"><div className="stat-label">Total attempts</div><div className="stat-value"><StatValue value={stats?.responses} /></div></div>
          <div className="stat"><div className="stat-label">Cases attempted</div><div className="stat-value"><StatValue value={stats?.attemptedCases} /></div></div>
          <div className="stat"><div className="stat-label">Active learners</div><div className="stat-value"><StatValue value={stats?.distinctAttempters} /></div></div>
          <div className="stat"><div className="stat-label">Pending doctors</div><div className="stat-value"><StatValue value={stats?.pendingDoctors} /></div></div>
          <div className="stat"><div className="stat-label">Open delete reqs</div><div className="stat-value"><StatValue value={stats?.openDeleteRequests} /></div></div>
        </div>
        {statsError && <p className="muted small" style={{ marginTop: 6 }}>{statsError}</p>}

        {/* Applied Applications — most recent pending doctor applicants */}
        <div className="spacer-7" />
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Stethoscope size={18} strokeWidth={1.75} aria-hidden="true" />
                Applied Applications
                <span className="muted small" style={{ marginLeft: 4 }}>({appliedApps.total})</span>
              </h3>
              <p className="muted small" style={{ marginTop: 4 }}>
                Most recent doctor applications awaiting review.
              </p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={loadAppliedApps}>Refresh</button>
              <Link href="/admin/doctor-approvals" className="btn btn-primary btn-sm">View all</Link>
            </div>
          </div>
          <div className="spacer-7" />
          {appliedApps.loading ? (
            <SkeletonRows n={3} avatar={false} />
          ) : appliedApps.error ? (
            <ErrorState body={appliedApps.error} onRetry={loadAppliedApps} />
          ) : appliedApps.items.length === 0 ? (
            <EmptyState
              icon={<Stethoscope size={20} strokeWidth={1.75} aria-hidden="true" />}
              title="No pending applications"
              body="When a doctor applies, you'll see them here."
            />
          ) : (
            <div className="admin-cards">
              {appliedApps.items.map((d) => (
                <div key={d.id} className="admin-card-row">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <Link href={`/u/${d.username}`} style={{ flex: 1, minWidth: 0 }}>
                      <strong className="clamp-2" style={{ display: "block" }}>{d.full_name}</strong>
                    </Link>
                    {d.specialty && (
                      <span className="badge" style={{ fontSize: 11, flexShrink: 0 }}>{d.specialty}</span>
                    )}
                  </div>
                  <div className="muted small" style={{ marginTop: 4 }}>
                    @{d.username} · {d.email}
                  </div>
                  <div className="muted small" style={{ marginTop: 6 }}>
                    {d.license_number && <><strong>License:</strong> {d.license_number}</>}
                    {d.years_exp ? <> · {d.years_exp}y experience</> : null}
                    {d.hospital ? <> · <strong>Hospital:</strong> {d.hospital}</> : null}
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <Link href="/admin/doctor-approvals" className="btn btn-primary btn-sm">Review</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links to dedicated pages */}
        <div className="spacer-7" />
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          <NavCard
            href="/admin/doctor-approvals"
            icon={<Stethoscope size={20} strokeWidth={1.75} aria-hidden="true" />}
            title="Doctor approvals"
            body="Review and approve applicants"
            badge={pendingDoctorBadge}
          />
          <NavCard
            href="/admin/delete-requests"
            icon={<FolderOpen size={20} strokeWidth={1.75} aria-hidden="true" />}
            title="Delete requests"
            body="Triage cases flagged for removal"
            badge={openDeleteBadge}
          />
          <NavCard
            href="/admin/practice-activity"
            icon={<BarChart3 size={20} strokeWidth={1.75} aria-hidden="true" />}
            title="Practice activity — by case"
            body="See which cases are being attempted"
          />
          <NavCard
            href="/admin/reports"
            icon={<Flag size={20} strokeWidth={1.75} aria-hidden="true" />}
            title="Reports"
            body="Review user-submitted reports on cases"
            badge={openReportsBadge}
          />
          <NavCard
            href="/admin/support"
            icon={<MessageSquare size={20} strokeWidth={1.75} aria-hidden="true" />}
            title="Doctor support chats"
            body="Reply to pending and rejected applicants"
            badge={supportUnread}
          />
        </div>

        {/* Practice activity — by learner */}
        <div className="spacer-7" />
        <div className="card">
          <h3 style={{ margin: 0 }}>Practice activity — by learner</h3>
          <p className="muted small" style={{ marginTop: 4 }}>Who is practicing the most. Includes both students and doctors.</p>
          <div className="spacer-7" />
          {activityLoading ? (
            <SkeletonRows n={6} avatar />
          ) : activityError ? (
            <ErrorState body={activityError} onRetry={loadActivity} />
          ) : studentAttempts.length === 0 ? (
            <EmptyState
              icon={<Users size={24} strokeWidth={1.75} aria-hidden="true" />}
              title="No learners active"
              body="Once people start practicing, you'll see them here."
            />
          ) : (() => {
            const total = studentAttempts.length;
            const pageSize = studentAttemptsPg.pageSize;
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const page = Math.min(studentAttemptsPg.page, totalPages);
            const start = (page - 1) * pageSize;
            const slice = studentAttempts.slice(start, start + pageSize);
            return (
              <>
                <div className="admin-cards">
                  {slice.map((u) => (
                    <div key={u.id} className="admin-card-row">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <Link href={`/u/${u.username}`} style={{ flex: 1, minWidth: 0 }}>
                          <strong className="clamp-2" style={{ display: "block" }}>{u.full_name || u.username}</strong>
                        </Link>
                        {u.role && (
                          <span className="badge" style={{ fontSize: 11, flexShrink: 0 }}>{u.role}</span>
                        )}
                      </div>
                      <div className="muted small" style={{ marginTop: 4 }}>@{u.username}</div>
                      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                        <div>
                          <div className="muted small">Attempts</div>
                          <div style={{ fontWeight: 700, fontSize: 18 }}>{u.attempts}</div>
                        </div>
                        <div>
                          <div className="muted small">Unique cases</div>
                          <div style={{ fontWeight: 700, fontSize: 18 }}>{u.unique_cases}</div>
                        </div>
                        <div>
                          <div className="muted small">Last attempt</div>
                          <div style={{ fontWeight: 600 }} title={u.last_attempt ? new Date(u.last_attempt).toLocaleString() : ""}>
                            {relativeTime(u.last_attempt) || "—"}
                          </div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        <Link href={`/u/${u.username}`} className="btn btn-ghost btn-sm">
                          <UserIcon size={14} strokeWidth={1.75} aria-hidden="true" /> Profile
                        </Link>
                        <Link href={`/messages/u/${u.username}`} className="btn btn-ghost btn-sm">
                          <MessageSquare size={14} strokeWidth={1.75} aria-hidden="true" /> DM
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="admin-table" style={{ overflowX: "auto" }}>
                  <table className="table table-sticky-first" style={{ width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>User</th>
                        <th style={{ textAlign: "left" }}>Role</th>
                        <th style={{ textAlign: "right" }}>Total attempts</th>
                        <th style={{ textAlign: "right" }}>Unique cases</th>
                        <th style={{ textAlign: "left" }}>Last attempt</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <Link href={`/u/${u.username}`} className="clamp-2">{u.full_name || u.username}</Link>
                          </td>
                          <td>{u.role}</td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>{u.attempts}</td>
                          <td style={{ textAlign: "right" }}>{u.unique_cases}</td>
                          <td className="muted small" title={u.last_attempt ? new Date(u.last_attempt).toLocaleString() : ""}>{relativeTime(u.last_attempt) || "—"}</td>
                          <td>
                            <div className="row row-actions" style={{ justifyContent: "flex-end", gap: 4 }}>
                              <Link
                                href={`/u/${u.username}`}
                                className="icon-action"
                                aria-label={`View profile of @${u.username}`}
                                title="View profile"
                              >
                                <UserIcon size={16} strokeWidth={1.75} aria-hidden="true" />
                              </Link>
                              <Link
                                href={`/messages/u/${u.username}`}
                                className="icon-action"
                                aria-label={`Open DM with @${u.username}`}
                                title="Open DM"
                              >
                                <MessageSquare size={16} strokeWidth={1.75} aria-hidden="true" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  pageSize={pageSize}
                  onChange={studentAttemptsPg.setPage}
                  onPageSizeChange={studentAttemptsPg.setPageSize}
                />
              </>
            );
          })()}
        </div>

        {/* AI generate (moved to bottom) */}
        <div className="spacer-7" />
        <div className="card">
          <h3>Generate cases with AI</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            Generates clinical cases with diagnoses and accepted-answer aliases. Cases are tagged as AI-generated. Review and verify before relying on them clinically.
          </p>
          <div className="spacer-7" />
          <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ minWidth: 140 }}>
              <label className="label">How many?</label>
              <select className="select" value={genCount} onChange={(e) => setGenCount(parseInt(e.target.value, 10))} disabled={genBusy}>
                <option value={1}>1 case</option>
                <option value={3}>3 cases</option>
                <option value={5}>5 cases</option>
                <option value={10}>10 cases</option>
              </select>
            </div>
            <div className="field" style={{ minWidth: 180 }}>
              <label className="label">Level (difficulty)</label>
              <select className="select" value={genLevel} onChange={(e) => setGenLevel(parseInt(e.target.value, 10))} disabled={genBusy}>
                <option value={1}>Level 1 — easiest (1st year)</option>
                <option value={2}>Level 2 — 2nd year</option>
                <option value={3}>Level 3 — 3rd year</option>
                <option value={4}>Level 4 — 4th year</option>
                <option value={5}>Level 5 — intern</option>
                <option value={6}>Level 6 — resident</option>
                <option value={7}>Level 7 — hardest (advanced resident)</option>
              </select>
            </div>
            <div className="field" style={{ minWidth: 220 }}>
              <label className="label">Specialty</label>
              <select className="select" value={genSpecialty} onChange={(e) => setGenSpecialty(e.target.value)} disabled={genBusy}>
                <option value="">Mixed (random per case)</option>
                {specialtyList.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={generateCases} disabled={genBusy} style={{ height: 40 }}>
              {genBusy ? <><span className="spinner" /> Generating… (may take 30–90s)</> : `Generate ${genCount} case${genCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
