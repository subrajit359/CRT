import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import AppShell from "../components/AppShell.jsx";
import Pagination from "../components/Pagination.jsx";
import { SkeletonRows } from "../components/Skeleton.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const PAGE_SIZE = 10;

export default function SearchPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [users, setUsers] = useState({ items: [], total: 0, totalPages: 1 });
  const [cases, setCases] = useState({ items: [], total: 0, totalPages: 1 });
  const [usersPage, setUsersPage] = useState(1);
  const [casesPage, setCasesPage] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);
  const [casesLoading, setCasesLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!submittedQ) return;
    setUsersLoading(true);
    const params = new URLSearchParams({
      q: submittedQ,
      type: "users",
      page: String(usersPage),
      pageSize: String(PAGE_SIZE),
    });
    api
      .get(`/api/search?${params}`)
      .then((r) =>
        setUsers({
          items: r.users || [],
          total: r.usersTotal || 0,
          totalPages: r.usersTotalPages || 1,
        })
      )
      .catch((e) => toast.error(e?.message || "Search failed"))
      .finally(() => setUsersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersPage, submittedQ]);

  useEffect(() => {
    if (!submittedQ) return;
    setCasesLoading(true);
    const params = new URLSearchParams({
      q: submittedQ,
      type: "cases",
      page: String(casesPage),
      pageSize: String(PAGE_SIZE),
    });
    api
      .get(`/api/search?${params}`)
      .then((r) =>
        setCases({
          items: r.cases || [],
          total: r.casesTotal || 0,
          totalPages: r.casesTotalPages || 1,
        })
      )
      .catch((e) => toast.error(e?.message || "Search failed"))
      .finally(() => setCasesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casesPage, submittedQ]);

  function doSearch(e) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    setUsersPage(1);
    setCasesPage(1);
    setSubmittedQ(trimmed);
  }

  const hasSearched = !!submittedQ;

  return (
    <AppShell>
      <div className="container fade-in">
        <h2>Search</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Find users by name or username, or cases by title or content.
        </p>
        <div className="spacer-7" />
        <form onSubmit={doSearch} className="row">
          <input
            ref={inputRef}
            className="input"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1 }}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="btn btn-primary" disabled={!q.trim()}>
            Search
          </button>
        </form>
        <div className="spacer-7" />
        <div className="dash-grid">
          {/* People */}
          <div className="card">
            <h3>
              People
              {hasSearched && !usersLoading && users.total > 0 && (
                <span className="muted small" style={{ fontWeight: 400, marginLeft: 8 }}>
                  {users.total} result{users.total !== 1 ? "s" : ""}
                </span>
              )}
            </h3>
            <div className="spacer-7" />
            {usersLoading ? (
              <SkeletonRows n={4} avatar />
            ) : !hasSearched ? (
              <div className="empty muted small">Run a search to find people.</div>
            ) : users.items.length === 0 ? (
              <div className="empty muted small">No people found for "{submittedQ}".</div>
            ) : (
              <>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {users.items.map((u) => (
                    <li key={u.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                      <Link href={`/u/${u.username}`}><strong>{u.full_name}</strong></Link>
                      <div className="muted small">@{u.username} · {u.role}{u.specialty ? ` · ${u.specialty}` : u.year_of_study ? ` · Year ${u.year_of_study}` : ""}</div>
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={usersPage}
                  totalPages={users.totalPages}
                  total={users.total}
                  onChange={setUsersPage}
                />
              </>
            )}
          </div>

          {/* Cases */}
          <div className="card">
            <h3>
              Cases
              {hasSearched && !casesLoading && cases.total > 0 && (
                <span className="muted small" style={{ fontWeight: 400, marginLeft: 8 }}>
                  {cases.total} result{cases.total !== 1 ? "s" : ""}
                </span>
              )}
            </h3>
            <div className="spacer-7" />
            {casesLoading ? (
              <SkeletonRows n={4} />
            ) : !hasSearched ? (
              <div className="empty muted small">Run a search to find cases.</div>
            ) : cases.items.length === 0 ? (
              <div className="empty muted small">No cases found for "{submittedQ}".</div>
            ) : (
              <>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {cases.items.map((c) => (
                    <li key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                      <Link href={`/case/${c.id}`} className="clamp-2"><strong>{c.title}</strong></Link>
                      <div className="muted small">{c.specialty} · Level {c.level}</div>
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={casesPage}
                  totalPages={cases.totalPages}
                  total={cases.total}
                  onChange={setCasesPage}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
