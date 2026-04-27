import { Sparkles } from "lucide-react";

/**
 * Lightweight empty-state surface.
 * `icon` accepts a React node — typically a lucide-react icon — that the
 * caller has already sized. Defaults to a Sparkles icon (no emoji).
 */
export default function EmptyState({
  icon = <Sparkles size={24} strokeWidth={1.75} aria-hidden="true" />,
  title,
  body,
  action,
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body muted">{body}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
