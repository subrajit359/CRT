import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { LayoutDashboard, Pencil } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useToast } from "../components/Toast.jsx";
import { apiUrl } from "../lib/api.js";
import "../styles/ResourceAdmin.css";

const API = apiUrl("/neet-api");
const BADGE_PRESETS = ["General", "1st Year", "2nd Year", "3rd Year", "4th Year", "NEET"];

export default function NeetResourceAdmin() {
  const { user } = useAuth();
  const [view, setView] = useState("dashboard");
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({ totalPosts: 0, totalResources: 0, totalViews: 0, totalDownloads: 0 });
  const [editingPost, setEditingPost] = useState(null);
  const [postForm, setPostForm] = useState({ title: "", description: "", badge: "General", thumbnail_url: "", keywords: "" });
  const [customBadge, setCustomBadge] = useState("");
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const toast = useToast();
  const thumbRef = useRef();

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [pr, sr] = await Promise.all([fetch(`${API}/posts`), fetch(`${API}/stats`)]);
      setPosts(await pr.json());
      setStats(await sr.json());
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const loadPostForEdit = async (post) => {
    setLoadingEdit(post.id);
    try {
      const res = await fetch(`${API}/posts/${post.id}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEditingPost(data);
      const isCustom = data.badge && !BADGE_PRESETS.includes(data.badge);
      const rawDate = data.date || "";
      const dateVal = rawDate.includes("T") ? rawDate.slice(0, 10) : rawDate;
      setPostForm({
        title: data.title || "",
        description: data.description || "",
        badge: isCustom ? "Custom" : (data.badge || "General"),
        thumbnail_url: data.thumbnail_url || "",
        keywords: data.keywords || "",
        date: dateVal,
      });
      setCustomBadge(isCustom ? data.badge : "");
      setSections(data.sections || []);
      setView("editPost");
    } catch (err) {
      toast.error(`Failed to load post: ${err.message}`);
    } finally {
      setLoadingEdit(null);
    }
  };

  const STOP_WORDS = new Set(["the","a","an","is","in","on","at","to","for","of","and","or","but","this","that","with","from","by","as","are","was","were","been","be","have","has","had","do","does","did","will","would","could","should","may","might","shall","its","it","he","she","they","we","you","i","me","him","her","us","them","not","also","about","very","into","than","more","just","all","each","such","when","which","who","their"]);

  const extractKeywords = (text) => {
    if (!text) return [];
    return [...new Set(
      text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
        .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    )].slice(0, 20);
  };

  const toggleKeyword = (word) => {
    const current = postForm.keywords ? postForm.keywords.split(",").map((k) => k.trim()).filter(Boolean) : [];
    const exists = current.includes(word);
    const next = exists ? current.filter((k) => k !== word) : [...current, word];
    setPostForm((f) => ({ ...f, keywords: next.join(",") }));
  };

  const startNewPost = () => {
    setEditingPost(null);
    setPostForm({ title: "", description: "", badge: "General", thumbnail_url: "", keywords: "", date: "" });
    setCustomBadge("");
    setSections([]);
    setView("editPost");
  };

  const handleNav = (tab) => {
    setView(tab);
    setSidebarOpen(false);
    if (tab === "dashboard") loadDashboard();
  };

  const uploadImage = async (file, key) => {
    setUploading((u) => ({ ...u, [key]: true }));
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`${API}/upload`, { method: "POST", body: fd });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      return url;
    } catch {
      toast.error("Image upload failed");
      return null;
    } finally {
      setUploading((u) => ({ ...u, [key]: false }));
    }
  };

  const handleSavePost = async () => {
    if (!postForm.title.trim()) { toast.error("Title is required"); return; }
    if (postForm.badge === "Custom" && !customBadge.trim()) { toast.error("Please enter a custom category name"); return; }
    setSaving(true);
    try {
      const method = editingPost ? "PUT" : "POST";
      const url = editingPost ? `${API}/posts/${editingPost.id}` : `${API}/posts`;
      const finalBadge = postForm.badge === "Custom" ? customBadge.trim() : postForm.badge;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...postForm, badge: finalBadge }),
      });
      const saved = await res.json();
      setEditingPost(saved);
      toast.success(editingPost ? "Post updated!" : "Post created! Now add sections below.");
      await loadDashboard();
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePost = async (id) => {
    if (!window.confirm("Delete this post and all its content?")) return;
    await fetch(`${API}/posts/${id}`, { method: "DELETE" });
    toast.success("Post deleted");
    await loadDashboard();
  };

  const handleAddSection = async () => {
    if (!editingPost) { toast.error("Save the post first before adding sections"); return; }
    const res = await fetch(`${API}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: editingPost.id, title: "New Section", image_url: "", order_index: sections.length }),
    });
    const sec = await res.json();
    setSections((s) => [...s, { ...sec, resources: [] }]);
  };

  const handleUpdateSection = async (id, data) => {
    await fetch(`${API}/sections/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  };

  const handleDeleteSection = async (id) => {
    if (!window.confirm("Delete this section and all its resources?")) return;
    await fetch(`${API}/sections/${id}`, { method: "DELETE" });
    setSections((s) => s.filter((sec) => sec.id !== id));
  };

  const updateSectionLocal = (id, field, value) => {
    setSections((s) => s.map((sec) => sec.id === id ? { ...sec, [field]: value } : sec));
  };

  const handleAddResource = async (sectionId) => {
    const res = await fetch(`${API}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: sectionId, title: "", description: "", drive_link: "", order_index: 0 }),
    });
    const r = await res.json();
    setSections((s) => s.map((sec) => sec.id === sectionId ? { ...sec, resources: [...(sec.resources || []), r] } : sec));
  };

  const handleDeleteResource = async (sectionId, resourceId) => {
    await fetch(`${API}/resources/${resourceId}`, { method: "DELETE" });
    setSections((s) => s.map((sec) => sec.id === sectionId
      ? { ...sec, resources: sec.resources.filter((r) => r.id !== resourceId) }
      : sec));
  };

  const updateResourceLocal = (sectionId, resourceId, field, value) => {
    setSections((s) => s.map((sec) => sec.id === sectionId
      ? { ...sec, resources: sec.resources.map((r) => r.id === resourceId ? { ...r, [field]: value } : r) }
      : sec));
  };

  const handleSaveResource = async (sectionId, resource) => {
    await fetch(`${API}/resources/${resource.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resource),
    });
    toast.success("Resource saved");
  };

  const handleSaveSection = async (section) => {
    await handleUpdateSection(section.id, { title: section.title, image_url: section.image_url, order_index: section.order_index });
    toast.success("Section saved");
  };

  const filtered = posts.filter((p) => p.title?.toLowerCase().includes(search.toLowerCase()));

  const userName = user?.username || "Admin";

  return (
    <AppShell>
      <div style={{ margin: "-24px -16px", minHeight: "calc(100vh - 60px)" }}>
        <div className="ra-layout">
          {sidebarOpen && <div className="ra-overlay" onClick={() => setSidebarOpen(false)} />}

          <aside className={"ra-sidebar" + (sidebarOpen ? " ra-sidebar-open" : "")}>
            <nav className="ra-nav">
              <button className={"ra-nav-btn" + (view === "dashboard" ? " active" : "")} onClick={() => handleNav("dashboard")} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <LayoutDashboard size={14} /> Dashboard
              </button>
              <button className={"ra-nav-btn" + (view === "editPost" && !editingPost ? " active" : "")} onClick={startNewPost} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Pencil size={14} /> New Post
              </button>
              <div className="ra-nav-divider" />
              <Link href="/study" className="ra-nav-btn secondary">↗ View Blog</Link>
              <Link href="/admin" className="ra-nav-btn secondary">← Admin Panel</Link>
            </nav>
          </aside>

          <main className="ra-main">

            {/* DASHBOARD */}
            {view === "dashboard" && (
              <div className="ra-content">
                <div className="ra-topbar">
                  <div className="ra-topbar-left">
                    <button className="ra-hamburger-inline" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                      <span /><span /><span />
                    </button>
                    <div>
                      <h1 className="ra-page-title">Dashboard</h1>
                      <p className="ra-page-sub">Welcome back, {userName}</p>
                    </div>
                  </div>
                  <button className="ra-btn-new" onClick={startNewPost}>+ New Post</button>
                </div>

                <div className="ra-stats">
                  <div className="ra-stat ra-stat-purple">
                    <p className="ra-stat-label">Total Posts</p>
                    <p className="ra-stat-value">{stats.totalPosts}</p>
                  </div>
                  <div className="ra-stat ra-stat-green">
                    <p className="ra-stat-label">Total Resources</p>
                    <p className="ra-stat-value">{stats.totalResources}</p>
                  </div>
                  <div className="ra-stat ra-stat-yellow">
                    <p className="ra-stat-label">Total Views</p>
                    <p className="ra-stat-value">{stats.totalViews?.toLocaleString()}</p>
                  </div>
                  <div className="ra-stat ra-stat-pink">
                    <p className="ra-stat-label">Total Downloads</p>
                    <p className="ra-stat-value">{stats.totalDownloads?.toLocaleString()}</p>
                  </div>
                </div>

                <div className="ra-table-box">
                  <div className="ra-table-head">
                    <h2>All Posts</h2>
                    <input className="ra-search" placeholder="Search posts..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  {loading ? (
                    <div className="ra-table-loading">Loading...</div>
                  ) : filtered.length === 0 ? (
                    <div className="ra-table-empty">
                      {posts.length === 0 ? "No posts yet. Create your first post!" : "No posts match your search."}
                    </div>
                  ) : (
                    <div className="ra-table-scroll">
                      <table className="ra-table">
                        <thead>
                          <tr>
                            <th>Title</th>
                            <th>Badge</th>
                            <th>Date</th>
                            <th>Views</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((post) => (
                            <tr key={post.id}>
                              <td className="ra-td-title">{post.title}</td>
                              <td><span className="ra-tag ra-tag-blue">{post.badge || "—"}</span></td>
                              <td className="ra-td-light">{post.date || "—"}</td>
                              <td className="ra-td-light">{(post.views || 0).toLocaleString()}</td>
                              <td>
                                <button
                                  className="ra-action-btn"
                                  onClick={() => loadPostForEdit(post)}
                                  disabled={loadingEdit === post.id}
                                >
                                  {loadingEdit === post.id ? "Opening..." : "Edit"}
                                </button>
                                <button className="ra-action-btn ra-action-del" onClick={() => handleDeletePost(post.id)}>Delete</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* EDIT / CREATE POST */}
            {view === "editPost" && (
              <div className="ra-content">
                <div className="ra-topbar">
                  <div className="ra-topbar-left">
                    <button className="ra-hamburger-inline" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                      <span /><span /><span />
                    </button>
                    <button className="ra-back-btn" onClick={() => handleNav("dashboard")}>&larr; Back</button>
                    <h1 className="ra-page-title">{editingPost ? "Edit Post" : "New Post"}</h1>
                  </div>
                  <button className="ra-btn-new" onClick={handleSavePost} disabled={saving}>
                    {saving ? "Saving..." : editingPost ? "Save Changes" : "Create Post"}
                  </button>
                </div>

                <div className="ra-create-grid">
                  <div className="ra-create-left">
                    {/* Post Details */}
                    <div className="ra-form-box">
                      <h2 className="ra-form-section-title">Post Details</h2>
                      <div className="ra-field">
                        <label>Post Title *</label>
                        <input value={postForm.title} onChange={(e) => setPostForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. MBBS 3rd Year – Important Topics PDF" />
                      </div>
                      <div className="ra-field">
                        <label>Short Description</label>
                        <textarea rows={3} value={postForm.description} onChange={(e) => setPostForm((f) => ({ ...f, description: e.target.value }))} placeholder="Brief description shown on the blog listing..." />
                      </div>
                      <div className="ra-field">
                        <label>Keywords <span className="ra-kw-hint">(tap to bold in description)</span></label>
                        <div className="ra-kw-chips">
                          {extractKeywords(postForm.description).map((word) => {
                            const selected = postForm.keywords ? postForm.keywords.split(",").map((k) => k.trim()).includes(word) : false;
                            return (
                              <button key={word} type="button" className={`ra-kw-chip${selected ? " ra-kw-chip-on" : ""}`} onClick={() => toggleKeyword(word)}>
                                {word}
                              </button>
                            );
                          })}
                          {!postForm.description && <span className="ra-kw-empty">Add a description above to see keyword suggestions</span>}
                          {postForm.description && extractKeywords(postForm.description).length === 0 && <span className="ra-kw-empty">No keywords found</span>}
                        </div>
                      </div>
                      <div className="ra-field-row">
                        <div className="ra-field" style={{ marginBottom: 0 }}>
                          <label>Badge / Category</label>
                          <select
                            value={postForm.badge}
                            onChange={(e) => {
                              setPostForm((f) => ({ ...f, badge: e.target.value }));
                              if (e.target.value !== "Custom") setCustomBadge("");
                            }}
                          >
                            {BADGE_PRESETS.map((b) => <option key={b}>{b}</option>)}
                            <option value="Custom">Custom...</option>
                          </select>
                          {postForm.badge === "Custom" && (
                            <input
                              style={{ marginTop: 8 }}
                              placeholder="Type custom category name..."
                              value={customBadge}
                              onChange={(e) => setCustomBadge(e.target.value)}
                            />
                          )}
                        </div>
                        <div className="ra-field" style={{ marginBottom: 0 }}>
                          <label>Publish Date</label>
                          <input
                            type="date"
                            value={postForm.date || ""}
                            onChange={(e) => setPostForm((f) => ({ ...f, date: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="ra-field">
                        <label>Thumbnail Image</label>
                        <div className="ra-upload-area" onClick={() => thumbRef.current?.click()}>
                          {uploading["thumb"] ? (
                            <span>Uploading...</span>
                          ) : postForm.thumbnail_url ? (
                            <div className="ra-thumb-preview">
                              <img src={postForm.thumbnail_url} alt="thumbnail" />
                              <span className="ra-thumb-change">Click to change</span>
                            </div>
                          ) : (
                            <span>Click to upload thumbnail</span>
                          )}
                        </div>
                        <input ref={thumbRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          const url = await uploadImage(file, "thumb");
                          if (url) setPostForm((f) => ({ ...f, thumbnail_url: url }));
                        }} />
                        {postForm.thumbnail_url && (
                          <input value={postForm.thumbnail_url} readOnly className="ra-url-preview" />
                        )}
                      </div>
                    </div>

                    {/* Sections */}
                    {editingPost && (
                      <div className="ra-form-box">
                        <div className="ra-form-box-header">
                          <h2 className="ra-form-section-title">Sections</h2>
                          <button className="ra-btn-add" onClick={handleAddSection}>+ Add Section</button>
                        </div>

                        {sections.length === 0 && (
                          <p className="ra-empty-note">No sections yet. Click "+ Add Section" to start.</p>
                        )}

                        {sections.map((section, sIdx) => (
                          <div className="ra-section-block" key={section.id}>
                            <div className="ra-section-header">
                              <span className="ra-section-label">Section {sIdx + 1}</span>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button className="ra-btn-save-sm" onClick={() => handleSaveSection(section)}>Save</button>
                                <button className="ra-resource-remove" onClick={() => handleDeleteSection(section.id)}>Delete</button>
                              </div>
                            </div>

                            <div className="ra-field" style={{ marginBottom: 10 }}>
                              <label>Section Title</label>
                              <input value={section.title} onChange={(e) => updateSectionLocal(section.id, "title", e.target.value)} placeholder="e.g. Pharmacology Notes" />
                            </div>

                            <div className="ra-field" style={{ marginBottom: 10 }}>
                              <label>Section Image (Cloudinary)</label>
                              <div className="ra-upload-area small" onClick={() => document.getElementById(`sec-img-${section.id}`)?.click()}>
                                {uploading[`sec-${section.id}`] ? "Uploading..." : section.image_url
                                  ? <div className="ra-thumb-preview small"><img src={section.image_url} alt="" /><span className="ra-thumb-change">Change</span></div>
                                  : "Upload section image"
                                }
                              </div>
                              <input id={`sec-img-${section.id}`} type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                                const file = e.target.files[0];
                                if (!file) return;
                                const url = await uploadImage(file, `sec-${section.id}`);
                                if (url) updateSectionLocal(section.id, "image_url", url);
                              }} />
                            </div>

                            <div className="ra-resources-block">
                              <div className="ra-resources-header">
                                <span className="ra-resources-label">Resources</span>
                                <button className="ra-btn-add sm" onClick={() => handleAddResource(section.id)}>+ Add</button>
                              </div>

                              {(!section.resources || section.resources.length === 0) && (
                                <p className="ra-empty-note sm">No resources yet.</p>
                              )}

                              {(section.resources || []).map((res, rIdx) => (
                                <div className="ra-resource-item" key={res.id}>
                                  <div className="ra-resource-item-header">
                                    <span className="ra-resource-label">Resource #{rIdx + 1}</span>
                                    <div style={{ display: "flex", gap: 8 }}>
                                      <button className="ra-btn-save-sm" onClick={() => handleSaveResource(section.id, res)}>Save</button>
                                      <button className="ra-resource-remove" onClick={() => handleDeleteResource(section.id, res.id)}>Remove</button>
                                    </div>
                                  </div>
                                  <input
                                    placeholder="Resource title (e.g. Pharmacology PYQ PDF)"
                                    value={res.title}
                                    onChange={(e) => updateResourceLocal(section.id, res.id, "title", e.target.value)}
                                  />
                                  <input
                                    placeholder="Short description"
                                    value={res.description}
                                    onChange={(e) => updateResourceLocal(section.id, res.id, "description", e.target.value)}
                                  />
                                  <input
                                    placeholder="Google Drive link (https://drive.google.com/...)"
                                    value={res.drive_link}
                                    onChange={(e) => updateResourceLocal(section.id, res.id, "drive_link", e.target.value)}
                                    className="ra-drive-input"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right panel */}
                  <div className="ra-create-right">
                    <div className="ra-form-box">
                      <h2 className="ra-form-section-title">Publish</h2>
                      {editingPost && (
                        <p className="ra-publish-sub">Editing post #{editingPost.id}</p>
                      )}
                      <button className="ra-btn-publish" onClick={handleSavePost} disabled={saving}>
                        {saving ? "Saving..." : editingPost ? "Save Changes" : "Create Post"}
                      </button>
                      <Link href="/study" className="ra-btn-draft">
                        Preview Post
                      </Link>
                    </div>

                    <div className="ra-form-box">
                      <h2 className="ra-form-section-title">Quick Stats</h2>
                      <div>
                        <div className="ra-quick-stat">
                          <span>Sections</span>
                          <strong>{sections.length}</strong>
                        </div>
                        <div className="ra-quick-stat">
                          <span>Resources</span>
                          <strong>{sections.reduce((t, s) => t + (s.resources?.length || 0), 0)}</strong>
                        </div>
                        <div className="ra-quick-stat">
                          <span>Views</span>
                          <strong>{(editingPost?.views || 0).toLocaleString()}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </AppShell>
  );
}
