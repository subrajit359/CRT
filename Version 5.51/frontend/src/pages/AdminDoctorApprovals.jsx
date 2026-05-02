import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Stethoscope, ArrowLeft } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Modal from "../components/Modal.jsx";
import Pagination from "../components/Pagination.jsx";
import { SkeletonRows } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import useUrlPaging from "../lib/usePaging.js";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const PAGE_SIZE = 10;

export default function AdminDoctorApprovals() {
  const toast = useToast();
  const [pending, setPending] = useState({
    items: [], total: 0, totalPages: 1, loading: true, error: null,
  });
  const pg = useUrlPaging({ initialPage: 1, initialPageSize: PAGE_SIZE });
  const [q, setQ] = useState("");
  const [doctorModal, setDoctorModal] = useState(null);

  function loadPending(page = pg.page, query = q) {
    setPending((p) => ({ ...p, loading: true, error: null }));
    const params = new URLSearchParams({ page, pageSize: PAGE_SIZE });
    if (query.trim()) params.set("q", query.trim());
    api.get(`/api/admin/doctors/pending?${params}`)
      .then((r) => setPending({
        items: r.items || r.doctors || [],
        total: r.total || 0,
        totalPages: r.totalPages || 1,
        loading: false,
        error: null,
      }))
      .catch((e) => setPending({
        items: [], total: 0, totalPages: 1, loading: false,
        error: e?.message || "Could not load doctor approvals",
      }));
  }

  useEffect(() => {
    const t = setTimeout(() => loadPending(pg.page, q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [pg.page, q]);

  function openDoctorModal(doctor, action) {
    setDoctorModal({ doctor, action, note: "" });
  }
  async function submitDoctorDecision() {
    const { doctor, action, note } = doctorModal;
    if (action === "reject" && !note.trim()) {
      toast.error("Please provide a reason for rejecting this applicant.");
      return;
    }
    try {
      await api.patch(`/api/admin/doctors/${doctor.id}/${action}`, { note: note.trim() });
      toast.success(action === "approve" ? "Doctor approved" : "Application rejected");
      setDoctorModal(null);
      loadPending();
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
            <h2 style={{ margin: 0 }}>Doctor approvals</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              Review applicants and approve or reject access to verify cases.
            </p>
          </div>
        </div>

        <div className="spacer-7" />
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0 }}>
              Pending applications
              <span className="muted small" style={{ marginLeft: 8 }}>({pending.total})</span>
            </h3>
            <input
              className="input"
              placeholder="Search name, email, license, hospital…"
              value={q}
              onChange={(e) => { setQ(e.target.value); pg.setPage(1); }}
              style={{ maxWidth: 320 }}
            />
          </div>
          <div className="spacer-7" />
          {pending.loading && pending.items.length === 0 ? (
            <SkeletonRows n={4} avatar={false} />
          ) : pending.error ? (
            <ErrorState body={pending.error} onRetry={() => loadPending(pg.page, q)} />
          ) : pending.items.length === 0 ? (
            <EmptyState
              icon={<Stethoscope size={24} strokeWidth={1.75} aria-hidden="true" />}
              title={q ? "No matches" : "Inbox zero"}
              body={q ? "No applications match your search." : "No pending doctor applications. You're all caught up."}
            />
          ) : (
            <>
              <div className="admin-cards">
                {pending.items.map((d) => (
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
                      <strong>License:</strong> {d.license_number || "—"}
                      {d.years_exp ? <> · {d.years_exp}y experience</> : null}
                    </div>
                    {d.hospital && (
                      <div className="muted small" style={{ marginTop: 4 }}>
                        <strong>Hospital:</strong> {d.hospital}
                      </div>
                    )}
                    {d.proof_text && (
                      <div className="muted small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                        <strong>Proof:</strong> {d.proof_text}
                      </div>
                    )}
                    <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <button className="btn btn-primary btn-sm" onClick={() => openDoctorModal(d, "approve")}>Approve</button>
                      <button className="btn btn-danger btn-sm" onClick={() => openDoctorModal(d, "reject")}>Reject</button>
                      <Link href={`/messages/u/${d.username}`} className="btn btn-ghost btn-sm" title="Send a message">DM</Link>
                    </div>
                  </div>
                ))}
              </div>
              <div className="admin-table" style={{ overflowX: "auto" }}>
                <table className="table table-sticky-first table-sticky-actions">
                  <thead><tr><th>Name</th><th>Specialty</th><th>License</th><th>Hospital</th><th>Proof</th><th></th></tr></thead>
                  <tbody>
                    {pending.items.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <Link href={`/u/${d.username}`}><strong className="clamp-2">{d.full_name}</strong></Link>
                          <div className="muted small">@{d.username} · {d.email}</div>
                        </td>
                        <td>{d.specialty}<div className="muted small">{d.years_exp || 0}y</div></td>
                        <td>{d.license_number}</td>
                        <td>{d.hospital || "—"}</td>
                        <td className="muted small clamp-2" style={{ maxWidth: 280 }}>{d.proof_text || "—"}</td>
                        <td>
                          <div className="row row-actions">
                            <button className="btn btn-primary btn-sm" onClick={() => openDoctorModal(d, "approve")}>Approve</button>
                            <button className="btn btn-danger btn-sm" onClick={() => openDoctorModal(d, "reject")}>Reject</button>
                            <Link href={`/messages/u/${d.username}`} className="btn btn-ghost btn-sm" title="Send a message">DM</Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={pg.page} totalPages={pending.totalPages} total={pending.total} onChange={pg.setPage} />
            </>
          )}
        </div>
      </div>

      <Modal
        open={!!doctorModal}
        onClose={() => setDoctorModal(null)}
        title={doctorModal?.action === "approve" ? "Approve doctor" : "Reject doctor"}
      >
        {doctorModal && (
          <div>
            <p className="muted small" style={{ marginTop: 0 }}>
              {doctorModal.action === "approve"
                ? `Approving ${doctorModal.doctor.full_name}. They will be able to log in and verify cases.`
                : `Rejecting ${doctorModal.doctor.full_name}. They will be notified with the reason below.`}
            </p>
            <label className="label">
              {doctorModal.action === "reject" ? "Reason (required)" : "Note to applicant (optional)"}
            </label>
            <textarea
              className="input"
              rows={4}
              value={doctorModal.note}
              onChange={(e) => setDoctorModal({ ...doctorModal, note: e.target.value })}
              placeholder={doctorModal.action === "reject"
                ? "Explain why this application is being rejected…"
                : "Optional welcome message or onboarding note…"}
              style={{ width: "100%", resize: "vertical" }}
              autoFocus
            />
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setDoctorModal(null)}>Cancel</button>
              <button
                className={doctorModal.action === "approve" ? "btn btn-primary" : "btn btn-danger"}
                onClick={submitDoctorDecision}
              >
                {doctorModal.action === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
