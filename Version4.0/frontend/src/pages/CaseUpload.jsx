import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Image as ImageIcon, FileText } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/heic,application/pdf";
const MAX_PER_FILE = 8 * 1024 * 1024;
const MAX_FILES = 8;
const CUSTOM_SPECIALTY = "__custom__";

const BULK_TEMPLATE = `=== CASE ===
Title: 60-year-old with sudden left-sided weakness
Specialty: Neurology
Level: 3
Source: Original
Body: A 60-year-old right-handed man presents with sudden onset left-sided
weakness and slurred speech that began 90 minutes ago while watching TV.
History: hypertension, type 2 diabetes, smoker (20 pack-years).
Exam: BP 178/96, HR 88 irregular, NIHSS 11. Left facial droop, left arm
drift, dysarthria. No headache or vomiting. Glucose 142 mg/dL.
Question: What is your single most urgent next step, and why?
Diagnosis: Acute ischemic stroke
Accepted: ischemic stroke, AIS, cerebral infarction, stroke
Explanation: Classic acute focal deficit within tPA window — needs urgent
non-contrast CT head to exclude hemorrhage before thrombolysis.

=== CASE ===
Title: 24-year-old with worsening abdominal pain
Specialty: Surgery
Level: 2
Body: 24-year-old man with 18 hours of peri-umbilical pain that has
migrated to the right lower quadrant, anorexia, low-grade fever 38.1°C.
Exam: tenderness at McBurney's point with rebound, voluntary guarding.
WBC 14.5 with left shift.
Question: What is your most likely diagnosis and the next step?
Diagnosis: Acute appendicitis
Accepted: appendicitis
Explanation: Migratory RLQ pain, McBurney tenderness, leukocytosis — classic.

=== CASE ===
Title: 8-year-old with rash and joint pain
Specialty: Pediatrics
Level: 2
Body: An 8-year-old presents with a 4-day history of palpable purpuric rash
on the buttocks and lower limbs, colicky abdominal pain, and bilateral ankle
swelling. Recent URI 2 weeks ago. Urinalysis: 2+ blood, trace protein.
Question: What is the most likely diagnosis and what should you monitor for?
Diagnosis: IgA vasculitis (Henoch-Schönlein purpura)
Accepted: HSP, Henoch-Schonlein purpura, IgA vasculitis
Explanation: Tetrad of palpable purpura, arthritis, abdominal pain, and renal
involvement following recent infection — classic for IgA vasculitis.
Attachments: rash_buttocks.jpg, urinalysis.pdf
`;

