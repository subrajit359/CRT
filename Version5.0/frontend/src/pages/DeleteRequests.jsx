import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import AppShell from "../components/AppShell.jsx";
import Avatar from "../components/Avatar.jsx";
import Pagination from "../components/Pagination.jsx";
import useUrlPaging from "../lib/usePaging.js";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const PAGE_SIZE = 20;

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const week = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - d.getTime() < week) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function DeleteRequests() {
  const toast = useToast();
  const [, navigate] = useLocation();
  const [items, setItems] = useState([]);
  const { page, pageSize, setPage, setPageSize } = useUrlPaging({
    initialPage: 1,
    initialPageSize: PAGE_SIZE,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: "open",
      });
      const r = await api.get(`/api/discussions/delete-requests?${params}`);
      const list = r.items || r.requests || [];
      setItems(list);
      setTotalPages(r.totalPages || 1);
      setTotal(r.total || list.length);
    } catch (e) { toast.error(e.message); }
  }, [page, pageSize, toast]);

  useEffect(() => {
    loadList();
    const iv = setInterval(() => {
      if (!document.hidden) loadList();
    }, 15000);
    return () => clearInterval(iv);
  }, [loadList]);

  function openRequest(d) {
    navigate(`/discussion/${d.case_id}?tab=delete-request&dr=${d.id}`);
  }

  return (
    <AppShell>
      <div className="container fade-in">
        <h2>Delete requests</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Cases flagged for removal. Discuss with the requester, the uploader, and other doctors before any decision.
        </p>
        <div className="spacer-7" />

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="dm-sidebar-head" style={{ padding: "12px 16px" }}>
            Open requests ({total})
          </div>
          {items.length === 0 && (
            <div className="empty" style={{ padding: 16 }}>No delete requests.</div>
          )}
          <ul className="dm-thread-list">
            {items.map((d) => {
              const lastTs = d.last_reply_at || d.created_at;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    className="dm-thread"
                    onClick={() => openRequest(d)}
                  >
                    <Avatar
                      url={d.requester_avatar_url}
                      name={d.requester_name || d.requester_username}
                      size={44}
                    />
                    <div className="dm-thread-body">
                      <div className="dm-thread-row1">
                        <span className="dm-thread-name">{d.case_title}</span>
                        <span className="dm-thread-time muted small">{fmtTime(lastTs)}</span>
                      </div>
                      <div className="dm-thread-row2">
                        <span className="dm-thread-preview muted">
                          <span
                            className={`badge ${d.status === "open" ? "badge-warning" : ""}`}
                            style={{ marginRight: 6 }}
                          >
                            {d.status}
                          </span>
                          {d.specialty} · @{d.requester_username}
                        </span>
                        {d.reply_count > 0 && (
                          <span className="badge badge-dot">{d.reply_count}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            total={total}
            onChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>
    </AppShell>
  );
}
