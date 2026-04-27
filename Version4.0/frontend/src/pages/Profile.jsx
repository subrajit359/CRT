import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { MessageSquare } from "lucide-react";
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

function paginate(arr, page, pageSize) {
  const total = arr?.length || 0;
  const start = (page - 1) * pageSize;
  return { items: (arr || []).slice(start, start + pageSize), total };
}

export default function Profile() {
  const params = useParams();
  const [, navigate] = useLocation();
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const uploadedPaging = useUrlPaging({ enabled: false, defaultPageSize: 10 });
  const verificationsPaging = useUrlPaging({ enabled: false, defaultPageSize: 10 });

  function load() {
    setError(null); setData(null);
    api.get(`/api/profiles/${params.username}`).then(setData).catch((e) => setError(e.message));
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
          <Avatar url={u.avatar_url} name={u.full_name || u.username} size={84} />
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
              <div className="row" style={{ marginTop: 10 }}>
                <span className="badge badge-primary">{data.student.year_of_study || "Student"}</span>
                <span className="badge">Level {data.student.global_level}</span>
                <span className="badge">{data.attempts} attempts</span>
                {data.showScores && data.averageScore != null && (
                  <span className="badge badge-success">{data.averageScore.toFixed(1)}/10 avg</span>
                )}
              </div>
            )}
          </div>
        </div>

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
