import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Circle } from "lucide-react";

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

function parseSections(body) {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const sections = [];
  let current = null;
  let intro = [];

  function pushIntro() {
    if (intro.length && intro.join("").trim()) {
      sections.push({ id: "intro", title: "Overview", paragraphs: intro.slice(), kind: "intro" });
    }
    intro = [];
  }

  function isHeading(line) {
    const t = line.trim();
    if (!t) return false;
    if (/^#{1,6}\s+/.test(t)) return true;
    if (/^[A-Z][A-Z0-9 \-,'/&():]{2,80}:?$/.test(t) && t.split(" ").length <= 10) return true;
    return false;
  }

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (isHeading(line)) {
      if (current) sections.push(current);
      else pushIntro();
      const title = line.replace(/^#{1,6}\s+/, "").replace(/:$/, "").trim();
      current = { id: slugify(title) || `s-${sections.length + 1}`, title, paragraphs: [], kind: "section" };
    } else if (current) {
      current.paragraphs.push(line);
    } else {
      intro.push(line);
    }
  }
  if (current) sections.push(current);
  else pushIntro();

  return sections
    .map((s) => ({
      ...s,
      paragraphs: s.paragraphs
        .join("\n")
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
    }))
    .filter((s) => s.title || s.paragraphs.length);
}

export default function ReadingMode({ caseId, body, onExit, onNext, onPrev }) {
  const sections = useMemo(() => parseSections(body), [body]);
  const storageKey = useMemo(() => `crt:read:${caseId}`, [caseId]);
  const [readSet, setReadSet] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const [activeId, setActiveId] = useState(sections[0]?.id || null);
  const sectionRefs = useRef({});
  const containerRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(Array.from(readSet))); } catch {}
  }, [readSet, storageKey]);

  useEffect(() => {
    const opts = { root: null, rootMargin: "-30% 0px -55% 0px", threshold: 0 };
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setActiveId(visible[0].target.id);
    }, opts);
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      if (e.key === "Escape") { e.preventDefault(); onExit?.(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onNext?.(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); onPrev?.(); }
      else if (e.key === "j") {
        const idx = sections.findIndex((s) => s.id === activeId);
        const next = sections[Math.min(sections.length - 1, idx + 1)];
        if (next) sectionRefs.current[next.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (e.key === "k") {
        const idx = sections.findIndex((s) => s.id === activeId);
        const prev = sections[Math.max(0, idx - 1)];
        if (prev) sectionRefs.current[prev.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sections, activeId, onExit, onNext, onPrev]);

  function toggleRead(id) {
    setReadSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function jumpTo(id) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const total = sections.length || 1;
  const readCount = sections.filter((s) => readSet.has(s.id)).length;
  const pct = Math.round((readCount / total) * 100);

  return (
    <div className="reading-mode" ref={containerRef}>
      <div className="reading-progress" aria-hidden>
        <div className="reading-progress-bar" style={{ width: `${pct}%` }} />
      </div>

      <aside className="reading-toc">
        <div className="reading-toc-head">
          <span className="reading-toc-eyebrow">Reading mode</span>
          <button className="btn btn-ghost btn-sm" onClick={onExit}>Exit</button>
        </div>
        <div className="reading-toc-stats">
          <span><strong>{readCount}</strong> of {total} sections</span>
          <span className="muted small">{pct}% read</span>
        </div>
        <ol className="reading-toc-list">
          {sections.map((s) => {
            const isRead = readSet.has(s.id);
            const isActive = s.id === activeId;
            return (
              <li key={s.id} className={`reading-toc-item ${isActive ? "is-active" : ""} ${isRead ? "is-read" : ""}`}>
                <button type="button" className="reading-toc-link" onClick={() => jumpTo(s.id)}>
                  <span className="reading-toc-bullet" aria-hidden="true">
                    {isRead
                      ? <Check size={14} strokeWidth={2} aria-hidden="true" />
                      : <Circle size={14} strokeWidth={1.75} aria-hidden="true" />}
                  </span>
                  <span className="reading-toc-title">{s.title || "Section"}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="reading-toc-foot muted small">
          <div><kbd className="kbd">j</kbd>/<kbd className="kbd">k</kbd> next/prev section</div>
          <div><kbd className="kbd">←</kbd>/<kbd className="kbd">→</kbd> prev/next case</div>
          <div><kbd className="kbd">esc</kbd> exit</div>
        </div>
      </aside>

      <article className="reading-article">
        {sections.map((s) => {
          const isRead = readSet.has(s.id);
          return (
            <section
              key={s.id}
              id={s.id}
              ref={(el) => (sectionRefs.current[s.id] = el)}
              className={`reading-section ${isRead ? "is-read" : ""}`}
            >
              <header className="reading-section-head">
                <h3>{s.title || "Section"}</h3>
                <button
                  type="button"
                  className={`reading-mark ${isRead ? "is-read" : ""}`}
                  onClick={() => toggleRead(s.id)}
                  aria-pressed={isRead}
                >
                  {isRead ? (
                    <span className="row" style={{ gap: 4, alignItems: "center", display: "inline-flex" }}>
                      <Check size={14} strokeWidth={2} aria-hidden="true" />
                      Section read
                    </span>
                  ) : "Mark read"}
                </button>
              </header>
              <div className="reading-section-body">
                {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </section>
          );
        })}
        <div className="reading-bottom-nav">
          <button className="btn btn-ghost" onClick={onPrev}>← Previous case</button>
          <button className="btn btn-primary" onClick={onNext}>Next case →</button>
        </div>
      </article>
    </div>
  );
}
