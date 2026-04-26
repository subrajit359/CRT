export default function VerifiedBadge({ count = 0, size = "md" }) {
  if (!count) return null;
  return (
    <span className={`vbadge vbadge-${size}`} title={`Verified by ${count} doctor${count > 1 ? "s" : ""}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 2l2.4 2.6 3.5-.4.5 3.5L21 9.6l-1.6 3.1L21 15.8l-2.6 1.9-.5 3.5-3.5-.4L12 23.4l-2.4-2.6-3.5.4-.5-3.5L3 15.8l1.6-3.1L3 9.6l2.6-1.9.5-3.5 3.5.4L12 2z"
          fill="currentColor"/>
        <path d="M8.5 12.5l2.3 2.3L15.7 9.9" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span>Verified · {count}</span>
    </span>
  );
}
