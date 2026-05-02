import { useEffect } from "react";

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50];

/**
 * Reusable pager.
 * - Hidden when totalPages <= 1 and no page-size selector requested.
 * - Optional ←/→ keyboard nav (default on, scoped to the page).
 * - Optional page-size selector — when `onPageSizeChange` is provided.
 * - Optional jump-to-page input for large result sets.
 */
export default function Pagination({
  page,
  totalPages,
  onChange,
  total,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  keyboard = true,
  showJump = false,
  ariaLabel = "Pagination",
}) {
  const safe = Math.max(1, Math.min(totalPages || 1, page || 1));
  const showSelector = typeof onPageSizeChange === "function";
  const hidden = (!totalPages || totalPages <= 1) && !showSelector;

  useEffect(() => {
    if (!keyboard || hidden) return;
    function onKey(e) {
      const tag = (e.target && e.target.tagName) || "";
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && safe > 1) { onChange(safe - 1); }
      else if (e.key === "ArrowRight" && safe < (totalPages || 1)) { onChange(safe + 1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, safe, totalPages, onChange, hidden]);

  if (hidden) return null;

  return (
    <nav className="pager" aria-label={ariaLabel}>
      <div className="pager-info muted small">
        {typeof total === "number" ? (
          <>Page <strong>{safe}</strong> of <strong>{totalPages || 1}</strong> · {total.toLocaleString()} total</>
        ) : (
          <>Page <strong>{safe}</strong> of <strong>{totalPages || 1}</strong></>
        )}
      </div>
      <div className="pager-controls">
        <button
          type="button"
          className="btn btn-ghost btn-sm pager-btn"
          disabled={safe <= 1}
          onClick={() => onChange(Math.max(1, safe - 1))}
          aria-label="Previous page"
        >
          ← Prev
        </button>
        {showJump && totalPages > 5 && (
          <input
            type="number"
            min={1}
            max={totalPages}
            value={safe}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) onChange(Math.max(1, Math.min(totalPages, n)));
            }}
            className="input pager-jump"
            aria-label="Jump to page"
          />
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm pager-btn"
          disabled={safe >= (totalPages || 1)}
          onClick={() => onChange(Math.min(totalPages || 1, safe + 1))}
          aria-label="Next page"
        >
          Next →
        </button>
        {showSelector && (
          <label className="pager-size">
            <span className="muted small">Show</span>
            <select
              className="select"
              value={pageSize || pageSizeOptions[0]}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
              aria-label="Items per page"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </nav>
  );
}
