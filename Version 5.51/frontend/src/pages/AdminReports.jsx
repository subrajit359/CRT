import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Inbox, ArrowLeft } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Modal from "../components/Modal.jsx";
import Pagination from "../components/Pagination.jsx";
import { SkeletonRows } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import useUrlPaging from "../lib/usePaging.js";
import { relativeTime } from "../lib/date.js";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const PAGE_SIZE = 10;

export default function AdminReports() {
  const toast = useToast();

  const [reports, setReports] = useState({
    items: [], total: 0, totalPages: 1, loading: true, error: null,
  });
  const pg = useUrlPaging({ initialPage: 1, initialPageSize: PAGE_SIZE });
  const page = pg.page;
  const setPage = pg.setPage;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("open");

  const [reportNoteModal, setReportNoteModal] = useState(null);

  function loadReports(p = page, query = q, st = status) {
    setReports((prev) => ({ ...prev, loading: true, error: null }));
    const params = new URLSearchParams({ page: p, pageSize: PAGE_SIZE, status: st });
    if (query.trim()) params.set("q", query.trim());
    api.get(`/api/admin/reports?${params}`)
      .then((r) => setReports({
        items: r.items || r.reports || [],
        total: r.total || 0,
        totalPages: r.totalPages || 1,
        loading: false,
        error: null,
      }))
      .catch((e) => setReports({
        items: [], total: 0, totalPages: 1, loading: false,
        error: e?.message || "Could not load reports",
      }));
  }

  useEffect(() => {
    const t = setTimeout(() => loadReports(page, q, status), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [page, q, status]);

  function openReportAction(report, st) {
    setReportNoteModal({ report, status: st, note: "" });
  }
  async function submitReportAction() {
    const { report, status: st, note } = reportNoteModal;
    try {
      await api.patch(`/api/admin/reports/${report.id}`, { status: st, note: note.trim() });
      toast.success(
        st === "actioned" ? "Marked as actioned" :
        st === "dismissed" ? "Report dismissed" :
        "Report re-opened"
      );
      setReportNoteModal(null);
      loadReports();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <AppShell>
      <div className="container fade-in">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <Link href="/admin" className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" /> Back to admin
            </Link>
            <h2 style={{ margin: 0 }}>Reports</h2>
            <p className="muted" style={{ marginTop: 4 }}>Review user-submitted reports on cases.</p>
          </div>
        </div>

        <div className="spacer-7" />
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0 }}>All reports</h3>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <select
                className="select"
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                style={{ width: 160 }}
              >
                <option value="open">Open only</option>
                <option value="actioned">Actioned</option>
                <option value="dismissed">Dismissed</option>
                <option value="all">All</option>
              </select>
              <input
                className="input"
                placeholder="Search case, reporter, reason…"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                style={{ maxWidth: 280 }}
              />
            </div>
          </div>
          <div className="spacer-7" />
          {reports.loading && reports.items.length === 0 ? (
            <SkeletonRows n={6} avatar={false} />
          ) : reports.error ? (
            <ErrorState body={reports.error} onRetry={() => loadReports(page, q, status)} />
          ) : reports.items.length === 0 ? (
            <EmptyState
              icon={<Inbox size={24} strokeWidth={1.75} aria-hidden="true" />}
              title={q ? "No matches" : "No reports to review"}
              body={q ? "No reports match your search." : `No ${status === "all" ? "" : status + " "}reports right now.`}
            />
          ) : (
            <>
              <div className="admin-cards">
                {reports.items.map((r) => {
                  const st = r.status || "open";
                  return (
                    <div key={r.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <Link href={`/case/${r.case_id}`} style={{ flex: 1, minWidth: 0 }}>
                          <strong className="clamp-2" style={{ display: "block" }}>{r.title || "Untitled case"}</strong>
                        </Link>
                        <span className={
                          "badge " + (
                            st === "open" ? "badge-warning" :
                            st === "actioned" ? "badge-success" : ""
                          )
                        } style={{ fontSize: 11, flexShrink: 0 }}>{st}</span>
                      </div>
                      {r.specialty && (
                        <div className="muted small" style={{ marginTop: 4 }}>{r.specialty}</div>
                      )}
                      <div className="muted small" style={{ marginTop: 8 }}>
                        Reported by <Link href={`/u/${r.username}`}>@{r.username}</Link>
                        {" · "}
                        <span title={r.created_at ? new Date(r.created_at).toLocaleString() : ""}>{relativeTime(r.created_at)}</span>
                      </div>
                      {r.reason && (
                        <div className="muted small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{r.reason}</div>
                      )}
                      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        {st === "open" ? (
                          <>
                            <button className="btn btn-primary btn-sm" onClick={() => openReportAction(r, "actioned")}>Mark actioned</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openReportAction(r, "dismissed")}>Dismiss</button>
                          </>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => openReportAction(r, "open")}>Re-open</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="admin-table" style={{ overflowX: "auto" }}>
                <table className="table table-sticky-first table-sticky-actions" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 220 }}>Case</th>
                      <th style={{ minWidth: 140 }}>Specialty</th>
                      <th style={{ minWidth: 120 }}>Reporter</th>
                      <th>Reason</th>
                      <th style={{ minWidth: 100 }}>Status</th>
                      <th style={{ minWidth: 110 }}>When</th>
                      <th style={{ width: 1, whiteSpace: "nowrap" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.items.map((r) => {
                      const st = r.status || "open";
                      return (
                        <tr key={r.id}>
                          <td>
                            <Link href={`/case/${r.case_id}`}>
                              <strong className="clamp-2">{r.title || "Untitled case"}</strong>
                            </Link>
                          </td>
                          <td>{r.specialty ? <span className="muted small">{r.specialty}</span> : <span className="muted small">—</span>}</td>
                          <td><Link href={`/u/${r.username}`}>@{r.username}</Link></td>
                          <td className="muted small clamp-2" style={{ maxWidth: 360 }}>{r.reason}</td>
                          <td>
                            <span className={
                              "badge " + (
                                st === "open" ? "badge-warning" :
                                st === "actioned" ? "badge-success" :
                                ""
                              )
                            } style={{ fontSize: 11 }}>{st}</span>
                          </td>
                          <td className="muted small" title={r.created_at ? new Date(r.created_at).toLocaleString() : ""}>{relativeTime(r.created_at)}</td>
                          <td>
                            {st === "open" ? (
                              <div className="row row-actions" style={{ flexWrap: "nowrap" }}>
                                <button className="btn btn-primary btn-sm" onClick={() => openReportAction(r, "actioned")}>Mark actioned</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => openReportAction(r, "dismissed")}>Dismiss</button>
                              </div>
                            ) : (
                              <button className="btn btn-ghost btn-sm" onClick={() => openReportAction(r, "open")}>Re-open</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} totalPages={reports.totalPages} total={reports.total} onChange={setPage} />
            </>
          )}
        </div>
      </div>

      {/* ----- Report action modal ----- */}
      <Modal
        open={!!reportNoteModal}
        onClose={() => setReportNoteModal(null)}
        title={
          reportNoteModal?.status === "actioned" ? "Mark report as actioned" :
          reportNoteModal?.status === "dismissed" ? "Dismiss report" :
          "Re-open report"
        }
      >
        {reportNoteModal && (
          <div>
            <p className="muted small" style={{ marginTop: 0 }}>
              <strong>Report:</strong> {reportNoteModal.report.title || "Untitled case"}
              <br />
              <em>{reportNoteModal.report.reason}</em>
            </p>
            <label className="label">Note (optional, for internal records)</label>
            <textarea
              className="input"
              rows={3}
              value={reportNoteModal.note}
              onChange={(e) => setReportNoteModal({ ...reportNoteModal, note: e.target.value })}
              placeholder="What did you do? e.g. 'Edited the case to remove the inaccurate dose.'"
              style={{ width: "100%", resize: "vertical" }}
              autoFocus
            />
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setReportNoteModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitReportAction}>Save</button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
