import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import "../styles/Resourcedetail.css";
import { apiUrl } from "../lib/api.js";

const IconFile = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
      fill="#fee2e2" stroke="#ef4444" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="14 2 14 8 20 8"
      stroke="#ef4444" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="8" y1="13" x2="16" y2="13" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round" />
    <line x1="8" y1="17" x2="13" y2="17" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const IconEye = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconDownload = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconClipboard = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="4" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
  </svg>
);

const IconCalendar = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconViews = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

function getDriveFileId(link) {
  if (!link) return null;
  const fileMatch = link.match(/\/file\/d\/([^/?&#]+)/);
  if (fileMatch) return fileMatch[1];
  const idMatch = link.match(/[?&]id=([^&]+)/);
  if (idMatch) return idMatch[1];
  return null;
}

function getDrivePreviewUrl(link) {
  const id = getDriveFileId(link);
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}

function getDriveDownloadUrl(link) {
  if (!link) return null;
  const id = getDriveFileId(link);
  if (id) return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  return link;
}

function boldKeywords(text, keywords) {
  if (!text || !keywords) return text;
  const words = keywords.split(",").map((w) => w.trim()).filter(Boolean);
  if (!words.length) return text;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(regex).map((part, i) =>
    words.some((w) => w.toLowerCase() === part.toLowerCase())
      ? <strong key={i} style={{ color: "#4f46e5", fontWeight: 700 }}>{part}</strong>
      : part
  );
}

function triggerDownload(link, key, setDlState) {
  const url = getDriveDownloadUrl(link);
  if (!url) return;
  setDlState((s) => ({ ...s, [key]: "downloading" }));
  const a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    setDlState((s) => ({ ...s, [key]: "done" }));
    setTimeout(() => setDlState((s) => ({ ...s, [key]: null })), 2500);
  }, 1200);
}

function ImageZoom({ src, alt, onClose }) {
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const g = useRef({
    scale: 1, x: 0, y: 0,
    dragging: false, dragX: 0, dragY: 0, dragPX: 0, dragPY: 0,
    lastTap: 0,
    pinchDist: null, pinchScale: 1, pinchX: 0, pinchY: 0,
  });
  const [zoomed, setZoomed] = useState(false);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  const applyRef = useRef(null);
  applyRef.current = (scale, x, y, animated = false) => {
    const img = imgRef.current;
    if (!img) return;
    const s = clamp(scale, 1, 6);
    const stage = stageRef.current;
    const w = stage ? stage.clientWidth  : window.innerWidth;
    const h = stage ? stage.clientHeight : window.innerHeight;
    const maxX = (w * (s - 1)) / 2;
    const maxY = (h * (s - 1)) / 2;
    const cx = clamp(x, -maxX, maxX);
    const cy = clamp(y, -maxY, maxY);
    g.current.scale = s; g.current.x = cx; g.current.y = cy;
    img.style.transition = animated ? "transform 0.22s ease" : "none";
    img.style.transform = `translate(${cx}px, ${cy}px) scale(${s})`;
    setZoomed(s > 1.01);
  };

  const resetView = useCallback((animated = true) => applyRef.current(1, 0, 0, animated), []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const { scale, x, y } = g.current;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newScale = Math.min(Math.max(scale * factor, 1), 6);
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const ox = e.clientX - rect.left - rect.width  / 2;
    const oy = e.clientY - rect.top  - rect.height / 2;
    const ratio = newScale / scale;
    applyRef.current(newScale, (x - ox) * ratio + ox, (y - oy) * ratio + oy);
  }, []);

  const onMouseDown = (e) => {
    if (g.current.scale <= 1) return;
    g.current.dragging = true;
    g.current.dragX = e.clientX; g.current.dragY = e.clientY;
    g.current.dragPX = g.current.x; g.current.dragPY = g.current.y;
  };
  const onMouseMove = (e) => {
    if (!g.current.dragging) return;
    applyRef.current(g.current.scale, g.current.dragPX + (e.clientX - g.current.dragX), g.current.dragPY + (e.clientY - g.current.dragY));
  };
  const onMouseUp = () => { g.current.dragging = false; };

  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const now = Date.now();
      const t = e.touches[0];
      if (now - g.current.lastTap < 280) {
        g.current.lastTap = 0;
        if (g.current.scale > 1.01) { applyRef.current(1, 0, 0, true); }
        else {
          const stage = stageRef.current;
          const rect = stage?.getBoundingClientRect();
          if (!rect) return;
          applyRef.current(2.5, -(t.clientX - rect.left - rect.width / 2) * 1.5, -(t.clientY - rect.top - rect.height / 2) * 1.5, true);
        }
      } else {
        g.current.lastTap = now;
        g.current.dragX = t.clientX; g.current.dragY = t.clientY;
        g.current.dragPX = g.current.x; g.current.dragPY = g.current.y;
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      g.current.pinchDist = Math.hypot(dx, dy);
      g.current.pinchScale = g.current.scale;
      g.current.pinchX = g.current.x;
      g.current.pinchY = g.current.y;
      g.current.lastTap = 0;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 2 && g.current.pinchDist !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const newScale = Math.min(Math.max(g.current.pinchScale * (dist / g.current.pinchDist), 1), 6);
      const stage = stageRef.current;
      const rect = stage?.getBoundingClientRect();
      if (!rect) return;
      const ox = cx - rect.left - rect.width  / 2;
      const oy = cy - rect.top  - rect.height / 2;
      const ratio = newScale / g.current.pinchScale;
      applyRef.current(newScale, (g.current.pinchX - ox) * ratio + ox, (g.current.pinchY - oy) * ratio + oy);
    } else if (e.touches.length === 1 && g.current.scale > 1.01) {
      applyRef.current(g.current.scale,
        g.current.dragPX + (e.touches[0].clientX - g.current.dragX),
        g.current.dragPY + (e.touches[0].clientY - g.current.dragY));
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (e.touches.length < 2) g.current.pinchDist = null;
    if (e.touches.length === 1) {
      g.current.dragX = e.touches[0].clientX; g.current.dragY = e.touches[0].clientY;
      g.current.dragPX = g.current.x; g.current.dragPY = g.current.y;
    }
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const opts = { passive: false };
    stage.addEventListener("wheel", handleWheel, opts);
    stage.addEventListener("touchstart", handleTouchStart, opts);
    stage.addEventListener("touchmove", handleTouchMove, opts);
    stage.addEventListener("touchend", handleTouchEnd, opts);
    return () => {
      stage.removeEventListener("wheel", handleWheel);
      stage.removeEventListener("touchstart", handleTouchStart);
      stage.removeEventListener("touchmove", handleTouchMove);
      stage.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="iz-overlay" onClick={onClose}>
      <button className="iz-close" onClick={onClose}>✕</button>
      <div
        ref={stageRef}
        className="iz-stage"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ cursor: zoomed ? "grab" : "zoom-in" }}
      >
        <img ref={imgRef} src={src} alt={alt} className="iz-img" draggable={false} />
      </div>
      {zoomed && (
        <button className="iz-reset" onClick={(e) => { e.stopPropagation(); resetView(); }}>
          Reset zoom
        </button>
      )}
    </div>
  );
}

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Normalize a neet post from /neet-api/posts/:id to the expected shape
function normalizePost(raw) {
  if (!raw) return null;
  return {
    ...raw,
    description: raw.description || "",
    badge: raw.badge || "",
    keywords: raw.keywords || "",
    sections: (raw.sections || []).map((sec) => ({
      ...sec,
      resources: (sec.resources || []).map((item) => ({
        ...item,
        title: item.title || "",
        drive_link: item.drive_link || "",
        description: item.description || "",
      })),
    })),
  };
}

