import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Search, Pencil, FileText, BookOpen } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Pagination from "../components/Pagination.jsx";
import { SkeletonRows } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { relativeTime } from "../lib/date.js";
import { api } from "../lib/api.js";

const PAGE_SIZE = 10;

export default function AdminCases() {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [level, setLevel] = useState("");
  const [specialties, setSpecialties] = useState([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get("/api/cases/specialties").then((r) => setSpecialties(r.specialties || [])).catch(() => {});
  }, []);

  const load = useMemo(() => async () => {
    setCases(null);
    setError("");
    setPage(1);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (specialty) params.set("specialty", specialty);
      if (level) params.set("level", level);
      const r = await api.get(`/api/cases${params.toString() ? `?${params.toString()}` : ""}`);
      setCases(r.cases || []);
    } catch (e) {
      setError(e?.message || "Could not load cases");
    }
  }, [q, specialty, level]);

  useEffect(() => { load(); }, [load]);

  return (
    <AppShell>
      <div className="container fade-in">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Link href="/admin" className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} /> Back to admin
          </Link>
        </div>

        <h2 style={{ margin: "0 0 4px" }}>Manage cases</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Edit any case's details or attachments.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); load(); }}
          className="card"
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}
        >
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
            <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.6 }} />
            <input
              className="input"
              placeholder="Search title or body…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ paddingLeft: 32, width: "100%" }}
            />
          </div>
          <select className="input" value={specialty} onChange={(e) => setSpecialty(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">All specialties</option>
            {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input" value={level} onChange={(e) => setLevel(e.target.value)} style={{ minWidth: 120 }}>
            <option value="">Any level</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Level {n}</option>)}
          </select>
          <button className="btn btn-primary" type="submit">Search</button>
        </form>

        <div style={{ marginTop: 16 }}>
          {error && <ErrorState message={error} onRetry={load} />}
          {!error && cases === null && <SkeletonRows rows={6} />}
          {!error && cases && cases.length === 0 && (
            <EmptyState
              icon={<BookOpen size={28} />}
              title="No cases match"
              hint="Try clearing the filters or a different search term."
            />
          )}
          {!error && cases && cases.length > 0 && (() => {
            const totalPages = Math.max(1, Math.ceil(cases.length / PAGE_SIZE));
            const safePage = Math.min(page, totalPages);
            const slice = cases.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
            return (
              <>
                <div className="muted small" style={{ marginBottom: 8 }}>
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, cases.length)} of {cases.length} cases
                </div>
                <ul className="list-reset" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {slice.map((c) => (
                    <li
                      key={c.id}
                      className="card"
                      style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
                    >
                      <div style={{ minWidth: 0, flex: "1 1 280px" }}>
                        <Link href={`/case/${c.id}`} style={{ fontWeight: 600 }}>{c.title}</Link>
                        <div className="muted small" style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span>{(c.specialties && c.specialties.length > 0 ? c.specialties : [c.specialty]).filter(Boolean).join(", ")}</span>
                          <span>· Level {c.level}</span>
                          <span>· by {c.uploader_name || c.uploader_username || "unknown"}</span>
                          <span>· {relativeTime(c.created_at)}</span>
                          {typeof c.verify_count === "number" && (
                            <span>· {c.verify_count} verified</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Link href={`/case/${c.id}`} className="btn btn-ghost btn-sm">
                          <FileText size={14} /> View
                        </Link>
                        <Link href={`/admin/cases/${c.id}/edit`} className="btn btn-primary btn-sm">
                          <Pencil size={14} /> Edit
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={safePage}
                  totalPages={totalPages}
                  total={cases.length}
                  onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                />
              </>
            );
          })()}
        </div>
      </div>
    </AppShell>
  );
}
