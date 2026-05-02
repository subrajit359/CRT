import { useEffect, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import {
  ArrowLeft, Save, Trash2, Image as ImageIcon, FileText, Upload,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { SkeletonRows } from "../components/Skeleton.jsx";
import ErrorState from "../components/ErrorState.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { api, getToken, apiUrl } from "../lib/api.js";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/heic,application/pdf";
const MAX_PER_FILE = 8 * 1024 * 1024;

export default function AdminCaseEdit() {
  const [, params] = useRoute("/admin/cases/:id/edit");
  const [, navigate] = useLocation();
  const id = params?.id;
  const toast = useToast();
  const [confirmEl, askConfirm] = useConfirm();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [specialties, setSpecialties] = useState([]);

  const [title, setTitle] = useState("");
  // Multi-specialty: cases can be tagged with one or more specialties.
  const [selectedSpecialties, setSelectedSpecialties] = useState([]);
  const [customSpecialty, setCustomSpecialty] = useState("");
  const [level, setLevel] = useState(1);
  const [body, setBody] = useState("");
  const [question, setQuestion] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [acceptedDiagnoses, setAcceptedDiagnoses] = useState("");
  const [diagnosisExplanation, setDiagnosisExplanation] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get("/api/cases/specialties").then((r) => setSpecialties(r.specialties || [])).catch(() => {});
  }, []);

  async function loadCase() {
    setLoading(true);
    setError("");
    try {
      const r = await api.get(`/api/cases/${id}`);
      const c = r.case;
      setTitle(c.title || "");
      const arr = Array.isArray(c.specialties) && c.specialties.length > 0
        ? c.specialties
        : (c.specialty ? [c.specialty] : []);
      setSelectedSpecialties(arr);
      setCustomSpecialty("");
      setLevel(c.level || 1);
      setBody(c.body || "");
      const firstQ = Array.isArray(c.questions) && c.questions[0] ? c.questions[0] : {};
      setQuestion(firstQ.prompt || "");
      setDiagnosis(c.diagnosis || "");
      setAcceptedDiagnoses(Array.isArray(c.accepted_diagnoses) ? c.accepted_diagnoses.join(", ") : "");
      setDiagnosisExplanation(c.diagnosis_explanation || "");
      setAttachments(r.attachments || []);
    } catch (e) {
      setError(e?.message || "Could not load case");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (id) loadCase(); /* eslint-disable-next-line */ }, [id]);

  function toggleSpecialty(s) {
    const v = String(s || "").trim();
    if (!v) return;
    setSelectedSpecialties((curr) => {
      const i = curr.findIndex((x) => x.toLowerCase() === v.toLowerCase());
      if (i >= 0) return curr.filter((_, idx) => idx !== i);
      return [...curr, v];
    });
  }
  function addCustomSpecialty() {
    const v = customSpecialty.trim();
    if (!v) return;
    setSelectedSpecialties((curr) => {
      if (curr.some((x) => x.toLowerCase() === v.toLowerCase())) return curr;
      return [...curr, v];
    });
    setCustomSpecialty("");
  }

  async function onSave(e) {
    e.preventDefault();
    // Include any pending typed-but-not-added text so users don't lose work.
    const pending = customSpecialty.trim();
    const finalSpecialties = [...selectedSpecialties];
    if (pending && !finalSpecialties.some((x) => x.toLowerCase() === pending.toLowerCase())) {
      finalSpecialties.push(pending);
    }
    if (!title.trim() || finalSpecialties.length === 0 || body.trim().length < 80 || !question.trim() || !diagnosis.trim()) {
      return toast.error("Fill in all required fields (body must be ≥ 80 chars, at least one specialty).");
    }
    setSaving(true);
    try {
      await api.patch(`/api/cases/${id}`, {
        title: title.trim(),
        specialties: finalSpecialties,
        level: parseInt(level, 10) || 1,
        body: body.trim(),
        diagnosis: diagnosis.trim(),
        diagnosisExplanation: diagnosisExplanation.trim() || null,
        questions: [{ prompt: question.trim(), expectation: "" }],
        acceptedDiagnoses: acceptedDiagnoses.split(/[,;|]/).map((s) => s.trim()).filter(Boolean),
      });
      toast.success("Case updated");
    } catch (err) {
      toast.error(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onAddFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    const valid = [];
    for (const f of picked) {
      if (f.size > MAX_PER_FILE) { toast.error(`${f.name} is over 8 MB`); continue; }
      valid.push(f);
    }
    if (!valid.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of valid) fd.append("files", f, f.name);
      const t = getToken();
      const res = await fetch(apiUrl(`/api/cases/${id}/attachments`), {
        method: "POST",
        credentials: "include",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);
      toast.success(`Added ${data.attachments?.length || valid.length} file${valid.length === 1 ? "" : "s"}`);
      // Reload the attachments list
      const r = await api.get(`/api/cases/${id}/attachments`);
      setAttachments(r.attachments || []);
    } catch (err) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteAttachment(att) {
    const ok = await askConfirm({
      title: "Delete this attachment?",
      message: att.filename,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/cases/${id}/attachments/${att.id}`);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
      toast.success("Attachment removed");
    } catch (err) {
      toast.error(err?.message || "Could not delete");
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="container fade-in">
          <SkeletonRows rows={8} />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="container fade-in">
          <ErrorState message={error} onRetry={loadCase} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="container fade-in upload-wrap">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Link href="/admin/cases" className="btn btn-ghost btn-sm">
            <ArrowLeft size={16} /> Back to cases
          </Link>
          <Link href={`/case/${id}`} className="btn btn-ghost btn-sm">
            View live
          </Link>
        </div>

        <h2 style={{ margin: "0 0 16px" }}>Edit case</h2>

        <form onSubmit={onSave} className="card">
          <div className="field">
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="field">
            <label className="label">
              Specialties
              <span className="muted small" style={{ marginLeft: 6 }}>
                (one or more — no primary)
              </span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {specialties.map((s) => {
                const on = selectedSpecialties.some((x) => x.toLowerCase() === s.toLowerCase());
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSpecialty(s)}
                    aria-pressed={on}
                    className="btn"
                    style={{
                      background: on ? "var(--primary)" : "transparent",
                      color: on ? "#fff" : "var(--ink-800)",
                      border: `1px solid ${on ? "var(--primary)" : "var(--line)"}`,
                      borderRadius: 999,
                      padding: "6px 12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {on ? "✓ " : ""}{s}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="input"
                value={customSpecialty}
                onChange={(e) => setCustomSpecialty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addCustomSpecialty(); }
                }}
                placeholder="Add another specialty (e.g. Hematology)"
              />
              <button type="button" className="btn btn-secondary" onClick={addCustomSpecialty}>Add</button>
            </div>
            {selectedSpecialties.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {selectedSpecialties.map((s) => (
                  <span
                    key={s}
                    className="badge"
                    style={{
                      background: "var(--primary)",
                      color: "#fff",
                      borderRadius: 999,
                      padding: "4px 10px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => toggleSpecialty(s)}
                      aria-label={`Remove ${s}`}
                      style={{
                        background: "transparent", color: "#fff", border: "none",
                        cursor: "pointer", fontWeight: 700, padding: 0, lineHeight: 1,
                      }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="field" style={{ maxWidth: 200 }}>
            <label className="label">Level</label>
            <select className="input" value={level} onChange={(e) => setLevel(parseInt(e.target.value, 10))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Level {n}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="label">Body</label>
            <textarea
              className="textarea"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
            <div className="help">{body.trim().length} characters · minimum 80</div>
          </div>

          <div className="field">
            <label className="label">Question</label>
            <textarea
              className="textarea"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="label">Correct diagnosis</label>
            <input className="input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} required />
          </div>

          <div className="field">
            <label className="label">Other accepted answers (optional)</label>
            <input
              className="input"
              value={acceptedDiagnoses}
              onChange={(e) => setAcceptedDiagnoses(e.target.value)}
              placeholder="comma, separated, synonyms"
            />
          </div>

          <div className="field">
            <label className="label">Explanation (optional)</label>
            <textarea
              className="textarea"
              rows={4}
              value={diagnosisExplanation}
              onChange={(e) => setDiagnosisExplanation(e.target.value)}
            />
          </div>

          <button className="btn btn-primary btn-lg" type="submit" disabled={saving}>
            {saving ? <span className="spinner" /> : <><Save size={16} /> Save changes</>}
          </button>
        </form>

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Attachments</h3>
          <p className="muted small" style={{ marginTop: 0 }}>
            Add or remove images and PDFs attached to this case. Up to 8 MB per file.
          </p>

          {attachments.length === 0 ? (
            <div className="muted small" style={{ marginBottom: 12 }}>No attachments yet.</div>
          ) : (
            <ul className="list-reset" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {attachments.map((a) => {
                const isImg = (a.mime_type || "").startsWith("image/");
                return (
                  <li
                    key={a.id}
                    style={{
                      display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between",
                      padding: 10, border: "1px solid var(--line)", borderRadius: 10,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                      {isImg
                        ? <img src={a.storage_url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />
                        : <div style={{ width: 48, height: 48, display: "grid", placeItems: "center", background: "var(--bg-soft)", borderRadius: 6, border: "1px solid var(--line)" }}>
                            <FileText size={20} />
                          </div>
                      }
                      <div style={{ minWidth: 0 }}>
                        <a href={a.storage_url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500 }}>
                          {a.filename}
                        </a>
                        <div className="muted small">
                          {a.mime_type} · {Math.max(1, Math.round((a.size_bytes || 0) / 1024))} KB
                        </div>
                      </div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDeleteAttachment(a)}>
                      <Trash2 size={14} /> Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <label className="file-drop" style={{ opacity: uploading ? 0.6 : 1, pointerEvents: uploading ? "none" : "auto" }}>
            <input type="file" accept={ACCEPT} multiple onChange={onAddFiles} hidden disabled={uploading} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {uploading ? <span className="spinner" /> : <Upload size={14} />}
              {uploading ? "Uploading…" : "Click to add files"}
            </span>
          </label>
        </div>
      </div>
      {confirmEl}
    </AppShell>
  );
}
