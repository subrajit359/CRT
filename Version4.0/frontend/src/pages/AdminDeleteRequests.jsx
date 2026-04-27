import { useEffect, useState } from "react";
import { Link } from "wouter";
import { FolderOpen, ArrowLeft } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Pagination from "../components/Pagination.jsx";
import { SkeletonRows } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import EditInsteadModal from "../components/EditInsteadModal.jsx";
import useUrlPaging from "../lib/usePaging.js";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const PAGE_SIZE = 10;

export default function AdminDeleteRequests() {
  const toast = useToast();
  const [confirmEl, askConfirm] = useConfirm();
  const [drs, setDrs] = useState({
    items: [], total: 0, totalPages: 1, loading: true, error: null,
  });
  const pg = useUrlPaging({ initialPage: 1, initialPageSize: PAGE_SIZE });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("open");
  const [editInsteadModal, setEditInsteadModal] = useState(null);

  function loadDrs(page = pg.page, query = q, st = status) {
    setDrs((p) => ({ ...p, loading: true, error: null }));
    const params = new URLSearchParams({ page, pageSize: PAGE_SIZE, status: st });
    if (query.trim()) params.set("q", query.trim());
    api.get(`/api/discussions/delete-requests?${params}`)
      .then((r) => setDrs({
        items: r.items || r.requests || [],
        total: r.total || 0,
        totalPages: r.totalPages || 1,
        loading: false,
        error: null,
      }))
      .catch((e) => setDrs({
        items: [], total: 0, totalPages: 1, loading: false,
        error: e?.message || "Could not load delete requests",
      }));
  }

  useEffect(() => {
    const t = setTimeout(() => loadDrs(pg.page, q, status), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [pg.page, q, status]);

  async function approve(request) {
    const ok = await askConfirm({
      title: "Delete this case?",
      body: <>This permanently hides <strong>"{request.case_title}"</strong> from learners. The requester will be notified.</>,
      confirmLabel: "Delete case",
      cancelLabel: "Keep case",
      tone: "danger",
      requireText: "DELETE",
    });
    if (!ok) return;
    try {
      await api.patch(`/api/admin/delete-requests/${request.id}`, { decision: "approved" });
      toast.success("Case deleted");
      loadDrs();
    } catch (e) { toast.error(e.message); }
  }
  async function reject(request) {
    const ok = await askConfirm({
      title: "Reject delete request?",
      body: <>Keep <strong>"{request.case_title}"</strong> in the library. The requester will be notified.</>,
      confirmLabel: "Reject request",
      cancelLabel: "Cancel",
      tone: "primary",
    });
    if (!ok) return;
    try {
      await api.patch(`/api/admin/delete-requests/${request.id}`, { decision: "rejected" });
      toast.success("Request rejected");
      loadDrs();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <AppShell>
      <div className="container fade-in">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <Link href="/admin" className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" /> Back to admin
            </Link>
            <h2 style={{ margin: 0 }}>Delete requests</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              Triage doctor-submitted requests to remove cases from the library.
            </p>
          </div>
        </div>

        <div className="spacer-7" />
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0 }}>
              Requests
              <span className="muted small" style={{ marginLeft: 8 }}>({drs.total})</span>
            </h3>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <select
                className="select"
                value={status}
                onChange={(e) => { setStatus(e.target.value); pg.setPage(1); }}
                style={{ width: 160 }}
              >
                <option value="open">Open only</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="edit_instead">Edited instead</option>
                <option value="all">All</option>
              </select>
              <input
                className="input"
                placeholder="Search case, requester, reason…"
                value={q}
                onChange={(e) => { setQ(e.target.value); pg.setPage(1); }}
                style={{ maxWidth: 280 }}
              />
            </div>
          </div>
          <div className="spacer-7" />
          {drs.loading && drs.items.length === 0 ? (
            <SkeletonRows n={4} avatar={false} />
          ) : drs.error ? (
            <ErrorState body={drs.error} onRetry={() => loadDrs(pg.page, q, status)} />
          ) : drs.items.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={24} strokeWidth={1.75} aria-hidden="true" />}
              title={q ? "No matches" : "Nothing to review"}
              body={q ? "No requests match your search." : `No ${status === "all" ? "" : status + " "}delete requests.`}
            />
          ) : (
            <>
              <div className="admin-cards">
                {drs.items.map((d) => {
                  const st = d.status || "open";
                  return (
                    <div key={d.id} className="admin-card-row">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <Link href={`/discussion/${d.case_id}?tab=delete-request&dr=${d.id}`} style={{ flex: 1, minWidth: 0 }}>
                          <strong className="clamp-2" style={{ display: "block" }}>{d.case_title || "Untitled case"}</strong>
                        </Link>
                        <span className={
                          "badge " + (
                            st === "open" ? "badge-warning" :
                            st === "approved" ? "badge-danger" :
                            st === "rejected" ? "badge-success" : ""
                          )
                        } style={{ fontSize: 11, flexShrink: 0 }}>{st}</span>
                      </div>
                      {d.specialty && (
                        <div className="muted small" style={{ marginTop: 4 }}>{d.specialty}</div>
                      )}
                      <div className="muted small" style={{ marginTop: 8 }}>
                        Requested by <Link href={`/u/${d.requester_username}`}>@{d.requester_username}</Link>
                      </div>
                      {d.reason && (
                        <div className="muted small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{d.reason}</div>
                      )}
                      <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        {st === "open" ? (
                          <>
                            <button className="btn btn-danger btn-sm" onClick={() => approve(d)}>Delete</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setEditInsteadModal({ request: d })}>Edit instead</button>
                            <Link href={`/upload?edit=${d.case_id}`} className="btn btn-ghost btn-sm">Open editor</Link>
                            <button className="btn btn-ghost btn-sm" onClick={() => reject(d)}>Reject</button>
                          </>
                        ) : (
                          <span className="muted small">resolved</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="admin-table" style={{ overflowX: "auto" }}>
                <table className="table table-sticky-first">
                  <thead><tr><th>Case</th><th>Specialty</th><th>Requester</th><th>Reason</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {drs.items.map((d) => (
                      <tr key={d.id}>
                        <td><Link href={`/discussion/${d.case_id}?tab=delete-request&dr=${d.id}`}><strong className="clamp-2">{d.case_title}</strong></Link></td>
                        <td>{d.specialty}</td>
                        <td><Link href={`/u/${d.requester_username}`}>@{d.requester_username}</Link></td>
                        <td className="muted small clamp-2" style={{ maxWidth: 320 }}>{d.reason}</td>
                        <td><span className="muted small">{d.status}</span></td>
                        <td>
                          {d.status === "open" ? (
                            <div className="row row-actions">
                              <button className="btn btn-danger btn-sm" onClick={() => approve(d)}>Delete</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setEditInsteadModal({ request: d })}>Edit instead</button>
                              <Link href={`/upload?edit=${d.case_id}`} className="btn btn-ghost btn-sm">Open editor</Link>
                              <button className="btn btn-ghost btn-sm" onClick={() => reject(d)}>Reject</button>
                            </div>
                          ) : (
                            <span className="muted small">resolved</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={pg.page} totalPages={drs.totalPages} total={drs.total} onChange={pg.setPage} />
            </>
          )}
        </div>
      </div>

      <EditInsteadModal
        open={!!editInsteadModal}
        request={editInsteadModal?.request}
        onClose={() => setEditInsteadModal(null)}
        onResolved={() => loadDrs()}
      />

      {confirmEl}
    </AppShell>
  );
}
