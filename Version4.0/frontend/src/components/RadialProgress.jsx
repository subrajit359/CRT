import { useEffect, useState } from "react";

export default function RadialProgress({
  value = 0,
  max = 1,
  size = 96,
  thickness = 9,
  label,
  sublabel,
  color = "var(--primary)",
  trackColor = "var(--ink-100)",
}) {
  const pct = Math.max(0, Math.min(1, value / (max || 1)));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  const [animPct, setAnimPct] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimPct(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const dash = c * animPct;

  // Scale label/sublabel typography with the ring size so small rings
  // (e.g. the streak strength ring) don't overflow the circle.
  const labelFont = Math.max(10, Math.round(size * 0.22));
  const subFont = Math.max(8, Math.round(size * 0.11));
  const subGap = Math.max(2, Math.round(size * 0.04));
  const isSmall = size < 80;

  return (
    <div
      className="radial"
      style={{ width: size, height: size, flex: `0 0 ${size}px` }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        <circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={thickness} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.7,.2,1)" }}
        />
      </svg>
      <div
        className="radial-inner"
        style={{ padding: Math.round(thickness / 2) }}
      >
        <div
          className="radial-label"
          style={{ fontSize: labelFont, lineHeight: 1 }}
        >
          {label}
        </div>
        {sublabel && (
          <div
            className="radial-sub"
            style={{
              fontSize: subFont,
              marginTop: subGap,
              letterSpacing: isSmall ? "0.02em" : undefined,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}
