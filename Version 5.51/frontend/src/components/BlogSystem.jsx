import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "../lib/api.js";

// ─── Drive URL helpers ────────────────────────────────────────────────────────
function parseDriveId(url) {
  if (!url) return null;
  const m1 = url.match(/\/file\/d\/([^/?#]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([^&#]+)/);
  if (m2) return m2[1];
  return null;
}

function getDriveEmbedUrl(url) {
  if (!url) return null;
  const id = parseDriveId(url);
  if (id) return `https://drive.google.com/file/d/${id}/preview`;
  if (url.includes("docs.google.com")) {
    return url.replace(/\/(edit|view)[^?]*/, "/preview");
  }
  return null;
}

function getDriveDownloadUrl(url) {
  if (!url) return url;
  const id = parseDriveId(url);
  if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  return url;
}

// ─── Inline Styles ────────────────────────────────────────────────────────────
const s = {
  wrapper: {
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    backgroundColor: "#f9f9f9",
    minHeight: "100vh",
    padding: 0,
    color: "#222",
  },
  searchBar: {
    backgroundColor: "#fff",
    borderBottom: "1px solid #e0e0e0",
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    position: "sticky",
    top: 0,
    zIndex: 100,
    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
  },
  searchInput: {
    flex: 1,
    border: "1px solid #ccc",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 14,
    outline: "none",
    color: "#333",
    backgroundColor: "#fafafa",
  },
  searchBtn: {
    backgroundColor: "#1a73e8",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 18px",
    fontSize: 14,
    cursor: "pointer",
    fontWeight: 600,
  },
  resultsHeading: {
    background: "linear-gradient(135deg, #0d47a1 0%, #1a73e8 100%)",
    color: "#fff",
    padding: "20px 16px",
    fontSize: 20,
    fontWeight: 800,
    lineHeight: 1.3,
  },
  postsList: { padding: "8px 12px" },
  postCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    marginBottom: 14,
    overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    border: "1px solid #ececec",
  },
  postImageWrap: {
    width: "100%",
    height: 170,
    overflow: "hidden",
    backgroundColor: "#dde6f5",
    position: "relative",
  },
  postImage: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  postImagePlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
  },
  viewCount: {
    position: "absolute",
    top: 8,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    color: "#fff",
    fontSize: 12,
    borderRadius: 12,
    padding: "2px 8px",
    fontWeight: 600,
  },
  postBody: { padding: "12px 14px 14px" },
  postTitle: { fontSize: 16, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px", lineHeight: 1.35 },
  postMeta: { display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#777", marginBottom: 8 },
  postExcerpt: {
    fontSize: 13.5,
    color: "#555",
    lineHeight: 1.55,
    margin: "0 0 12px",
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  readMoreBtn: {
    display: "inline-block",
    backgroundColor: "#1a73e8",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    padding: "7px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  tagBadge: {
    display: "inline-block",
    backgroundColor: "#e8f0fe",
    color: "#1a73e8",
    borderRadius: 12,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    marginRight: 4,
    marginBottom: 4,
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    padding: "18px 0 28px",
  },
  pageBtn: {
    border: "1px solid #ccc",
    background: "#fff",
    borderRadius: 5,
    padding: "7px 14px",
    fontSize: 14,
    cursor: "pointer",
    color: "#333",
    fontWeight: 500,
  },
  pageBtnActive: {
    border: "1px solid #1a73e8",
    background: "#1a73e8",
    borderRadius: 5,
    padding: "7px 14px",
    fontSize: 14,
    cursor: "pointer",
    color: "#fff",
    fontWeight: 600,
  },
  detailWrap: { backgroundColor: "#fff", minHeight: "100vh" },
  detailHero: {
    background: "linear-gradient(135deg, #0d47a1 0%, #1a73e8 100%)",
    color: "#fff",
    padding: "22px 16px",
  },
  detailHeroTitle: { fontSize: 22, fontWeight: 800, lineHeight: 1.3, margin: 0 },
  detailMeta: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginTop: 10,
    flexWrap: "wrap",
  },
  detailBody: { padding: "18px 16px" },
  detailSection: { marginBottom: 28 },
  detailSectionTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: "#0d47a1",
    borderBottom: "2px solid #e0e8ff",
    paddingBottom: 6,
    marginBottom: 12,
  },
  detailSectionImage: {
    width: "100%",
    height: 150,
    objectFit: "cover",
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: "#dde6f5",
  },
  detailList: { listStyle: "none", padding: 0, margin: 0 },
  detailListItem: {
    padding: "8px 0",
    borderBottom: "1px solid #f0f0f0",
    fontSize: 14,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  detailListItemRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  },
  detailListNum: { color: "#555", fontWeight: 600, minWidth: 22, flexShrink: 0, paddingTop: 1 },
  detailListLabel: { color: "#1a73e8", cursor: "pointer", flex: 1, lineHeight: 1.4 },
  driveBtns: { display: "flex", gap: 8, paddingLeft: 30, flexWrap: "wrap" },
  driveEmbedBtn: {
    border: "1px solid #1a73e8",
    background: "#fff",
    color: "#1a73e8",
    borderRadius: 5,
    padding: "4px 12px",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  driveDownloadBtn: {
    border: "none",
    background: "#1a73e8",
    color: "#fff",
    borderRadius: 5,
    padding: "4px 12px",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 600,
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  driveEmbed: {
    width: "100%",
    height: 420,
    border: "1px solid #dde6f5",
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: "#f8faff",
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#1a73e8",
    fontSize: 14,
    cursor: "pointer",
    padding: "14px 16px 0",
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontWeight: 600,
  },
  tocBox: {
    border: "1px solid #e0e8ff",
    borderRadius: 7,
    padding: "12px 14px",
    marginBottom: 20,
    backgroundColor: "#f8faff",
  },
  tocTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "#555",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  tocItem: { fontSize: 13, color: "#1a73e8", padding: "3px 0", cursor: "pointer", display: "block" },
  adBox: {
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
    height: 60,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#aaa",
    fontSize: 12,
    marginBottom: 16,
    border: "1px dashed #ccc",
  },
  relatedSection: {
    backgroundColor: "#f4f7ff",
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  spinner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 0",
    color: "#888",
    fontSize: 14,
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 24px",
    color: "#888",
    fontSize: 15,
  },
};

// ─── Icons ────────────────────────────────────────────────────────────────────
const CalendarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const ClockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const EyeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const DriveIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2L2 19h20L12 2z" /><path d="M2 19l5-8" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// ─── Drive item row ───────────────────────────────────────────────────────────
function DriveItem({ item, index }) {
  const [open, setOpen] = useState(false);
  const embedUrl = getDriveEmbedUrl(item.drive_url);
  const downloadUrl = getDriveDownloadUrl(item.drive_url);
  const hasDrive = !!item.drive_url;

  return (
    <li style={s.detailListItem}>
      <div style={s.detailListItemRow}>
        <span style={s.detailListNum}>{index}.</span>
        <span
          style={{ ...s.detailListLabel, cursor: hasDrive ? "pointer" : "default" }}
          onClick={() => hasDrive && setOpen((v) => !v)}
        >
          {item.label}
        </span>
      </div>
      {hasDrive && (
        <div style={s.driveBtns}>
          {embedUrl && (
            <button style={s.driveEmbedBtn} onClick={() => setOpen((v) => !v)}>
              <DriveIcon /> {open ? "Hide Preview" : "Preview"}
            </button>
          )}
          <a href={downloadUrl} target="_blank" rel="noreferrer" style={s.driveDownloadBtn}>
            <DownloadIcon /> Download
          </a>
        </div>
      )}
      {open && embedUrl && (
        <iframe
          src={embedUrl}
          style={s.driveEmbed}
          allow="autoplay"
          title={item.label}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      )}
    </li>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────
function PostCard({ post, onReadMore }) {
  return (
    <div style={s.postCard}>
      <div style={s.postImageWrap}>
        {post.thumbnail_url ? (
          <img src={post.thumbnail_url} alt={post.title} style={s.postImage} />
        ) : (
          <div style={s.postImagePlaceholder}>No Image</div>
        )}
        {post.views > 0 && (
          <span style={s.viewCount}><EyeIcon /> {post.views.toLocaleString()}</span>
        )}
      </div>
      <div style={s.postBody}>
        <h2 style={s.postTitle}>{post.title}</h2>
        <div style={s.postMeta}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <CalendarIcon /> {new Date(post.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <ClockIcon /> {post.read_time}
          </span>
        </div>
        {post.tags?.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {post.tags.map((t) => <span key={t} style={s.tagBadge}>{t}</span>)}
          </div>
        )}
        {post.excerpt && <p style={s.postExcerpt}>{post.excerpt}</p>}
        <button style={s.readMoreBtn} onClick={() => onReadMore(post)}>Read More</button>
      </div>
    </div>
  );
}

// ─── Post Detail ──────────────────────────────────────────────────────────────
function PostDetail({ post, onBack }) {
  return (
    <div style={s.detailWrap}>
      <button style={s.backBtn} onClick={onBack}><BackIcon /> Back</button>
      <div style={s.detailHero}>
        <h1 style={s.detailHeroTitle}>{post.title}</h1>
        <div style={s.detailMeta}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <CalendarIcon />{" "}
            {new Date(post.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <ClockIcon /> {post.read_time}
          </span>
          {post.views > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <EyeIcon /> {post.views.toLocaleString()}
            </span>
          )}
        </div>
        {post.tags?.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {post.tags.map((t) => (
              <span key={t} style={{ ...s.tagBadge, backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      <div style={s.detailBody}>
        <div style={s.adBox}>Advertisement</div>

        {post.sections?.length > 0 && (
          <div style={s.tocBox}>
            <div style={s.tocTitle}>Table of Contents</div>
            {post.sections.map((sec, i) => (
              <span
                key={sec.id}
                style={s.tocItem}
                onClick={() => document.getElementById(`blog-sec-${sec.id}`)?.scrollIntoView({ behavior: "smooth" })}
              >
                {i + 1}. {sec.title}
              </span>
            ))}
          </div>
        )}

        {post.excerpt && (
          <p style={{ fontSize: 14, color: "#444", lineHeight: 1.6, marginBottom: 20 }}>{post.excerpt}</p>
        )}

        {post.sections?.map((sec, i) => (
          <div key={sec.id} id={`blog-sec-${sec.id}`} style={s.detailSection}>
            <h3 style={s.detailSectionTitle}>{sec.title}</h3>
            {sec.image_url && (
              <img src={sec.image_url} alt={sec.title} style={s.detailSectionImage} />
            )}
            {sec.items?.length > 0 ? (
              <ol style={s.detailList}>
                {sec.items.map((item, j) => (
                  <DriveItem key={item.id} item={item} index={j + 1} />
                ))}
              </ol>
            ) : (
              <p style={{ fontSize: 13, color: "#999", fontStyle: "italic" }}>No resources in this section yet.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function Pagination({ current, total, onChange }) {
  if (total <= 1) return null;

  function getPages() {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [];
    pages.push(1);
    if (current > 3) pages.push("…");
    for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
    if (current < total - 2) pages.push("…");
    pages.push(total);
    return pages;
  }

  return (
    <div style={s.pagination}>
      <button style={s.pageBtn} onClick={() => onChange(current - 1)} disabled={current === 1}>« Prev</button>
      {getPages().map((p, i) =>
        p === "…"
          ? <span key={`ellipsis-${i}`} style={{ padding: "7px 4px", color: "#888", fontSize: 14 }}>…</span>
          : <button key={p} style={p === current ? s.pageBtnActive : s.pageBtn} onClick={() => onChange(p)}>{p}</button>
      )}
      <button style={s.pageBtn} onClick={() => onChange(current + 1)} disabled={current === total}>Next »</button>
    </div>
  );
}

// ─── Main BlogSystem ──────────────────────────────────────────────────────────
/**
 * BlogSystem — fetches posts from /api/blog/posts
 *
 * Props:
 *   postsPerPage {number}  – default 5
 *   searchTitle  {string}  – heading override
 *   tagFilter    {string}  – pre-filter by tag
 */
export default function BlogSystem({ postsPerPage = 5, searchTitle = "", tagFilter = "" }) {
  const [inputQ, setInputQ] = useState("");
  const [activeQ, setActiveQ] = useState("");
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [postDetail, setPostDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchPosts = useCallback(async (q, p) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: postsPerPage });
      if (q) params.set("q", q);
      if (tagFilter) params.set("tag", tagFilter);
      const res = await fetch(apiUrl(`/api/blog/posts?${params}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load posts");
      const data = await res.json();
      setPosts(data.posts || []);
      setTotalPages(data.pages || 1);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [postsPerPage, tagFilter]);

  useEffect(() => { fetchPosts(activeQ, page); }, [fetchPosts, activeQ, page]);

  const handleSearch = () => {
    setActiveQ(inputQ.trim());
    setPage(1);
    setSelectedPost(null);
    setPostDetail(null);
  };

  const openPost = async (post) => {
    setSelectedPost(post);
    setLoadingDetail(true);
    setPostDetail(null);
    try {
      const [detailRes] = await Promise.all([
        fetch(apiUrl(`/api/blog/posts/${post.id}`), { credentials: "include" }),
        fetch(apiUrl(`/api/blog/posts/${post.id}/view`), { method: "POST", credentials: "include" }),
      ]);
      if (detailRes.ok) setPostDetail(await detailRes.json());
    } catch { /* ignore */ } finally {
      setLoadingDetail(false);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setSelectedPost(null);
    setPostDetail(null);
  };

  if (selectedPost) {
    return (
      <div style={s.wrapper}>
        <div style={s.searchBar}>
          <input
            type="text" placeholder="Search posts…" value={inputQ}
            onChange={(e) => setInputQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={s.searchInput}
          />
          <button style={s.searchBtn} onClick={handleSearch}>Search</button>
        </div>
        {loadingDetail ? (
          <div style={s.spinner}>Loading…</div>
        ) : postDetail ? (
          <PostDetail post={postDetail} onBack={handleBack} />
        ) : (
          <PostDetail post={selectedPost} onBack={handleBack} />
        )}
      </div>
    );
  }

  const heading = searchTitle || (activeQ ? `Results for: "${activeQ}"` : "All Posts");

  return (
    <div style={s.wrapper}>
      <div style={s.searchBar}>
        <input
          type="text" placeholder="Search posts…" value={inputQ}
          onChange={(e) => setInputQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          style={s.searchInput}
        />
        <button style={s.searchBtn} onClick={handleSearch}>Search</button>
      </div>

      <div style={s.resultsHeading}>{heading}</div>

      <div style={s.postsList}>
        {loading ? (
          <div style={s.spinner}>Loading posts…</div>
        ) : posts.length === 0 ? (
          <div style={s.emptyState}>
            {activeQ ? `No posts found for "${activeQ}".` : "No posts published yet."}
          </div>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} onReadMore={openPost} />
          ))
        )}
      </div>

      <Pagination current={page} total={totalPages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
    </div>
  );
}
