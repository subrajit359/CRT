import { Link } from "wouter";
import {
  Check, X, AlertTriangle, MessageSquare, Trash2, Clock,
  Star, ArrowUp, ArrowDown, Circle,
} from "lucide-react";

// Single source of truth for the bullet icon shown in each timeline row.
// All icons are 12px lucide glyphs so they read as a single dot — keeping a
// flat hierarchy with the surrounding text.
const ICON = (Comp, extra = {}) => <Comp size={12} strokeWidth={2} aria-hidden="true" {...extra} />;
const KIND_META = {
  case_verified:    { dot: "var(--green-700)",  icon: ICON(Check) },
  case_unverified:  { dot: "var(--rose-700)",   icon: ICON(AlertTriangle) },
  discussion_reply: { dot: "var(--primary)",    icon: ICON(MessageSquare) },
  delete_request:   { dot: "var(--amber-700)",  icon: ICON(Trash2) },
  delete_decision:  { dot: "var(--ink-700)",    icon: ICON(Circle, { fill: "currentColor" }) },
  doctor_pending:   { dot: "var(--amber-700)",  icon: ICON(Clock) },
  doctor_approved:  { dot: "var(--green-700)",  icon: ICON(Check) },
  doctor_rejected:  { dot: "var(--rose-700)",   icon: ICON(X) },
  welcome:          { dot: "var(--primary)",    icon: ICON(Star) },
  "attempt-high":   { dot: "var(--green-700)",  icon: ICON(ArrowUp) },
  "attempt-low":    { dot: "var(--rose-700)",   icon: ICON(ArrowDown) },
  attempt:          { dot: "var(--primary)",    icon: ICON(Circle, { fill: "currentColor" }) },
};

function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24); if (dd < 7) return `${dd}d ago`;
  return d.toLocaleDateString();
}

export default function Timeline({ events = [], emptyText = "Nothing yet — your activity will land here." }) {
  if (!events.length) {
    return <div className="timeline-empty muted">{emptyText}</div>;
  }
  return (
    <ul className="timeline">
      {events.map((e) => {
        const meta = KIND_META[e.kind] || { dot: "var(--ink-400)", icon: "·" };
        const inner = (
          <>
            <span className="timeline-dot" style={{ background: meta.dot }} aria-hidden>{meta.icon}</span>
            <div className="timeline-body">
              <div className="timeline-title">{e.title}</div>
              {e.body && <div className="timeline-sub">{e.body}</div>}
              <div className="timeline-time">{timeAgo(e.created_at)}</div>
            </div>
          </>
        );
        return (
          <li key={e.id} className="timeline-row">
            {e.link ? <Link href={e.link} className="timeline-link">{inner}</Link> : <div className="timeline-link">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}
