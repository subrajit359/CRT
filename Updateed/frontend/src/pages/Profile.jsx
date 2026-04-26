import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

export default function Profile() {
  const params = useParams();
  const [, navigate] = useLocation();
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/api/profiles/${params.username}`).then(setData).catch((e) => setError(e.message));
  }, [params.username]);

  if (error) return <AppShell><div className="container"><div className="empty">{error}</div></div></AppShell>;
  if (!data) return <AppShell><div className="page-center"><div className="spinner-lg" /></div></AppShell>;

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
                <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/messages/u/${u.username}`)}>
                  💬 Message
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
              <h3>Uploaded cases ({data.uploaded?.length || 0})</h3>
              <div className="spacer-7" />
              {(!data.uploaded || data.uploaded.length === 0) ? <div className="empty">No uploads yet.</div> : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {data.uploaded.map((c) => (
                    <li key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                      <Link href={`/case/${c.id}`}>{c.title}</Link>
                      <div className="muted small">{c.specialty} · {new Date(c.created_at).toLocaleDateString()}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card">
              <h3>Verifications ({data.verifications?.length || 0})</h3>
              <div className="spacer-7" />
              {(!data.verifications || data.verifications.length === 0) ? <div className="empty">No verifications yet.</div> : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {data.verifications.slice(0, 20).map((v, i) => (
                    <li key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                      <span className={`badge ${v.action === "verify" ? "badge-success" : "badge-danger"}`}>{v.action}</span>
                      <Link href={`/case/${v.case_id}`} style={{ marginLeft: 10 }}>{v.title}</Link>
                      <div className="muted small">{v.specialty} · {new Date(v.created_at).toLocaleDateString()}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
