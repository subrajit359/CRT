import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Plus, Trash2, Upload, Edit3, Home, ChevronRight, Eye, EyeOff,
  Loader2, Tag, Image as ImageIcon, ExternalLink, Save, X,
  ChevronDown, ChevronUp, GripVertical, BookOpen, Link2,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { useToast } from "../components/Toast.jsx";

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, { credentials: "include", ...opts });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

async function uploadThumbnail(postId, file) {
  const fd = new FormData();
  fd.append("thumbnail", file);
  const res = await fetch(`/api/blog/posts/${postId}/thumbnail`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Upload failed");
  return j;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TagInput({ value, onChange }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim().toLowerCase();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput("");
  };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {value.map((tag) => (
          <span key={tag} style={{
            background: "#e8f0fe", color: "#1a73e8", borderRadius: 12,
            padding: "2px 10px", fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            {tag}
            <button
              type="button" onClick={() => onChange(value.filter((t) => t !== tag))}
              style={{ border: "none", background: "none", cursor: "pointer", color: "#1a73e8", padding: 0, lineHeight: 1 }}
            >×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add tag and press Enter"
          className="input" style={{ flex: 1, height: 36, fontSize: 13 }}
        />
        <button type="button" onClick={add} className="btn btn-ghost btn-sm">Add</button>
      </div>
    </div>
  );
}

function ItemRow({ item, sectionId, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [driveUrl, setDriveUrl] = useState(item.drive_url || "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const updated = await apiFetch(`/api/blog/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), drive_url: driveUrl.trim() || null }),
      });
      onSave(updated);
      setEditing(false);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const del = async () => {
    if (!confirm(`Delete "${item.label}"?`)) return;
    try {
      await apiFetch(`/api/blog/items/${item.id}`, { method: "DELETE" });
      onDelete(item.id);
    } catch (e) { toast.error(e.message); }
  };

  if (editing) {
    return (
      <div style={{ padding: "10px 12px", background: "#f8faff", borderRadius: 6, marginBottom: 6, border: "1px solid #e0e8ff" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            className="input" value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Resource label" style={{ height: 36, fontSize: 13 }}
          />
          <div style={{ position: "relative" }}>
            <Link2 size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#888" }} />
            <input
              className="input" value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="Google Drive URL (optional)"
              style={{ height: 36, fontSize: 13, paddingLeft: 30 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={save} disabled={busy} className="btn btn-primary btn-sm">
              {busy ? <Loader2 size={12} className="spin" /> : <Save size={12} />} Save
            </button>
            <button onClick={() => setEditing(false)} className="btn btn-ghost btn-sm"><X size={12} /> Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderBottom: "1px solid #f4f4f4" }}>
      <GripVertical size={14} color="#ccc" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: "#333" }}>
        {item.label}
        {item.drive_url && (
          <a href={item.drive_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: "#1a73e8" }}>
            <ExternalLink size={11} />
          </a>
        )}
      </span>
      <button onClick={() => setEditing(true)} className="btn btn-ghost btn-xs"><Edit3 size={12} /></button>
      <button onClick={del} className="btn btn-ghost btn-xs" style={{ color: "#e53e3e" }}><Trash2 size={12} /></button>
    </div>
  );
}

function SectionEditor({ section, postId, onSave, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [imageUrl, setImageUrl] = useState(section.image_url || "");
  const [items, setItems] = useState(section.items || []);
  const [newLabel, setNewLabel] = useState("");
  const [newDriveUrl, setNewDriveUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const saveMeta = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const updated = await apiFetch(`/api/blog/sections/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), image_url: imageUrl.trim() || null }),
      });
      onSave(updated);
      setEditingMeta(false);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const addItem = async () => {
    if (!newLabel.trim()) return;
    setBusy(true);
    try {
      const item = await apiFetch(`/api/blog/sections/${section.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), drive_url: newDriveUrl.trim() || null }),
      });
      setItems((prev) => [...prev, item]);
      setNewLabel(""); setNewDriveUrl("");
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const del = async () => {
    if (!confirm(`Delete section "${section.title}" and all its items?`)) return;
    try {
      await apiFetch(`/api/blog/sections/${section.id}`, { method: "DELETE" });
      onDelete(section.id);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div style={{ border: "1px solid #dde6f5", borderRadius: 8, marginBottom: 10, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
        background: "#f4f7ff", cursor: "pointer",
      }} onClick={() => setExpanded((v) => !v)}>
        <GripVertical size={14} color="#bbb" />
        {editingMeta ? (
          <input
            className="input" value={title} onChange={(e) => setTitle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{ flex: 1, height: 32, fontSize: 13 }}
          />
        ) : (
          <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "#0d47a1" }}>{section.title}</span>
        )}
        <span style={{ fontSize: 12, color: "#888" }}>{items.length} items</span>
        {editingMeta ? (
          <>
            <button onClick={(e) => { e.stopPropagation(); saveMeta(); }} className="btn btn-primary btn-xs" disabled={busy}>
              {busy ? <Loader2 size={11} className="spin" /> : <Save size={11} />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditingMeta(false); }} className="btn btn-ghost btn-xs"><X size={11} /></button>
          </>
        ) : (
          <>
            <button onClick={(e) => { e.stopPropagation(); setEditingMeta(true); }} className="btn btn-ghost btn-xs"><Edit3 size={12} /></button>
            <button onClick={(e) => { e.stopPropagation(); del(); }} className="btn btn-ghost btn-xs" style={{ color: "#e53e3e" }}><Trash2 size={12} /></button>
          </>
        )}
        {expanded ? <ChevronUp size={14} color="#888" /> : <ChevronDown size={14} color="#888" />}
      </div>

      {expanded && (
        <div style={{ padding: "12px 14px" }}>
          {imageUrl || editingMeta ? (
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>Section Image URL (optional)</label>
              <input
                className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…" style={{ height: 36, fontSize: 13 }}
              />
            </div>
          ) : null}

          <div style={{ marginBottom: 8 }}>
            {items.map((item) => (
              <ItemRow
                key={item.id} item={item} sectionId={section.id}
                onSave={(updated) => setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i))}
                onDelete={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
              />
            ))}
          </div>

          <div style={{ background: "#f8faff", borderRadius: 6, padding: 10, border: "1px dashed #c7d8f8" }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase" }}>Add Resource</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input
                className="input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Resource label *" style={{ height: 36, fontSize: 13 }}
              />
              <div style={{ position: "relative" }}>
                <Link2 size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#888" }} />
                <input
                  className="input" value={newDriveUrl} onChange={(e) => setNewDriveUrl(e.target.value)}
                  placeholder="Google Drive link (optional)"
                  style={{ height: 36, fontSize: 13, paddingLeft: 30 }}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                />
              </div>
              <button onClick={addItem} disabled={busy || !newLabel.trim()} className="btn btn-primary btn-sm">
                {busy ? <Loader2 size={12} className="spin" /> : <Plus size={12} />} Add Resource
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PostEditor({ post, onSaved, onClose }) {
  const [title, setTitle] = useState(post?.title || "");
  const [excerpt, setExcerpt] = useState(post?.excerpt || "");
  const [readTime, setReadTime] = useState(post?.read_time || "1 min read");
  const [tags, setTags] = useState(post?.tags || []);
  const [published, setPublished] = useState(post?.published || false);
  const [sections, setSections] = useState([]);
  const [newSecTitle, setNewSecTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(post?.thumbnail_url || null);
  const thumbRef = useRef(null);
  const toast = useToast();

  const isNew = !post?.id;

  useEffect(() => {
    if (post?.id) {
      fetch(`/api/blog/posts/${post.id}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => { setSections(data.sections || []); setThumbnailUrl(data.thumbnail_url || null); })
        .catch(() => {});
    }
  }, [post?.id]);

  const savePost = async () => {
    if (!title.trim()) return toast.error("Title is required");
    setBusy(true);
    try {
      let saved;
      if (isNew) {
        saved = await apiFetch("/api/blog/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), excerpt, read_time: readTime, tags, published }),
        });
      } else {
        saved = await apiFetch(`/api/blog/posts/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), excerpt, read_time: readTime, tags, published }),
        });
      }
      toast.success(isNew ? "Post created" : "Post saved");
      onSaved(saved, sections);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const handleThumb = async (file) => {
    if (!post?.id) return toast.error("Save the post first before uploading a thumbnail.");
    if (!file) return;
    setThumbBusy(true);
    try {
      const r = await uploadThumbnail(post.id, file);
      setThumbnailUrl(r.thumbnail_url);
      toast.success("Thumbnail uploaded");
    } catch (e) { toast.error(e.message); }
    finally { setThumbBusy(false); if (thumbRef.current) thumbRef.current.value = ""; }
  };

  const addSection = async () => {
    if (!newSecTitle.trim() || !post?.id) return;
    setBusy(true);
    try {
      const sec = await apiFetch(`/api/blog/posts/${post.id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newSecTitle.trim() }),
      });
      setSections((prev) => [...prev, sec]);
      setNewSecTitle("");
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, overflowY: "auto" }}>
      <div style={{
        maxWidth: 680, margin: "40px auto 40px", background: "#fff",
        borderRadius: 12, padding: "28px 28px 32px", boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, flex: 1 }}>
            {isNew ? "New Post" : "Edit Post"}
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm"><X size={18} /></button>
        </div>

        {/* Meta fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          <div>
            <label className="label">Title *</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title" style={{ height: 40 }} />
          </div>
          <div>
            <label className="label">Excerpt / Summary</label>
            <textarea className="input" value={excerpt} onChange={(e) => setExcerpt(e.target.value)}
              placeholder="A short description shown in the post list…" rows={3}
              style={{ resize: "vertical", lineHeight: 1.5, paddingTop: 10 }} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Read Time</label>
              <input className="input" value={readTime} onChange={(e) => setReadTime(e.target.value)}
                placeholder="e.g. 5 min read" style={{ height: 40 }} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
                Published
              </label>
            </div>
          </div>
          <div>
            <label className="label">Tags</label>
            <TagInput value={tags} onChange={setTags} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button onClick={savePost} disabled={busy} className="btn btn-primary">
            {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {isNew ? " Create Post" : " Save Changes"}
          </button>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        </div>

        {/* Thumbnail upload (only when post exists) */}
        {post?.id && (
          <div style={{ marginBottom: 24, padding: "14px 16px", background: "#f8faff", borderRadius: 8, border: "1px solid #e0e8ff" }}>
            <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 14 }}>
              <ImageIcon size={14} style={{ marginRight: 5, verticalAlign: "middle" }} /> Thumbnail
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="thumb"
                  style={{ width: 100, height: 68, objectFit: "cover", borderRadius: 6, border: "1px solid #dde6f5" }} />
              ) : (
                <div style={{ width: 100, height: 68, background: "#dde6f5", borderRadius: 6, display: "grid", placeItems: "center" }}>
                  <ImageIcon size={22} color="#aaa" />
                </div>
              )}
              <div>
                <input ref={thumbRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => handleThumb(e.target.files[0])} />
                <button onClick={() => thumbRef.current?.click()} disabled={thumbBusy} className="btn btn-ghost btn-sm">
                  {thumbBusy ? <Loader2 size={12} className="spin" /> : <Upload size={12} />}
                  {thumbnailUrl ? " Change" : " Upload"} Thumbnail
                </button>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#888" }}>Uploads to Cloudinary. Max 10 MB.</p>
              </div>
            </div>
          </div>
        )}

        {/* Sections (only when post exists) */}
        {post?.id && (
          <div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>Sections</h3>
            </div>

            {sections.map((sec) => (
              <SectionEditor
                key={sec.id} section={sec} postId={post.id}
                onSave={(updated) => setSections((prev) => prev.map((s) => s.id === updated.id ? { ...updated, items: s.items } : s))}
                onDelete={(id) => setSections((prev) => prev.filter((s) => s.id !== id))}
              />
            ))}

            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                className="input" value={newSecTitle} onChange={(e) => setNewSecTitle(e.target.value)}
                placeholder="New section title" style={{ height: 36, fontSize: 13 }}
                onKeyDown={(e) => e.key === "Enter" && addSection()}
              />
              <button onClick={addSection} disabled={busy || !newSecTitle.trim()} className="btn btn-primary btn-sm">
                <Plus size={13} /> Add Section
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminBlogPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/blog/posts?limit=50");
      setPosts(data.posts || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const togglePublish = async (post) => {
    try {
      const updated = await apiFetch(`/api/blog/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !post.published }),
      });
      setPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
      toast.success(updated.published ? "Published" : "Unpublished");
    } catch (e) { toast.error(e.message); }
  };

  const deletePost = async (post) => {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/blog/posts/${post.id}`, { method: "DELETE" });
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      toast.success("Post deleted");
    } catch (e) { toast.error(e.message); }
  };

  const handleSaved = (saved) => {
    setPosts((prev) => {
      const existing = prev.find((p) => p.id === saved.id);
      if (existing) return prev.map((p) => p.id === saved.id ? { ...p, ...saved } : p);
      return [saved, ...prev];
    });
    if (!editing) setEditing(saved);
  };

  return (
    <AppShell>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 80px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "28px 0 24px", gap: 14, flexWrap: "wrap" }}>
          <div style={{
            width: 46, height: 46, borderRadius: 14,
            background: "linear-gradient(135deg, #1a73e8, #0d47a1)",
            display: "grid", placeItems: "center", flexShrink: 0,
          }}>
            <BookOpen size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-400)", marginBottom: 2 }}>
              <Link href="/study" style={{ color: "var(--ink-400)", textDecoration: "none" }}>
                <Home size={12} />
              </Link>
              <ChevronRight size={12} />
              <span>Blog Posts</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Manage Blog Posts</h2>
          </div>
          <button onClick={() => { setEditing(null); setShowNew(true); }} className="btn btn-primary btn-sm">
            <Plus size={14} /> New Post
          </button>
        </div>

        {/* Post list */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <Loader2 size={28} className="spin" color="#1a73e8" />
          </div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 24px", color: "#888" }}>
            <BookOpen size={48} strokeWidth={1} style={{ marginBottom: 16, opacity: 0.25 }} />
            <h3 style={{ margin: "0 0 8px" }}>No posts yet</h3>
            <p style={{ margin: "0 0 16px", fontSize: 14 }}>Create your first blog post to get started.</p>
            <button onClick={() => setShowNew(true)} className="btn btn-primary btn-sm">
              <Plus size={14} /> Create First Post
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {posts.map((post) => (
              <div key={post.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px",
                background: "#fff",
                borderRadius: 10,
                border: "1px solid var(--line, #ececec)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}>
                {post.thumbnail_url ? (
                  <img src={post.thumbnail_url} alt="" style={{ width: 60, height: 42, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 60, height: 42, background: "#dde6f5", borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center" }}>
                    <ImageIcon size={18} color="#aaa" />
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 3px", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {post.title}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#888", flexWrap: "wrap" }}>
                    <span>{post.read_time}</span>
                    <span>·</span>
                    <span>{post.views} views</span>
                    {post.tags?.length > 0 && (
                      <>
                        <span>·</span>
                        {post.tags.slice(0, 3).map((t) => (
                          <span key={t} style={{ background: "#e8f0fe", color: "#1a73e8", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>{t}</span>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => togglePublish(post)}
                    className="btn btn-ghost btn-sm"
                    title={post.published ? "Unpublish" : "Publish"}
                    style={{ color: post.published ? "#16a34a" : "#888" }}
                  >
                    {post.published ? <Eye size={14} /> : <EyeOff size={14} />}
                    <span style={{ fontSize: 12, marginLeft: 4 }}>{post.published ? "Live" : "Draft"}</span>
                  </button>
                  <button onClick={() => { setShowNew(false); setEditing(post); }} className="btn btn-ghost btn-sm">
                    <Edit3 size={13} />
                  </button>
                  <button onClick={() => deletePost(post)} className="btn btn-ghost btn-sm" style={{ color: "#e53e3e" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post editor modal */}
      {(showNew || editing) && (
        <PostEditor
          post={showNew ? null : editing}
          onSaved={(saved) => { handleSaved(saved); if (showNew) { setShowNew(false); setEditing(saved); } }}
          onClose={() => { setShowNew(false); setEditing(null); }}
        />
      )}
    </AppShell>
  );
}
