export default function EmptyState({ icon = "✦", title, body, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden>{icon}</div>
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body muted">{body}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
