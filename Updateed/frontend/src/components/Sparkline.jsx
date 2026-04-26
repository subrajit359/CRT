import { useMemo } from "react";

export default function Sparkline({
  data = [],
  width = 80,
  height = 28,
  stroke = "var(--primary)",
  fill = "rgba(15, 76, 58, 0.10)",
  strokeWidth = 1.6,
  showDot = true,
}) {
  const { path, areaPath, lastPoint, hasData } = useMemo(() => {
    const points = (data || []).map((v, i) => ({ i, v: v == null ? null : Number(v) }));
    const filled = points.map((p) => (p.v == null ? null : p));
    const real = filled.filter(Boolean);
    if (real.length < 2) {
      return { path: "", areaPath: "", lastPoint: null, hasData: false };
    }
    const xs = points.map((p) => p.i);
    const vs = real.map((p) => p.v);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minV = Math.min(...vs);
    const maxV = Math.max(...vs);
    const range = maxV - minV || 1;
    const padY = 3;
    const sx = (i) => ((i - minX) / Math.max(1, maxX - minX)) * (width - 2) + 1;
    const sy = (v) => height - padY - ((v - minV) / range) * (height - padY * 2);

    let d = "";
    let prev = null;
    points.forEach((p) => {
      if (p.v == null) return;
      const x = sx(p.i);
      const y = sy(p.v);
      d += prev == null ? `M ${x} ${y}` : ` L ${x} ${y}`;
      prev = p;
    });
    const lastReal = real[real.length - 1];
    const firstReal = real[0];
    const area = `${d} L ${sx(lastReal.i)} ${height} L ${sx(firstReal.i)} ${height} Z`;
    return {
      path: d,
      areaPath: area,
      lastPoint: { x: sx(lastReal.i), y: sy(lastReal.v) },
      hasData: true,
    };
  }, [data, width, height]);

  if (!hasData) {
    return (
      <svg width={width} height={height} className="sparkline sparkline-empty" aria-hidden>
        <line x1="2" y1={height / 2} x2={width - 2} y2={height / 2} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 3" />
      </svg>
    );
  }

  return (
    <svg width={width} height={height} className="sparkline" aria-hidden>
      <path d={areaPath} fill={fill} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {showDot && lastPoint && (
        <circle cx={lastPoint.x} cy={lastPoint.y} r={2.6} fill={stroke} />
      )}
    </svg>
  );
}
