import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ShieldCheck } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { api } from "../lib/api.js";

function StatValue({ value }) {
  if (value === null || value === undefined) {
    return <Skeleton width="60%" height={26} />;
  }
  return <span>{value}</span>;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);

  function loadStats() {
    setStats(null);
    setStatsError(null);
    api.get("/api/admin/stats")
      .then(setStats)
      .catch((e) => { setStats({}); setStatsError(e?.message || "Could not load stats"); });
  }

  useEffect(() => { loadStats(); }, []);

  return (
    <AppShell>
      <div className="container fade-in">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Dashboard</h2>
            <p className="muted" style={{ marginTop: 4 }}>Platform overview and key metrics.</p>
          </div>
          <Link href="/admin" className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" /> Admin Panel
          </Link>
        </div>

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
      </div>
    </AppShell>
  );
}
