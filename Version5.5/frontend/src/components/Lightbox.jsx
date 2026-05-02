import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Lightbox({ items, index, onClose, onIndexChange }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const pinchRef = useRef(null);

  const current = items?.[index];

  const reset = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => { reset(); }, [index, reset]);

  const goPrev = useCallback(() => {
    if (!items || items.length < 2) return;
    onIndexChange((index - 1 + items.length) % items.length);
  }, [items, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (!items || items.length < 2) return;
    onIndexChange((index + 1) % items.length);
  }, [items, index, onIndexChange]);

  useEffect(() => {
    if (!current) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "0") reset();
      else if (e.key === "+" || e.key === "=") setScale((s) => Math.min(s * 1.25, 6));
      else if (e.key === "-") setScale((s) => Math.max(s / 1.25, 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, onClose, goPrev, goNext, reset]);

  function onWheel(e) {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setScale((s) => Math.min(6, Math.max(1, s + s * delta)));
  }

  function onDoubleClick() {
    setScale((s) => (s > 1 ? 1 : 2.5));
    if (scale > 1) setPan({ x: 0, y: 0 });
  }

  function onPointerDown(e) {
    if (scale <= 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.baseX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.baseY + (e.clientY - dragRef.current.startY),
    });
  }
  function onPointerUp() { dragRef.current = null; }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      const d = touchDist(e.touches);
      pinchRef.current = { startDist: d, startScale: scale };
    }
  }
  function onTouchMove(e) {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const d = touchDist(e.touches);
      const next = Math.min(6, Math.max(1, (d / pinchRef.current.startDist) * pinchRef.current.startScale));
      setScale(next);
    }
  }
  function onTouchEnd(e) {
    if (e.touches.length < 2) pinchRef.current = null;
  }

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          className="lb-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <button className="lb-close" onClick={onClose} aria-label="Close">×</button>
          {items.length > 1 && (
            <>
              <button className="lb-nav lb-prev" onClick={(e) => { e.stopPropagation(); goPrev(); }} aria-label="Previous">‹</button>
              <button className="lb-nav lb-next" onClick={(e) => { e.stopPropagation(); goNext(); }} aria-label="Next">›</button>
              <div className="lb-counter">{index + 1} / {items.length}</div>
            </>
          )}
          <div
            className="lb-stage"
            onWheel={onWheel}
            onDoubleClick={onDoubleClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <motion.img
              key={current.storage_url || current.url}
              src={current.storage_url || current.url}
              alt={current.filename || ""}
              className="lb-img"
              draggable={false}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale }}
              transition={{ scale: { type: "spring", stiffness: 240, damping: 26 }, opacity: { duration: 0.18 } }}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, cursor: scale > 1 ? "grab" : "zoom-in" }}
            />
          </div>
          <div className="lb-toolbar">
            <button className="lb-tool" onClick={() => setScale((s) => Math.max(1, s / 1.25))} aria-label="Zoom out">−</button>
            <span className="lb-zoom">{Math.round(scale * 100)}%</span>
            <button className="lb-tool" onClick={() => setScale((s) => Math.min(6, s * 1.25))} aria-label="Zoom in">+</button>
            <button className="lb-tool" onClick={reset} aria-label="Reset">reset</button>
            {current.filename && <span className="lb-filename muted">{current.filename}</span>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}
