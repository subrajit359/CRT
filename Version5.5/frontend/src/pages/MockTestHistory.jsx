import { useEffect, useState } from "react";
import { Link } from "wouter";
import { History, Play, FileSearch } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Pagination from "../components/Pagination.jsx";
import { api } from "../lib/api.js";
import EmptyState from "../components/EmptyState.jsx";

const PAGE_SIZE = 10;

export default function MockTestHistory() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get("/api/mock/history").then((r) => setTests(r.tests || [])).finally(() => setLoading(false));
  }, []);

  const totalPages = Math.max(1, Math.ceil(tests.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = tests.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 880 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}><History size={22} style={{ verticalAlign: -3, marginRight: 8 }} />Mock Test History</h2>
            <p className="muted">Your last 50 attempts.</p>
          </div>
          <Link href="/mock" className="btn btn-primary btn-sm"><Play size={14} style={{ marginRight: 4 }} />Take a new test</Link>
        </div>
        <div className="spacer-7" />

        {loading ? (
          <div className="card"><div className="spinner-lg" /></div>
        ) : tests.length === 0 ? (
          <div className="card lift">
            <EmptyState
              icon={<FileSearch size={24} strokeWidth={1.75} />}
              title="No tests yet"
              body="Run your first mock test to see it here."
              action={<Link href="/mock" className="btn btn-primary">Start a mock test</Link>}
            />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {slice.map((t) => {
                const cfg = t.config || {};
                const submitted = t.status === "submitted";
                const pct = submitted && t.total_marks > 0
                  ? Math.round((Number(t.obtained_marks) / Number(t.total_marks)) * 100)
                  : null;
                return (
                  <div key={t.id} className="card lift" style={{ padding: 14 }}>
                    <div className="row-between" style={{ flexWrap: "wrap", gap: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>
                          {cfg.specialty || "All specialties"}
                          {cfg.topic ? ` · ${cfg.topic}` : ""}
                        </div>
                        <div className="muted small">
                          {(cfg.types || []).join(", ").toUpperCase() || "MCQ"} · {Number(t.total_marks).toFixed(0)} marks
                          {cfg.negativeMarking ? " · −0.25" : ""} · started {new Date(t.started_at).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {submitted ? (
                          <>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>
                              {Number(t.obtained_marks).toFixed(1)} / {Number(t.total_marks).toFixed(0)}
                            </div>
                            <div className="muted small">{pct}%</div>
                          </>
                        ) : <span className="badge badge-warning">In progress</span>}
                      </div>
                      <div>
                        <Link href={submitted ? `/mock/result/${t.id}` : `/mock/play/${t.id}`} className="btn btn-ghost btn-sm">
                          {submitted ? "Review" : "Resume"} →
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={tests.length}
              onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
