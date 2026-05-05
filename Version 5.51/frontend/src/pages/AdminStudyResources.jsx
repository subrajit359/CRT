import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  Plus, Trash2, Upload, Folder, FileText, Edit3, Home, ChevronRight,
  Image as ImageIcon, BookOpen, Eye, CheckCircle2, Loader2, AlignLeft,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api, apiUrl, getToken } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../lib/auth.jsx";

/* helper — multipart upload for thumbnail */
async function uploadThumbnail(catId, file) {
  const fd = new FormData();
  fd.append("thumbnail", file);
  const token = getToken();
  const res = await fetch(apiUrl(`/api/study/categories/${catId}/thumbnail`), {
    method: "POST",
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || "Upload failed");
  }
  return res.json();
}

/* Thumbnail upload widget shown on each category row (root level) */
function ThumbUploader({ cat, onSuccess }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const toast = useToast();

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadThumbnail(cat.id, file);
      onSuccess(cat.id, r.thumbnail_url);
      toast.success("Thumbnail updated");
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {cat.thumbnail_url && (
        <img
          src={cat.thumbnail_url}
          alt="thumb"
          style={{ width: 52, height: 36, objectFit: "cover", borderRadius: 7, border: "1.5px solid var(--line)" }}
        />
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        title={cat.thumbnail_url ? "Change thumbnail" : "Add thumbnail"}
        onClick={() => ref.current?.click()}
        style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "5px 10px" }}
        disabled={busy}
      >
        {busy ? <Loader2 size={13} className="spin" /> : <ImageIcon size={13} />}
        {cat.thumbnail_url ? "Change" : "Add thumb"}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />
    </div>
  );
}

