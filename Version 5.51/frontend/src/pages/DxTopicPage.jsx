import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  Brain, ChevronRight, Paperclip, Edit3, Save, X, Upload, Trash2,
  Image, FileText, BarChart2, FileEdit, Sheet,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import AttachmentViewer from "../components/AttachmentViewer.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useToast } from "../components/Toast.jsx";

// Classify file for a friendly icon
function fileIcon(att) {
  const fn = (att.filename || "").toLowerCase();
  if (att.kind === "image" || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fn)) return <Image size={38} strokeWidth={1.25} />;
  if (att.kind === "pdf"   || fn.endsWith(".pdf"))                           return <FileText size={38} strokeWidth={1.25} />;
  if (/\.(pptx?|key|odp)$/i.test(fn))                                       return <BarChart2 size={38} strokeWidth={1.25} />;
  if (/\.(docx?|rtf|odt)$/i.test(fn))                                       return <FileEdit size={38} strokeWidth={1.25} />;
  if (/\.(xlsx?|ods|csv)$/i.test(fn))                                       return <Sheet size={38} strokeWidth={1.25} />;
  return <Paperclip size={38} strokeWidth={1.25} />;
}

function isImage(att) {
  const fn = (att.filename || "").toLowerCase();
  return att.kind === "image" || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fn);
}

