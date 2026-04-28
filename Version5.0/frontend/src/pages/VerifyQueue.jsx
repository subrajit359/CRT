import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2 } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import Pagination from "../components/Pagination.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { api } from "../lib/api.js";

const PAGE_SIZE = 20;

export default function VerifyQueue() {
  const [cases, setCases] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setCases(null);
    api
      .get(`/api/verify/queue?page=${page}&pageSize=${PAGE_SIZE}`)
      .then((r) => {
        setCases(r.items || r.cases || []);
        setTotalPages(r.totalPages || 1);
        setTotal(r.total || 0);
      });
  }, [page]);

  return (
    <AppShell>
      <div className="container fade-in">
        <h2>Verify queue</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Cases that haven't yet been verified by you. Lowest verification count first.
          {total > 0 && ` · ${total} case${total === 1 ? "" : "s"} remaining`}
        </p>
        <div className="spacer-7" />
        {cases === null ? (
          <Skeleton height={120} />
        ) : cases.length === 0 ? (
          <div className="empty">All caught up.</div>
        ) : (
          <>
            <div className="case-list">
              {cases.map((c) => (
                <div key={c.id} className="case-item">
                  <div>
                    <Link href={`/case/${c.id}`}><h4>{c.title}</h4></Link>
                    <div className="case-meta">
                      <span className="badge badge-primary">{c.specialty}</span>
                      <span className="badge">L{c.level}</span>
                      <span className="badge">{c.source_kind}</span>
                      <span className="muted small row" style={{ gap: 2, alignItems: "center", display: "inline-flex" }}>
                        <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden="true" />
                        {c.verify_count}
                      </span>
                    </div>
                  </div>
                  <Link href={`/case/${c.id}`} className="btn btn-secondary btn-sm">Review</Link>
                </div>
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
          </>
        )}
      </div>
    </AppShell>
  );
}
