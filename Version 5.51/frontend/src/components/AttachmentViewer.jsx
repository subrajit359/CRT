import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, ExternalLink, FileText, ChevronLeft, ChevronRight } from "lucide-react";

function classify(att) {
  if (!att) return "other";
  if (att.kind) return att.kind;
  const m = (att.mime_type || "").toLowerCase();
  const fn = (att.filename || att.storage_url || "").toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fn)) return "image";
  if (m === "application/pdf" || fn.endsWith(".pdf")) return "pdf";
  if (m.startsWith("video/") || /\.(mp4|webm|ogg|mov)$/.test(fn)) return "video";
  if (m.includes("powerpoint") || m.includes("presentation") || /\.(pptx?|key|odp)$/.test(fn)) return "office";
  if (m.includes("word") || m.includes("document") || /\.(docx?|rtf|odt)$/.test(fn)) return "office";
  if (m.includes("excel") || m.includes("spreadsheet") || /\.(xlsx?|ods|csv)$/.test(fn)) return "office";
  return "other";
}

function officeViewerUrl(rawUrl) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(rawUrl)}`;
}

export default function AttachmentViewer({ items, index, onClose, onIndexChange }) {
  const list = Array.isArray(items) ? items : (items ? [items] : []);
  const cur = list[index];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowLeft" && index > 0) onIndexChange?.(index - 1);
      if (e.key === "ArrowRight" && index < list.length - 1) onIndexChange?.(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, list.length, onClose, onIndexChange]);

  if (!cur) return null;
  const kind = classify(cur);
  const url = cur.storage_url;

  return createPortal(
    <div className="av-overlay" onClick={onClose}>

      {/* ── Header ── */}
      <div className="av-header" onClick={(e) => e.stopPropagation()}>
        <FileText size={18} className="av-header-icon" />
        <div className="av-header-info">
          <strong>{cur.filename || cur.title || "Attachment"}</strong>
          {cur.size_bytes ? (
            <span className="av-meta">· {(cur.size_bytes / 1024).toFixed(0)} KB</span>
          ) : null}
          {cur.description && (
            <span className="av-meta av-meta-desc">· {cur.description}</span>
          )}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost btn-sm av-action-btn"
          aria-label="Open in new tab"
        >
          <ExternalLink size={15} />
          <span className="av-btn-text">Open</span>
        </a>
        <a
          href={url}
          download={cur.filename || true}
          className="btn btn-ghost btn-sm av-action-btn"
          aria-label="Download"
        >
          <Download size={15} />
          <span className="av-btn-text">Download</span>
        </a>
        <button
          className="btn btn-ghost btn-sm av-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Content wrapper — relative so nav arrows stay pinned over the area ── */}
      <div className="av-content-wrap" onClick={(e) => e.stopPropagation()}>

        {/* Images: block+overflow:auto so large images scroll correctly.
            Everything else: flex fill so iframes/video fill the space. */}
        <div className={`av-body ${kind === "image" ? "av-body--img" : "av-body--fill"}`}>
          {kind === "image" && (
            <img
              src={url}
              alt={cur.filename}
              className="av-img"
            />
          )}
          {kind === "pdf" && (
            <iframe
              src={url}
              title={cur.filename || "PDF"}
              className="av-frame"
            />
          )}
          {kind === "video" && (
            <video src={url} controls className="av-video" />
          )}
          {kind === "office" && (
            <iframe
              src={officeViewerUrl(url)}
              title={cur.filename || "Document"}
              className="av-frame"
            />
          )}
          {kind === "other" && (
            <div className="av-unsupported">
              <FileText size={40} style={{ opacity: 0.5 }} />
              <h3 style={{ margin: "12px 0 4px" }}>{cur.filename || "File"}</h3>
              <p className="muted small">This file type can't be previewed inline.</p>
              <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ marginTop: 10 }}>
                Open in new tab
              </a>
            </div>
          )}
        </div>

        {/* Nav arrows — outside the scrollable av-body so they stay pinned */}
        {list.length > 1 && (
          <button
            className="av-nav av-nav-prev"
            onClick={() => onIndexChange?.(Math.max(0, index - 1))}
            disabled={index === 0}
            aria-label="Previous"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {list.length > 1 && (
          <button
            className="av-nav av-nav-next"
            onClick={() => onIndexChange?.(Math.min(list.length - 1, index + 1))}
            disabled={index >= list.length - 1}
            aria-label="Next"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* ── Counter ── */}
      {list.length > 1 && (
        <div className="av-counter" onClick={(e) => e.stopPropagation()}>
          {index + 1} / {list.length}
        </div>
      )}
    </div>,
    document.body
  );
}
