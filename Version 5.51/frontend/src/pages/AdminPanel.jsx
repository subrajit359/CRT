import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import {
  FileText, Stethoscope, FolderOpen, Flag, BarChart3, Users,
  MessageSquare, User as UserIcon, ChevronRight, UserX, BookOpen, Mail, Home, Inbox, Bell,
  Cpu, CheckCircle2, XCircle, Clock, RefreshCw, Trash2, CalendarClock,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Pagination from "../components/Pagination.jsx";
import Skeleton, { SkeletonRows } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import useUrlPaging from "../lib/usePaging.js";
import { relativeTime } from "../lib/date.js";
import { api, apiUrl, getToken } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

// ---------------------------------------------------------------------------
// SSE parser (same pattern as CasePlay / DrRioWidget)
// ---------------------------------------------------------------------------
async function* parseSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "message";
  let dataLines = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).replace(/\r$/, "");
      buffer = buffer.slice(newlineIdx + 1);
      if (line === "") {
        if (dataLines.length > 0) {
          const dataStr = dataLines.join("\n");
          try { yield { event: eventType, data: JSON.parse(dataStr) }; }
          catch { yield { event: eventType, data: { raw: dataStr } }; }
          eventType = "message";
          dataLines = [];
        }
      } else if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function StatValue({ value }) {
  if (value === null || value === undefined) return <Skeleton width="60%" height={26} />;
  return <span>{value}</span>;
}

