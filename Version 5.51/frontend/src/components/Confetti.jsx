import { useEffect, useRef } from "react";

const COLORS = ["#4f46e5", "#818cf8", "#6366f1", "#a5b4fc", "#c7d2fe", "#111827"];

export default function Confetti({ trigger = 0, count = 80, duration = 1800, origin = "center" }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!trigger) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const cx = origin === "top" ? w / 2 : w / 2;
    const cy = origin === "top" ? 0 : h / 2;

    const pieces = Array.from({ length: count }).map(() => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 7;
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        size: 4 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        life: 1,
        shape: Math.random() > 0.5 ? "rect" : "circle",
      };
    });

    let raf;
    const start = performance.now();
    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of pieces) {
        p.vy += 0.18;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.995;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - t / duration);
        if (p.life > 0) alive = true;
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    }
    raf = requestAnimationFrame(frame);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [trigger, count, duration, origin]);

  return <canvas ref={ref} className="confetti-canvas" aria-hidden="true" />;
}

export function ConfettiBurst({ active, onDone, label }) {
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => onDone && onDone(), 2400);
    return () => clearTimeout(t);
  }, [active, onDone]);
  if (!active) return null;
  return (
    <div className="confetti-overlay" aria-live="polite">
      <Confetti trigger={active} />
      {label && (
        <div className="confetti-label">
          <div className="confetti-label-eyebrow">Streak milestone</div>
          <div className="confetti-label-title">{label}</div>
        </div>
      )}
    </div>
  );
}
