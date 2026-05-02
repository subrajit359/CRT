import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  Folder, FileText, ChevronRight, Image as ImageIcon, FileVideo,
  Settings as Cog, BookOpen, ArrowLeft, ExternalLink,
  Heart, Brain, Wind, Baby, Scissors, Microscope, Activity,
  Zap, Flame, Search, X,
  CheckCircle2, FileType, ChevronDown, ChevronUp,
  Calendar, User as UserIcon,
  AlignLeft, Hash, Rss, FolderOpen,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import AttachmentViewer from "../components/AttachmentViewer.jsx";
import { useAuth } from "../lib/auth.jsx";
import { lazy, Suspense } from "react";
const NeetBlogPage       = lazy(() => import("../components/NeetBlogPage.jsx"));
const NeetResourceDetails = lazy(() => import("../components/NeetResourceDetails.jsx"));

/* ─── localStorage helpers ─────────────────────────────────────────────── */
const VIEWED_KEY  = "crlearn_study_viewed";
const RECENT_KEY  = "crlearn_study_recent";

function getViewed()  { try { return new Set(JSON.parse(localStorage.getItem(VIEWED_KEY) || "[]")); } catch { return new Set(); } }
function markViewed(id) {
  const s = getViewed(); s.add(id);
  localStorage.setItem(VIEWED_KEY, JSON.stringify([...s]));
}
function getRecent()  { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } }
function addRecent(item) {
  let list = getRecent().filter((r) => r.id !== item.id);
  list.unshift({ ...item, ts: Date.now() });
  if (list.length > 6) list = list.slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

/* ─── accent palette ────────────────────────────────────────────────────── */
const KEYWORD_COLORS = [
  { keys: ["cardio","heart","cardiac","coronary"],       color:"#E53E3E", bg:"rgba(229,62,62,0.08)"  },
  { keys: ["neuro","brain","spine","neural"],            color:"#7C3AED", bg:"rgba(124,58,237,0.08)" },
  { keys: ["pulmo","lung","respir","chest","airway"],    color:"#0EA5E9", bg:"rgba(14,165,233,0.08)" },
  { keys: ["gastro","bowel","liver","GI","hepat"],       color:"#059669", bg:"rgba(5,150,105,0.08)"  },
  { keys: ["pediatr","child","neonat","infant"],         color:"#EC4899", bg:"rgba(236,72,153,0.08)" },
  { keys: ["surg","operat","ortho","trauma","abdom"],    color:"#F97316", bg:"rgba(249,115,22,0.08)" },
  { keys: ["endocrin","diabet","thyroid","hormon"],      color:"#D97706", bg:"rgba(217,119,6,0.08)"  },
  { keys: ["nephro","kidney","renal"],                   color:"#0D9488", bg:"rgba(13,148,136,0.08)" },
  { keys: ["infect","micro","bacteria","virus","anti"],  color:"#65A30D", bg:"rgba(101,163,13,0.08)" },
  { keys: ["dermat","skin","rash"],                      color:"#C026D3", bg:"rgba(192,38,211,0.08)" },
  { keys: ["gynae","gynec","obstet","women","matern"],   color:"#DB2777", bg:"rgba(219,39,119,0.08)" },
  { keys: ["emergency","acute","critical","resus"],      color:"#DC2626", bg:"rgba(220,38,38,0.08)"  },
  { keys: ["psych","mental","behav"],                    color:"#6366F1", bg:"rgba(99,102,241,0.08)" },
  { keys: ["pharma","drug","medic","antibiotic"],        color:"#0891B2", bg:"rgba(8,145,178,0.08)"  },
  { keys: ["case","clinical","scenario"],                color:"#2563EB", bg:"rgba(37,99,235,0.08)"  },
  { keys: ["topic","note","summary","pathol"],           color:"#4f46e5", bg:"rgba(79,70,229,0.08)"  },
];
const FALLBACKS = [
  "#3B82F6","#8B5CF6","#06B6D4","#F59E0B","#EF4444","#10B981",
].map((c) => ({ color: c, bg: `${c}14` }));

function getAccent(name = "") {
  const lower = name.toLowerCase();
  for (const e of KEYWORD_COLORS) {
    if (e.keys.some((k) => lower.includes(k.toLowerCase()))) return e;
  }
  let h = 0;
  for (let i = 0; i < lower.length; i++) h = (h * 31 + lower.charCodeAt(i)) & 0xffffffff;
  return FALLBACKS[Math.abs(h) % FALLBACKS.length];
}

/* ─── icons ─────────────────────────────────────────────────────────────── */
function CatIcon({ name, size = 22, color }) {
  const p = { size, color, strokeWidth: 1.75 };
  const l = (name || "").toLowerCase();
  if (l.includes("cardio") || l.includes("heart"))       return <Heart {...p} />;
  if (l.includes("neuro") || l.includes("brain"))        return <Brain {...p} />;
  if (l.includes("pulmo") || l.includes("lung"))         return <Wind {...p} />;
  if (l.includes("pediatr") || l.includes("child"))      return <Baby {...p} />;
  if (l.includes("surg") || l.includes("abdom"))         return <Scissors {...p} />;
  if (l.includes("infect") || l.includes("micro"))       return <Microscope {...p} />;
  if (l.includes("endocrin") || l.includes("diabet"))    return <Activity {...p} />;
  if (l.includes("pharma") || l.includes("drug"))        return <FileType {...p} />;
  if (l.includes("emergency") || l.includes("acute"))    return <Zap {...p} />;
  if (l.includes("dermat") || l.includes("skin"))        return <Flame {...p} />;
  if (l.includes("psych"))                               return <Brain {...p} />;
  if (l.includes("case") || l.includes("clinical"))      return <BookOpen {...p} />;
  return <Folder {...p} />;
}

function KindIcon({ kind, color, size = 16 }) {
  const p = { size, color, strokeWidth: 1.75 };
  if (kind === "image") return <ImageIcon {...p} />;
  if (kind === "video") return <FileVideo {...p} />;
  if (kind === "note")  return <FileText {...p} />;
  return <FileText {...p} />;
}

function kindLabel(kind, storageUrl) {
  if (kind === "image") return "IMAGE";
  if (kind === "video") return "VIDEO";
  if (kind === "pdf")   return "PDF";
  if (kind === "pptx")  return "PPTX";
  if (kind === "doc")   return "DOC";
  if (storageUrl)       return "FILE";
  return "NOTE";
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/* ─── slugify for anchor IDs ─────────────────────────────────────────────── */
function slugify(name = "", id = "") {
  return `section-${id || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;
}

/* ─── note reader modal ────────────────────────────────────────────────── */
function NoteModal({ resource, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!resource) return null;
  const { color, bg } = getAccent(resource.category_name || resource.title || "");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(10,10,10,0.55)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elev)", borderRadius: 20, width: "100%", maxWidth: 660,
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.25)", border: "1px solid var(--line)",
          overflow: "hidden",
        }}
      >
        <div style={{
          padding: "20px 24px 16px", borderBottom: "1px solid var(--line)",
          background: bg, display: "flex", alignItems: "flex-start", gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `${color}22`, display: "grid", placeItems: "center", flexShrink: 0,
            border: `1.5px solid ${color}33`,
          }}>
            <KindIcon kind={resource.kind} color={color} size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--ink-900)", lineHeight: 1.3 }}>
              {resource.title}
            </h3>
            {(resource.category_name || resource.parent_name) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                {resource.parent_name && (
                  <>
                    <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 99, background: `${color}18`, color, fontWeight: 700 }}>
                      {resource.parent_name}
                    </span>
                    <ChevronRight size={12} color="var(--ink-300)" />
                  </>
                )}
                <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{resource.category_name}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              border: "none", background: "rgba(0,0,0,0.08)", borderRadius: 10,
              width: 32, height: 32, display: "grid", placeItems: "center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <X size={16} color="var(--ink-600)" />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "22px 24px", flex: 1 }}>
          {resource.description ? (
            <pre style={{
              whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14.5,
              lineHeight: 1.8, color: "var(--ink-800)", margin: 0,
            }}>
              {resource.description}
            </pre>
          ) : (
            <p style={{ color: "var(--ink-400)", fontStyle: "italic" }}>No content.</p>
          )}
        </div>

        {resource.uploader && (
          <div style={{
            padding: "12px 24px", borderTop: "1px solid var(--line)",
            fontSize: 12, color: "var(--ink-400)", background: "var(--bg-muted)",
          }}>
            Added by @{resource.uploader}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── blog post card (root level) ───────────────────────────────────────── */
function BlogPostCard({ cat, onClick }) {
  const { color } = getAccent(cat.name);
  const total = (cat.child_count || 0) + (cat.resource_count || 0);

  return (
    <div className="study-blog-card" onClick={onClick}>
      <div className="study-blog-thumb">
        {cat.thumbnail_url ? (
          <img src={cat.thumbnail_url} alt={cat.name} className="study-blog-thumb-img" />
        ) : (
          <div className="study-blog-thumb-fallback" style={{ background: `linear-gradient(135deg, ${color}28 0%, ${color}10 100%)` }}>
            <CatIcon name={cat.name} size={52} color={color} />
          </div>
        )}
        <div className="study-blog-thumb-overlay" />
        <div className="study-blog-date-badge">
          <Calendar size={11} />
          {fmtDate(cat.created_at)}
        </div>
      </div>

      <div className="study-blog-body">
        <div className="study-blog-meta">
          {cat.author && (
            <span className="study-blog-author">
              <UserIcon size={11} /> @{cat.author}
            </span>
          )}
          {total > 0 && (
            <span className="study-blog-count">
              {total} item{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <h3 className="study-blog-title">{cat.name}</h3>

        {cat.description && (
          <p className="study-blog-excerpt">{cat.description}</p>
        )}

        <div className="study-blog-footer">
          <button className="study-blog-btn" style={{ color, borderColor: `${color}40`, background: `${color}0e` }}>
            Read more <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── blog skeleton ─────────────────────────────────────────────────────── */
function BlogSkeletons() {
  return (
    <div className="study-blog-grid">
      {[1,2,3,4,5,6].map((i) => (
        <div key={i} className="study-blog-card" style={{ cursor: "default" }}>
          <div className="study-blog-thumb shimmer" style={{ borderRadius: "16px 16px 0 0" }} />
          <div className="study-blog-body" style={{ gap: 10 }}>
            <div className="shimmer" style={{ height: 12, width: "40%", borderRadius: 6 }} />
            <div className="shimmer" style={{ height: 20, width: "80%", borderRadius: 6 }} />
            <div className="shimmer" style={{ height: 14, width: "100%", borderRadius: 6 }} />
            <div className="shimmer" style={{ height: 14, width: "70%", borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Table of Contents ─────────────────────────────────────────────────── */
function TableOfContents({ items, onItemClick }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="study-toc">
      <div className="study-toc-header">
        <AlignLeft size={15} />
        Table of Contents
      </div>
      <ol className="study-toc-list">
        {items.map((item, i) => (
          <li key={item.id} className="study-toc-item">
            <a
              href={`#${slugify(item.name, item.id)}`}
              className="study-toc-link"
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(slugify(item.name, item.id));
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <span className="study-toc-num">{i + 1}.</span>
              {item.name}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ─── blog-style section for sub-category ──────────────────────────────── */
function BlogSection({ cat, onNavigate }) {
  const { color } = getAccent(cat.name);
  const hasChildren = cat.child_count > 0;
  const hasResources = cat.resource_count > 0;
  const anchorId = slugify(cat.name, cat.id);

  return (
    <div id={anchorId} className="study-section-block">
      {/* Section header row */}
      <div className="study-section-header" style={{ borderLeftColor: color }}>
        <div className="study-section-header-left">
          <div className="study-section-icon" style={{ background: `${color}18`, border: `1.5px solid ${color}30` }}>
            <CatIcon name={cat.name} size={20} color={color} />
          </div>
          <div>
            <h3 className="study-section-title">{cat.name}</h3>
            {cat.description && (
              <p className="study-section-subtitle">{cat.description}</p>
            )}
            <div className="study-section-meta">
              {hasChildren && (
                <span style={{ color }}>{cat.child_count} subsection{cat.child_count !== 1 ? "s" : ""}</span>
              )}
              {hasChildren && hasResources && <span style={{ color: "var(--ink-300)" }}>·</span>}
              {hasResources && (
                <span style={{ color: "var(--ink-500)" }}>{cat.resource_count} resource{cat.resource_count !== 1 ? "s" : ""}</span>
              )}
            </div>
          </div>
        </div>

        <button
          className="study-section-browse-btn"
          style={{ color, borderColor: `${color}40`, background: `${color}0d` }}
          onClick={() => onNavigate(cat.id)}
        >
          Browse <ChevronRight size={14} />
        </button>
      </div>

      {/* Thumbnail if available */}
      {cat.thumbnail_url && (
        <div className="study-section-thumb-wrap">
          <img src={cat.thumbnail_url} alt={cat.name} className="study-section-thumb-img" />
        </div>
      )}
    </div>
  );
}

/* ─── resource numbered list item ──────────────────────────────────────── */
function ResourceListItem({ r, index, viewed, onClick, accentOverride }) {
  const [expanded, setExpanded] = useState(false);
  const isViewable = !!r.storage_url || r.description;
  const { color } = accentOverride || getAccent(r.category_name || r.title || "");
  const kLabel = kindLabel(r.kind, r.storage_url);

  return (
    <li className="study-res-item">
      <div className="study-res-item-row" onClick={isViewable ? onClick : undefined}
        style={{ cursor: isViewable ? "pointer" : "default" }}>
        <span className="study-res-item-num" style={{ color }}>{index}.</span>
        <div className="study-res-item-body">
          <span className="study-res-item-title">{r.title}</span>
          <div className="study-res-item-badges">
            <span className="study-res-kind-badge" style={{ background: `${color}18`, color }}>
              {kLabel}
            </span>
            {r.uploader && (
              <span className="study-res-uploader">by @{r.uploader}</span>
            )}
          </div>
        </div>
        <div className="study-res-item-actions">
          {viewed && <CheckCircle2 size={14} color="var(--success)" strokeWidth={2.5} />}
          {r.description && (
            <button
              className="study-res-preview-btn"
              onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? "Hide" : "Preview"}
            </button>
          )}
          {r.storage_url && (
            <button className="study-res-open-btn" style={{ color, borderColor: `${color}40`, background: `${color}0d` }}
              onClick={(e) => { e.stopPropagation(); onClick(); }}>
              <ExternalLink size={12} /> Open
            </button>
          )}
        </div>
      </div>

      {expanded && r.description && (
        <div className="study-res-expand">
          <pre className="study-res-expand-text">{r.description}</pre>
        </div>
      )}
    </li>
  );
}

/* ─── resource list skeleton ─────────────────────────────────────────────── */
function ResourceListSkeletons({ count = 5 }) {
  return (
    <ul className="study-res-list">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="study-res-item">
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0" }}>
            <div className="shimmer" style={{ width: 22, height: 18, borderRadius: 4, flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="shimmer" style={{ height: 15, width: "65%", borderRadius: 5 }} />
              <div className="shimmer" style={{ height: 11, width: "35%", borderRadius: 4 }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ─── search result row ─────────────────────────────────────────────────── */
function SearchResultRow({ r, viewed, onClick }) {
  const [expanded, setExpanded] = useState(false);
  const isViewable = !!r.storage_url || r.description;
  const { color } = getAccent(r.parent_name || r.category_name || r.title || "");
  const kLabel = kindLabel(r.kind, r.storage_url);

  return (
    <div className="study-search-row" style={{ borderLeftColor: color }}>
      <div
        className="study-search-row-main"
        style={{ cursor: isViewable ? "pointer" : "default" }}
        onClick={isViewable ? onClick : undefined}
      >
        <div className="study-search-row-icon" style={{ background: `${color}15` }}>
          <KindIcon kind={r.kind} color={color} size={15} />
        </div>
        <div className="study-search-row-body">
          <span className="study-search-row-title">{r.title}</span>
          <div className="study-search-row-meta">
            <span className="study-res-kind-badge" style={{ background: `${color}18`, color }}>{kLabel}</span>
            {r.parent_name && <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{r.parent_name}</span>}
            {r.parent_name && r.category_name && <ChevronRight size={10} color="var(--ink-300)" />}
            {r.category_name && <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{r.category_name}</span>}
          </div>
        </div>
        <div className="study-search-row-actions">
          {viewed && <CheckCircle2 size={14} color="var(--success)" strokeWidth={2.5} />}
          {r.description && (
            <button className="study-res-preview-btn"
              onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}>
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          {r.storage_url && (
            <button className="study-res-open-btn" style={{ color, borderColor: `${color}40`, background: `${color}0d` }}
              onClick={(e) => { e.stopPropagation(); onClick(); }}>
              <ExternalLink size={12} /> Open
            </button>
          )}
        </div>
      </div>
      {expanded && r.description && (
        <div className="study-res-expand">
          <pre className="study-res-expand-text">{r.description}</pre>
        </div>
      )}
    </div>
  );
}

/* ─── blog skeleton inside post ────────────────────────────────────────── */
function SectionSkeletons() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 24 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{
          background: "var(--bg-elev)", borderRadius: 16,
          border: "1.5px solid var(--line)", overflow: "hidden",
          borderLeft: "4px solid var(--ink-200)",
        }}>
          <div style={{ padding: "20px 22px", display: "flex", alignItems: "center", gap: 14 }}>
            <div className="shimmer" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="shimmer" style={{ height: 18, width: "50%", borderRadius: 5 }} />
              <div className="shimmer" style={{ height: 12, width: "30%", borderRadius: 4 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function StudyResources() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const isManager = user?.role === "admin" || user?.role === "doctor";

  const params = new URLSearchParams(search);
  const cat = params.get("cat") || "";

  const [activeTab, setActiveTab] = useState("blog");
  const [selectedBlogPostId, setSelectedBlogPostId] = useState(null);

  const [path, setPath]             = useState([]);
  const [categories, setCategories] = useState([]);
  const [resources, setResources]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [viewer, setViewer]         = useState(null);
  const [noteRes, setNoteRes]       = useState(null);

  const [query, setQuery]               = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching]       = useState(false);
  const searchTimer = useRef(null);

  const [viewed, setViewed] = useState(() => getViewed());

  function go(id) { navigate(id ? `/study?cat=${id}` : "/study"); }

  useEffect(() => {
    setLoading(true);
    const calls = [
      api.get(`/api/study/categories${cat ? `?parent=${encodeURIComponent(cat)}` : ""}`)
         .then((r) => setCategories(r.categories || [])),
    ];
    if (cat) {
      calls.push(api.get(`/api/study/categories/${cat}/path`).then((r) => setPath(r.path || [])));
      calls.push(api.get(`/api/study/categories/${cat}/resources`).then((r) => setResources(r.resources || [])));
    } else {
      setPath([]); setResources([]);
    }
    Promise.all(calls).finally(() => setLoading(false));
  }, [cat]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.get(`/api/study/search?q=${encodeURIComponent(query.trim())}`);
        setSearchResults(r.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 320);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  function openResource(r) {
    markViewed(r.id);
    setViewed(getViewed());
    addRecent(r);
    if (r.storage_url) {
      const list = (searchResults || resources).filter((x) => x.storage_url);
      const idx = list.findIndex((x) => x.id === r.id);
      if (idx >= 0) setViewer({ list, idx });
    } else if (r.description) {
      setNoteRes(r);
    }
  }

  const isSearching = query.trim().length >= 2;
  const current = path[path.length - 1];

  return (
    <AppShell>
      <style>{`
        @keyframes srSlideForward { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .sr-anim { animation: srSlideForward 0.25s cubic-bezier(.4,0,.2,1) both; }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 80px" }}>

        {/* ── Page header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "28px 0 20px", flexWrap: "wrap", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 14,
              background: "linear-gradient(135deg, var(--emerald-600), var(--emerald-800))",
              display: "grid", placeItems: "center", flexShrink: 0,
            }}>
              <BookOpen size={22} color="#fff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--ink-900)" }}>Study</h2>
              <p style={{ margin: 0, fontSize: 13, color: "var(--ink-400)" }}>
                Medical notes, slides, references & more
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isManager && (
              <Link href="/admin/neet-blog" className="btn btn-primary btn-sm">
                <Cog size={14} style={{ marginRight: 4 }} /> Manage Blog
              </Link>
            )}
            {isManager && (
              <Link href="/admin/study" className="btn btn-ghost btn-sm">
                <Cog size={14} style={{ marginRight: 4 }} /> Resources
              </Link>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display: "flex", gap: 4, marginBottom: 24,
          borderBottom: "2px solid var(--line)",
        }}>
          {[
            { id: "blog", label: "Blog Posts", icon: <Rss size={14} /> },
            { id: "resources", label: "Resource Library", icon: <FolderOpen size={14} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 18px",
                fontSize: 14, fontWeight: 600,
                border: "none", background: "none", cursor: "pointer",
                color: activeTab === tab.id ? "var(--primary-600, #1a73e8)" : "var(--ink-400)",
                borderBottom: activeTab === tab.id ? "2px solid var(--primary-600, #1a73e8)" : "2px solid transparent",
                marginBottom: -2,
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ── Blog tab ── */}
        {activeTab === "blog" && (
          <div style={{ margin: "0 -16px" }}>
            <Suspense fallback={<div className="page-center"><div className="spinner-lg" /></div>}>
              {selectedBlogPostId ? (
                <NeetResourceDetails
                  postId={selectedBlogPostId}
                  onBack={() => setSelectedBlogPostId(null)}
                />
              ) : (
                <NeetBlogPage onPostSelect={(id) => setSelectedBlogPostId(id)} />
              )}
            </Suspense>
          </div>
        )}

        {/* ── Resources tab ── */}
        {activeTab === "resources" && <>

        {/* ── Search bar ── */}
        <div style={{ position: "relative", marginBottom: 28 }}>
          <Search size={16} color="var(--ink-400)"
            style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            type="text"
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all notes, resources, topics…"
            style={{ paddingLeft: 42, paddingRight: query ? 40 : 14, width: "100%", boxSizing: "border-box", height: 44, fontSize: 14 }}
          />
          {query && (
            <button onClick={() => { setQuery(""); setSearchResults(null); }}
              style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                border: "none", background: "var(--ink-200)", borderRadius: 99,
                width: 22, height: 22, display: "grid", placeItems: "center",
                cursor: "pointer",
              }}>
              <X size={12} color="var(--ink-600)" />
            </button>
          )}
        </div>

        {/* ── Search results ── */}
        {isSearching ? (
          <div className="sr-anim">
            {searching ? (
              <ResourceListSkeletons count={5} />
            ) : searchResults && searchResults.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--ink-400)" }}>
                <Search size={36} style={{ marginBottom: 14, opacity: 0.25 }} />
                <p style={{ margin: 0, fontSize: 15 }}>No results for "<strong>{query}</strong>"</p>
              </div>
            ) : searchResults ? (
              <>
                <div style={{ marginBottom: 16, fontSize: 13, color: "var(--ink-500)" }}>
                  <strong>{searchResults.length}</strong> result{searchResults.length !== 1 ? "s" : ""} for "<strong>{query}</strong>"
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {searchResults.map((r) => (
                    <SearchResultRow
                      key={r.id} r={r}
                      viewed={viewed.has(r.id)}
                      onClick={() => openResource(r)}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>

        /* ── ROOT: blog post grid ── */
        ) : !cat ? (
          <div className="sr-anim">
            {loading ? (
              <BlogSkeletons />
            ) : categories.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 24px", color: "var(--ink-400)" }}>
                <BookOpen size={48} strokeWidth={1} style={{ marginBottom: 16, opacity: 0.25 }} />
                <h3 style={{ margin: "0 0 8px", color: "var(--ink-500)" }}>No posts yet</h3>
                <p style={{ margin: 0, fontSize: 14 }}>
                  {isManager
                    ? "Create your first post from the Manage posts panel."
                    : "Check back soon — content is being added."}
                </p>
                {isManager && (
                  <Link href="/admin/study" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>
                    Create first post →
                  </Link>
                )}
              </div>
            ) : (
              <div className="study-blog-grid">
                {categories.map((c) => (
                  <BlogPostCard key={c.id} cat={c} onClick={() => go(c.id)} />
                ))}
              </div>
            )}
          </div>

        /* ── INSIDE A POST ── */
        ) : (
          <div className="sr-anim">

            {/* Post article header */}
            {current && (
              <div className="study-article-header">
                {/* Breadcrumb + back */}
                <div className="study-article-breadcrumb">
                  <button
                    className="study-article-back-btn"
                    onClick={() => go(path.length >= 2 ? path[path.length - 2].id : "")}
                  >
                    <ArrowLeft size={14} />
                    {path.length >= 2 ? path[path.length - 2].name : "Study"}
                  </button>
                  {path.length > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      <ChevronRight size={12} color="var(--ink-300)" />
                      {path.map((p, i) => (
                        <span key={p.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {i > 0 && <ChevronRight size={11} color="var(--ink-300)" />}
                          <span style={{ fontSize: 12, color: i === path.length - 1 ? "var(--ink-700)" : "var(--ink-400)", fontWeight: i === path.length - 1 ? 600 : 400 }}>
                            {p.name}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cover image */}
                {current.thumbnail_url && (
                  <div className="study-article-cover">
                    <img src={current.thumbnail_url} alt={current.name} />
                  </div>
                )}

                {/* Title */}
                <h1 className="study-article-title">{current.name}</h1>

                {/* Meta: date + author */}
                <div className="study-article-meta">
                  <span className="study-article-meta-item">
                    <Calendar size={13} />
                    {fmtDate(current.created_at || path[0]?.created_at)}
                  </span>
                  {(categories.length > 0 || resources.length > 0) && (
                    <span className="study-article-meta-item">
                      <Hash size={13} />
                      {categories.length > 0
                        ? `${categories.length} section${categories.length !== 1 ? "s" : ""}`
                        : `${resources.length} resource${resources.length !== 1 ? "s" : ""}`}
                    </span>
                  )}
                </div>

                {/* Description as excerpt */}
                {current.description && (
                  <p className="study-article-excerpt">{current.description}</p>
                )}

                {/* Divider */}
                <div className="study-article-divider" />
              </div>
            )}

            {loading ? (
              categories.length > 0 || !cat ? <SectionSkeletons /> : <ResourceListSkeletons count={6} />
            ) : (
              <>
                {/* Table of Contents — only when there are sub-categories */}
                {categories.length > 0 && (
                  <TableOfContents items={categories} />
                )}

                {/* Sub-categories as blog sections */}
                {categories.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
                    {categories.map((c) => (
                      <BlogSection
                        key={c.id}
                        cat={c}
                        onNavigate={go}
                      />
                    ))}
                  </div>
                )}

                {/* Resources as numbered list */}
                {resources.length > 0 && (
                  <div style={{ marginTop: categories.length > 0 ? 32 : 8 }}>
                    {categories.length > 0 && (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--line)",
                      }}>
                        <FileText size={15} color="var(--ink-400)" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-600)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Resources in this section
                        </span>
                      </div>
                    )}
                    <ul className="study-res-list">
                      {resources.map((r, i) => (
                        <ResourceListItem
                          key={r.id}
                          r={r}
                          index={i + 1}
                          viewed={viewed.has(r.id)}
                          accentOverride={getAccent(current?.name || "")}
                          onClick={() => openResource(r)}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {categories.length === 0 && resources.length === 0 && (
                  <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--ink-400)" }}>
                    <Folder size={36} strokeWidth={1} style={{ marginBottom: 12, opacity: 0.25 }} />
                    <p style={{ margin: 0 }}>No content in this section yet.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </>}

      </div>

      {noteRes && <NoteModal resource={noteRes} onClose={() => setNoteRes(null)} />}

      {viewer && (
        <AttachmentViewer
          items={viewer.list}
          index={viewer.idx}
          onClose={() => setViewer(null)}
          onIndexChange={(i) => setViewer((v) => ({ ...v, idx: i }))}
        />
      )}
    </AppShell>
  );
}
