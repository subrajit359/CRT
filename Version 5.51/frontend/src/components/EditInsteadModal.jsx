import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import { api } from "../lib/api.js";
import { useToast } from "./Toast.jsx";

/**
 * Shared "Edit instead" modal for resolving a delete request by editing
 * the case rather than deleting it. Used from both the Admin Dashboard
 * and the per-case Discussion page.
 *
 * Props:
 *  - open:    boolean       — whether the modal is visible
 *  - request: { id, case_id } | null — the delete_requests row to resolve
 *  - onClose: () => void
 *  - onResolved?: () => void — called after a successful save+resolve
 */
export default function EditInsteadModal({ open, request, onClose, onResolved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !request?.case_id) {
        setForm(null);
        return;
      }
      try {
        const r = await api.get(`/api/cases/${request.case_id}`);
        const c = r?.case ? r.case : r;
        const qs = Array.isArray(c.questions) && c.questions.length
          ? c.questions
          : [{ prompt: "", expectation: "" }];
        const aliases = Array.isArray(c.accepted_diagnoses)
          ? c.accepted_diagnoses
          : Array.isArray(c.acceptedDiagnoses)
            ? c.acceptedDiagnoses
            : [];
        if (cancelled) return;
        setForm({
          title: c.title || "",
          specialty: c.specialty || "",
          level: c.level ?? 3,
          body: c.body || "",
          diagnosis: c.diagnosis || "",
          diagnosis_explanation: c.diagnosis_explanation || c.diagnosisExplanation || "",
          questions: qs.map((q) => ({
            prompt: String(q.prompt || ""),
            expectation: String(q.expectation || ""),
          })),
          accepted_diagnoses: aliases.join(", "),
        });
      } catch (e) {
        toast.error("Could not load case for editing: " + e.message);
        onClose?.();
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open, request?.case_id, toast, onClose]);

  function setField(patch) {
    setForm((f) => (f ? { ...f, ...patch } : f));
  }

  async function submit() {
    if (!form || !request) return;
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and presentation are required.");
      return;
    }
    const cleanedQuestions = (form.questions || [])
      .map((q) => ({
        prompt: String(q.prompt || "").trim(),
        expectation: String(q.expectation || "").trim(),
      }))
      .filter((q) => q.prompt);
    if (cleanedQuestions.length === 0) {
      toast.error("At least one question is required.");
      return;
    }
    const cleanedAliases = String(form.accepted_diagnoses || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      await api.patch(`/api/cases/${request.case_id}`, {
        title: form.title.trim(),
        specialty: form.specialty.trim(),
        level: parseInt(form.level, 10) || 3,
        body: form.body.trim(),
        diagnosis: form.diagnosis.trim(),
        diagnosis_explanation: form.diagnosis_explanation.trim(),
        questions: cleanedQuestions,
        acceptedDiagnoses: cleanedAliases,
      });
      await api.patch(`/api/admin/delete-requests/${request.id}`, { decision: "edit_instead" });
      toast.success("Case updated and request resolved");
      onResolved?.();
      onClose?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit case instead of deleting" width={680}>
      {form && (
        <div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Make the changes that resolve the concern raised in the delete request, then save.
            The requester will be notified that the case was edited.
          </p>

          <label className="label">Title</label>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setField({ title: e.target.value })}
            style={{ width: "100%" }}
          />

          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Specialty</label>
              <input
                className="input"
                value={form.specialty}
                onChange={(e) => setField({ specialty: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ width: 120 }}>
              <label className="label">Level</label>
              <input
                className="input"
                type="number"
                min="1"
                max="7"
                value={form.level}
                onChange={(e) => setField({ level: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <label className="label" style={{ marginTop: 8 }}>Presentation</label>
          <textarea
            className="input"
            rows={6}
            value={form.body}
            onChange={(e) => setField({ body: e.target.value })}
            style={{ width: "100%", resize: "vertical" }}
          />

          <label className="label" style={{ marginTop: 8 }}>Diagnosis</label>
          <input
            className="input"
            value={form.diagnosis}
            onChange={(e) => setField({ diagnosis: e.target.value })}
            style={{ width: "100%" }}
          />

          <label className="label" style={{ marginTop: 8 }}>Diagnosis explanation</label>
          <textarea
            className="input"
            rows={4}
            value={form.diagnosis_explanation}
            onChange={(e) => setField({ diagnosis_explanation: e.target.value })}
            style={{ width: "100%", resize: "vertical" }}
          />

          <label className="label" style={{ marginTop: 8 }}>
            Accepted diagnosis aliases <span className="muted small">(comma-separated)</span>
          </label>
          <input
            className="input"
            value={form.accepted_diagnoses}
            onChange={(e) => setField({ accepted_diagnoses: e.target.value })}
            placeholder="MI, STEMI, NSTEMI, heart attack, myocardial infarction"
            style={{ width: "100%" }}
          />

          <div style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <label className="label" style={{ margin: 0 }}>Questions</label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setField({
                  questions: [...(form.questions || []), { prompt: "", expectation: "" }],
                })}
              >
                + Add question
              </button>
            </div>
            {(form.questions || []).map((q, idx) => (
              <div
                key={idx}
                style={{ border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, padding: 10, marginTop: 8 }}
              >
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span className="muted small">Question {idx + 1}</span>
                  {(form.questions || []).length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setField({
                        questions: (form.questions || []).filter((_, i) => i !== idx),
                      })}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Question prompt"
                  value={q.prompt}
                  onChange={(e) => {
                    const next = [...(form.questions || [])];
                    next[idx] = { ...next[idx], prompt: e.target.value };
                    setField({ questions: next });
                  }}
                  style={{ width: "100%", resize: "vertical", marginTop: 6 }}
                />
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Model answer / expectation (optional)"
                  value={q.expectation}
                  onChange={(e) => {
                    const next = [...(form.questions || [])];
                    next[idx] = { ...next[idx], expectation: e.target.value };
                    setField({ questions: next });
                  }}
                  style={{ width: "100%", resize: "vertical", marginTop: 6 }}
                />
              </div>
            ))}
          </div>

          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? "Saving…" : "Save edits & resolve"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
