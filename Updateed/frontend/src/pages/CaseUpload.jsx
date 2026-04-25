import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/heic,application/pdf";
const MAX_PER_FILE = 8 * 1024 * 1024;
const MAX_FILES = 8;

export default function CaseUpload() {
  const [, navigate] = useLocation();
  const toast = useToast();
  const [specialties, setSpecialties] = useState([]);
  const [title, setTitle] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [level, setLevel] = useState(3);
  const [body, setBody] = useState("");
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [source, setSource] = useState("Original");
  const [diagnosis, setDiagnosis] = useState("");
  const [acceptedDiagnoses, setAcceptedDiagnoses] = useState("");
  const [diagnosisExplanation, setDiagnosisExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);

  useEffect(() => {
    api.get("/api/cases/specialties").then((r) => { setSpecialties(r.specialties); setSpecialty(r.specialties[0] || ""); });
  }, []);

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

  async function submit(e) {
    e.preventDefault();
    if (body.trim().length < 80) return toast.error("Case body too short");
    if (!questionPrompt.trim()) return toast.error("Add at least one reasoning question");
    if (!diagnosis.trim()) return toast.error("Diagnosis is required (used to grade student answers)");
    setBusy(true);
    try {
      const r = await api.post("/api/cases", {
        title, specialty, level: parseInt(level, 10), body, source,
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
      toast.success("Uploaded — auto-verified by you");
      navigate(`/case/${r.id}`);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <AppShell>
      <div className="container fade-in upload-wrap">
        <h2>Upload a case</h2>
        <p className="muted" style={{ marginTop: 4 }}>Cases must be original or properly attributed. Avoid copyrighted text.</p>
        <div className="spacer-7" />
        <form onSubmit={submit} className="card">
          <div className="field">
            <label className="label">Title</label>
            <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 60-year-old with sudden left-sided weakness" />
          </div>

          <div className="upload-grid">
            <div className="field">
              <label className="label">Specialty</label>
              <select className="select" value={specialty} onChange={(e) => setSpecialty(e.target.value)} required>
                {specialties.map((s) => <option key={s}>{s}</option>)}
              </select>
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
            <div className="help">Comma-separated. A student's answer is marked correct if it contains the diagnosis OR any of these.</div>
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
                    <span className="file-name">{f.type.startsWith("image/") ? "🖼️" : "📄"} {f.name}</span>
                    <span className="muted small">{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeFile(i)}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? <span className="spinner" /> : "Upload case"}</button>
        </form>
      </div>
    </AppShell>
  );
}
