export default function Skeleton({ height = 12, width = "100%", radius = 6, style = {}, className = "" }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{
        display: "block",
        height: typeof height === "number" ? `${height}px` : height,
        width: typeof width === "number" ? `${width}px` : width,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export function SkeletonStack({ rows = 3, gap = 8, height = 12 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} width={`${90 - i * 12}%`} />
      ))}
    </div>
  );
}
