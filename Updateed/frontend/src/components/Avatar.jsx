export default function Avatar({ url, name, size = 36, className = "", title }) {
  const initial = (name || "?")[0].toUpperCase();
  const style = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    objectFit: "cover",
  };
  if (url) {
    return (
      <img
        src={url}
        alt={name || ""}
        title={title || name}
        className={`avatar-img ${className}`}
        style={style}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={`avatar-fallback ${className}`}
      title={title || name}
      style={{
        ...style,
        background: "var(--accent, #2563eb)",
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontWeight: 600,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initial}
    </div>
  );
}
