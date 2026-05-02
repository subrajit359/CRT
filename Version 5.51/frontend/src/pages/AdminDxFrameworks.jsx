import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Plus, Trash2, Upload, Edit3, Save, X, ChevronRight, Paperclip, FileJson } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../lib/auth.jsx";
import Modal from "../components/Modal.jsx";
import { getBodyPartImage } from "../components/BodyPartIcons.jsx";

export default function AdminDxFrameworks() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";

  const params = new URLSearchParams(search);
  const specialtyId = params.get("specialty") || "";
  const topicId = params.get("topic") || "";

  const [specialties, setSpecialties] = useState([]);
  const [specialty, setSpecialty] = useState(null);
  const [topics, setTopics] = useState([]);
  const [topic, setTopic] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [newSpecName, setNewSpecName] = useState("");
  const [newSpecIcon, setNewSpecIcon] = useState("");
  const [newSpecDesc, setNewSpecDesc] = useState("");
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicExpl, setNewTopicExpl] = useState("");
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicTitleEdit, setTopicTitleEdit] = useState("");
  const [topicExplEdit, setTopicExplEdit] = useState("");
  const [attDescMap, setAttDescMap] = useState({});
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  // Import
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const importFileRef = useRef(null);

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImportJson(ev.target.result || "");
    reader.readAsText(file);
    if (importFileRef.current) importFileRef.current.value = "";
  }

  async function runImport() {
    let parsed;
    try { parsed = JSON.parse(importJson); } catch { toast.error("Invalid JSON — please check the format."); return; }

    // Normalise to array
    const all = Array.isArray(parsed) ? parsed : [parsed];

    // Filter: only keep specialties whose name matches an existing organ image
    const toImport = all.filter((s) => getBodyPartImage(s?.name || "") !== null);
    const noImage = all.filter((s) => getBodyPartImage(s?.name || "") === null).map((s) => s?.name || "?");

    if (toImport.length === 0) {
      toast.error(`No specialties matched an organ image. Skipped: ${noImage.join(", ")}`);
      return;
    }

    setImportBusy(true);
    try {
      const payload = toImport.length === 1 ? toImport[0] : toImport;
      const r = await api.post("/api/dx/import", payload);
      const results = r.results || [];
      const totalInserted = results.reduce((s, x) => s + x.inserted, 0);
      const totalSkippedDup = results.reduce((s, x) => s + x.skipped, 0);
      const names = results.map((x) => x.name).join(", ");
      if (results.length > 0) {
        toast.success(
          `Imported ${results.length} specialty${results.length === 1 ? "" : " specialties"} (${names}): ${totalInserted} topic${totalInserted === 1 ? "" : "s"} added${totalSkippedDup ? `, ${totalSkippedDup} duplicate${totalSkippedDup === 1 ? "" : "s"} skipped` : ""}.`
        );
      }
      if (noImage.length > 0) {
        toast.error(`Skipped ${noImage.length} with no matching organ image: ${noImage.join(", ")}`);
      }
      setImportOpen(false);
      setImportJson("");
      await load();
    } catch (e) { toast.error(e.message || "Import failed"); } finally { setImportBusy(false); }
  }

  async function load() {
    setLoading(true);
    try {
      if (topicId) {
        const r = await api.get(`/api/dx/topics/${topicId}`);
        setTopic(r.topic);
        const atts = r.attachments || [];
        setAttachments(atts);
        const descInit = {};
        atts.forEach((a) => { descInit[a.id] = a.description || ""; });
        setAttDescMap(descInit);
        setTopicTitleEdit(r.topic?.title || "");
        setTopicExplEdit(r.topic?.explanation || "");
      } else if (specialtyId) {
        const r = await api.get(`/api/dx/specialties/${specialtyId}/topics`);
        setSpecialty(r.specialty);
        setTopics(r.topics || []);
      } else {
        const r = await api.get("/api/dx/specialties");
        setSpecialties(r.specialties || []);
      }
    } catch (e) {
      toast.error(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [specialtyId, topicId]);

  async function addSpecialty() {
    if (!newSpecName.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/dx/specialties", { name: newSpecName.trim(), icon: newSpecIcon.trim() || null, description: newSpecDesc.trim() || null });
      setNewSpecName(""); setNewSpecIcon(""); setNewSpecDesc("");
      toast.success("Specialty added");
      await load();
    } catch (e) { toast.error(e.message || "Failed"); } finally { setBusy(false); }
  }
  async function delSpecialty(id) {
    if (!confirm("Delete this specialty and ALL its topics? Cannot be undone.")) return;
    try { await api.del(`/api/dx/specialties/${id}`); toast.success("Deleted"); await load(); }
    catch (e) { toast.error(e.message || "Delete failed"); }
  }

  async function addTopic() {
    if (!newTopicTitle.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/dx/specialties/${specialtyId}/topics`, { title: newTopicTitle.trim(), explanation: newTopicExpl });
      setNewTopicTitle(""); setNewTopicExpl("");
      toast.success("Topic added");
      await load();
    } catch (e) { toast.error(e.message || "Failed"); } finally { setBusy(false); }
  }
  async function delTopic(id) {
    if (!confirm("Delete this topic and its attachments?")) return;
    try { await api.del(`/api/dx/topics/${id}`); toast.success("Deleted"); navigate(`/admin/dx?specialty=${specialtyId}`); }
    catch (e) { toast.error(e.message || "Delete failed"); }
  }
  async function saveTopicEdit() {
    setBusy(true);
    try {
      await api.patch(`/api/dx/topics/${topicId}`, { title: topicTitleEdit, explanation: topicExplEdit });
      toast.success("Saved");
      setEditingTopic(false);
      await load();
    } catch (e) { toast.error(e.message || "Save failed"); } finally { setBusy(false); }
  }

  async function uploadAttachments(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      await api.upload(`/api/dx/topics/${topicId}/attachments`, files, "files");
      toast.success(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}`);
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch (er) { toast.error(er.message || "Upload failed"); } finally { setBusy(false); }
  }
  async function delAttachment(id) {
    if (!confirm("Delete attachment?")) return;
    try { await api.del(`/api/dx/attachments/${id}`); toast.success("Deleted"); await load(); }
    catch (e) { toast.error(e.message || "Delete failed"); }
  }

  async function saveAttDesc(id) {
    try {
      await api.patch(`/api/dx/attachments/${id}`, { description: attDescMap[id] || "" });
      toast.success("Description saved");
    } catch (e) { toast.error(e.message || "Save failed"); }
  }

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 980 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>FlowCharts — Manager</h2>
            <p className="muted small">
              {isAdmin
                ? "Admins can add, edit, and delete everything."
                : "Doctors can add specialties, topics, and attachments. Editing and deleting is admin-only."}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)}>
              <FileJson size={14} style={{ marginRight: 4 }} />Import specialty
            </button>
            <Link href="/dx" className="btn btn-ghost btn-sm">View as student →</Link>
          </div>
        </div>

        <div className="spacer-5" />

        <div className="row" style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/admin/dx")}>All specialties</button>
          {(specialty || specialtyId) && (
            <>
              <ChevronRight size={14} className="muted" />
              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/admin/dx?specialty=${specialtyId}`)}>
                <strong>{specialty?.name || "Specialty"}</strong>
              </button>
            </>
          )}
          {topic && (<><ChevronRight size={14} className="muted" /><strong>{topic.title}</strong></>)}
        </div>

        <div className="spacer-5" />

        {loading ? (
          <div className="card"><div className="spinner-lg" /></div>
        ) : topicId && topic ? (
          <>
            <div className="card lift">
              {editingTopic && isAdmin ? (
                <>
                  <input className="input" value={topicTitleEdit} onChange={(e) => setTopicTitleEdit(e.target.value)} />
                  <div className="spacer-5" />
                  <textarea className="textarea" rows={10} value={topicExplEdit} onChange={(e) => setTopicExplEdit(e.target.value)} />
                  <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                    <button className="btn btn-ghost" onClick={() => setEditingTopic(false)} disabled={busy}><X size={14} style={{ marginRight: 4 }} />Cancel</button>
                    <button className="btn btn-primary" onClick={saveTopicEdit} disabled={busy}><Save size={14} style={{ marginRight: 4 }} />Save</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="row-between">
                    <h2 style={{ marginTop: 0 }}>{topic.title}</h2>
                    <div className="row" style={{ gap: 6 }}>
                      {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => setEditingTopic(true)}><Edit3 size={14} /></button>}
                      {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => delTopic(topicId)}><Trash2 size={14} color="var(--rose-700)" /></button>}
                    </div>
                  </div>
                  <div className="muted small" style={{ marginBottom: 10 }}>
                    {topic.specialty_name}{topic.author ? ` · by @${topic.author}` : ""}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{topic.explanation || <em className="muted">No write-up yet.</em>}</div>
                </>
              )}
            </div>

            <div className="spacer-5" />
            <div className="card lift">
              <h3 style={{ marginTop: 0 }}><Paperclip size={16} style={{ verticalAlign: -2, marginRight: 6 }} />Attachments</h3>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="application/pdf,image/*,.pptx,.ppt,.docx,.doc,.xlsx,.xls"
                onChange={uploadAttachments}
              />
              <p className="muted small" style={{ marginTop: 6 }}>PDFs, images, slides, docs (max 25 MB each, up to 8 at once).</p>
              <div className="spacer-5" />
              {attachments.length === 0 ? (
                <p className="muted">No attachments yet.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {attachments.map((a) => (
                    <li key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                      <div className="row-between">
                        <a href={a.storage_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 6, alignItems: "center", fontWeight: 600, fontSize: 13 }}>
                          <Paperclip size={13} />{a.filename}
                        </a>
                        <div className="row" style={{ gap: 8, alignItems: "center" }}>
                          <span className="muted small">{a.size_bytes ? `${(a.size_bytes / 1024).toFixed(0)} KB` : a.kind}</span>
                          {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => delAttachment(a.id)}><Trash2 size={13} color="var(--rose-700)" /></button>}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 8, marginTop: 6 }}>
                        <input
                          className="input"
                          style={{ fontSize: 12 }}
                          placeholder="Add a short description for students..."
                          value={attDescMap[a.id] ?? ""}
                          onChange={(e) => setAttDescMap((m) => ({ ...m, [a.id]: e.target.value }))}
                        />
                        <button className="btn btn-ghost btn-sm" onClick={() => saveAttDesc(a.id)}><Save size={13} /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : specialtyId ? (
          <>
            <div className="card lift">
              <h3 style={{ marginTop: 0 }}>Add a topic to {specialty?.name}</h3>
              <input className="input" placeholder="Topic title (e.g. Approach to chest pain)" value={newTopicTitle} onChange={(e) => setNewTopicTitle(e.target.value)} />
              <div className="spacer-5" />
              <textarea className="textarea" rows={6} placeholder="Explanation / flowchart notes (freeform)" value={newTopicExpl} onChange={(e) => setNewTopicExpl(e.target.value)} />
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                <button className="btn btn-primary" onClick={addTopic} disabled={busy || !newTopicTitle.trim()}><Plus size={14} style={{ marginRight: 4 }} />Add topic</button>
              </div>
            </div>

            <div className="spacer-5" />
            <h3>Topics</h3>
            {topics.length === 0 ? (
              <div className="card"><p className="muted">No topics yet — add the first one above.</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {topics.map((t) => (
                  <div key={t.id} className="card" style={{ padding: 12 }}>
                    <div className="row-between">
                      <button className="btn btn-ghost btn-sm" style={{ padding: 0, flex: 1, justifyContent: "flex-start", textAlign: "left" }} onClick={() => navigate(`/admin/dx?specialty=${specialtyId}&topic=${t.id}`)}>
                        <strong>{t.title}</strong>
                      </button>
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <span className="muted small">{t.attachment_count} att.</span>
                        {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => delTopic(t.id)}><Trash2 size={14} color="var(--rose-700)" /></button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="card lift">
              <h3 style={{ marginTop: 0 }}>Add a specialty</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8 }}>
                <input className="input" placeholder="Name (e.g. Cardiology)" value={newSpecName} onChange={(e) => setNewSpecName(e.target.value)} />
                <input className="input" placeholder="Icon" value={newSpecIcon} onChange={(e) => setNewSpecIcon(e.target.value)} maxLength={4} />
              </div>
              <div className="spacer-5" />
              <textarea className="textarea" rows={2} placeholder="Short description" value={newSpecDesc} onChange={(e) => setNewSpecDesc(e.target.value)} />
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                <button className="btn btn-primary" onClick={addSpecialty} disabled={busy || !newSpecName.trim()}><Plus size={14} style={{ marginRight: 4 }} />Add specialty</button>
              </div>
            </div>

            <div className="spacer-5" />
            <h3>Specialties</h3>
            {specialties.length === 0 ? (
              <div className="card"><p className="muted">No specialties yet — add the first one above.</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {specialties.map((s) => (
                  <div key={s.id} className="card" style={{ padding: 12 }}>
                    <div className="row-between">
                      <button className="btn btn-ghost btn-sm" style={{ padding: 0, flex: 1, justifyContent: "flex-start", textAlign: "left" }} onClick={() => navigate(`/admin/dx?specialty=${s.id}`)}>
                        <strong>{s.name}</strong>
                        <span className="muted small" style={{ marginLeft: 8 }}>· {s.topic_count} topic{s.topic_count === 1 ? "" : "s"}</span>
                      </button>
                      {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => delSpecialty(s.id)}><Trash2 size={14} color="var(--rose-700)" /></button>}
                    </div>
                    {s.description && <div className="muted small" style={{ marginTop: 4 }}>{s.description}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Import specialty modal ── */}
      <Modal open={importOpen} onClose={() => { setImportOpen(false); setImportJson(""); }} title="Import specialty" width={560}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="muted small" style={{ margin: 0 }}>
            Paste or upload a JSON file. Only specialties whose name matches an existing organ image (e.g. Cardiology, Neurology, Pulmonology…) will be imported. Others are skipped. Duplicate topics are also skipped.
          </p>
          <pre className="muted" style={{ fontSize: 11, background: "var(--surface-2, #f3f4f6)", borderRadius: 6, padding: "8px 10px", overflowX: "auto", margin: 0 }}>{`// Single specialty
{ "name": "Cardiology", "topics": [
    { "title": "Chest pain", "explanation": "..." }
  ]
}

// Multiple specialties (array)
[
  { "name": "Cardiology", "topics": [ { "title": "Chest pain", "explanation": "..." } ] },
  { "name": "Neurology",  "topics": [ { "title": "Headache",   "explanation": "..." } ] }
]`}</pre>

          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => importFileRef.current?.click()}>
              <Upload size={13} style={{ marginRight: 4 }} />Load from file
            </button>
            <span className="muted small">or paste JSON below</span>
            <input ref={importFileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={handleImportFile} />
          </div>

          <textarea
            className="textarea"
            rows={10}
            placeholder='{ "name": "...", "topics": [...] }'
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            style={{ fontFamily: "monospace", fontSize: 12 }}
          />

          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setImportOpen(false); setImportJson(""); }} disabled={importBusy}>Cancel</button>
            <button className="btn btn-primary" onClick={runImport} disabled={importBusy || !importJson.trim()}>
              {importBusy ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