/* Inline description editor */
function DescriptionEditor({ cat, onSaved }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(cat.description || "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/api/study/categories/${cat.id}`, { description: val.trim() || null });
      onSaved(cat.id, val.trim() || null);
      toast.success("Description saved");
      setOpen(false);
    } catch (e) {
      toast.error(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "5px 10px" }}
        title="Edit description / excerpt"
      >
        <AlignLeft size={13} />
        {cat.description ? "Edit desc" : "Add desc"}
      </button>

      {open && (
        <div style={{
          marginTop: 10, padding: "14px 16px", background: "var(--bg-muted)",
          borderRadius: 12, border: "1px solid var(--line)",
        }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-500)", display: "block", marginBottom: 6 }}>
            Post description / excerpt (shown on blog card)
          </label>
          <textarea
            className="textarea"
            rows={3}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Write a short description that will appear under the post title…"
            style={{ minHeight: 80, fontSize: 13, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save description"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminStudyResources() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";
  const fileInput = useRef(null);

  const params = new URLSearchParams(search);
  const cat = params.get("cat") || "";

  const [path, setPath]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [resources, setResources]   = useState([]);
  const [loading, setLoading]       = useState(true);

  /* new post / folder form */
  const [newCatName, setNewCatName]   = useState("");
  const [newCatDesc, setNewCatDesc]   = useState("");
  const [newCatThumb, setNewCatThumb] = useState(null);
  const thumbInput = useRef(null);

  /* new resource form */
  const [newResTitle, setNewResTitle] = useState("");
  const [newResDesc, setNewResDesc]   = useState("");
  const [newResFile, setNewResFile]   = useState(null);
  const [busy, setBusy]               = useState(false);

  /* rename */
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");

  async function load() {
    setLoading(true);
    try {
      const reqs = [api.get(`/api/study/categories${cat ? `?parent=${encodeURIComponent(cat)}` : ""}`)];
      if (cat) {
        reqs.push(api.get(`/api/study/categories/${cat}/path`));
        reqs.push(api.get(`/api/study/categories/${cat}/resources`));
      }
      const [cats, p, r] = await Promise.all(reqs);
      setCategories(cats.categories || []);
      setPath(p?.path || []);
      setResources(r?.resources || []);
    } catch (e) {
      toast.error(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cat]);

  function go(id) { navigate(id ? `/admin/study?cat=${id}` : "/admin/study"); }

  async function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await api.post("/api/study/categories", {
        name,
        parent_id: cat || null,
        description: newCatDesc.trim() || null,
      });
      /* If a thumbnail was selected, upload it right away */
      if (newCatThumb && r.id) {
        try { await uploadThumbnail(r.id, newCatThumb); } catch { /* non-fatal */ }
      }
      setNewCatName(""); setNewCatDesc(""); setNewCatThumb(null);
      if (thumbInput.current) thumbInput.current.value = "";
      toast.success(!cat ? "Post created!" : "Section created");
      await load();
    } catch (e) {
      toast.error(e.message || "Create failed");
    } finally { setBusy(false); }
  }

  async function deleteCategory(id) {
    if (!confirm("Delete this and EVERYTHING inside it? This cannot be undone.")) return;
    try {
      await api.del(`/api/study/categories/${id}`);
      toast.success("Deleted");
      await load();
    } catch (e) {
      toast.error(e.message || "Delete failed");
    }
  }

  async function renameCategory(id) {
    if (!renameVal.trim()) { setRenaming(null); return; }
    try {
      await api.patch(`/api/study/categories/${id}`, { name: renameVal.trim() });
      toast.success("Renamed");
      setRenaming(null);
      await load();
    } catch (e) {
      toast.error(e.message || "Rename failed");
    }
  }

  function handleThumbUpdated(id, url) {
    setCategories((prev) => prev.map((c) => c.id === id ? { ...c, thumbnail_url: url } : c));
  }

  function handleDescUpdated(id, desc) {
    setCategories((prev) => prev.map((c) => c.id === id ? { ...c, description: desc } : c));
  }

  async function uploadResource() {
    const title = newResTitle.trim();
    if (!title) { toast.error("Title is required"); return; }
    if (!cat) { toast.error("Open a folder first"); return; }
    setBusy(true);
    try {
      await api.upload(`/api/study/categories/${cat}/resources`, newResFile ? [newResFile] : [], "file", { title, description: newResDesc });
      setNewResTitle(""); setNewResDesc(""); setNewResFile(null);
      if (fileInput.current) fileInput.current.value = "";
      toast.success("Uploaded");
      await load();
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally { setBusy(false); }
  }

  async function deleteResource(id) {
    if (!confirm("Delete this file?")) return;
    try {
      await api.del(`/api/study/resources/${id}`);
      toast.success("Deleted");
      await load();
    } catch (e) {
      toast.error(e.message || "Delete failed");
    }
  }

  const isRoot = !cat;
  const itemLabel = isRoot ? "post" : "section";

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 980 }}>

        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: "linear-gradient(135deg, var(--emerald-600), var(--emerald-800))",
                display: "grid", placeItems: "center",
              }}>
                <BookOpen size={20} color="#fff" />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Study Posts — Admin</h2>
                <p className="muted small" style={{ margin: 0 }}>
                  {isAdmin
                    ? "Create posts with thumbnails, descriptions, and study files."
                    : "Doctors can create posts and upload files. Editing & deleting is admin-only."}
                </p>
              </div>
            </div>
          </div>
          <Link href="/study" className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Eye size={14} /> View as student
          </Link>
        </div>

        {/* ── Breadcrumb ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap",
          padding: "8px 14px", background: "var(--bg-elev)", border: "1px solid var(--line)",
          borderRadius: 10, marginBottom: 20,
        }}>
          <button className="btn btn-ghost btn-sm" onClick={() => go("")}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px" }}>
            <Home size={13} /> Posts
          </button>
          {path.map((p, i) => (
            <span key={p.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <ChevronRight size={13} color="var(--ink-300)" />
              {i === path.length - 1
                ? <strong style={{ fontSize: 13 }}>{p.name}</strong>
                : <button className="btn btn-ghost btn-sm" onClick={() => go(p.id)} style={{ padding: "3px 8px", fontSize: 13 }}>{p.name}</button>
              }
            </span>
          ))}
        </div>

        {/* ── Create new post / section ── */}
        <div className="card lift" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
            <Plus size={16} />
            New {itemLabel} {cat ? "section" : ""}
            {isRoot && (
              <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 99,
                background: "var(--emerald-50)", color: "var(--emerald-700)",
                border: "1px solid var(--emerald-200)", fontWeight: 700,
              }}>
                Blog post
              </span>
            )}
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              className="input"
              placeholder={isRoot ? "Post title (e.g. Cardiology Notes, ECG Masterclass…)" : "Section name"}
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />

            {/* Description only shown at root (creates a blog post) or always optionally */}
            <textarea
              className="textarea"
              rows={2}
              placeholder={isRoot
                ? "Short description shown on the blog card (optional but recommended)"
                : "Description (optional)"}
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              style={{ minHeight: 64, fontSize: 13, resize: "vertical" }}
            />

            {/* Thumbnail only at root level (post cover) */}
            {isRoot && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => thumbInput.current?.click()}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                >
                  <ImageIcon size={14} />
                  {newCatThumb ? `✓ ${newCatThumb.name}` : "Add cover thumbnail (optional)"}
                </button>
                {newCatThumb && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setNewCatThumb(null); if (thumbInput.current) thumbInput.current.value = ""; }}
                    style={{ fontSize: 12, color: "var(--rose-600)" }}
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={thumbInput}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => setNewCatThumb(e.target.files?.[0] || null)}
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={addCategory}
                disabled={busy || !newCatName.trim()}
                style={{ minWidth: 120 }}
              >
                {busy ? "Creating…" : `Create ${itemLabel}`}
              </button>
            </div>
          </div>
        </div>

        {/* ── Upload resource (inside a folder) ── */}
        {cat && (
          <div className="card lift" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
              <Upload size={16} /> Upload a resource to this section
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <input
                className="input"
                placeholder="Resource title"
                value={newResTitle}
                onChange={(e) => setNewResTitle(e.target.value)}
              />
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/*,.pptx,.ppt,.docx,.doc,.xlsx,.xls,.txt,video/*"
                onChange={(e) => setNewResFile(e.target.files?.[0] || null)}
                style={{ fontSize: 13 }}
              />
            </div>
            <textarea
              className="textarea"
              rows={2}
              placeholder="Description / notes (optional)"
              value={newResDesc}
              onChange={(e) => setNewResDesc(e.target.value)}
              style={{ minHeight: 64, fontSize: 13, marginBottom: 10 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary btn-sm" onClick={uploadResource} disabled={busy || !newResTitle.trim()}>
                {busy ? "Uploading…" : "Upload resource"}
              </button>
            </div>
            <p className="muted small" style={{ marginTop: 6 }}>
              Supports PDF, images, PPTX/PPT, DOCX, XLSX, MP4 and more (max 25 MB).
            </p>
          </div>
        )}

        {/* ── Loading ── */}
        {loading ? (
          <div className="card" style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <div className="spinner-lg" />
          </div>
        ) : (
          <>
            {/* ── Categories / posts ── */}
            {categories.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {isRoot ? "Published posts" : "Sections"}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {categories.map((c) => (
                    <div key={c.id} className="card" style={{ padding: 14, borderLeft: "4px solid var(--emerald-400)" }}>

                      {/* Top row: thumbnail preview + title + actions */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>

                        {/* Thumbnail preview */}
                        <div
                          onClick={() => go(c.id)}
                          style={{
                            width: 72, height: 50, borderRadius: 10, overflow: "hidden",
                            background: "var(--bg-muted)", border: "1.5px solid var(--line)",
                            flexShrink: 0, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {c.thumbnail_url
                            ? <img src={c.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <ImageIcon size={18} color="var(--ink-300)" />
                          }
                        </div>

                        {/* Title + meta */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {renaming === c.id ? (
                            <input
                              className="input"
                              autoFocus
                              value={renameVal}
                              onChange={(e) => setRenameVal(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") renameCategory(c.id);
                                if (e.key === "Escape") setRenaming(null);
                              }}
                              onBlur={() => renameCategory(c.id)}
                              style={{ maxWidth: 340, marginBottom: 4 }}
                            />
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => go(c.id)}
                              style={{ padding: "2px 4px", fontWeight: 800, fontSize: 15, height: "auto" }}
                            >
                              {c.name}
                            </button>
                          )}
                          <div style={{ fontSize: 12, color: "var(--ink-400)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span>{c.child_count} section{c.child_count !== 1 ? "s" : ""}</span>
                            <span>·</span>
                            <span>{c.resource_count} file{c.resource_count !== 1 ? "s" : ""}</span>
                            {c.description && (
                              <>
                                <span>·</span>
                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <CheckCircle2 size={12} color="var(--success)" /> Has description
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                          {isAdmin && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => { setRenaming(c.id); setRenameVal(c.name); }}
                              title="Rename"
                              style={{ padding: "5px 8px" }}
                            >
                              <Edit3 size={13} />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => deleteCategory(c.id)}
                              title="Delete"
                              style={{ padding: "5px 8px" }}
                            >
                              <Trash2 size={13} color="var(--rose-700)" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Second row: thumbnail upload + description edit (admin/doctor) */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                        <ThumbUploader cat={c} onSuccess={handleThumbUpdated} />
                        <DescriptionEditor cat={c} onSaved={handleDescUpdated} />
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => go(c.id)}
                          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "5px 10px", marginLeft: "auto" }}
                        >
                          <Folder size={13} /> Open →
                        </button>
                      </div>

                      {/* Description preview if set */}
                      {c.description && (
                        <div style={{
                          marginTop: 8, padding: "8px 12px",
                          background: "var(--bg-muted)", borderRadius: 8,
                          fontSize: 12, color: "var(--ink-500)", fontStyle: "italic", lineHeight: 1.5,
                        }}>
                          {c.description.length > 150 ? c.description.slice(0, 150) + "…" : c.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Resources inside current folder ── */}
            {cat && resources.length > 0 && (
              <div>
                <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Files in this section
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {resources.map((r) => (
                    <div key={r.id} className="card" style={{ padding: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <FileText size={16} color="var(--ink-400)" style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                          <div className="muted small">
                            {r.filename || r.kind}
                            {r.size_bytes ? ` · ${(r.size_bytes / 1024).toFixed(0)} KB` : ""}
                            {r.uploader ? ` · @${r.uploader}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {r.storage_url && (
                            <a className="btn btn-ghost btn-sm" href={r.storage_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                              Open ↗
                            </a>
                          )}
                          {isAdmin && (
                            <button className="btn btn-ghost btn-sm" onClick={() => deleteResource(r.id)}>
                              <Trash2 size={13} color="var(--rose-700)" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {categories.length === 0 && resources.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
                <BookOpen size={36} color="var(--ink-300)" strokeWidth={1.5} style={{ marginBottom: 12 }} />
                <p className="muted" style={{ margin: 0 }}>
                  {isRoot
                    ? "No posts yet. Create your first post above."
                    : "Empty section. Upload resources or add sub-sections above."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
