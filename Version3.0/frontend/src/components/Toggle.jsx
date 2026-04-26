export default function Toggle({ checked, onChange, disabled, label, sublabel }) {
  return (
    <label className={`switch-row ${disabled ? "is-disabled" : ""}`}>
      <span className="switch-text">
        {label && <span className="switch-label">{label}</span>}
        {sublabel && <span className="switch-sub">{sublabel}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        className={`switch ${checked ? "on" : ""}`}
        onClick={() => onChange && onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </label>
  );
}
