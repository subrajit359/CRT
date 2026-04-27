/**
 * Family of skeleton placeholders. The CSS .skeleton class supplies the
 * shimmer animation. Variants are convenience wrappers so pages don't
 * keep redefining the same shapes.
 */
export default function Skeleton({
  height = 12,
  width = "100%",
  radius = 6,
  style = {},
  className = "",
}) {
  return (
    <span
      className={`skeleton ${className}`}
      aria-hidden="true"
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

export function SkeletonCircle({ size = 36, className = "", style = {} }) {
  return (
    <Skeleton
      height={size}
      width={size}
      radius={"50%"}
      className={className}
      style={style}
    />
  );
}

export function SkeletonRow({ avatar = true, lines = 2 }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid var(--line)",
      }}
    >
      {avatar && <SkeletonCircle size={36} />}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} height={i === 0 ? 12 : 10} width={i === 0 ? "60%" : "40%"} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonRows({ n = 5, avatar = true }) {
  return (
    <div>
      {Array.from({ length: n }).map((_, i) => (
        <SkeletonRow key={i} avatar={avatar} />
      ))}
    </div>
  );
}

export function SkeletonCard({ height = 160 }) {
  return (
    <div
      className="card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: height,
      }}
    >
      <Skeleton height={16} width="55%" />
      <SkeletonStack rows={3} height={12} />
    </div>
  );
}
