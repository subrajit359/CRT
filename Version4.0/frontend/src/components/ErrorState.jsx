import { AlertTriangle } from "lucide-react";

/**
 * Generic error/state surface — pairs with EmptyState/Skeleton for consistent
 * load → empty → error → ready transitions.
 *
 * `icon` accepts a short string or a React node (typically a lucide-react icon).
 * If left as the default sentinel, an AlertTriangle icon is rendered.
 */
const DEFAULT_ICON = Symbol("default-error-icon");

export default function ErrorState({
  icon = DEFAULT_ICON,
  title = "Something went wrong",
  body,
  action,
  onRetry,
}) {
  const renderedIcon = icon === DEFAULT_ICON
    ? <AlertTriangle size={24} strokeWidth={1.75} aria-hidden="true" />
    : icon;
  return (
    <div className="error-state" role="alert" aria-live="polite">
      <div className="error-state-icon" aria-hidden>{renderedIcon}</div>
      <div className="error-state-title">{title}</div>
      {body && <div className="error-state-body muted">{body}</div>}
      {(onRetry || action) && (
        <div className="error-state-action">
          {onRetry ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
              Try again
            </button>
          ) : action}
        </div>
      )}
    </div>
  );
}
