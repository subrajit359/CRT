import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Edit3, Save, X, Sparkles, ImagePlus, XCircle,
  Loader2, ChevronDown, ChevronUp, Filter, Brain, AlertTriangle,
  Check, Upload, FileText, CheckCircle, AlertCircle,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api, apiUrl, getToken } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../lib/auth.jsx";

/* ─── constants ──────────────────────────────────────────────────────────── */
const TYPE_LABELS = { mcq: "MCQ", saq: "Short Answer", laq: "Long Answer" };
const TYPE_COLORS = {
  mcq: { bg: "rgba(15,76,58,0.10)", color: "var(--emerald-700)" },
  saq: { bg: "rgba(176,120,66,0.12)", color: "#7a4f1a" },
  laq: { bg: "rgba(80,60,160,0.10)", color: "#4a3a9a" },
};

const DEFAULT_OPTIONS = [
  { id: "A", text: "" },
  { id: "B", text: "" },
  { id: "C", text: "" },
  { id: "D", text: "" },
];

function emptyForm() {
  return {
    type: "mcq",
    specialty: "",
    topic: "",
    prompt: "",
    options: DEFAULT_OPTIONS.map((o) => ({ ...o })),
    correct_answer: "A",
    explanation: "",
    marks: 1,
    attachmentFile: null,
    attachmentPreview: null,
  };
}

/* ─── small helpers ───────────────────────────────────────────────────────── */
function TypeBadge({ type }) {
  const c = TYPE_COLORS[type] || { bg: "var(--ink-100)", color: "var(--ink-700)" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
      textTransform: "uppercase", background: c.bg, color: c.color,
    }}>
      {TYPE_LABELS[type] || type}
    </span>
  );
}

/* ─── Modal ───────────────────────────────────────────────────────────────── */
function Modal({ open, onClose, title, children, maxWidth = 680 }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 900,
            background: "rgba(10,10,10,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "20px 16px",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-elev)", borderRadius: 20, padding: "28px 28px 24px",
              width: "100%", maxWidth, maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 32px 80px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.12)",
              border: "1px solid var(--line)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink-900)" }}>{title}</h3>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  background: "var(--bg-muted)", border: "none", borderRadius: 8,
                  width: 32, height: 32, cursor: "pointer", display: "grid",
                  placeItems: "center", color: "var(--ink-600)", transition: "background 160ms",
                }}
              >
                <X size={16} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ─── Confirm dialog ──────────────────────────────────────────────────────── */
function ConfirmModal({ open, onClose, onConfirm, title, body, confirmLabel = "Delete", danger = true }) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={420}>
      <p style={{ color: "var(--ink-600)", lineHeight: 1.6, marginTop: 0 }}>{body}</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn"
          onClick={onConfirm}
          style={{
            background: danger ? "var(--danger)" : "var(--primary)",
            color: "#fff", border: "none",
          }}
        >
          {danger && <AlertTriangle size={14} style={{ marginRight: 6 }} />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ─── Image upload zone ───────────────────────────────────────────────────── */
function ImageUploadZone({ preview, onChange, onRemove }) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);

  function pick(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange(file, e.target.result);
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "var(--ink-700)" }}>
        Image attachment <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>(optional)</span>
      </label>
      {preview ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          <img
            src={preview}
            alt="preview"
            style={{ maxHeight: 160, maxWidth: "100%", borderRadius: 10, border: "1px solid var(--line)", objectFit: "contain", display: "block" }}
          />
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove image"
            style={{
              position: "absolute", top: -8, right: -8,
              background: "var(--danger)", color: "#fff", border: "none",
              borderRadius: "50%", width: 24, height: 24,
              display: "grid", placeItems: "center", cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            }}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => ref.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
          style={{
            border: `2px dashed ${dragging ? "var(--primary)" : "var(--line-strong)"}`,
            borderRadius: 12, padding: "20px 16px", textAlign: "center", cursor: "pointer",
            background: dragging ? "var(--primary-soft)" : "var(--bg-muted)",
            transition: "all 160ms ease",
          }}
        >
          <Upload size={20} style={{ color: "var(--ink-400)", marginBottom: 6 }} />
          <div style={{ fontSize: 13, color: "var(--ink-600)" }}>
            Drop image here or <span style={{ color: "var(--primary)", fontWeight: 600 }}>browse</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 4 }}>PNG, JPG, GIF up to 10 MB</div>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
    </div>
  );
}

