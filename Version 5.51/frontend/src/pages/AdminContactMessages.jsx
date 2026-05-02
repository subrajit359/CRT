import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Inbox, Trash2, Mail, Calendar, User, MessageSquare, RefreshCw,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function EmptyInbox() {
  return (
    <div style={{
      textAlign: "center", padding: "60px 24px",
      color: "var(--ink-400)",
    }}>
      <Inbox size={48} strokeWidth={1.25} style={{ marginBottom: 14, opacity: 0.4 }} />
      <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>No messages yet</p>
      <p style={{ margin: "6px 0 0", fontSize: 13 }}>Contact form submissions will appear here.</p>
    </div>
  );
}

function MessageCard({ msg, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: "var(--bg-elev)", border: "1px solid var(--line)",
      borderRadius: 14, overflow: "hidden",
      transition: "box-shadow 0.15s",
    }}>
      {/* Header row */}
      <div
        style={{
          display: "flex", alignItems: "flex-start", gap: 14,
          padding: "16px 20px", cursor: "pointer",
        }}
        onClick={() => setExpanded((x) => !x)}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: "rgba(79,70,229,0.1)", display: "grid", placeItems: "center",
        }}>
          <MessageSquare size={18} color="#4f46e5" strokeWidth={1.75} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)" }}>
              {msg.name}
            </span>
            <a
              href={`mailto:${msg.email}`}
              style={{ fontSize: 12, color: "#4f46e5", textDecoration: "none", fontWeight: 500 }}
              onClick={(e) => e.stopPropagation()}
            >
              {msg.email}
            </a>
            {msg.emailed && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 7px",
                borderRadius: 99, background: "rgba(5,150,105,0.1)",
                color: "#059669", border: "1px solid rgba(5,150,105,0.2)",
              }}>
                ✓ Emailed
              </span>
            )}
          </div>

          {msg.subject && (
            <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 600, color: "var(--ink-700)" }}>
              {msg.subject}
            </p>
          )}

          <p style={{
            margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: "100%",
          }}>
            {msg.message}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "var(--ink-400)", whiteSpace: "nowrap" }}>
            {fmtDate(msg.created_at)}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(msg); }}
            style={{
              border: "none", background: "rgba(220,38,38,0.08)", borderRadius: 8,
              width: 32, height: 32, display: "grid", placeItems: "center",
              cursor: "pointer", color: "#dc2626", flexShrink: 0,
            }}
            title="Delete message"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Expanded message body */}
      {expanded && (
        <div style={{
          borderTop: "1px solid var(--line)",
          padding: "18px 20px",
          background: "var(--bg-muted, var(--paper-2))",
        }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: "var(--ink-400)", display: "flex", alignItems: "center", gap: 5 }}>
              <User size={12} /> {msg.name}
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-400)", display: "flex", alignItems: "center", gap: 5 }}>
              <Mail size={12} />
              <a href={`mailto:${msg.email}`} style={{ color: "#4f46e5", textDecoration: "none" }}>{msg.email}</a>
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-400)", display: "flex", alignItems: "center", gap: 5 }}>
              <Calendar size={12} /> {fmtDate(msg.created_at)}
            </span>
          </div>
          <pre style={{
            margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit",
            fontSize: 14, lineHeight: 1.75, color: "var(--ink-800)",
            background: "var(--bg-elev)", border: "1px solid var(--line)",
            borderRadius: 10, padding: "14px 16px",
          }}>
            {msg.message}
          </pre>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <a
              href={`mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject || "Your message to CrLearn")}`}
              className="btn btn-primary btn-sm"
              style={{ textDecoration: "none" }}
            >
              <Mail size={13} style={{ marginRight: 5 }} /> Reply by email
            </a>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: "#dc2626" }}
              onClick={() => onDelete(msg)}
            >
              <Trash2 size={13} style={{ marginRight: 5 }} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminContactMessages() {
  const toast = useToast();
  const [confirmEl, askConfirm] = useConfirm();

  const [items,   setItems]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const PAGE_SIZE = 20;

  const load = useCallback(async (p = page) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get(`/api/admin/contact-messages?page=${p}&pageSize=${PAGE_SIZE}`);
      setItems(r.items || []);
      setTotal(r.total || 0);
      setPage(p);
    } catch (e) {
      setError(e?.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(1); }, []);

  const handleDelete = async (msg) => {
    const ok = await askConfirm({
      title: "Delete this message?",
      body: `From ${msg.name} (${msg.email}). This cannot be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.del(`/api/admin/contact-messages/${msg.id}`);
      toast.success("Message deleted");
      setItems((prev) => prev.filter((m) => m.id !== msg.id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e) {
      toast.error(e?.message || "Delete failed");
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AppShell>
      {confirmEl}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px 80px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
          <Link href="/admin" style={{ color: "var(--ink-400)", display: "flex", alignItems: "center", gap: 4, fontSize: 13, textDecoration: "none" }}>
            <ArrowLeft size={15} /> Admin
          </Link>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
              display: "grid", placeItems: "center",
            }}>
              <Inbox size={22} color="#fff" strokeWidth={1.75} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--ink-900)" }}>
                Contact messages
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: "var(--ink-400)" }}>
                {total} message{total !== 1 ? "s" : ""} received
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => load(page)}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>

        {/* Content */}
        {error ? (
          <div style={{
            background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)",
            borderRadius: 12, padding: "16px 20px", color: "#dc2626", fontSize: 14,
          }}>
            {error}
          </div>
        ) : loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1,2,3].map((i) => (
              <div key={i} style={{
                height: 80, borderRadius: 14, background: "var(--bg-elev)",
                border: "1px solid var(--line)",
              }} className="shimmer" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div style={{ background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 16 }}>
            <EmptyInbox />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map((msg) => (
                <MessageCard key={msg.id} msg={msg} onDelete={handleDelete} />
              ))}
            </div>

            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 28 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => load(page - 1)}
                >← Prev</button>
                <span style={{ fontSize: 13, color: "var(--ink-400)", padding: "6px 12px" }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => load(page + 1)}
                >Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