export default function CaseUpload() {
  const [, navigate] = useLocation();
  const toast = useToast();
  const [mode, setMode] = useState("single"); // "single" | "bulk"
  const [specialties, setSpecialties] = useState([]);

  // Single-case fields
  const [title, setTitle] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [customSpecialty, setCustomSpecialty] = useState("");
  const [level, setLevel] = useState(3);
  const [body, setBody] = useState("");
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [source, setSource] = useState("Original");
  const [diagnosis, setDiagnosis] = useState("");
  const [acceptedDiagnoses, setAcceptedDiagnoses] = useState("");
  const [diagnosisExplanation, setDiagnosisExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);

  // Bulk-upload fields
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkFiles, setBulkFiles] = useState([]);

  function onPickBulkFiles(e) {
    const picked = Array.from(e.target.files || []);
    const valid = [];
    for (const f of picked) {
      if (f.size > MAX_PER_FILE) { toast.error(`${f.name} is over 8 MB`); continue; }
      valid.push(f);
    }
    setBulkFiles((prev) => {
      const seen = new Set(prev.map((p) => p.name.toLowerCase()));
      const merged = [...prev];
      for (const f of valid) {
        if (!seen.has(f.name.toLowerCase())) { merged.push(f); seen.add(f.name.toLowerCase()); }
      }
      return merged.slice(0, 32);
    });
    e.target.value = "";
  }
  function removeBulkFile(idx) {
    setBulkFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  useEffect(() => {
    api.get("/api/cases/specialties").then((r) => {
      setSpecialties(r.specialties);
      // Only pick a default if no draft restored a specialty.
      setSpecialty((curr) => curr || r.specialties[0] || "");
    });
  }, []);

  // ---- Draft autosave (single-case) ----
  const DRAFT_KEY = "reasonal:caseupload:draft:v1";
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.title) setTitle(d.title);
      if (d.specialty) setSpecialty(d.specialty);
      if (d.customSpecialty) setCustomSpecialty(d.customSpecialty);
      if (d.level) setLevel(d.level);
      if (d.body) setBody(d.body);
      if (d.questionPrompt) setQuestionPrompt(d.questionPrompt);
      if (d.source) setSource(d.source);
      if (d.diagnosis) setDiagnosis(d.diagnosis);
      if (d.acceptedDiagnoses) setAcceptedDiagnoses(d.acceptedDiagnoses);
      if (d.diagnosisExplanation) setDiagnosisExplanation(d.diagnosisExplanation);
      if (d.title || d.body || d.diagnosis) setDraftRestored(true);
    } catch {/* ignore */}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const hasContent = title || body || diagnosis || questionPrompt;
        if (!hasContent) return;
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          title, specialty, customSpecialty, level, body,
          questionPrompt, source, diagnosis, acceptedDiagnoses, diagnosisExplanation,
          savedAt: Date.now(),
        }));
      } catch {/* quota */}
    }, 600);
    return () => clearTimeout(t);
  }, [title, specialty, customSpecialty, level, body, questionPrompt, source, diagnosis, acceptedDiagnoses, diagnosisExplanation]);

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {/* ignore */}
    setDraftRestored(false);
  }
  function discardDraft() {
    clearDraft();
    setTitle(""); setBody(""); setQuestionPrompt(""); setDiagnosis("");
    setAcceptedDiagnoses(""); setDiagnosisExplanation(""); setCustomSpecialty("");
  }

  function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
    const valid = [];
    for (const f of picked) {
      if (f.size > MAX_PER_FILE) { toast.error(`${f.name} is over 8 MB`); continue; }
      valid.push(f);
    }
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES));
    e.target.value = "";
  }
  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function resolveSpecialty() {
    if (specialty === CUSTOM_SPECIALTY) return customSpecialty.trim();
    return specialty;
  }

  async function submit(e) {
    e.preventDefault();
    const finalSpecialty = resolveSpecialty();
    if (!finalSpecialty) return toast.error("Pick or type a specialty");
    if (body.trim().length < 80) return toast.error("Case body too short");
    if (!questionPrompt.trim()) return toast.error("Add at least one reasoning question");
    if (!diagnosis.trim()) return toast.error("Diagnosis is required (used to grade student answers)");
    setBusy(true);
    try {
      const r = await api.post("/api/cases", {
        title, specialty: finalSpecialty, level: parseInt(level, 10), body, source,
        questions: [{ prompt: questionPrompt, expectation: "" }],
        diagnosis: diagnosis.trim(),
        acceptedDiagnoses: acceptedDiagnoses.split(",").map((s) => s.trim()).filter(Boolean),
        diagnosisExplanation: diagnosisExplanation.trim() || null,
      });
      if (files.length) {
        try {
          await api.upload(`/api/cases/${r.id}/attachments`, files);
        } catch (err) {
          toast.error(`Case saved, but attachments failed: ${err.message}`);
        }
      }
      clearDraft();
      toast.success("Uploaded — auto-verified by you");
      navigate(`/case/${r.id}`);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function submitBulk(e) {
    e.preventDefault();
    if (bulkText.trim().length < 40) return toast.error("Paste your bulk cases first");
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const r = bulkFiles.length
        ? await api.upload("/api/cases/bulk", bulkFiles, "files", { text: bulkText })
        : await api.post("/api/cases/bulk", { text: bulkText });
      setBulkResult(r);
      if (r.createdCount > 0) {
        const attached = (r.created || []).reduce((s, c) => s + (c.attachedCount || 0), 0);
        const extra = attached ? ` · ${attached} attachment${attached === 1 ? "" : "s"}` : "";
        toast.success(`Created ${r.createdCount} case${r.createdCount === 1 ? "" : "s"}${extra}`);
        if (r.errorCount === 0 && !(r.attachmentWarnings?.length)) {
          setBulkText("");
          setBulkFiles([]);
        }
      } else {
        toast.error("No cases created — check the format");
      }
    } catch (e) { toast.error(e.message); }
    finally { setBulkBusy(false); }
  }

  const tabBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      className="btn"
      style={{
        background: mode === id ? "var(--primary)" : "transparent",
        color: mode === id ? "#fff" : "var(--ink-800)",
        border: `1px solid ${mode === id ? "var(--primary)" : "var(--line)"}`,
        borderRadius: 999,
        padding: "8px 18px",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <AppShell>
      <div className="container fade-in upload-wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Upload a case</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {tabBtn("single", "Single")}
            {tabBtn("bulk", "Bulk")}
          </div>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          Cases must be original or properly attributed. Avoid copyrighted text.
        </p>
        <div className="spacer-7" />

        {mode === "single" && draftRestored && (
          <div className="banner-info" role="status" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span><strong>Draft restored.</strong> Your previous unsubmitted draft has been recovered.</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={discardDraft}>Discard draft</button>
          </div>
        )}
        {mode === "single" && (
          <form onSubmit={submit} className="card">
            <div className="field">
              <label className="label">Title</label>
              <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 60-year-old with sudden left-sided weakness" />
            </div>

            <div className="upload-grid">
              <div className="field">
                <label className="label">Specialty</label>
                <select className="select" value={specialty} onChange={(e) => setSpecialty(e.target.value)} required>
                  {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value={CUSTOM_SPECIALTY}>Other (custom)…</option>
                </select>
                {specialty === CUSTOM_SPECIALTY && (
                  <input
                    className="input"
                    style={{ marginTop: 8 }}
                    autoFocus
                    required
                    value={customSpecialty}
                    onChange={(e) => setCustomSpecialty(e.target.value)}
                    placeholder="Type the specialty name (e.g. Hematology)"
                  />
                )}
              </div>
              <div className="field">
                <label className="label">Level</label>
                <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
                  {[1,2,3,4,5,6,7].map((l) => <option key={l} value={l}>Level {l}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Source</label>
                <input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Original / textbook / paper" />
              </div>
            </div>

            <div className="field">
              <label className="label">Case body</label>
              <textarea className="textarea" required rows={12} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Full case: demographics, history, exam, vitals, labs. Don't reveal the diagnosis." />
              <div className="help">{body.length} chars · target 250–500 words.</div>
            </div>
            <div className="field">
              <label className="label">Reasoning question</label>
              <textarea className="textarea" required rows={3} value={questionPrompt} onChange={(e) => setQuestionPrompt(e.target.value)} placeholder="One focused reasoning question. e.g. What is your single most urgent next step, and why?" />
            </div>

            <div className="field">
              <label className="label">Correct diagnosis <span className="muted small">(required — used to grade student answers)</span></label>
              <input className="input" required value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Acute myocardial infarction" />
              <div className="help">Only doctors and admins can see this. Students never see it.</div>
            </div>
            <div className="field">
              <label className="label">Also accept these wordings <span className="muted small">(optional)</span></label>
              <input className="input" value={acceptedDiagnoses} onChange={(e) => setAcceptedDiagnoses(e.target.value)} placeholder="MI, STEMI, NSTEMI, heart attack, myocardial infarction" />
              <div className="help">Comma-separated. The AI assistant also accepts answers that mean the same thing in different words.</div>
            </div>
            <div className="field">
              <label className="label">Diagnosis explanation <span className="muted small">(optional — shown to students after they answer)</span></label>
              <textarea className="textarea" rows={3} value={diagnosisExplanation} onChange={(e) => setDiagnosisExplanation(e.target.value)} placeholder="Why this diagnosis fits — key features, distinguishing findings." />
            </div>

            <div className="field">
              <label className="label">Attachments (optional)</label>
              <div className="help">Images (PNG, JPG, GIF, WEBP, HEIC) or PDF · up to 8 MB each · max {MAX_FILES} files.</div>
              <label className="file-drop">
                <input type="file" accept={ACCEPT} multiple onChange={onPickFiles} hidden />
                <span>Click to add files</span>
              </label>
              {files.length > 0 && (
                <ul className="file-list">
                  {files.map((f, i) => (
                    <li key={i}>
                      <span className="file-name row" style={{ gap: 6, alignItems: "center", display: "inline-flex" }}>{f.type.startsWith("image/") ? <ImageIcon size={14} strokeWidth={1.75} aria-hidden="true" /> : <FileText size={14} strokeWidth={1.75} aria-hidden="true" />} {f.name}</span>
                      <span className="muted small">{(f.size / 1024).toFixed(0)} KB</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeFile(i)}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? <span className="spinner" /> : "Upload case"}</button>
          </form>
        )}

        {mode === "bulk" && (
          <form onSubmit={submitBulk} className="card">
            <div className="field">
              <label className="label">Bulk paste</label>
              <p className="muted small" style={{ marginTop: 4, marginBottom: 8 }}>
                Paste many cases at once. Separate each case with a line that says <code>=== CASE ===</code>.
                Inside each block use the same fields as the single form: <strong>Title, Specialty, Level, Source, Body, Question, Diagnosis, Accepted, Explanation, Attachments.</strong>
                {" "}<button type="button" className="btn btn-ghost btn-sm" onClick={() => setBulkText(BULK_TEMPLATE)}>Insert example</button>
              </p>
              <textarea
                className="textarea"
                required
                rows={22}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={BULK_TEMPLATE}
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}
              />
              <div className="help">Specialty can be any name — no need to match the dropdown list.</div>
            </div>

            <div className="field">
              <label className="label">Attachments (optional)</label>
              <div className="help">
                Add image or PDF files here, then reference them in any case block with
                {" "}<code>Attachments: filename1.png, filename2.pdf</code>. Files are matched by name (case-insensitive).
                Up to 8 MB each, max 32 files total.
              </div>
              <label className="file-drop">
                <input type="file" accept={ACCEPT} multiple onChange={onPickBulkFiles} hidden />
                <span>Click to add files for bulk attachments</span>
              </label>
              {bulkFiles.length > 0 && (
                <ul className="file-list">
                  {bulkFiles.map((f, i) => (
                    <li key={i}>
                      <span className="file-name row" style={{ gap: 6, alignItems: "center", display: "inline-flex" }}>{f.type.startsWith("image/") ? <ImageIcon size={14} strokeWidth={1.75} aria-hidden="true" /> : <FileText size={14} strokeWidth={1.75} aria-hidden="true" />} {f.name}</span>
                      <span className="muted small">{(f.size / 1024).toFixed(0)} KB</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeBulkFile(i)}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button className="btn btn-primary btn-lg" disabled={bulkBusy}>
              {bulkBusy ? <span className="spinner" /> : "Upload all cases"}
            </button>

            {bulkResult && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "var(--bg-muted)", border: "1px solid var(--line)" }}>
                <strong>Done.</strong>{" "}
                Created <strong>{bulkResult.createdCount}</strong>
                {bulkResult.errorCount > 0 && <> · Skipped <strong style={{ color: "#b54a4a" }}>{bulkResult.errorCount}</strong></>}
                {bulkResult.created?.length > 0 && (
                  <ul style={{ marginTop: 10, paddingLeft: 18 }}>
                    {bulkResult.created.map((c) => (
                      <li key={c.id}>
                        #{c.index} — <a href={`/case/${c.id}`}>{c.title}</a>
                        {c.attachedCount > 0 && <span className="muted small"> · {c.attachedCount} attachment{c.attachedCount === 1 ? "" : "s"}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {bulkResult.errors?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="muted small" style={{ marginBottom: 4 }}>Errors:</div>
                    <ul style={{ paddingLeft: 18, color: "#b54a4a" }}>
                      {bulkResult.errors.map((e, i) => (
                        <li key={i}><strong>#{e.index}</strong> {e.title}: {e.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {bulkResult.attachmentWarnings?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="muted small" style={{ marginBottom: 4 }}>Attachment warnings:</div>
                    <ul style={{ paddingLeft: 18, color: "#b58a4a" }}>
                      {bulkResult.attachmentWarnings.map((w, i) => (
                        <li key={i}><strong>#{w.index}</strong> {w.title}: {w.warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {bulkResult.unusedFiles?.length > 0 && (
                  <div className="muted small" style={{ marginTop: 10 }}>
                    Uploaded but not referenced by any case: {bulkResult.unusedFiles.join(", ")}
                  </div>
                )}
              </div>
            )}
          </form>
        )}
      </div>
    </AppShell>
  );
}
