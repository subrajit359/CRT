import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { ArrowLeft, UserX } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import Pagination from "../components/Pagination.jsx";
import { SkeletonRows } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import useUrlPaging from "../lib/usePaging.js";
import { relativeTime } from "../lib/date.js";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(17,20,26,0.55)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 480, animation: "fadeIn 180ms ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px" }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function AdminAccountDeleteRequests() {
  const toast = useToast();
  const [confirmEl, askConfirm] = useConfirm();
  const pg = useUrlPaging({ initialPage: 1, initialPageSize: 20, enabled: false });
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending");

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(pg.page),
      pageSize: String(pg.pageSize),
      status: statusFilter,
    });
    api.get(`/api/admin/account-delete-requests?${params}`)
      .then((r) => {
        setRequests(r.requests || []);
        setTotal(r.total || 0);
        setTotalPages(r.totalPages || 1);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [pg.page, pg.pageSize, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(req) {
    const ok = await askConfirm({
      title: "Delete this account?",
      body: <>This will permanently delete <strong>{req.full_name || req.username}</strong>'s account. This cannot be undone.</>,
      confirmLabel: "Yes, delete account",
      tone: "danger",
      requireText: "DELETE",
    });
    if (!ok) return;
    try {
      await api.patch(`/api/admin/account-delete-requests/${req.id}`, { decision: "approved" });
      toast.success("Account deleted");
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setRejectBusy(true);
    try {
      await api.patch(`/api/admin/account-delete-requests/${rejectTarget.id}`, {
        decision: "rejected",
        admin_note: rejectNote.trim() || undefined,
      });
      toast.success("Request rejected");
      setRejectTarget(null); setRejectNote("");
      load();
    } catch (e) { toast.error(e.message); }
    finally { setRejectBusy(false); }
  }

  return (
    <AppShell>
      <div className="container fade-in">
        <div>
          <Link href="/admin" className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" /> Back to admin
          </Link>
          <h2 style={{ margin: 0 }}>Account deletion requests</h2>
          <p className="muted" style={{ marginTop: 4 }}>Users who have requested their accounts to be deleted.</p>
        </div>

        <div className="spacer-7" />

        <div className="card">
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {["pending", "approved", "rejected", "all"].map((s) => (
              <button
                key={s}
                className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setStatusFilter(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <SkeletonRows n={5} avatar />
          ) : error ? (
            <ErrorState body={error} onRetry={load} />
          ) : requests.length === 0 ? (
            <EmptyState
              icon={<UserX size={24} strokeWidth={1.75} aria-hidden="true" />}
              title="No requests"
              body="No account deletion requests in this category."
            />
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {requests.map((r) => (
                  <div
                    key={r.id}
                    className="card"
                    style={{ padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}
                  >
                    <Avatar url={r.avatar_url} name={r.full_name || r.username} size={40} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Link href={`/u/${r.username}`} style={{ fontWeight: 600 }}>{r.full_name || r.username}</Link>
                        <span className="muted small">@{r.username}</span>
                        <span className={`badge ${r.role === "doctor" ? "badge-success" : ""}`}>{r.role}</span>
                        <span className={`badge ${r.status === "pending" ? "badge-warning" : r.status === "approved" ? "badge-danger" : ""}`}>
                          {r.status}
                        </span>
                        <span className="muted small" style={{ marginLeft: "auto" }}>{relativeTime(r.created_at)}</span>
                      </div>
                      {r.reason && (
                        <div className="muted small" style={{ marginTop: 6, padding: "8px 10px", background: "var(--bg-soft)", borderRadius: 7 }}>
                          <strong>Reason:</strong> {r.reason}
                        </div>
                      )}
                      {r.admin_note && (
                        <div className="muted small" style={{ marginTop: 6 }}>
                          <strong>Admin note:</strong> {r.admin_note}
                        </div>
                      )}
                    </div>
                    {r.status === "pending" && (
                      <div className="row" style={{ gap: 8, flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setRejectTarget(r); setRejectNote(""); }}>
                          Reject
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleApprove(r)}>
                          Delete account
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Pagination
                page={pg.page}
                totalPages={totalPages}
                total={total}
                pageSize={pg.pageSize}
                onChange={pg.setPage}
                onPageSizeChange={pg.setPageSize}
              />
            </>
          )}
        </div>
      </div>

      {rejectTarget && (
        <Modal title="Reject deletion request" onClose={() => setRejectTarget(null)}>
          <p className="muted small" style={{ margin: "0 0 12px" }}>
            Optionally include a note explaining why the request is declined. It will be sent to the user as a notification.
          </p>
          <textarea
            className="textarea"
            rows={3}
            autoFocus
            placeholder="Admin note (optional)…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button className="btn btn-ghost" onClick={() => setRejectTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleReject} disabled={rejectBusy}>
              {rejectBusy ? <span className="spinner" /> : "Reject request"}
            </button>
          </div>
        </Modal>
      )}

      {confirmEl}
    </AppShell>
  );
}
