import { useState, useEffect, useRef, useLayoutEffect } from "react";
import "../styles/BlogPage.css";
import { apiUrl } from "../lib/api.js";

const POSTS_PER_PAGE = 10;

const IconEye = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconCamera = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9ca3af"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function NeetBlogPage({ onPostSelect, scrollToPostId }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const cardRefs = useRef({});

  useLayoutEffect(() => {
    if (!scrollToPostId) return;
    const el = cardRefs.current[scrollToPostId];
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [scrollToPostId]);

  useEffect(() => {
    fetch("/neet-api/posts")
      .then((r) => r.json())
      .then((data) => {
        const raw = Array.isArray(data) ? data : (data.posts || []);
        const mapped = raw.map((p) => ({
          ...p,
          description: p.description || "",
          badge: p.badge || "",
          date: p.date || null,
        }));
        setPosts(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = query.trim()
    ? posts.filter((p) => {
        const q = query.toLowerCase();
        return (
          (p.title || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.badge || "").toLowerCase().includes(q)
        );
      })
    : posts;

  const totalPages = Math.ceil(filtered.length / POSTS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE);

  const handleSearch = (val) => { setQuery(val); setPage(1); };

  if (loading) {
    return (
      <div className="blog-page">
        <div className="blog-loading">
          <div className="blog-spinner"></div>
          <p>Loading posts...</p>
        </div>
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className="blog-page">
        <div className="blog-empty">
          <p>No posts yet. Check back soon.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="blog-page">
      <div className="blog-header">
        <p className="blog-header-label">Latest Posts</p>
        <h1 className="blog-header-title">Study Resources</h1>
        <p className="blog-header-count">
          {filtered.length} post{filtered.length !== 1 ? "s" : ""} found
        </p>
        <div className="blog-search-wrap">
          <span className="blog-search-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            className="blog-search-input"
            type="text"
            placeholder="Search posts by title, topic..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {query && (
            <button className="blog-search-clear" onClick={() => handleSearch("")}>
              &#10005;
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="blog-no-results">
          <div className="blog-no-results-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <p className="blog-no-results-title">No results for "{query}"</p>
          <p className="blog-no-results-sub">Try a different keyword or clear the search.</p>
          <button className="blog-no-results-btn" onClick={() => setQuery("")}>Clear Search</button>
        </div>
      ) : (
        <>
          <div className="blog-grid">
            {paginated.map((post) => (
              <div
                className="blog-card"
                key={post.id}
                ref={(el) => { if (el) cardRefs.current[post.id] = el; }}
                onClick={() => onPostSelect(post.id)}
              >
                <div className="blog-card-thumb">
                  {post.thumbnail_url ? (
                    <img src={post.thumbnail_url} alt={post.title} />
                  ) : (
                    <div className="blog-card-thumb-placeholder">
                      <IconCamera />
                    </div>
                  )}
                  <span className="blog-card-views">
                    <IconEye /> {(post.views || 0).toLocaleString()}
                  </span>
                </div>
                <div className="blog-card-body">
                  <p className="blog-card-date">{post.date || formatDate(post.created_at)}</p>
                  <h2 className="blog-card-title">{post.title}</h2>
                  <p className="blog-card-desc">{post.description}</p>
                  <button className="blog-card-btn" onClick={(e) => { e.stopPropagation(); onPostSelect(post.id); }}>
                    Read More &rarr;
                  </button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="blog-pagination">
              <button
                className="blog-page-btn"
                onClick={() => { setPage((p) => p - 1); window.scrollTo(0, 0); }}
                disabled={page === 1}
              >
                &#8592; Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={"blog-page-num" + (p === page ? " active" : "")}
                  onClick={() => { setPage(p); window.scrollTo(0, 0); }}
                >
                  {p}
                </button>
              ))}

              <button
                className="blog-page-btn"
                onClick={() => { setPage((p) => p + 1); window.scrollTo(0, 0); }}
                disabled={page === totalPages}
              >
                Next &#8594;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
