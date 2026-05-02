import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Search, MoreVertical, ShieldOff, Shield, AlertTriangle, Trash2, UserX, Users,
} from "lucide-react";
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

function fmtBan(banUntil) {
  if (!banUntil) return null;
  const d = new Date(banUntil);
  if (d.getFullYear() >= 9999) return "Permanently banned";
  if (d < new Date()) return null;
  return `Banned until ${d.toLocaleDateString()}`;
}

function DoctorStatusBadge({ status }) {
  if (!status) return null;
  const map = {
    approved: { label: "Approved", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
    pending:  { label: "Pending approval", color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
    rejected: { label: "Rejected", color: "#b91c1c", bg: "#fff1f2", border: "#fecdd3" },
  };
  const s = map[status] || { label: status, color: "var(--text-soft)", bg: "var(--bg-soft)", border: "var(--line)" };
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 7px",
      borderRadius: 99, border: `1px solid ${s.border}`,
      background: s.bg, color: s.color, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

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

function ThreeDotMenu({ user, onBan, onUnban, onWarn, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isBanned = user.ban_until && new Date(user.ban_until) > new Date();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="icon-action"
        title="User actions"
        onClick={() => setOpen((v) => !v)}
        aria-label="User actions"
      >
        <MoreVertical size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div
          style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 300,
            background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.14)", minWidth: 200,
            animation: "fadeIn 120ms ease",
            overflow: "hidden",
          }}
        >
          {isBanned ? (
            <button className="dropdown-item" onClick={() => { setOpen(false); onUnban(user); }}>
              <Shield size={15} strokeWidth={1.75} aria-hidden="true" /> Unban account
            </button>
          ) : (
            <button className="dropdown-item" onClick={() => { setOpen(false); onBan(user); }}>
              <ShieldOff size={15} strokeWidth={1.75} aria-hidden="true" /> Ban account
            </button>
          )}
          <button className="dropdown-item" onClick={() => { setOpen(false); onWarn(user); }}>
            <AlertTriangle size={15} strokeWidth={1.75} aria-hidden="true" /> Send warning / message
          </button>
          <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
          <button className="dropdown-item is-danger" onClick={() => { setOpen(false); onDelete(user); }}>
            <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" /> Delete account
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminAllUsers() {
  const toast = useToast();
  const [confirmEl, askConfirm] = useConfirm();
  const pg = useUrlPaging({ initialPage: 1, initialPageSize: 25, enabled: false });
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");

  // Ban modal
  const [banTarget, setBanTarget] = useState(null);
  const [banDays, setBanDays] = useState("7");
  const [banPermanent, setBanPermanent] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [banBusy, setBanBusy] = useState(false);

  // Warn modal
  const [warnTarget, setWarnTarget] = useState(null);
  const [warnTitle, setWarnTitle] = useState("");
  const [warnMsg, setWarnMsg] = useState("");
  const [warnBusy, setWarnBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(pg.page),
      pageSize: String(pg.pageSize),
      role,
      ...(q ? { q } : {}),
    });
    api.get(`/api/admin/all-users?${params}`)
      .then((r) => {
        setUsers(r.users || []);
        setTotal(r.total || 0);
        setTotalPages(r.totalPages || 1);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [pg.page, pg.pageSize, q, role]);

  useEffect(() => { load(); }, [load]);

  async function handleUnban(u) {
    const ok = await askConfirm({
      title: "Unban this user?",
      body: <>Remove the suspension for <strong>{u.full_name || u.username}</strong>?</>,
      confirmLabel: "Yes, unban",
      tone: "primary",
    });
    if (!ok) return;
    try {
      await api.post(`/api/admin/users/${u.id}/unban`, {});
      toast.success("User unbanned");
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function handleBan() {
    if (!banTarget) return;
    setBanBusy(true);
    try {
      await api.post(`/api/admin/users/${banTarget.id}/ban`, {
        permanent: banPermanent,
        duration_days: banPermanent ? 0 : parseInt(banDays || "1", 10),
        reason: banReason.trim() || undefined,
      });
      toast.success("User banned");
      setBanTarget(null); setBanDays("7"); setBanPermanent(false); setBanReason("");
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBanBusy(false); }
  }

  async function handleWarn() {
    if (!warnTarget || !warnMsg.trim()) return;
    setWarnBusy(true);
    try {
      await api.post(`/api/admin/users/${warnTarget.id}/warn`, {
        title: warnTitle.trim() || "Message from admin",
        message: warnMsg.trim(),
      });
      toast.success("Message sent");
      setWarnTarget(null); setWarnTitle(""); setWarnMsg("");
    } catch (e) { toast.error(e.message); }
    finally { setWarnBusy(false); }
  }

  async function handleDelete(u) {
    const ok = await askConfirm({
      title: "Delete this account?",
      body: <>This permanently deletes <strong>{u.full_name || u.username}</strong>'s account and all their data. This action cannot be undone.</>,
      confirmLabel: "Delete permanently",
      cancelLabel: "Cancel",
      tone: "danger",
      requireText: "DELETE",
    });
    if (!ok) return;
    try {
      await api.del(`/api/admin/users/${u.id}`);
      toast.success("Account deleted");
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <AppShell>
      <div className="container fade-in">
        <div>
          <Link href="/admin" className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" /> Back to admin
          </Link>
          <h2 style={{ margin: 0 }}>All users</h2>
          <p className="muted" style={{ marginTop: 4 }}>Manage student and doctor accounts.</p>
        </div>

        <div className="spacer-7" />

        <div className="card">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <Search size={14} strokeWidth={1.75} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.45, pointerEvents: "none" }} aria-hidden="true" />
              <input
                className="input"
                style={{ paddingLeft: 32, width: "100%" }}
                placeholder="Search by name, username, email…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="row" style={{ gap: 6 }}>
              {["all", "student", "doctor"].map((r) => (
                <button
                  key={r}
                  className={`btn btn-sm ${role === r ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setRole(r)}
                >
                  {r === "all" ? "All" : r.charAt(0).toUpperCase() + r.slice(1) + "s"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <SkeletonRows n={8} avatar />
          ) : error ? (
            <ErrorState body={error} onRetry={load} />
          ) : users.length === 0 ? (
            <EmptyState
              icon={<Users size={24} strokeWidth={1.75} aria-hidden="true" />}
              title="No users found"
              body="Try adjusting the search or filter."
            />
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table className="table table-sticky-first table-sticky-actions" style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>User</th>
                      <th style={{ textAlign: "left" }}>Role</th>
                      <th style={{ textAlign: "right" }}>Attempts</th>
                      <th style={{ textAlign: "left" }}>Last active</th>
                      <th style={{ textAlign: "left" }}>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const banLabel = fmtBan(u.ban_until);
                      return (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <Avatar url={u.avatar_url} name={u.full_name || u.username} size={32} />
                              <div>
                                <Link href={`/u/${u.username}`} style={{ fontWeight: 600 }}>{u.full_name || u.username}</Link>
                                <div className="muted small">@{u.username}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                              <span className={`badge ${u.role === "doctor" ? "badge-success" : ""}`}>{u.role}</span>
                              {u.role === "doctor" && <DoctorStatusBadge status={u.doctor_status} />}
                            </div>
                          </td>
                          <td style={{ textAlign: "right" }}>{u.attempts ?? 0}</td>
                          <td className="muted small">{relativeTime(u.last_attempt || u.last_login) || "—"}</td>
                          <td>
                            {banLabel
                              ? <span className="badge badge-danger" style={{ fontSize: 11 }}>{banLabel}</span>
                              : <span className="badge" style={{ fontSize: 11, background: "var(--bg-soft)" }}>Active</span>
                            }
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <ThreeDotMenu
                              user={u}
                              onBan={(target) => { setBanTarget(target); setBanDays("7"); setBanPermanent(false); setBanReason(""); }}
                              onUnban={handleUnban}
                              onWarn={(target) => { setWarnTarget(target); setWarnMsg(""); }}
                              onDelete={handleDelete}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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

      {banTarget && (
        <Modal title={`Ban ${banTarget.full_name || banTarget.username}`} onClose={() => setBanTarget(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={banPermanent} onChange={(e) => setBanPermanent(e.target.checked)} />
              <span>Permanent ban</span>
            </label>
            {!banPermanent && (
              <div>
                <label className="label" style={{ marginBottom: 6 }}>Duration (days)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={3650}
                  value={banDays}
                  onChange={(e) => setBanDays(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            )}
            <div>
              <label className="label" style={{ marginBottom: 6 }}>Reason (optional — shown to user)</label>
              <textarea
                className="textarea"
                rows={3}
                placeholder="Explain the reason for this ban…"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setBanTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleBan} disabled={banBusy}>
                {banBusy ? <span className="spinner" /> : "Ban user"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {warnTarget && (
        <Modal
          open
          title={`Message to ${warnTarget.full_name || warnTarget.username}`}
          onClose={() => { setWarnTarget(null); setWarnTitle(""); setWarnMsg(""); }}
          width={520}
        >
          <p className="muted small" style={{ margin: "0 0 12px" }}>
            This will pop up center-screen on the user's next page load and stay in
            their notifications until they dismiss it.
          </p>
          <div className="field">
            <label className="label">Title</label>
            <input
              className="input"
              autoFocus
              placeholder="e.g. Account warning"
              value={warnTitle}
              onChange={(e) => setWarnTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Description</label>
            <textarea
              className="textarea"
              rows={5}
              placeholder="What do you want to tell this user?"
              value={warnMsg}
              onChange={(e) => setWarnMsg(e.target.value)}
            />
          </div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button
              className="btn btn-ghost"
              onClick={() => { setWarnTarget(null); setWarnTitle(""); setWarnMsg(""); }}
            >Cancel</button>
            <button className="btn btn-primary" onClick={handleWarn} disabled={warnBusy || !warnMsg.trim()}>
              {warnBusy ? <span className="spinner" /> : "Send message"}
            </button>
          </div>
        </Modal>
      )}

      {confirmEl}
    </AppShell>
  );
}
