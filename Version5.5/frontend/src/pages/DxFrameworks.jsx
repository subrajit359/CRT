import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  Brain, Stethoscope, ChevronRight, Paperclip,
  Plus, Trash2, Edit3, Save, X, Upload,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import EmptyState from "../components/EmptyState.jsx";
import { useAuth } from "../lib/auth.jsx";
import { getBodyPartIcon, getBodyPartImage } from "../components/BodyPartIcons.jsx";
import { useToast } from "../components/Toast.jsx";
import Modal from "../components/Modal.jsx";

export default function DxFrameworks() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const toast = useToast();
  const isManager = user?.role === "admin" || user?.role === "doctor";
  const isAdmin   = user?.role === "admin";

  const params      = new URLSearchParams(search);
  const specialtyId = params.get("specialty") || "";

  // ── Data ────────────────────────────────────────────────────────────────
  const [specialties, setSpecialties] = useState([]);
  const [specialty,   setSpecialty]   = useState(null);
  const [topics,      setTopics]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [busy,        setBusy]        = useState(false);

  // ── Specialty add / edit ─────────────────────────────────────────────────
  const [addSpecOpen,  setAddSpecOpen]  = useState(false);
  const [newSpecName,  setNewSpecName]  = useState("");
  const [editSpecId,   setEditSpecId]   = useState(null);
  const [editSpecName, setEditSpecName] = useState("");

  // ── Topic add ────────────────────────────────────────────────────────────
  const [addTopicOpen,   setAddTopicOpen]   = useState(false);
  const [newTopicTitle,  setNewTopicTitle]  = useState("");
  const [newTopicExpl,   setNewTopicExpl]   = useState("");
  const [newTopicFiles,  setNewTopicFiles]  = useState([]);
  const addTopicFileRef = useRef(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true);
    try {
      if (specialtyId) {
        const r = await api.get(`/api/dx/specialties/${specialtyId}/topics`);
        setSpecialty(r.specialty);
        setTopics(r.topics || []);
        setSpecialties([]);
      } else {
        const r = await api.get("/api/dx/specialties");
        setSpecialties(r.specialties || []);
        setSpecialty(null);
        setTopics([]);
      }
    } catch (e) {
      toast.error(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [specialtyId]);

  // ── Specialty CRUD ────────────────────────────────────────────────────────
  async function addSpecialty() {
    if (!newSpecName.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/dx/specialties", { name: newSpecName.trim() });
      setNewSpecName(""); setAddSpecOpen(false);
      toast.success("Specialty added");
      await load();
    } catch (e) { toast.error(e.message || "Failed"); } finally { setBusy(false); }
  }

  async function saveEditSpecialty() {
    if (!editSpecName.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/api/dx/specialties/${editSpecId}`, { name: editSpecName.trim() });
      setEditSpecId(null); setEditSpecName("");
      toast.success("Specialty updated");
      await load();
    } catch (e) { toast.error(e.message || "Failed"); } finally { setBusy(false); }
  }

  async function delSpecialty(id) {
    if (!confirm("Delete this specialty and ALL its topics? This cannot be undone.")) return;
    try { await api.del(`/api/dx/specialties/${id}`); toast.success("Deleted"); await load(); }
    catch (e) { toast.error(e.message || "Delete failed"); }
  }

  // ── Topic CRUD ────────────────────────────────────────────────────────────
  async function addTopic() {
    if (!newTopicTitle.trim()) return;
    setBusy(true);
    try {
      const r = await api.post(`/api/dx/specialties/${specialtyId}/topics`, {
        title:       newTopicTitle.trim(),
        explanation: newTopicExpl || null,
      });
      if (newTopicFiles.length > 0 && r.id) {
        try {
          await api.upload(`/api/dx/topics/${r.id}/attachments`, newTopicFiles, "files");
        } catch (ue) {
          toast.error("Title created but file upload failed: " + (ue.message || ""));
        }
      }
      setNewTopicTitle(""); setNewTopicExpl(""); setNewTopicFiles([]); setAddTopicOpen(false);
      toast.success("Title added");
      await load();
    } catch (e) { toast.error(e.message || "Failed"); } finally { setBusy(false); }
  }

  async function delTopic(id) {
    if (!confirm("Delete this title and all its files?")) return;
    try {
      await api.del(`/api/dx/topics/${id}`);
      toast.success("Deleted");
      await load();
    } catch (e) { toast.error(e.message || "Delete failed"); }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 980 }}>

        {/* Header */}
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>
              <Brain size={22} style={{ verticalAlign: -3, marginRight: 8 }} />
              FlowCharts
            </h2>
            <p className="muted small">Structured approaches to diseases and clinical problems, organised by specialty.</p>
          </div>

          {/* Top-right action button */}
          {isManager && !specialtyId && (
            <button className="btn btn-primary btn-sm" onClick={() => { setAddSpecOpen(true); setNewSpecName(""); }}>
              <Plus size={14} style={{ marginRight: 4 }} />Add Specialty
            </button>
          )}
          {isManager && specialtyId && (
            <button className="btn btn-primary btn-sm" onClick={() => setAddTopicOpen((v) => !v)}>
              <Plus size={14} style={{ marginRight: 4 }} />
              {addTopicOpen ? "Close" : "Add Title"}
            </button>
          )}
        </div>

        <div className="spacer-5" />

        {/* Breadcrumb */}
        <div className="row" style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/dx")}>All specialties</button>
          {specialty && specialtyId && (
            <>
              <ChevronRight size={14} className="muted" />
              <strong style={{ fontSize: 14 }}>{specialty.name}</strong>
            </>
          )}
        </div>

        <div className="spacer-5" />

        {loading ? (
          <div className="card"><div className="spinner-lg" /></div>
        ) : specialtyId ? (
          <TopicsView
            topics={topics}
            isManager={isManager}
            isAdmin={isAdmin}
            addTopicOpen={addTopicOpen}
            newTopicTitle={newTopicTitle}
            setNewTopicTitle={setNewTopicTitle}
            newTopicExpl={newTopicExpl}
            setNewTopicExpl={setNewTopicExpl}
            newTopicFiles={newTopicFiles}
            setNewTopicFiles={setNewTopicFiles}
            addTopicFileRef={addTopicFileRef}
            onAddTopic={addTopic}
            onDelTopic={delTopic}
            onOpenTopic={(t) => navigate(`/dx/topic/${t.id}`)}
            busy={busy}
          />
        ) : (
          <SpecialtyGrid
            specialties={specialties}
            onOpen={(s) => navigate(`/dx?specialty=${s.id}`)}
            isManager={isManager}
            isAdmin={isAdmin}
            onEditSpecialty={(s) => { setEditSpecId(s.id); setEditSpecName(s.name); }}
            onDelSpecialty={delSpecialty}
          />
        )}
      </div>

      {/* Add Specialty modal */}
      <Modal
        open={addSpecOpen}
        onClose={() => setAddSpecOpen(false)}
        title="Add specialty"
        width={420}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className="input"
            placeholder="Specialty name (e.g. Cardiology)"
            value={newSpecName}
            onChange={(e) => setNewSpecName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSpecialty()}
            autoFocus
          />
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setAddSpecOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={addSpecialty} disabled={busy || !newSpecName.trim()}>
              <Plus size={14} style={{ marginRight: 4 }} />Add
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Specialty modal */}
      <Modal
        open={!!editSpecId}
        onClose={() => { setEditSpecId(null); setEditSpecName(""); }}
        title="Edit specialty name"
        width={420}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className="input"
            placeholder="Specialty name"
            value={editSpecName}
            onChange={(e) => setEditSpecName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveEditSpecialty()}
            autoFocus
          />
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button
              className="btn btn-ghost"
              onClick={() => { setEditSpecId(null); setEditSpecName(""); }}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={saveEditSpecialty}
              disabled={busy || !editSpecName.trim()}
            >
              <Save size={14} style={{ marginRight: 4 }} />Save
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

// ── Level 1: Specialty grid ──────────────────────────────────────────────────

function SpecialtyGrid({ specialties, onOpen, isManager, isAdmin, onEditSpecialty, onDelSpecialty }) {
  if (specialties.length === 0) {
    return (
      <div className="card lift">
        <EmptyState
          icon={<Stethoscope size={24} strokeWidth={1.75} />}
          title="No specialties yet"
          body={isManager
            ? 'Click "+ Add Specialty" above to create the first one.'
            : "FlowCharts will appear here once added."}
        />
      </div>
    );
  }

  return (
    <div className="dx-specialty-grid">
      {specialties.map((s) => {
        const BodyIcon = getBodyPartIcon(s.name);
        const imgSrc  = getBodyPartImage(s.name);
        return (
          <div key={s.id} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => onOpen(s)}
              className="dx-specialty-card"
              style={{ width: "100%" }}
            >
              <div className="dx-specialty-icon-wrap">
                {imgSrc
                  ? <img src={imgSrc} alt={s.name} className="dx-specialty-img" />
                  : <BodyIcon color="var(--primary)" size={72} />}
              </div>
              <div className="dx-specialty-name">{s.name}</div>
              {isManager && (
                <div className="dx-specialty-count">
                  {s.topic_count} title{s.topic_count === 1 ? "" : "s"}
                </div>
              )}
            </button>

            {/* Admin: edit + delete buttons */}
            {isAdmin && (
              <div
                className="row"
                style={{ position: "absolute", top: 6, right: 6, gap: 2 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "3px 6px", background: "rgba(255,255,255,0.9)", borderRadius: 6 }}
                  onClick={() => onEditSpecialty(s)}
                  title="Edit specialty name"
                >
                  <Edit3 size={12} />
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "3px 6px", background: "rgba(255,255,255,0.9)", borderRadius: 6 }}
                  onClick={() => onDelSpecialty(s.id)}
                  title="Delete specialty"
                >
                  <Trash2 size={12} color="var(--rose-700,#be123c)" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Level 2: Topics list ─────────────────────────────────────────────────────

function TopicsView({
  topics, isManager, isAdmin,
  addTopicOpen, newTopicTitle, setNewTopicTitle, newTopicExpl, setNewTopicExpl,
  newTopicFiles, setNewTopicFiles, addTopicFileRef,
  onAddTopic, onDelTopic, onOpenTopic, busy,
}) {
  return (
    <>
      {/* Add Title form — inline card, only when open */}
      {isManager && addTopicOpen && (
        <div className="card lift" style={{ marginBottom: 16, borderLeft: "3px solid var(--primary)" }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>
            <Plus size={15} style={{ verticalAlign: -2, marginRight: 6 }} />New title
          </h3>

          <label className="label">Title name</label>
          <input
            className="input"
            placeholder="e.g. Approach to chest pain"
            value={newTopicTitle}
            onChange={(e) => setNewTopicTitle(e.target.value)}
            autoFocus
          />

          <div className="spacer-5" />

          <label className="label">Description / notes</label>
          <textarea
            className="textarea"
            rows={5}
            placeholder="FlowChart notes, steps, differentials…"
            value={newTopicExpl}
            onChange={(e) => setNewTopicExpl(e.target.value)}
          />

          <div className="spacer-5" />

          <label className="label">Attach files (images, PDF, PPTX…)</label>
          <div
            onClick={() => addTopicFileRef.current?.click()}
            style={{
              border: "2px dashed var(--border)", borderRadius: 8,
              padding: "14px", cursor: "pointer", textAlign: "center",
              color: "var(--muted)",
              background: newTopicFiles.length > 0 ? "var(--surface-2,#f9fafb)" : "transparent",
            }}
          >
            {newTopicFiles.length === 0 ? (
              <span><Upload size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Click to select files</span>
            ) : (
              <span>
                {newTopicFiles.length} file{newTopicFiles.length === 1 ? "" : "s"} selected &nbsp;·&nbsp;
                <span
                  style={{ color: "var(--primary)", cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); setNewTopicFiles([]); }}
                >Clear</span>
              </span>
            )}
          </div>
          <input
            ref={addTopicFileRef}
            type="file"
            multiple
            accept="application/pdf,image/*,.pptx,.ppt,.docx,.doc,.xlsx,.xls,video/*"
            style={{ display: "none" }}
            onChange={(e) => { setNewTopicFiles(Array.from(e.target.files || [])); e.target.value = ""; }}
          />

          {newTopicFiles.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {newTopicFiles.map((f, i) => (
                <div key={i} className="row" style={{ gap: 6, fontSize: 12, alignItems: "center" }}>
                  <Paperclip size={11} className="muted" />
                  <span style={{ flex: 1 }}>{f.name}</span>
                  <span className="muted">({(f.size / 1024).toFixed(0)} KB)</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: "1px 4px" }}
                    onClick={() => setNewTopicFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="row" style={{ justifyContent: "flex-end", marginTop: 14, gap: 8 }}>
            <button className="btn btn-primary" onClick={onAddTopic} disabled={busy || !newTopicTitle.trim()}>
              {busy ? "Saving…" : <><Save size={14} style={{ marginRight: 4 }} />Save title</>}
            </button>
          </div>
        </div>
      )}

      {/* Topics list */}
      {topics.length === 0 ? (
        <div className="card lift">
          <EmptyState
            icon={<Brain size={24} strokeWidth={1.75} />}
            title="No titles yet"
            body={isManager
              ? 'Click "+ Add Title" above to create the first one.'
              : "This specialty doesn't have any flowcharts yet."}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {topics.map((t) => (
            <div key={t.id} className="card lift" style={{ padding: 14 }}>
              <div className="row-between">
                <button
                  onClick={() => onOpenTopic(t)}
                  style={{
                    background: "none", border: "none",
                    cursor: "pointer", textAlign: "left",
                    flex: 1, padding: 0,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{t.title}</div>
                  {/* File count only visible to managers */}
                  {isManager && (
                    <div className="muted small" style={{ marginTop: 3 }}>
                      <Paperclip size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
                      {t.attachment_count} file{t.attachment_count === 1 ? "" : "s"}
                    </div>
                  )}
                </button>
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <ChevronRight size={18} className="muted" />
                  {isAdmin && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onDelTopic(t.id)}
                      title="Delete title"
                    >
                      <Trash2 size={13} color="var(--rose-700,#be123c)" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
