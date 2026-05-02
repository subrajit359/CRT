import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Send, AlertTriangle } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

export default function MockTestPlay() {
  const params = useParams();
  const id = params.id;
  const [, navigate] = useLocation();
  const toast = useToast();

  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/api/mock/tests/${id}`).then((r) => {
      if (!alive) return;
      if (r.status === "submitted") {
        navigate(`/mock/result/${id}`, { replace: true });
        return;
      }
      setTest(r);
      setAnswers(r.answers || {});
      setLoading(false);
    }).catch((e) => {
      if (!alive) return;
      toast.error(e.message || "Could not load test");
      navigate("/mock", { replace: true });
    });
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const questions = test?.questions || [];
  const q = questions[idx];
  const total = questions.length;
  const answered = useMemo(
    () => questions.reduce((n, _, i) => n + (answers[String(i)] ? 1 : 0), 0),
    [questions, answers]
  );

  function setAnswer(val) {
    setAnswers((prev) => ({ ...prev, [String(idx)]: val }));
  }

  async function submit() {
    setSubmitting(true);
    try {
      await api.post(`/api/mock/tests/${id}/submit`, { answers });
      navigate(`/mock/result/${id}`, { replace: true });
    } catch (e) {
      toast.error(e.message || "Submit failed");
      setSubmitting(false);
      setConfirm(false);
    }
  }

  if (loading) {
    return <AppShell><div className="container"><div className="card"><div className="spinner-lg" /></div></div></AppShell>;
  }
  if (!test || !q) return null;

  const cfg = test.config || {};

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 880 }}>
        <div className="row-between" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Mock Test</h2>
            <p className="muted small">
              {cfg.specialty || "All specialties"}{cfg.topic ? ` · ${cfg.topic}` : ""} ·
              {" "}{total} questions · {test.total_marks} marks{cfg.negativeMarking ? " · −0.25 negative" : ""}
            </p>
          </div>
          <div className="muted small">Answered {answered}/{total}</div>
        </div>

        <div className="spacer-5" />

        <div className="card lift">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="badge badge-primary">{(q.type || "").toUpperCase()}</span>
            <span className="muted small">Q{idx + 1} of {total} · {q.marks} mark{q.marks === 1 ? "" : "s"}</span>
          </div>

          <div style={{ fontSize: 16, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{q.prompt}</div>

          {/* Attachment image */}
          {q.attachment_url && (
            <div style={{ marginTop: 14 }}>
              <img
                src={q.attachment_url}
                alt="Question image"
                style={{ maxWidth: "100%", maxHeight: 340, borderRadius: 8, border: "1px solid var(--line)", objectFit: "contain" }}
              />
            </div>
          )}

          <div className="spacer-5" />

          {q.type === "mcq" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(Array.isArray(q.options) ? q.options : []).map((opt) => {
                const oid = opt.id || opt.label || opt.key || "";
                const oText = opt.text || opt.value || opt.label || "";
                const selected = (answers[String(idx)] || "") === oid;
                return (
                  <label
                    key={oid}
                    className={`row ${selected ? "is-selected" : ""}`}
                    style={{
                      gap: 10, padding: "10px 12px", border: "1px solid var(--line)",
                      borderRadius: 8, cursor: "pointer",
                      background: selected ? "rgba(15,76,58,0.08)" : "transparent",
                      borderColor: selected ? "var(--primary)" : "var(--line)",
                    }}
                  >
                    <input
                      type="radio"
                      name={`mcq-${idx}`}
                      checked={selected}
                      onChange={() => setAnswer(oid)}
                    />
                    <strong style={{ minWidth: 18 }}>{oid}.</strong>
                    <span>{oText}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <textarea
              className="textarea"
              rows={q.type === "laq" ? 8 : 4}
              placeholder={q.type === "saq" ? "Write a concise answer (1-2 sentences)…" : "Write a structured long answer…"}
              value={answers[String(idx)] || ""}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}
        </div>

        <div className="spacer-5" />

        <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
            <ChevronLeft size={14} style={{ marginRight: 4 }} />Previous
          </button>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                title={`Question ${i + 1}`}
                className="btn btn-sm"
                style={{
                  width: 30, padding: 0,
                  background: i === idx ? "var(--primary)" : (answers[String(i)] ? "rgba(15,76,58,0.18)" : "var(--ink-100)"),
                  color: i === idx ? "#fff" : "var(--ink-900)",
                }}
              >{i + 1}</button>
            ))}
          </div>
          {idx < total - 1 ? (
            <button className="btn btn-primary" onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}>
              Next<ChevronRight size={14} style={{ marginLeft: 4 }} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setConfirm(true)}>
              <Send size={14} style={{ marginRight: 4 }} />Submit test
            </button>
          )}
        </div>

        {confirm && (
          <div
            onClick={() => !submitting && setConfirm(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 460, margin: 16 }}>
              <h3 style={{ marginTop: 0 }}>
                <AlertTriangle size={18} style={{ verticalAlign: -3, color: "var(--amber-700)", marginRight: 6 }} />
                Submit test?
              </h3>
              <p className="muted">You answered {answered} of {total} questions. Unanswered questions score 0. This cannot be undone.</p>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                <button className="btn btn-ghost" onClick={() => setConfirm(false)} disabled={submitting}>Keep going</button>
                <button className="btn btn-primary" onClick={submit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Yes, submit"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
