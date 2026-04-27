import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BarChart3, Eye, Edit3, Trash2, MessageSquare, ArrowLeft } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Pagination from "../components/Pagination.jsx";
import { SkeletonRows } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import useUrlPaging from "../lib/usePaging.js";
import { relativeTime } from "../lib/date.js";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

export default function AdminPracticeActivity() {
  const toast = useToast();
  const [confirmEl, askConfirm] = useConfirm();
  const [caseAttempts, setCaseAttempts] = useState([]);
  const [sort, setSort] = useState("most");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pg = useUrlPaging({ initialPage: 1, initialPageSize: 25, enabled: false });

  function load() {
    setLoading(true);
    setError(null);
    api.get(`/api/admin/case-attempts?limit=200&sort=${sort === "least" ? "least" : "most"}`)
      .then((r) => {
        setCaseAttempts(r.cases || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e?.message || "Could not load practice activity");
        setLoading(false);
      });
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sort]);

  async function deleteCase(c) {
    const ok = await askConfirm({
      title: "Delete this case?",
      body: <>This permanently hides <strong>"{c.title || `Case #${c.id}`}"</strong> from learners. Their attempt history is preserved.</>,
      confirmLabel: "Delete case",
      cancelLabel: "Cancel",
      tone: "danger",
      requireText: "DELETE",
    });
    if (!ok) return;
    try {
      await api.del(`/api/admin/cases/${c.id}`);
      toast.success("Case deleted");
      load();
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
            <h2 style={{ margin: 0 }}>Practice activity — by case</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              How many times each case has been attempted, and by how many distinct learners.
            </p>
          </div>
        </div>

        <div className="spacer-7" />
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0 }}>
              Cases
              <span className="muted small" style={{ marginLeft: 8 }}>({caseAttempts.length})</span>
            </h3>
            <div className="row" style={{ gap: 6 }}>
              <button className={`btn btn-sm ${sort === "most" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSort("most")}>Most attempted</button>
              <button className={`btn btn-sm ${sort === "least" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSort("least")}>Least attempted</button>
            </div>
          </div>
          <div className="spacer-7" />
          {loading ? (
            <SkeletonRows n={6} avatar={false} />
          ) : error ? (
            <ErrorState body={error} onRetry={load} />
          ) : caseAttempts.length === 0 ? (
            <EmptyState
              icon={<BarChart3 size={24} strokeWidth={1.75} aria-hidden="true" />}
              title="No attempts yet"
              body="Once learners start practicing, you'll see usage here."
            />
          ) : (() => {
            const total = caseAttempts.length;
            const pageSize = pg.pageSize;
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const page = Math.min(pg.page, totalPages);
            const start = (page - 1) * pageSize;
            const slice = caseAttempts.slice(start, start + pageSize);
            return (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table className="table table-sticky-first" style={{ width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Case</th>
                        <th style={{ textAlign: "left" }}>Specialty</th>
                        <th style={{ textAlign: "center" }}>Lvl</th>
                        <th style={{ textAlign: "right" }}>Attempts</th>
                        <th style={{ textAlign: "right" }}>Unique learners</th>
                        <th style={{ textAlign: "left" }}>Last attempt</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <Link href={`/case/${c.id}`} className="clamp-2">{c.title || `Case #${c.id}`}</Link>
                          </td>
                          <td>{c.specialty || "—"}</td>
                          <td style={{ textAlign: "center" }}>{c.level ?? "—"}</td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>{c.attempts}</td>
                          <td style={{ textAlign: "right" }}>{c.unique_students}</td>
                          <td className="muted small" title={c.last_attempt ? new Date(c.last_attempt).toLocaleString() : ""}>{relativeTime(c.last_attempt) || "—"}</td>
                          <td>
                            <div className="row row-actions" style={{ justifyContent: "flex-end", gap: 4 }}>
                              <Link href={`/case/${c.id}`} className="icon-action" aria-label={`View case ${c.title || c.id}`} title="View case">
                                <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                              </Link>
                              <Link href={`/upload?edit=${c.id}`} className="icon-action" aria-label={`Edit case ${c.title || c.id}`} title="Edit case">
                                <Edit3 size={16} strokeWidth={1.75} aria-hidden="true" />
                              </Link>
                              <button
                                type="button"
                                className="icon-action is-danger"
                                aria-label={`Delete case ${c.title || c.id}`}
                                title="Delete case"
                                onClick={() => deleteCase(c)}
                              >
                                <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                              </button>
                              <Link href={`/discussion/${c.id}`} className="icon-action" aria-label={`Open discussion for ${c.title || c.id}`} title="Open discussion">
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
                  onChange={pg.setPage}
                  onPageSizeChange={pg.setPageSize}
                />
              </>
            );
          })()}
        </div>
      </div>

      {confirmEl}
    </AppShell>
  );
}