/* ─── Question form (inside modal) ───────────────────────────────────────── */
function QuestionForm({ form, setForm, specialties }) {
  function update(k, v) { setForm((p) => ({ ...p, [k]: v })); }
  function setOpt(idx, key, val) {
    setForm((p) => {
      const opts = [...(p.options || [])];
      opts[idx] = { ...opts[idx], [key]: val };
      return { ...p, options: opts };
    });
  }
  function addOpt() {
    setForm((p) => {
      const next = String.fromCharCode(65 + (p.options || []).length);
      return { ...p, options: [...(p.options || []), { id: next, text: "" }] };
    });
  }
  function removeOpt(idx) {
    setForm((p) => ({ ...p, options: (p.options || []).filter((_, i) => i !== idx) }));
  }

  const opts = Array.isArray(form.options) && form.options.length > 0
    ? form.options
    : DEFAULT_OPTIONS.map((o) => ({ ...o }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Row 1: Type + Marks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="label">Type</label>
          <select className="input" value={form.type} onChange={(e) => update("type", e.target.value)}>
            <option value="mcq">MCQ</option>
            <option value="saq">Short Answer</option>
            <option value="laq">Long Answer</option>
          </select>
        </div>
        <div>
          <label className="label">Marks</label>
          <input type="number" className="input" min={0.25} step={0.25} value={form.marks}
            onChange={(e) => update("marks", Number(e.target.value) || 1)} />
        </div>
      </div>

      {/* Row 2: Specialty + Topic — full width each */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="label">Specialty *</label>
          <input className="input" list="qf-spec-list" value={form.specialty}
            onChange={(e) => update("specialty", e.target.value)} placeholder="e.g. Cardiology" />
          <datalist id="qf-spec-list">
            {specialties.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label className="label">Topic <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>(optional)</span></label>
          <input className="input" value={form.topic}
            onChange={(e) => update("topic", e.target.value)} placeholder="e.g. Acute MI" />
        </div>
      </div>

      {/* Question text */}
      <div>
        <label className="label">Question *</label>
        <textarea className="textarea" rows={3} value={form.prompt || ""}
          onChange={(e) => update("prompt", e.target.value)} placeholder="Write the question stem here…" />
      </div>

      {/* Image attachment — shown in form */}
      <ImageUploadZone
        preview={form.attachmentPreview}
        onChange={(file, preview) => update("attachmentFile", file) || update("attachmentPreview", preview) ||
          setForm((p) => ({ ...p, attachmentFile: file, attachmentPreview: preview }))}
        onRemove={() => setForm((p) => ({ ...p, attachmentFile: null, attachmentPreview: null }))}
      />

      {/* MCQ options */}
      {form.type === "mcq" && (
        <div>
          <label className="label" style={{ marginBottom: 8 }}>Options — select the correct answer</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {opts.map((o, i) => {
              const isCorrect = form.correct_answer === o.id;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 10,
                  border: `1.5px solid ${isCorrect ? "var(--emerald-600)" : "var(--line)"}`,
                  background: isCorrect ? "rgba(15,76,58,0.06)" : "var(--bg-muted)",
                  transition: "all 140ms",
                }}>
                  <input type="radio" name="correct" checked={isCorrect}
                    onChange={() => update("correct_answer", o.id)}
                    style={{ accentColor: "var(--primary)", cursor: "pointer", flexShrink: 0 }} />
                  <input
                    className="input"
                    style={{ width: 48, padding: "6px 8px", textAlign: "center", fontWeight: 700 }}
                    value={o.id || ""}
                    onChange={(e) => setOpt(i, "id", e.target.value.toUpperCase().slice(0, 1) || String.fromCharCode(65 + i))}
                  />
                  <input className="input" style={{ flex: 1 }} value={o.text || ""}
                    onChange={(e) => setOpt(i, "text", e.target.value)} placeholder={`Option ${o.id}`} />
                  {isCorrect && <Check size={16} color="var(--emerald-600)" style={{ flexShrink: 0 }} />}
                  <button type="button" onClick={() => removeOpt(i)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--ink-400)", flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addOpt} style={{ marginTop: 8 }}>
            <Plus size={14} style={{ marginRight: 4 }} />Add option
          </button>
        </div>
      )}

      {/* SAQ / LAQ answer */}
      {form.type !== "mcq" && (
        <div>
          <label className="label">Model answer *</label>
          <textarea className="textarea" rows={form.type === "laq" ? 5 : 2}
            value={String(form.correct_answer || "")}
            onChange={(e) => update("correct_answer", e.target.value)}
            placeholder={form.type === "laq" ? "Write a structured model answer…" : "Write a concise model answer…"} />
        </div>
      )}

      {/* Explanation */}
      <div>
        <label className="label">Explanation <span style={{ color: "var(--ink-400)", fontWeight: 400 }}>(shown after submission)</span></label>
        <textarea className="textarea" rows={3} value={form.explanation || ""}
          onChange={(e) => update("explanation", e.target.value)}
          placeholder="Why is this the correct answer? Common pitfalls?" />
      </div>
    </div>
  );
}

/* ─── AI Generate panel (inside modal) ───────────────────────────────────── */
function GenerateForm({ genForm, setGenForm, specialties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="label">Specialty *</label>
          <input className="input" list="gen-spec-list" value={genForm.specialty}
            onChange={(e) => setGenForm((p) => ({ ...p, specialty: e.target.value }))}
            placeholder="e.g. Cardiology" />
          <datalist id="gen-spec-list">
            {specialties.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label className="label">Topic</label>
          <input className="input" value={genForm.topic}
            onChange={(e) => setGenForm((p) => ({ ...p, topic: e.target.value }))}
            placeholder="e.g. Acute MI" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="label">Number of questions</label>
          <input type="number" className="input" min={1} max={20} value={genForm.count}
            onChange={(e) => setGenForm((p) => ({ ...p, count: Number(e.target.value) || 5 }))} />
        </div>
        <div>
          <label className="label">Marks per question</label>
          <input type="number" className="input" min={0.25} step={0.25} value={genForm.marksPerQ}
            onChange={(e) => setGenForm((p) => ({ ...p, marksPerQ: Number(e.target.value) || 1 }))} />
        </div>
      </div>

      <div>
        <label className="label" style={{ marginBottom: 8 }}>Question types</label>
        <div style={{ display: "flex", gap: 12 }}>
          {Object.entries({ mcq: "MCQ", saq: "Short Answer", laq: "Long Answer" }).map(([k, label]) => (
            <label key={k} style={{
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              padding: "8px 14px", borderRadius: 10,
              border: `1.5px solid ${genForm.types[k] ? "var(--primary)" : "var(--line)"}`,
              background: genForm.types[k] ? "rgba(15,76,58,0.07)" : "var(--bg-muted)",
              transition: "all 140ms", userSelect: "none",
            }}>
              <input type="checkbox" checked={!!genForm.types[k]}
                onChange={(e) => setGenForm((p) => ({ ...p, types: { ...p.types, [k]: e.target.checked } }))}
                style={{ accentColor: "var(--primary)" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Question card ───────────────────────────────────────────────────────── */
function QuestionCard({ q, isAdmin, isDoctor, uploadingFor, onEdit, onDelete, onUploadAttachment, onRemoveAttachment }) {
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      style={{
        background: "var(--bg-elev)", borderRadius: 14,
        border: "1px solid var(--line)",
        boxShadow: "0 2px 8px rgba(15,76,58,0.05)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px" }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, flex: 1 }}>
            <TypeBadge type={q.type} />
            {q.source === "ai" && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(80,60,160,0.10)", color: "#4a3a9a" }}>
                AI
              </span>
            )}
            <span style={{ fontSize: 12, color: "var(--ink-400)" }}>
              {q.specialty || "General"}{q.topic ? ` · ${q.topic}` : ""} · {q.marks} mark{q.marks === 1 ? "" : "s"}
            </span>
            {q.attachment_url && (
              <span style={{ fontSize: 11, color: "var(--ink-400)", display: "flex", alignItems: "center", gap: 3 }}>
                <ImagePlus size={11} />IMG
              </span>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {(isAdmin || isDoctor) && (
              <>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadAttachment(q.id, f); e.target.value = ""; }} />
                <button
                  title={q.attachment_url ? "Replace image" : "Attach image"}
                  disabled={uploadingFor === q.id}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    background: "var(--bg-muted)", border: "1px solid var(--line)", borderRadius: 8,
                    padding: "5px 7px", cursor: "pointer", display: "grid", placeItems: "center",
                    color: "var(--ink-500)", transition: "all 140ms",
                  }}
                >
                  {uploadingFor === q.id ? <Loader2 size={13} className="spinner" /> : <ImagePlus size={13} />}
                </button>
              </>
            )}
            {isAdmin && q.attachment_url && (
              <button title="Remove image" onClick={() => onRemoveAttachment(q)}
                style={{ background: "var(--rose-100)", border: "1px solid var(--rose-300)", borderRadius: 8, padding: "5px 7px", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--rose-700)", transition: "all 140ms" }}>
                <XCircle size={13} />
              </button>
            )}
            {isAdmin && (
              <>
                <button title="Edit" onClick={() => onEdit(q)}
                  style={{ background: "var(--bg-muted)", border: "1px solid var(--line)", borderRadius: 8, padding: "5px 7px", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--ink-600)", transition: "all 140ms" }}>
                  <Edit3 size={13} />
                </button>
                <button title="Delete" onClick={() => onDelete(q)}
                  style={{ background: "var(--rose-100)", border: "1px solid var(--rose-300)", borderRadius: 8, padding: "5px 7px", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--rose-700)", transition: "all 140ms" }}>
                  <Trash2 size={13} />
                </button>
              </>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{ background: "var(--bg-muted)", border: "1px solid var(--line)", borderRadius: 8, padding: "5px 7px", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--ink-500)", transition: "all 140ms" }}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>

        {/* Question text */}
        <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: "var(--ink-900)", lineHeight: 1.55 }}>
          {q.prompt}
        </div>

        {/* Attachment preview (thumbnail) */}
        {q.attachment_url && (
          <div style={{ marginTop: 10 }}>
            <img src={q.attachment_url} alt="attachment" style={{ maxHeight: 120, maxWidth: "100%", borderRadius: 8, border: "1px solid var(--line)", objectFit: "contain" }} />
          </div>
        )}
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 16px 14px", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              {q.type === "mcq" && Array.isArray(q.options) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {q.options.map((o) => {
                    const oid = o.id || o.label;
                    const isCorr = oid === q.correct_answer;
                    return (
                      <div key={oid} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                        borderRadius: 8, fontSize: 13,
                        background: isCorr ? "rgba(15,76,58,0.08)" : "var(--bg-muted)",
                        border: `1px solid ${isCorr ? "var(--emerald-600)" : "var(--line)"}`,
                        fontWeight: isCorr ? 600 : 400, color: isCorr ? "var(--emerald-700)" : "var(--ink-700)",
                      }}>
                        {isCorr && <Check size={13} />}
                        <strong>{oid}.</strong> {o.text || o.value || ""}
                      </div>
                    );
                  })}
                </div>
              )}
              {q.type !== "mcq" && q.correct_answer && (
                <div style={{ background: "rgba(15,76,58,0.06)", borderLeft: "3px solid var(--primary)", borderRadius: "0 8px 8px 0", padding: "8px 12px", fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: "var(--ink-500)", marginRight: 6 }}>Model answer:</span>
                  {q.correct_answer}
                </div>
              )}
              {q.explanation && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--amber-100)", borderRadius: 8, fontSize: 13, color: "var(--amber-700)" }}>
                  <strong>Explanation:</strong> {q.explanation}
                </div>
              )}
              {q.author && <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-400)" }}>Added by @{q.author}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Bulk upload template ────────────────────────────────────────────────── */
const BULK_TEMPLATE = `=== QUESTION ===
Type: mcq
Specialty: Cardiology
Topic: Acute MI
Marks: 1
Question: A 65-year-old man presents with crushing chest pain radiating to the left arm for 45 minutes. ECG shows ST elevation in leads II, III, aVF. Which is the most appropriate immediate management?
A: Aspirin 300 mg orally
B: Metoprolol 5 mg IV
C: Furosemide 40 mg IV
D: Atropine 0.5 mg IV
Answer: A
Explanation: Aspirin is first-line for suspected STEMI — it irreversibly inhibits platelet COX-1, reducing thrombus propagation. Metoprolol and furosemide are adjuncts, not the immediate priority. Atropine is for bradycardia/heart block.

=== QUESTION ===
Type: saq
Specialty: Neurology
Topic: Stroke
Marks: 2
Question: A 72-year-old presents with sudden right-sided weakness and aphasia of 1-hour duration. BP 168/92. What is the single most important first investigation and why?
Answer: Non-contrast CT head
Explanation: Non-contrast CT is essential to exclude haemorrhagic stroke before thrombolysis. IV tPA is contraindicated in haemorrhagic stroke, so distinguishing ischaemic from haemorrhagic is the critical first step.

=== QUESTION ===
Type: mcq
Specialty: Surgery
Topic: Acute Abdomen
Marks: 1
Question: A 24-year-old man has 18 hours of periumbilical pain now localised to the right iliac fossa with fever 38.2°C and WBC 14.5. The most likely diagnosis is?
A: Acute appendicitis
B: Mesenteric adenitis
C: Meckel's diverticulitis
D: Inguinal hernia
Answer: A
Explanation: Migratory periumbilical pain to RIF (McBurney's), fever, and leukocytosis are classic for acute appendicitis. Mesenteric adenitis lacks the migratory pattern. Meckel's is less common and usually presents differently.
`;

/* ─── Bulk upload modal ───────────────────────────────────────────────────── */
function BulkUploadModal({ open, onClose, onSuccess }) {
  const toast = useToast();
  const [bulkText, setBulkText] = useState("");
  const [blockFiles, setBlockFiles] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  function handleClose() {
    if (busy) return;
    onClose();
  }

  useEffect(() => {
    if (!open) { setTimeout(() => { setBulkText(""); setBlockFiles({}); setResult(null); }, 300); }
  }, [open]);

  function loadTxt(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/\.txt$/i.test(f.name) && f.type !== "text/plain") {
      return toast.error("Please choose a .txt file");
    }
    if (f.size > 5 * 1024 * 1024) return toast.error("File is over 5 MB");
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "").replace(/\r\n/g, "\n").trim();
      if (!text) return toast.error("That file is empty");
      if (bulkText.trim() && !window.confirm("Replace current text with file contents?")) return;
      setBulkText(text);
      toast.success(`Loaded ${f.name}`);
    };
    reader.onerror = () => toast.error("Could not read file");
    reader.readAsText(f);
  }

  const parsedCount = (() => {
    const blocks = String(bulkText || "")
      .split(/^\s*={2,}\s*question\s*={2,}\s*$/gim)
      .filter((b) => b.trim());
    return blocks.length;
  })();

  function addBlockFile(idx, file) {
    if (!file || !file.type.startsWith("image/")) return toast.error("Only image files allowed");
    if (file.size > 10 * 1024 * 1024) return toast.error("Image must be under 10 MB");
    setBlockFiles((prev) => ({ ...prev, [idx]: file }));
  }

  function removeBlockFile(idx) {
    setBlockFiles((prev) => { const n = { ...prev }; delete n[idx]; return n; });
  }

  async function submit(e) {
    e.preventDefault();
    if (bulkText.trim().length < 20) return toast.error("Paste your questions first");
    setBusy(true);
    setResult(null);
    try {
      let r;
      const hasFiles = Object.keys(blockFiles).length > 0;
      if (hasFiles) {
        const fd = new FormData();
        fd.append("text", bulkText);
        for (const [idx, file] of Object.entries(blockFiles)) {
          fd.append(`question_${Number(idx) + 1}`, file, file.name);
        }
        const t = getToken();
        const resp = await fetch(apiUrl("/api/mock/questions/bulk"), {
          method: "POST",
          credentials: "include",
          headers: t ? { Authorization: `Bearer ${t}` } : {},
          body: fd,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${resp.status}`);
        }
        r = await resp.json();
      } else {
        r = await api.post("/api/mock/questions/bulk", { text: bulkText });
      }
      setResult(r);
      if (r.createdCount > 0) {
        toast.success(`Created ${r.createdCount} question${r.createdCount === 1 ? "" : "s"}`);
        if (r.errorCount === 0) { setBulkText(""); setBlockFiles({}); }
        onSuccess?.();
      } else {
        toast.error("No questions created — check the format");
      }
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Bulk upload questions" maxWidth={780}>
      <div style={{
        padding: "10px 14px", borderRadius: 10, marginBottom: 20,
        background: "rgba(15,76,58,0.06)", border: "1px solid rgba(15,76,58,0.15)",
        fontSize: 13, color: "var(--ink-700)", lineHeight: 1.6,
      }}>
        Separate each question with a line containing <code style={{ background: "var(--bg-muted)", padding: "1px 5px", borderRadius: 4 }}>{"=== QUESTION ==="}</code>.
        {" "}Each block needs: <strong>Type</strong>, <strong>Specialty</strong>, <strong>Question</strong>, <strong>Answer</strong>, <strong>Explanation</strong>.
        {" "}For MCQ, add options on separate lines as <code style={{ background: "var(--bg-muted)", padding: "1px 5px", borderRadius: 4 }}>A: ...</code>
      </div>

      <form onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-700)" }}>
              Paste questions
              {parsedCount > 0 && (
                <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--ink-400)" }}>
                  ({parsedCount} block{parsedCount === 1 ? "" : "s"} detected)
                </span>
              )}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => setBulkText(BULK_TEMPLATE)}
                style={{ fontSize: 12 }}>
                Load example
              </button>
              <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                <FileText size={13} />
                Upload .txt
                <input type="file" accept=".txt,text/plain" hidden onChange={loadTxt} />
              </label>
            </div>
          </div>
          <textarea
            className="textarea"
            rows={14}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`=== QUESTION ===\nType: mcq\nSpecialty: Cardiology\nQuestion: ...\nA: ...\nB: ...\nAnswer: A\nExplanation: ...`}
            style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.55, resize: "vertical" }}
          />
        </div>

        {/* Per-block image attachments */}
        {parsedCount > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-700)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <ImagePlus size={14} />
              Question images
              <span style={{ fontWeight: 400, color: "var(--ink-400)", fontSize: 12 }}>(optional — one image per block)</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Array.from({ length: parsedCount }, (_, i) => {
                const file = blockFiles[i];
                const previewUrl = file ? URL.createObjectURL(file) : null;
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 8,
                      background: file ? "rgba(15,76,58,0.05)" : "var(--bg-muted)",
                      border: `1px solid ${file ? "rgba(15,76,58,0.2)" : "var(--line)"}`,
                    }}
                  >
                    <span style={{ minWidth: 60, fontSize: 13, fontWeight: 600, color: "var(--ink-700)", flexShrink: 0 }}>
                      Block {i + 1}
                    </span>
                    {file ? (
                      <>
                        <img
                          src={previewUrl}
                          alt=""
                          style={{ width: 38, height: 38, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)", flexShrink: 0 }}
                        />
                        <span style={{ flex: 1, fontSize: 12, color: "var(--ink-600)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeBlockFile(i)}
                          title="Remove image"
                          style={{
                            background: "var(--danger)", color: "#fff", border: "none",
                            borderRadius: "50%", width: 20, height: 20,
                            display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0,
                          }}
                        >
                          <X size={11} />
                        </button>
                      </>
                    ) : (
                      <label style={{ flex: 1, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--primary)", fontWeight: 600 }}>
                        <ImagePlus size={13} />
                        Add image
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) addBlockFile(i, f); }}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Results panel */}
        {result && (
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {result.createdCount > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderRadius: 10, background: "rgba(15,76,58,0.07)", border: "1px solid rgba(15,76,58,0.2)",
              }}>
                <CheckCircle size={16} color="var(--emerald-700)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--emerald-700)", fontWeight: 600 }}>
                  {result.createdCount} question{result.createdCount === 1 ? "" : "s"} created successfully
                </span>
              </div>
            )}
            {result.errors?.length > 0 && (
              <div style={{
                padding: "10px 14px", borderRadius: 10,
                background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.18)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <AlertCircle size={15} color="var(--danger)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>
                    {result.errors.length} error{result.errors.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "var(--danger)", display: "flex", flexDirection: "column", gap: 2 }}>
                  {result.errors.map((err, i) => (
                    <li key={i}>
                      {err.index != null ? `Block ${err.index}: ` : ""}{err.error || err.message || String(err)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !bulkText.trim()}>
            {busy
              ? <><Loader2 size={14} className="spinner" style={{ marginRight: 6 }} />Uploading…</>
              : <><Upload size={14} style={{ marginRight: 6 }} />Upload questions</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function AdminMockQuestions() {
  const { user } = useAuth();
  const toast = useToast();
  const [, navigate] = useLocation();
  const isAdmin = user?.role === "admin";
  const isDoctor = user?.role === "doctor";

  useEffect(() => {
    if (user && user.role === "student") navigate("/mock", { replace: true });
  }, [user, navigate]);

  const [specialties, setSpecialties] = useState([]);
  const [filter, setFilter] = useState("");
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState(null);
  const [qPage, setQPage] = useState(1);
  const Q_PER_PAGE = 10;

  /* form modal */
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);

  /* generate modal */
  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({ specialty: "", topic: "", types: { mcq: true, saq: false, laq: false }, count: 5, marksPerQ: 1 });
  const [genBusy, setGenBusy] = useState(false);

  /* bulk upload modal */
  const [bulkOpen, setBulkOpen] = useState(false);

  /* delete confirm */
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    api.get("/api/mock/specialties")
      .then((r) => setSpecialties(Array.isArray(r.specialties) ? r.specialties : []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const path = filter ? `/api/mock/questions?specialty=${encodeURIComponent(filter)}` : "/api/mock/questions";
      const r = await api.get(path);
      setQuestions(r.questions || []);
    } catch (e) {
      toast.error(e.message || "Failed to load questions");
    } finally {
      setLoading(false);
    }
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  /* ── form actions ── */
  function openNew() { setEditingId(null); setForm(emptyForm()); setFormOpen(true); }
  function openEdit(q) {
    setEditingId(q.id);
    const opts = Array.isArray(q.options) && q.options.length > 0
      ? q.options.map((o) => ({ id: o.id || "", text: o.text || o.value || "" }))
      : DEFAULT_OPTIONS.map((o) => ({ ...o }));
    setForm({
      type: q.type || "mcq", specialty: q.specialty || "",
      topic: q.topic || "", prompt: q.prompt || "",
      options: opts, correct_answer: String(q.correct_answer || ""),
      explanation: String(q.explanation || ""), marks: Number(q.marks) || 1,
      attachmentFile: null,
      attachmentPreview: q.attachment_url || null,
    });
    setFormOpen(true);
  }

  async function save() {
    const promptVal = (form.prompt || "").trim();
    const answerVal = String(form.correct_answer || "").trim();
    if (!promptVal) { toast.error("Question is required"); return; }
    if (!answerVal) { toast.error("Correct answer is required"); return; }
    if (!form.specialty.trim()) { toast.error("Specialty is required"); return; }
    setBusy(true);
    try {
      const payload = {
        type: form.type, specialty: form.specialty.trim(),
        topic: form.topic.trim() || null, prompt: promptVal,
        correct_answer: answerVal,
        explanation: String(form.explanation || "").trim(),
        marks: Number(form.marks) || 1,
        options: form.type === "mcq" ? form.options : null,
      };
      let savedId = editingId;
      if (!savedId) {
        const r = await api.post("/api/mock/questions", payload);
        savedId = r.id || r.question?.id;
      } else {
        await api.patch(`/api/mock/questions/${savedId}`, payload);
      }
      /* upload attachment if a new file was selected */
      if (form.attachmentFile && savedId) {
        setUploadingFor(savedId);
        const fd = new FormData();
        fd.append("file", form.attachmentFile);
        const token = localStorage.getItem("rsn_token");
        const res = await fetch(apiUrl(`/api/mock/questions/${savedId}/attachment`), {
          method: "POST", credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Image upload failed"); }
        setUploadingFor(null);
      }
      toast.success(editingId ? "Question updated" : "Question added");
      setFormOpen(false);
      await load();
    } catch (e) {
      toast.error(e.message || "Save failed");
    } finally {
      setBusy(false);
      setUploadingFor(null);
    }
  }

  /* ── attachment on existing card ── */
  async function uploadAttachment(qid, file) {
    setUploadingFor(qid);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("rsn_token");
      const r = await fetch(apiUrl(`/api/mock/questions/${qid}/attachment`), {
        method: "POST", credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Upload failed"); }
      const data = await r.json();
      toast.success("Image uploaded");
      setQuestions((qs) => qs.map((x) => x.id === qid ? { ...x, attachment_url: data.url } : x));
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingFor(null);
    }
  }

  async function removeAttachment(q) {
    try {
      await api.del(`/api/mock/questions/${q.id}/attachment`);
      toast.success("Image removed");
      setQuestions((qs) => qs.map((x) => x.id === q.id ? { ...x, attachment_url: null } : x));
    } catch (e) {
      toast.error(e.message || "Failed");
    }
  }

  /* ── delete ── */
  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.del(`/api/mock/questions/${deleteTarget.id}`);
      toast.success("Question deleted");
      setQuestions((qs) => qs.filter((q) => q.id !== deleteTarget.id));
    } catch (e) {
      toast.error(e.message || "Delete failed");
    } finally {
      setDeleteTarget(null);
    }
  }

  /* ── AI generate ── */
  async function runGenerate() {
    if (!genForm.specialty.trim()) { toast.error("Specialty is required"); return; }
    const selectedTypes = Object.entries(genForm.types).filter(([, v]) => v).map(([k]) => k);
    if (!selectedTypes.length) { toast.error("Pick at least one question type"); return; }
    setGenBusy(true);
    try {
      const r = await api.post("/api/mock/questions/generate", {
        specialty: genForm.specialty.trim(), topic: genForm.topic.trim() || undefined,
        types: selectedTypes, count: Number(genForm.count) || 5, marksPerQ: Number(genForm.marksPerQ) || 1,
      });
      toast.success(`Generated ${r.count} question${r.count === 1 ? "" : "s"}`);
      setGenOpen(false);
      await load();
    } catch (e) {
      toast.error(e.message || "AI generation failed");
    } finally {
      setGenBusy(false);
    }
  }

  if (!user || user.role === "student") return null;

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 1000, paddingBottom: 48 }}>

        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700 }}>Question Bank</h2>
          <p className="muted small" style={{ margin: "0 0 16px" }}>
            {isAdmin ? "Admin: add, edit, delete & generate" : "Doctor: add questions only"}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <Link href="/mock" className="btn btn-ghost btn-sm">← Mock Test</Link>
            <button className="btn btn-ghost btn-sm" onClick={() => setGenOpen(true)}>
              <Brain size={14} style={{ marginRight: 5 }} />Generate with AI
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setBulkOpen(true)}>
              <Upload size={14} style={{ marginRight: 5 }} />Bulk upload
            </button>
            <button className="btn btn-primary btn-sm" onClick={openNew}>
              <Plus size={14} style={{ marginRight: 5 }} />Add question
            </button>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
          background: "var(--bg-elev)", borderRadius: 12, border: "1px solid var(--line)",
          marginBottom: 20,
        }}>
          <Filter size={15} color="var(--ink-400)" />
          <select className="input" style={{ maxWidth: 240, margin: 0 }} value={filter}
            onChange={(e) => { setFilter(e.target.value); setQPage(1); }}>
            <option value="">All specialties</option>
            {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--ink-400)" }}>
            {questions.length} question{questions.length === 1 ? "" : "s"}
            {questions.length > Q_PER_PAGE && ` · page ${qPage} of ${Math.ceil(questions.length / Q_PER_PAGE)}`}
          </span>
        </div>

        {/* ── Question list ── */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="shimmer" style={{ height: 80, borderRadius: 14 }} />
            ))}
          </div>
        ) : questions.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "56px 24px",
            background: "var(--bg-elev)", borderRadius: 16, border: "1.5px dashed var(--line)",
          }}>
            <Brain size={36} color="var(--ink-300)" style={{ marginBottom: 12 }} />
            <h3 style={{ margin: "0 0 8px", color: "var(--ink-700)" }}>No questions yet</h3>
            <p className="muted" style={{ marginBottom: 20 }}>
              Add your first question manually or let AI generate some.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-ghost" onClick={() => setGenOpen(true)}>
                <Brain size={14} style={{ marginRight: 5 }} />Generate with AI
              </button>
              <button className="btn btn-primary" onClick={openNew}>
                <Plus size={14} style={{ marginRight: 5 }} />Add question
              </button>
            </div>
          </div>
        ) : (
          <AnimatePresence>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {questions.slice((qPage - 1) * Q_PER_PAGE, qPage * Q_PER_PAGE).map((q) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  isAdmin={isAdmin}
                  isDoctor={isDoctor}
                  uploadingFor={uploadingFor}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  onUploadAttachment={uploadAttachment}
                  onRemoveAttachment={removeAttachment}
                />
              ))}
            </div>
          </AnimatePresence>
        )}

        {/* ── Pagination ── */}
        {!loading && questions.length > Q_PER_PAGE && (() => {
          const totalPages = Math.ceil(questions.length / Q_PER_PAGE);
          function getPages() {
            if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
            const pages = [1];
            if (qPage > 3) pages.push("…");
            for (let p = Math.max(2, qPage - 1); p <= Math.min(totalPages - 1, qPage + 1); p++) pages.push(p);
            if (qPage < totalPages - 2) pages.push("…");
            pages.push(totalPages);
            return pages;
          }
          return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, paddingTop: 20 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setQPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                disabled={qPage === 1}
              >← Prev</button>
              {getPages().map((p, i) =>
                p === "…"
                  ? <span key={`el-${i}`} style={{ padding: "0 4px", color: "var(--ink-400)" }}>…</span>
                  : <button
                      key={p}
                      className="btn btn-sm"
                      style={{
                        minWidth: 34, padding: "0 8px",
                        background: p === qPage ? "var(--primary)" : "var(--bg-elev)",
                        color: p === qPage ? "#fff" : "var(--ink-700)",
                        border: "1px solid var(--line)",
                      }}
                      onClick={() => { setQPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    >{p}</button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setQPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                disabled={qPage === totalPages}
              >Next →</button>
            </div>
          );
        })()}
      </div>

      {/* ── Add/Edit modal ── */}
      <Modal
        open={formOpen}
        onClose={() => !busy && setFormOpen(false)}
        title={editingId ? "Edit question" : "New question"}
        maxWidth={720}
      >
        <QuestionForm form={form} setForm={setForm} specialties={specialties} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy
              ? <><Loader2 size={14} className="spinner" style={{ marginRight: 6 }} />Saving…</>
              : <><Save size={14} style={{ marginRight: 6 }} />{editingId ? "Update" : "Add question"}</>}
          </button>
        </div>
      </Modal>

      {/* ── Bulk upload modal ── */}
      <BulkUploadModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSuccess={() => load()}
      />

      {/* ── AI Generate modal ── */}
      <Modal open={genOpen} onClose={() => !genBusy && setGenOpen(false)} title="Generate questions with AI" maxWidth={560}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(80,60,160,0.07)", border: "1px solid rgba(80,60,160,0.15)", marginBottom: 20 }}>
          <Sparkles size={16} color="#4a3a9a" />
          <span style={{ fontSize: 13, color: "#4a3a9a" }}>AI will create clinically accurate questions and save them to the bank.</span>
        </div>
        <GenerateForm genForm={genForm} setGenForm={setGenForm} specialties={specialties} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={() => setGenOpen(false)} disabled={genBusy}>Cancel</button>
          <button className="btn btn-primary" onClick={runGenerate} disabled={genBusy}>
            {genBusy
              ? <><Loader2 size={14} className="spinner" style={{ marginRight: 6 }} />Generating…</>
              : <><Sparkles size={14} style={{ marginRight: 6 }} />Generate</>}
          </button>
        </div>
      </Modal>

      {/* ── Delete confirm ── */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete question?"
        body={`"${deleteTarget?.prompt?.slice(0, 80) ?? ""}…" will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </AppShell>
  );
}