export default function DxTopicPage() {
  const [, navigate] = useLocation();
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const isManager = user?.role === "admin" || user?.role === "doctor";
  const isAdmin   = user?.role === "admin";

  // ── Data ────────────────────────────────────────────────────────────────
  const [topic, setTopic]           = useState(null);
  const [attachments, setAtt]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [viewer, setViewer]         = useState(null);

  // ── Edit state ───────────────────────────────────────────────────────────
  const [editing, setEditing]       = useState(false);
  const [titleEdit, setTitleEdit]   = useState("");
  const [explEdit, setExplEdit]     = useState("");
  const [attDesc, setAttDesc]       = useState({});   // id → description string
  const [busy, setBusy]             = useState(false);
  const fileInput = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get(`/api/dx/topics/${id}`);
      setTopic(r.topic);
      const atts = r.attachments || [];
      setAtt(atts);
      const dm = {};
      atts.forEach((a) => { dm[a.id] = a.description || ""; });
      setAttDesc(dm);
      setTitleEdit(r.topic?.title || "");
      setExplEdit(r.topic?.explanation || "");
    } catch (e) {
      toast.error(e.message || "Failed to load topic");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function saveTopic() {
    setBusy(true);
    try {
      await api.patch(`/api/dx/topics/${id}`, { title: titleEdit, explanation: explEdit });
      toast.success("Saved");
      setEditing(false);
      await load();
    } catch (e) { toast.error(e.message || "Save failed"); } finally { setBusy(false); }
  }

  async function deleteTopic() {
    if (!confirm("Delete this topic and all its files? This cannot be undone.")) return;
    try {
      await api.del(`/api/dx/topics/${id}`);
      toast.success("Topic deleted");
      navigate(`/dx?specialty=${topic?.specialty_id || ""}`);
    } catch (e) { toast.error(e.message || "Delete failed"); }
  }

  async function uploadFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      await api.upload(`/api/dx/topics/${id}/attachments`, files, "files");
      toast.success(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}`);
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch (er) { toast.error(er.message || "Upload failed"); } finally { setBusy(false); }
  }

  async function deleteFile(attId) {
    if (!confirm("Delete this file?")) return;
    try { await api.del(`/api/dx/attachments/${attId}`); toast.success("File deleted"); await load(); }
    catch (e) { toast.error(e.message || "Delete failed"); }
  }

  async function saveDesc(attId) {
    try {
      await api.patch(`/api/dx/attachments/${attId}`, { description: attDesc[attId] || "" });
      toast.success("Description saved");
    } catch (e) { toast.error(e.message || "Save failed"); }
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  const hasDescription = !!(topic?.explanation || "").trim();
  const hasFiles       = attachments.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppShell>
        <div className="container" style={{ maxWidth: 900 }}>
          <div className="card"><div className="spinner-lg" /></div>
        </div>
      </AppShell>
    );
  }

  if (!topic) {
    return (
      <AppShell>
        <div className="container" style={{ maxWidth: 900 }}>
          <div className="card">
            <p className="muted">Topic not found.</p>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/dx")}>
              Back to specialties
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 900 }}>

        {/* Breadcrumb */}
        <div className="row" style={{ gap: 4, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/dx")}>
            All specialties
          </button>
          <ChevronRight size={14} className="muted" />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/dx?specialty=${topic.specialty_id}`)}
          >
            <strong>{topic.specialty_name}</strong>
          </button>
          <ChevronRight size={14} className="muted" />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{topic.title}</span>
        </div>

        {/* ── Topic content card ── */}
        <div className="card lift">
          {editing ? (
            /* Edit mode */
            <>
              <label className="label">Title</label>
              <input
                className="input"
                value={titleEdit}
                onChange={(e) => setTitleEdit(e.target.value)}
                style={{ fontWeight: 600, marginBottom: 12 }}
                autoFocus
              />
              <label className="label">Description / notes</label>
              <textarea
                className="textarea"
                rows={14}
                value={explEdit}
                onChange={(e) => setExplEdit(e.target.value)}
              />
              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>
                  <X size={14} style={{ marginRight: 4 }} />Cancel
                </button>
                <button className="btn btn-primary" onClick={saveTopic} disabled={busy}>
                  <Save size={14} style={{ marginRight: 4 }} />{busy ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          ) : (
            /* View mode */
            <>
              <div className="row-between" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ marginTop: 0, marginBottom: 4 }}>{topic.title}</h2>
                  <div className="muted small" style={{ marginBottom: hasDescription ? 14 : 0 }}>
                    {topic.specialty_name}
                    {topic.author ? ` · @${topic.author}` : ""}
                  </div>
                </div>
                {isAdmin && (
                  <div className="row" style={{ gap: 6, marginLeft: 12, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} title="Edit">
                      <Edit3 size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={deleteTopic} title="Delete topic">
                      <Trash2 size={14} color="var(--rose-700,#be123c)" />
                    </button>
                  </div>
                )}
              </div>

              {hasDescription ? (
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{topic.explanation}</div>
              ) : isManager ? (
                <p className="muted small">No description yet — click edit to add one.</p>
              ) : (
                /* Student: no description */
                <p className="muted small">No description provided for this topic.</p>
              )}
            </>
          )}
        </div>

        {/* ── Files section ── */}
        {/*
          Students: only show this section if there are actually files.
          Managers: always show (they need the upload button).
        */}
        {(isManager || hasFiles) && !editing && (
          <>
            <div className="spacer-5" />
            <div className="card lift">
              <div className="row-between" style={{ alignItems: "center", marginBottom: 14 }}>
                {/* Only managers see the "Files" label + count */}
                {isManager ? (
                  <h3 style={{ margin: 0 }}>
                    <Paperclip size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
                    Files
                    <span className="muted" style={{ fontSize: 13, fontWeight: 400, marginLeft: 6 }}>
                      ({attachments.length})
                    </span>
                  </h3>
                ) : (
                  /* Student header — no count, just a neutral label */
                  <h3 style={{ margin: 0 }}>Resources</h3>
                )}
                {isManager && (
                  <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
                    <Upload size={13} style={{ marginRight: 4 }} />Upload
                    <input
                      ref={fileInput}
                      type="file"
                      multiple
                      accept="application/pdf,image/*,.pptx,.ppt,.docx,.doc,.xlsx,.xls,video/*"
                      onChange={uploadFiles}
                      style={{ display: "none" }}
                    />
                  </label>
                )}
              </div>

              {!hasFiles ? (
                /* Only managers see the "no files" prompt */
                <p className="muted small">No files yet — upload files to get started.</p>
              ) : (
                <div className="dx-att-grid">
                  {attachments.map((a, i) => (
                    <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {/* Thumbnail / file icon — click to view */}
                      <div style={{ position: "relative" }}>
                        <button
                          type="button"
                          onClick={() => setViewer(i)}
                          className="dx-att-preview"
                          title="Click to view"
                          style={{
                            display: "block", width: "100%",
                            background: "none", border: "none",
                            cursor: "pointer", padding: 0,
                          }}
                        >
                          {isImage(a) ? (
                            <img
                              src={a.storage_url}
                              alt={isManager ? a.filename : "Resource"}
                              loading="lazy"
                              className="dx-att-img"
                            />
                          ) : (
                            <div className="dx-att-file-icon">
                              <span style={{ lineHeight: 1, color: "var(--ink-400)" }}>{fileIcon(a)}</span>
                              <span className="dx-att-ext">
                                {(a.filename || "").split(".").pop().toUpperCase()}
                              </span>
                            </div>
                          )}
                        </button>

                        {/* Delete button — admin only, top-right corner */}
                        {isAdmin && (
                          <button
                            className="btn btn-sm"
                            style={{
                              position: "absolute", top: 6, right: 6,
                              background: "rgba(220,38,38,0.9)",
                              color: "#fff", border: "none",
                              borderRadius: 6, padding: "3px 7px",
                              cursor: "pointer", display: "flex",
                              alignItems: "center", gap: 3,
                            }}
                            onClick={() => deleteFile(a.id)}
                            title="Delete file"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>

                      {/* Info below thumbnail */}
                      <div className="dx-att-info">
                        {/* Filename — managers only */}
                        {isManager && (
                          <a
                            href={a.storage_url}
                            target="_blank"
                            rel="noreferrer"
                            className="dx-att-name"
                          >
                            {a.filename}
                          </a>
                        )}

                        {/* Description */}
                        {isManager ? (
                          <div className="row" style={{ gap: 5, marginTop: 4 }}>
                            <input
                              className="input"
                              style={{ fontSize: 11 }}
                              placeholder="Add a description…"
                              value={attDesc[a.id] ?? ""}
                              onChange={(e) =>
                                setAttDesc((m) => ({ ...m, [a.id]: e.target.value }))
                              }
                            />
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => saveDesc(a.id)}
                              title="Save description"
                            >
                              <Save size={12} />
                            </button>
                          </div>
                        ) : (
                          /* Student: show description if it exists */
                          a.description && (
                            <div className="dx-att-desc">{a.description}</div>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Empty state for students when nothing at all */}
        {!isManager && !hasDescription && !hasFiles && !editing && (
          <div className="spacer-5" />
        )}

        {/* Full-screen viewer */}
        {viewer != null && attachments[viewer] && (
          <AttachmentViewer
            items={attachments}
            index={viewer}
            onClose={() => setViewer(null)}
            onIndexChange={setViewer}
          />
        )}
      </div>
    </AppShell>
  );
}