function NavCard({ href, icon, title, body, badge }) {
  return (
    <Link
      href={href}
      className="card"
      style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none", color: "inherit" }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: "var(--bg-soft, #f1f5f9)",
        display: "grid", placeItems: "center", flexShrink: 0,
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

function JobStatusBadge({ status }) {
  if (status === "running")  return <span className="badge badge-warning">Running</span>;
  if (status === "done")     return <span className="badge badge-success">Done</span>;
  if (status === "failed")   return <span className="badge badge-danger">Failed</span>;
  return <span className="badge">Pending</span>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AdminPanel() {
  const toast = useToast();
  const [stats, setStats] = useState(null);

  const [studentAttempts, setStudentAttempts] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(null);
  const studentAttemptsPg = useUrlPaging({ initialPage: 1, initialPageSize: 25, prefix: "ua", enabled: false });

  // ── AI case generation state ─────────────────────────────────────────────
  const [genCount, setGenCount]       = useState(5);
  const [genLevel, setGenLevel]       = useState(3);
  const [genSpecialty, setGenSpecialty] = useState("");
  const [specialtyList, setSpecialtyList] = useState([]);
  const [showFallbackModal, setShowFallbackModal] = useState(false);

  // Active job tracker
  const [activeJob, setActiveJob] = useState(null); // { jobId, total, doneCount, failedCount, cases[], status }
  const abortRef = useRef(null); // AbortController for the SSE fetch

  // Recent jobs history
  const [recentJobs, setRecentJobs] = useState(null);
  const [jobsLoading, setJobsLoading] = useState(false);

  // ── Other state ──────────────────────────────────────────────────────────
  const [unseenLogs, setUnseenLogs] = useState({ count: 0, hasError: false });
  const [supportUnread, setSupportUnread] = useState(0);
  const [appliedApps, setAppliedApps] = useState({ items: [], total: 0, loading: true, error: null });

  // ── Loaders ──────────────────────────────────────────────────────────────
  function loadStats() {
    api.get("/api/admin/stats").then(setStats).catch(() => setStats({}));
  }

  function loadAppliedApps() {
    setAppliedApps((s) => ({ ...s, loading: true, error: null }));
    api.get("/api/admin/doctors/pending?page=1&pageSize=5")
      .then((r) => setAppliedApps({ items: r.items || r.doctors || [], total: r.total || 0, loading: false, error: null }))
      .catch((e) => setAppliedApps({ items: [], total: 0, loading: false, error: e?.message || "Could not load applications" }));
  }

  function loadActivity() {
    setActivityLoading(true);
    setActivityError(null);
    api.get("/api/admin/student-attempts?limit=200")
      .then((sa) => { setStudentAttempts(sa.users || []); setActivityLoading(false); })
      .catch((e) => { setActivityError(e?.message || "Could not load practice activity"); setActivityLoading(false); });
  }

  function loadSupportUnread() {
    api.get("/api/support/unread").then((r) => setSupportUnread(r.unread || 0)).catch(() => {});
  }

  function loadRecentJobs() {
    setJobsLoading(true);
    api.get("/api/admin/jobs?limit=10")
      .then((r) => { setRecentJobs(r.jobs || []); setJobsLoading(false); })
      .catch(() => { setRecentJobs([]); setJobsLoading(false); });
  }

  async function deleteJob(jobId) {
    try {
      await api.del(`/api/admin/jobs/${jobId}`);
      setRecentJobs((prev) => (prev || []).filter((j) => j.id !== jobId));
      toast.success("Job deleted");
    } catch (e) {
      toast.error(e.message || "Failed to delete job");
    }
  }

  async function cancelJobById(jobId) {
    try {
      await api.patch(`/api/admin/jobs/${jobId}/cancel`, {});
      setRecentJobs((prev) =>
        (prev || []).map((j) => j.id === jobId ? { ...j, status: "failed", error: "Cancelled by admin" } : j)
      );
      if (activeJob?.jobId === jobId) {
        setActiveJob((j) => j ? { ...j, status: "failed" } : j);
      }
      toast.success("Job cancelled");
    } catch (e) {
      toast.error(e.message || "Failed to cancel job");
    }
  }

  useEffect(() => {
    loadStats();
    loadActivity();
    loadAppliedApps();
    loadSupportUnread();
    loadRecentJobs();
    api.get("/api/cases/specialties")
      .then((r) => setSpecialtyList(r.specialties || []))
      .catch((e) => console.warn("Specialty list fetch failed:", e?.message || e));
    const iv = setInterval(loadSupportUnread, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    function onStatus(e) {
      const d = e.detail || {};
      setUnseenLogs({ count: d.count || 0, hasError: !!d.hasError });
    }
    window.addEventListener("admin:logs:status", onStatus);
    return () => window.removeEventListener("admin:logs:status", onStatus);
  }, []);

  // ── Case generation with live SSE progress ────────────────────────────────
  async function generateCases() {
    if (activeJob?.status === "running") return;
    // Groq is now primary — skip the model-selection modal and go straight to generation
    startGeneration(false);
  }

  async function startGeneration(allowFallback) {
    setShowFallbackModal(false);
    if (activeJob?.status === "running") return;

    // Abort any existing SSE fetch
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }

    let jobId;
    try {
      const r = await api.post("/api/admin/cases/generate", {
        count: genCount, level: genLevel, specialty: genSpecialty || null, allowFallback,
      });
      jobId = r.jobId;
    } catch (e) {
      toast.error(e.message);
      return;
    }

    // Initialise local job state
    setActiveJob({ jobId, total: genCount, doneCount: 0, failedCount: 0, cases: [], status: "running" });

    // Open SSE stream
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const token = getToken();
      const response = await fetch(apiUrl(`/api/admin/jobs/${jobId}/stream`), {
        method: "GET",
        credentials: "include",
        headers: {
          "Accept": "text/event-stream",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        signal: ctrl.signal,
      });

      if (!response.ok) throw new Error(`Job stream error (${response.status})`);

      for await (const { event, data } of parseSSE(response)) {
        if (event === "status") {
          // Initial snapshot from the server
          setActiveJob((j) => j ? {
            ...j,
            total: data.total ?? j.total,
            doneCount: data.done_count ?? j.doneCount,
            failedCount: data.failed_count ?? j.failedCount,
            status: data.status ?? j.status,
          } : j);
        } else if (event === "case_done") {
          setActiveJob((j) => j ? {
            ...j,
            doneCount: data.doneCount ?? j.doneCount,
            failedCount: data.failedCount ?? j.failedCount,
            cases: data.case ? [...j.cases, data.case] : j.cases,
          } : j);
        } else if (event === "case_failed") {
          setActiveJob((j) => j ? {
            ...j,
            doneCount: data.doneCount ?? j.doneCount,
            failedCount: data.failedCount ?? j.failedCount,
          } : j);
        } else if (event === "done") {
          setActiveJob((j) => j ? { ...j, status: "done" } : j);
          const ok = data.inserted?.length || 0;
          const fail = data.failedCount || 0;
          if (ok === 0) toast.error("AI generation failed — check server logs");
          else if (fail) toast.success(`Generated ${ok} of ${genCount} case${genCount !== 1 ? "s" : ""} (${fail} failed)`);
          else toast.success(`Generated ${ok} case${ok !== 1 ? "s" : ""} successfully`);
          loadStats();
          loadRecentJobs();
          break;
        } else if (event === "error") {
          setActiveJob((j) => j ? { ...j, status: "failed" } : j);
          toast.error(data.error || "Job failed");
          loadRecentJobs();
          break;
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setActiveJob((j) => j ? { ...j, status: "failed" } : j);
        toast.error(e.message);
      }
    } finally {
      abortRef.current = null;
    }
  }

  function dismissJob() {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setActiveJob(null);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const genBusy = activeJob?.status === "running";
  const pendingDoctorBadge = useMemo(() => stats?.pendingDoctors ?? null, [stats]);
  const openDeleteBadge    = useMemo(() => stats?.openDeleteRequests ?? null, [stats]);
  const openReportsBadge   = useMemo(() => stats?.openReports ?? null, [stats]);

  // ── Render ────────────────────────────────────────────────────────────────
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
            <Link href="/" className="btn btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Home size={16} strokeWidth={1.75} aria-hidden="true" /> Dashboard
            </Link>
            <Link href="/admin/logs" className="btn" style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FileText size={16} strokeWidth={1.75} aria-hidden="true" /> Server logs
              {unseenLogs.count > 0 && (
                <span title={`${unseenLogs.count} new log${unseenLogs.count > 1 ? "s" : ""}`} style={{
                  position: "absolute", top: -6, right: -6,
                  minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
                  background: unseenLogs.hasError ? "#dc2626" : "#d97706",
                  color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: "18px",
                  textAlign: "center", boxShadow: "0 0 0 2px var(--bg, #fff)",
                  animation: "pulseDot 1.6s ease-in-out infinite",
                }}>
                  {unseenLogs.count > 99 ? "99+" : unseenLogs.count}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Applied Applications */}
        <div className="spacer-7" />
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Stethoscope size={18} strokeWidth={1.75} aria-hidden="true" />
                Applied Applications
                <span className="muted small" style={{ marginLeft: 4 }}>({appliedApps.total})</span>
              </h3>
              <p className="muted small" style={{ marginTop: 4 }}>Most recent doctor applications awaiting review.</p>
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
                    {d.specialty && <span className="badge" style={{ fontSize: 11, flexShrink: 0 }}>{d.specialty}</span>}
                  </div>
                  <div className="muted small" style={{ marginTop: 4 }}>@{d.username} · {d.email}</div>
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

        {/* Quick links */}
        <div className="spacer-7" />
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <NavCard href="/admin/doctor-approvals" icon={<Stethoscope size={20} strokeWidth={1.75} aria-hidden="true" />} title="Doctor approvals" body="Review and approve applicants" badge={pendingDoctorBadge} />
          <NavCard href="/admin/delete-requests" icon={<FolderOpen size={20} strokeWidth={1.75} aria-hidden="true" />} title="Delete requests" body="Triage cases flagged for removal" badge={openDeleteBadge} />
          <NavCard href="/admin/practice-activity" icon={<BarChart3 size={20} strokeWidth={1.75} aria-hidden="true" />} title="Practice activity — by case" body="See which cases are being attempted" />
          <NavCard href="/admin/reports" icon={<Flag size={20} strokeWidth={1.75} aria-hidden="true" />} title="Reports" body="Review user-submitted reports on cases" badge={openReportsBadge} />
          <NavCard href="/admin/support" icon={<MessageSquare size={20} strokeWidth={1.75} aria-hidden="true" />} title="Doctor support chats" body="Reply to pending and rejected applicants" badge={supportUnread} />
          <NavCard href="/admin/all-users" icon={<Users size={20} strokeWidth={1.75} aria-hidden="true" />} title="All users" body="Manage student and doctor accounts" />
          <NavCard href="/admin/account-delete-requests" icon={<UserX size={20} strokeWidth={1.75} aria-hidden="true" />} title="Account deletion requests" body="Review requests from users to delete their accounts" />
          <NavCard href="/admin/cases" icon={<BookOpen size={20} strokeWidth={1.75} aria-hidden="true" />} title="Manage cases" body="Edit any case's details or attachments" />
          <NavCard href="/admin/mail" icon={<Mail size={20} strokeWidth={1.75} aria-hidden="true" />} title="Mail sender" body="Send an email directly to any registered user" />
          <NavCard href="/admin/contact-messages" icon={<Inbox size={20} strokeWidth={1.75} aria-hidden="true" />} title="Contact messages" body="View and manage contact form submissions" />
          <NavCard href="/admin/push" icon={<Bell size={20} strokeWidth={1.75} aria-hidden="true" />} title="Push notifications" body="Broadcast announcements to subscribed devices" />
          <NavCard href="/admin/digest" icon={<CalendarClock size={20} strokeWidth={1.75} aria-hidden="true" />} title="Weekly digest" body="Manage automated Monday email + push digest for students" />
          <NavCard href="/admin/ai-room" icon={<Cpu size={20} strokeWidth={1.75} aria-hidden="true" />} title="AI Room" body="Monitor, test, and toggle every AI used in the platform" />
        </div>

        {/* Practice activity — all users */}
        <div className="spacer-7" />
        <div className="card">
          <h3 style={{ margin: 0 }}>Practice activity — all users</h3>
          <p className="muted small" style={{ marginTop: 4 }}>Who is practicing the most — students and doctors.</p>
          <div className="spacer-7" />
          {activityLoading ? (
            <SkeletonRows n={6} avatar />
          ) : activityError ? (
            <ErrorState body={activityError} onRetry={loadActivity} />
          ) : studentAttempts.length === 0 ? (
            <EmptyState icon={<Users size={24} strokeWidth={1.75} aria-hidden="true" />} title="No learners active" body="Once people start practicing, you'll see them here." />
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
                        {u.role && <span className="badge" style={{ fontSize: 11, flexShrink: 0 }}>{u.role}</span>}
                      </div>
                      <div className="muted small" style={{ marginTop: 4 }}>@{u.username}</div>
                      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                        <div><div className="muted small">Attempts</div><div style={{ fontWeight: 700, fontSize: 18 }}>{u.attempts}</div></div>
                        <div><div className="muted small">Unique cases</div><div style={{ fontWeight: 700, fontSize: 18 }}>{u.unique_cases}</div></div>
                        <div>
                          <div className="muted small">Last attempt</div>
                          <div style={{ fontWeight: 600 }} title={u.last_attempt ? new Date(u.last_attempt).toLocaleString() : ""}>
                            {relativeTime(u.last_attempt) || "—"}
                          </div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        <Link href={`/u/${u.username}`} className="btn btn-ghost btn-sm"><UserIcon size={14} strokeWidth={1.75} aria-hidden="true" /> Profile</Link>
                        <Link href={`/messages/u/${u.username}`} className="btn btn-ghost btn-sm"><MessageSquare size={14} strokeWidth={1.75} aria-hidden="true" /> DM</Link>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="admin-table" style={{ overflowX: "auto" }}>
                  <table className="table table-sticky-first table-sticky-actions" style={{ width: "100%", fontSize: 13 }}>
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
                          <td><Link href={`/u/${u.username}`} className="clamp-2">{u.full_name || u.username}</Link></td>
                          <td>{u.role}</td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>{u.attempts}</td>
                          <td style={{ textAlign: "right" }}>{u.unique_cases}</td>
                          <td className="muted small" title={u.last_attempt ? new Date(u.last_attempt).toLocaleString() : ""}>{relativeTime(u.last_attempt) || "—"}</td>
                          <td>
                            <div className="row row-actions" style={{ justifyContent: "flex-end", gap: 4 }}>
                              <Link href={`/u/${u.username}`} className="icon-action" aria-label={`View profile of @${u.username}`} title="View profile"><UserIcon size={16} strokeWidth={1.75} aria-hidden="true" /></Link>
                              <Link href={`/messages/u/${u.username}`} className="icon-action" aria-label={`Open DM with @${u.username}`} title="Open DM"><MessageSquare size={16} strokeWidth={1.75} aria-hidden="true" /></Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={studentAttemptsPg.setPage} onPageSizeChange={studentAttemptsPg.setPageSize} />
              </>
            );
          })()}
        </div>

        {/* ── AI Generate cases ─────────────────────────────────────────── */}
        <div className="spacer-7" />
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Cpu size={18} strokeWidth={1.75} aria-hidden="true" />
                Generate cases with AI
              </h3>
              <p className="muted small" style={{ marginTop: 4 }}>
                Cases are generated in the background — you see each one appear as it's ready.
              </p>
            </div>
            {recentJobs !== null && (
              <button className="btn btn-ghost btn-sm" onClick={loadRecentJobs} disabled={jobsLoading}
                style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <RefreshCw size={14} style={jobsLoading ? { animation: "spin 1s linear infinite" } : {}} />
                Refresh history
              </button>
            )}
          </div>

          <div className="spacer-7" />

          {/* Controls */}
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
            <button className="btn btn-primary" onClick={generateCases} disabled={genBusy} style={{ height: 40, display: "flex", alignItems: "center", gap: 8 }}>
              {genBusy
                ? <><span className="spinner" /> Generating…</>
                : `Generate ${genCount} case${genCount === 1 ? "" : "s"}`}
            </button>
          </div>

          {/* Live job progress */}
          {activeJob && (
            <div style={{ marginTop: 20 }}>
              {/* Progress bar */}
              {(() => {
                const pct = activeJob.total > 0
                  ? Math.round(((activeJob.doneCount + activeJob.failedCount) / activeJob.total) * 100)
                  : 0;
                const isRunning = activeJob.status === "running";
                const isDone    = activeJob.status === "done";
                const isFailed  = activeJob.status === "failed";
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        {isRunning && `Generating… ${activeJob.doneCount + activeJob.failedCount} / ${activeJob.total}`}
                        {isDone    && `Done — ${activeJob.doneCount} generated${activeJob.failedCount ? `, ${activeJob.failedCount} failed` : ""}`}
                        {isFailed  && "Job failed — see server logs"}
                      </span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="muted small">{pct}%</span>
                        {!isRunning && (
                          <button className="btn btn-ghost btn-sm" onClick={dismissJob}>Dismiss</button>
                        )}
                      </div>
                    </div>
                    <div style={{
                      height: 8, borderRadius: 4,
                      background: "var(--bg-soft, #e2e8f0)",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${pct}%`,
                        borderRadius: 4,
                        background: isFailed ? "#dc2626" : isDone ? "#16a34a" : "var(--color-primary, #2563eb)",
                        transition: "width 0.4s ease",
                      }} />
                    </div>

                    {/* Case list as they come in */}
                    {activeJob.cases.length > 0 && (
                      <ul className="list-reset" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                        {activeJob.cases.map((c) => (
                          <li key={c.id} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 12px", borderRadius: 8,
                            background: "var(--bg-soft, #f8fafc)",
                            fontSize: 13,
                          }}>
                            <CheckCircle2 size={15} color="#16a34a" style={{ flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <Link href={`/case/${c.id}`} style={{ fontWeight: 600 }}>{c.title}</Link>
                              <span className="muted" style={{ marginLeft: 8 }}>{c.specialty}</span>
                            </span>
                          </li>
                        ))}
                        {activeJob.failedCount > 0 && (
                          <li style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 12px", borderRadius: 8,
                            background: "#fef2f2", fontSize: 13,
                          }}>
                            <XCircle size={15} color="#dc2626" style={{ flexShrink: 0 }} />
                            <span className="muted">{activeJob.failedCount} case{activeJob.failedCount > 1 ? "s" : ""} failed to generate</span>
                          </li>
                        )}
                      </ul>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Recent job history */}
          <div style={{ marginTop: activeJob ? 20 : 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: 14 }}>Recent generation jobs</h4>
            </div>
            {jobsLoading && recentJobs === null ? (
              <SkeletonRows n={3} avatar={false} />
            ) : !recentJobs || recentJobs.length === 0 ? (
              <p className="muted small">No jobs yet. Generate some cases to see history here.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {recentJobs.map((j) => {
                  const payload = j.payload || {};
                  const label = [
                    payload.count ? `${payload.count} case${payload.count > 1 ? "s" : ""}` : null,
                    payload.specialty || "mixed",
                    payload.level ? `L${payload.level}` : null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <div key={j.id} style={{
                      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                      padding: "8px 12px", borderRadius: 8,
                      background: "var(--bg-soft, #f8fafc)", fontSize: 13,
                    }}>
                      <div style={{ flexShrink: 0 }}>
                        {j.status === "done"    && <CheckCircle2 size={15} color="#16a34a" />}
                        {j.status === "running" && <Clock size={15} color="#d97706" style={{ animation: "spin 2s linear infinite" }} />}
                        {j.status === "failed"  && <XCircle size={15} color="#dc2626" />}
                        {j.status === "pending" && <Clock size={15} className="muted" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <span style={{ fontWeight: 600 }}>{label}</span>
                        {j.creator_name && <span className="muted" style={{ marginLeft: 8 }}>by {j.creator_name}</span>}
                      </div>
                      <div className="muted" style={{ flexShrink: 0 }}>
                        {j.done_count}/{j.total} done
                        {j.failed_count > 0 && <span style={{ color: "#dc2626", marginLeft: 6 }}>{j.failed_count} failed</span>}
                      </div>
                      <JobStatusBadge status={j.status} />
                      <span className="muted small" style={{ flexShrink: 0 }}>{relativeTime(j.created_at)}</span>
                      {j.status === "running" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Cancel job"
                          onClick={() => cancelJobById(j.id)}
                          style={{ padding: "2px 6px", color: "var(--danger, #dc2626)", flexShrink: 0, fontSize: 12 }}
                        >
                          Cancel
                        </button>
                      )}
                      {j.status !== "running" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Delete job"
                          onClick={() => deleteJob(j.id)}
                          style={{ padding: "2px 6px", color: "var(--danger, #dc2626)", flexShrink: 0 }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Groq fallback confirmation modal — portalled to body so fixed positioning is never clipped ── */}
      {showFallbackModal && createPortal(
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.45)", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 16,
        }}
          onClick={() => setShowFallbackModal(false)}
        >
          <div className="card" style={{
            maxWidth: 420, width: "100%", padding: 28,
            boxShadow: "0 8px 40px rgba(0,0,0,0.22)", borderRadius: 12,
          }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px" }}>Choose AI model</h3>
            <p className="muted small" style={{ margin: "0 0 20px", lineHeight: 1.6 }}>
              Cases are generated with <strong>Gemini</strong> by default.
              If Gemini hits its free-tier limit mid-job, should the system
              automatically switch to <strong>Groq</strong> to keep generating?
            </p>
            <div style={{ background: "var(--surface-2, #f5f5f5)", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13 }}>
              <div style={{ marginBottom: 6 }}>
                <strong>Gemini</strong> — higher clinical quality, 1,500 req/day free limit
              </div>
              <div>
                <strong>Groq</strong> — fast fallback, generous rate limits, slightly less detailed
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => startGeneration(true)}
              >
                Yes, switch to Groq if needed
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => startGeneration(false)}
              >
                No, Gemini only
              </button>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 12, width: "100%" }}
              onClick={() => setShowFallbackModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      , document.body)}
    </AppShell>
  );
}