export default function NeetResourceDetails({ postId, onBack }) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [dlState, setDlState] = useState({});
  const [zoomImg, setZoomImg] = useState(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeZoom, setIframeZoom] = useState(1);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    setLoading(true);
    fetch(`/neet-api/posts/${postId}`)
      .then((r) => r.json())
      .then((data) => { setPost(normalizePost(data)); setLoading(false); })
      .catch(() => setLoading(false));
  }, [postId]);

  useEffect(() => {
    if (!postId) return;
    const key = `vp_${postId}`;
    if (localStorage.getItem(key)) return;
    fetch(`/neet-api/posts/${postId}/view`, { method: "POST" })
      .then(() => localStorage.setItem(key, "1"))
      .catch(() => {});
  }, [postId]);

  useEffect(() => {
    const locked = preview || zoomImg;
    document.body.style.overflow = locked ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [preview, zoomImg]);

  useEffect(() => {
    setIframeLoaded(false);
    setIframeZoom(1);
  }, [preview]);

  if (loading) {
    return (
      <div className="rd-page">
        <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
          <div className="blog-spinner" style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#4f46e5", borderRadius: "50%" }} />
        </div>
      </div>
    );
  }

  if (!post || post.error) {
    return (
      <div className="rd-page">
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <p style={{ color: "#6b7280", marginBottom: 12 }}>Post not found.</p>
          <button className="rd-back-link" onClick={onBack}>&#8592; Back to Blog</button>
        </div>
      </div>
    );
  }

  const { thumbnail_url, title, date, created_at, views, badge, description, keywords, sections = [] } = post;
  const displayDate = date || formatDate(created_at);

  return (
    <div className="rd-page">
      <article className="rd-article">
        <button className="rd-back-link" onClick={onBack}>&#8592; Back to Blog</button>

        {thumbnail_url && (
          <div className="rd-thumbnail">
            <img src={thumbnail_url} alt={title} />
          </div>
        )}

        <div className="rd-meta">
          {displayDate && <span className="rd-meta-item"><IconCalendar /> {displayDate}</span>}
          {displayDate && <span className="rd-meta-dot">&bull;</span>}
          <span className="rd-meta-item"><IconViews /> {(views || 0).toLocaleString()} views</span>
          {badge && <span className="rd-meta-dot">&bull;</span>}
          {badge && <span className="rd-badge">{badge}</span>}
        </div>

        <h1 className="rd-title">{title}</h1>
        {description && <p className="rd-desc">{boldKeywords(description, keywords)}</p>}

        {sections.length > 0 && (
          <div className="rd-toc">
            <div className="rd-toc-header">
              <IconClipboard size={16} />
              <h2>Table of Contents</h2>
            </div>
            <ol className="rd-toc-list">
              {sections.map((s, i) => (
                <li key={s.id} className="rd-toc-item">
                  <a href={`#section-${s.id}`}>
                    <span className="rd-toc-num">{i + 1}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="rd-sections">
          {sections.map((section, sIdx) => (
            <section key={section.id} id={`section-${section.id}`} className="rd-section">
              <div className="rd-section-heading">
                <div className="rd-section-bar"></div>
                <h2>{section.title}</h2>
              </div>

              {section.image_url && (
                <div className="rd-section-image" onClick={() => setZoomImg({ src: section.image_url, alt: section.title })}>
                  <img src={section.image_url} alt={section.title} />
                  <span className="rd-img-zoom-hint">Tap to zoom</span>
                </div>
              )}

              <div className="rd-resources">
                {(section.resources || []).map((item, idx) => (
                  <div className="rd-card" key={item.id}>
                    <div className="rd-card-num">{String(idx + 1).padStart(2, "0")}</div>
                    <div className="rd-card-icon">
                      <IconFile size={22} />
                    </div>
                    <div className="rd-card-text">
                      <p className="rd-card-title">{item.title}</p>
                      {item.description && <p className="rd-card-desc">{item.description}</p>}
                    </div>
                    <div className="rd-card-actions">
                      <button
                        className="rd-btn-preview"
                        onClick={() => setPreview(item)}
                        disabled={!item.drive_link}
                        title={!item.drive_link ? "No preview link" : "Preview"}
                      >
                        <IconEye size={13} /> Preview
                      </button>
                      {item.drive_link ? (
                        <button
                          className={`rd-btn-download${dlState[item.id] === "done" ? " rd-btn-done" : ""}`}
                          onClick={() => triggerDownload(item.drive_link, item.id, setDlState)}
                          disabled={!!dlState[item.id]}
                        >
                          {dlState[item.id] === "downloading" && <span className="rd-spinner" />}
                          {dlState[item.id] === "done" && <span className="rd-checkmark">✓</span>}
                          {!dlState[item.id] && <IconDownload size={13} />}
                          {dlState[item.id] === "downloading" ? "Downloading…" : dlState[item.id] === "done" ? "Downloaded!" : "Download"}
                        </button>
                      ) : (
                        <button className="rd-btn-download" disabled>
                          <IconDownload size={13} /> Download
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {(!section.resources || section.resources.length === 0) && (
                  <p style={{ color: "#9ca3af", fontSize: 13 }}>No resources in this section yet.</p>
                )}
              </div>

              {sIdx < sections.length - 1 && <hr className="rd-divider" />}
            </section>
          ))}
        </div>
      </article>

      {zoomImg && createPortal(
        <ImageZoom src={zoomImg.src} alt={zoomImg.alt} onClose={() => setZoomImg(null)} />,
        document.body
      )}

      {preview && createPortal(
        <div className="rd-overlay" onClick={() => setPreview(null)}>
          <div className="rd-popup" onClick={(e) => e.stopPropagation()}>
            <div className="rd-popup-header">
              <div className="rd-popup-icon"><IconFile size={20} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="rd-popup-title">{preview.title}</p>
                <p className="rd-popup-subtitle">PDF Document</p>
              </div>
              <button className="rd-popup-close" onClick={() => setPreview(null)}>&#10005;</button>
            </div>

            {getDrivePreviewUrl(preview.drive_link) ? (
              <div className="rd-popup-iframe-wrap">
                {!iframeLoaded && (
                  <div className="rd-iframe-loading">
                    <div className="rd-iframe-spinner" />
                    <span>Loading file…</span>
                  </div>
                )}
                <iframe
                  src={getDrivePreviewUrl(preview.drive_link)}
                  title={preview.title}
                  className="rd-popup-iframe"
                  allow="autoplay"
                  loading="lazy"
                  onLoad={() => setIframeLoaded(true)}
                  style={{
                    width: `${iframeZoom * 100}%`,
                    height: `${iframeZoom * 100}%`,
                    opacity: iframeLoaded ? 1 : 0,
                    transition: "opacity 0.3s",
                    flexShrink: 0,
                  }}
                />
                <div className="rd-iframe-cover" />
              </div>
            ) : (
              <div className="rd-popup-body">
                <div className="rd-popup-pdf-icon">
                  <IconFile size={32} />
                  <span className="rd-pdf-label">PDF</span>
                </div>
                {preview.description && <p className="rd-popup-desc">{preview.description}</p>}
                <p className="rd-popup-hint">No preview link available for this resource</p>
              </div>
            )}

            <div className="rd-popup-footer">
              <div className="rd-zoom-bar">
                <button className="rd-zoom-btn" title="Zoom out" disabled={iframeZoom <= 1}
                  onClick={() => setIframeZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </button>
                <span className="rd-zoom-pct">{Math.round(iframeZoom * 100)}%</span>
                <button className="rd-zoom-btn" title="Zoom in" disabled={iframeZoom >= 2}
                  onClick={() => setIframeZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </button>
              </div>
              <button className="rd-popup-cancel" onClick={() => setPreview(null)}>Close</button>
              {preview.drive_link ? (
                <button
                  className={`rd-popup-download${dlState["popup"] === "done" ? " rd-btn-done" : ""}`}
                  onClick={() => triggerDownload(preview.drive_link, "popup", setDlState)}
                  disabled={!!dlState["popup"]}
                >
                  {dlState["popup"] === "downloading" && <span className="rd-spinner" />}
                  {dlState["popup"] === "done" && <span className="rd-checkmark">✓</span>}
                  {!dlState["popup"] && <IconDownload size={14} />}
                  {dlState["popup"] === "downloading" ? "Downloading…" : dlState["popup"] === "done" ? "Downloaded!" : "Download File"}
                </button>
              ) : (
                <button className="rd-popup-download" disabled>No link added</button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
