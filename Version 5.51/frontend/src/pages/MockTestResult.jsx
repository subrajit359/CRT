import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Trophy, CheckCircle2, XCircle, MinusCircle, RotateCcw, History, CircleDot } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";

function pctColor(pct) {
  if (pct >= 75) return "var(--green-700, #16a34a)";
  if (pct >= 50) return "var(--amber-700, #D99423)";
  return "var(--rose-700, #B23A3A)";
}

// Format a mark number: round to 2dp, drop trailing zeros
function fmt(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return v % 1 === 0 ? String(v) : v.toFixed(2).replace(/0+$/, "");
}

function cardBg(r) {
  if (r.is_correct) return "rgba(15,76,58,0.05)";
  if (r.is_partial) return "rgba(217,148,35,0.05)";
  if (!r.given_answer) return "rgba(0,0,0,0.02)";
  return "transparent";
}

// Parse the plain-text eval feedback into named sections
function parseFeedback(text) {
  if (!text) return null;
  const sections = {};
  const lines = text.split("\n");
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^what you got right[:\s]/i.test(trimmed)) { current = "right"; sections.right = []; }
    else if (/^what was missing[:\s]/i.test(trimmed)) { current = "missing"; sections.missing = []; }
    else if (/^one-line rule[:\s]/i.test(trimmed)) { current = "rule"; sections.rule = []; }
    else if (current && trimmed.startsWith("-")) {
      const bullet = trimmed.replace(/^-\s*/, "").trim();
      if (bullet) sections[current].push(bullet);
    }
  }
  return (sections.right || sections.missing || sections.rule) ? sections : null;
}

export default function MockTestResult() {
  const params = useParams();
  const id = params.id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get(`/api/mock/tests/${id}`).then((r) => {
      if (!alive) return;
      setData(r);
      setLoading(false);
    }).catch((e) => {
      if (!alive) return;
      setErr(e.message || "Could not load result");
      setLoading(false);
    });
    return () => { alive = false; };
  }, [id]);

  if (loading) {
    return <AppShell><div className="container"><div className="card"><div className="spinner-lg" /></div></div></AppShell>;
  }
  if (err) {
    return <AppShell><div className="container"><div className="card"><p>{err}</p></div></div></AppShell>;
  }
  if (!data || data.status !== "submitted") {
    return <AppShell><div className="container"><div className="card"><p className="muted">This test hasn't been submitted yet.</p></div></div></AppShell>;
  }

  const cfg = data.config || {};
  const total = Number(data.total_marks);
  const got = Number(data.obtained);
  const pct = total > 0 ? Math.max(0, Math.round((got / total) * 100)) : 0;

  const review = data.review || [];
  const correct = review.filter((r) => r.is_correct).length;
  const partial = review.filter((r) => r.is_partial).length;
  const wrong = review.filter((r) => !r.is_correct && !r.is_partial && r.given_answer).length;
  const skipped = review.filter((r) => !r.given_answer).length;

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 880 }}>
        <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}><Trophy size={22} style={{ verticalAlign: -3, marginRight: 8 }} />Mock Test Result</h2>
            <p className="muted small">
              {cfg.specialty || "All specialties"}{cfg.topic ? ` · ${cfg.topic}` : ""} ·
              {" "}{review.length} questions{cfg.negativeMarking ? " · negative marking on" : ""}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link href="/mock/history" className="btn btn-ghost btn-sm"><History size={14} style={{ marginRight: 4 }} />History</Link>
            <Link href="/mock" className="btn btn-primary btn-sm"><RotateCcw size={14} style={{ marginRight: 4 }} />Take another</Link>
          </div>
        </div>

        <div className="spacer-7" />

        <div className="card lift" style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
          <div style={{ minWidth: 160 }}>
            <div className="muted small">Score</div>
            <div style={{ fontSize: 40, fontWeight: 700, color: pctColor(pct), fontFamily: "var(--font-display)", lineHeight: 1.1, wordBreak: "break-word" }}>
              {fmt(got)} / {fmt(total)}
            </div>
            <div style={{ fontSize: 13, color: pctColor(pct), fontWeight: 600 }}>{pct}%</div>
          </div>
          <div style={{ display: "flex", gap: 18, flex: 1, flexWrap: "wrap" }}>
            <Stat icon={<CheckCircle2 size={18} color="var(--green-700)" />} label="Correct" value={correct} />
            {partial > 0 && <Stat icon={<CircleDot size={18} color="var(--amber-700,#D99423)" />} label="Partial" value={partial} />}
            <Stat icon={<XCircle size={18} color="var(--rose-700)" />} label="Wrong" value={wrong} />
            <Stat icon={<MinusCircle size={18} color="var(--muted)" />} label="Skipped" value={skipped} />
          </div>
        </div>

        <div className="spacer-7" />

        <h3>Question-by-question review</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {review.map((r) => (
            <div key={r.index} className="card" style={{
              borderLeft: `4px solid ${r.is_correct ? "var(--green-700)" : r.is_partial ? "var(--amber-700,#D99423)" : (r.given_answer ? "var(--rose-700)" : "var(--ink-300,#ccc)")}`,
              background: cardBg(r),
            }}>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="badge badge-primary">{r.type?.toUpperCase()}</span>
                  {r.is_correct && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green-700)", letterSpacing: "0.04em" }}>CORRECT</span>}
                  {r.is_partial && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--amber-700,#D99423)", letterSpacing: "0.04em" }}>PARTIAL</span>}
                  {!r.is_correct && !r.is_partial && r.given_answer && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--rose-700)", letterSpacing: "0.04em" }}>WRONG</span>}
                  {!r.given_answer && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-400,#999)", letterSpacing: "0.04em" }}>SKIPPED</span>}
                </div>
                <span className="muted small">
                  Q{r.index + 1} · <strong style={{ color: "var(--ink-800)" }}>{fmt(r.score)} / {fmt(r.marks)}</strong> marks
                </span>
              </div>
              <div style={{ whiteSpace: "pre-wrap", marginBottom: 10 }}><strong>{r.prompt}</strong></div>

              {r.attachment_url && (
                <div style={{ marginBottom: 10 }}>
                  <img src={r.attachment_url} alt="Question image" style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, border: "1px solid var(--line)", objectFit: "contain" }} />
                </div>
              )}

              {r.type === "mcq" && Array.isArray(r.options) && (
                <ul style={{ listStyle: "none", padding: 0, margin: "8px 0", display: "flex", flexDirection: "column", gap: 4 }}>
                  {r.options.map((o) => {
                    const oid = o.id || o.label;
                    const isCorr = String(oid).toUpperCase() === String(r.correct_answer || "").toUpperCase();
                    const isGiven = String(oid).toUpperCase() === String(r.given_answer || "").toUpperCase();
                    return (
                      <li key={oid} style={{
                        padding: "6px 10px", borderRadius: 6,
                        background: isCorr ? "rgba(15,76,58,0.10)" : isGiven ? "rgba(178,58,58,0.10)" : "transparent",
                        border: `1px solid ${isCorr ? "var(--green-700)" : (isGiven ? "var(--rose-700)" : "var(--line)")}`,
                      }}>
                        <strong>{oid}.</strong> {o.text || o.value}
                        {isCorr && <span className="badge badge-success" style={{ marginLeft: 8 }}>correct</span>}
                        {isGiven && !isCorr && <span className="badge badge-danger" style={{ marginLeft: 8 }}>your answer</span>}
                      </li>
                    );
                  })}
                </ul>
              )}

              {r.type !== "mcq" && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span className="muted small">Your answer</span>
                    {r.ai_verdict && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                        letterSpacing: "0.04em",
                        background: r.ai_verdict === "CORRECT"
                          ? "rgba(34,197,94,0.10)" : r.ai_verdict === "PARTIAL"
                          ? "rgba(176,120,66,0.12)" : "rgba(178,58,58,0.10)",
                        color: r.ai_verdict === "CORRECT"
                          ? "var(--green-700,#16a34a)" : r.ai_verdict === "PARTIAL"
                          ? "#7a4f1a" : "var(--rose-700,#B23A3A)",
                      }}>
                        AI: {r.ai_verdict}{r.ai_score != null ? ` · ${Math.round(r.ai_score * 100)}%` : ""}
                      </span>
                    )}
                  </div>
                  {r.ai_reason && (
                    <div style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 6, fontStyle: "italic" }}>
                      {r.ai_reason}
                    </div>
                  )}
                  {/* Eval feedback — what was missing */}
                  {(() => {
                    const fb = parseFeedback(r.ai_feedback);
                    if (!fb) return null;
                    return (
                      <div style={{
                        marginTop: 4, marginBottom: 8,
                        borderRadius: 10, overflow: "hidden",
                        border: "1px solid var(--line)",
                        fontSize: 13,
                      }}>
                        {fb.right?.length > 0 && (
                          <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.05)", borderBottom: "1px solid var(--line)" }}>
                            <div style={{ fontWeight: 700, color: "var(--green-700,#16a34a)", marginBottom: 5, fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                              What You Got Right
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                              {fb.right.map((b, i) => <li key={i} style={{ color: "var(--ink-700)" }}>{b}</li>)}
                            </ul>
                          </div>
                        )}
                        {fb.missing?.length > 0 && (
                          <div style={{ padding: "10px 14px", background: "rgba(178,58,58,0.04)", borderBottom: fb.rule?.length ? "1px solid var(--line)" : "none" }}>
                            <div style={{ fontWeight: 700, color: "var(--rose-700,#B23A3A)", marginBottom: 5, fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                              What Was Missing
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                              {fb.missing.map((b, i) => <li key={i} style={{ color: "var(--ink-700)" }}>{b}</li>)}
                            </ul>
                          </div>
                        )}
                        {fb.rule?.length > 0 && (
                          <div style={{ padding: "10px 14px", background: "rgba(80,60,160,0.05)" }}>
                            <div style={{ fontWeight: 700, color: "#4a3a9a", marginBottom: 5, fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                              One-Line Rule
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {fb.rule.map((b, i) => <li key={i} style={{ color: "var(--ink-700)" }}>{b}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div style={{
                    border: "1px solid var(--line)", borderRadius: 6, padding: 10, background: "var(--ink-50, #f7f7f5)",
                    whiteSpace: "pre-wrap", marginBottom: 8, minHeight: 36,
                  }}>{r.given_answer || <em className="muted">(skipped)</em>}</div>
                  <div className="muted small" style={{ marginBottom: 4 }}>Model answer</div>
                  <div style={{
                    border: "1px solid var(--green-700)", borderRadius: 6, padding: 10,
                    background: "rgba(15,76,58,0.06)", whiteSpace: "pre-wrap",
                  }}>{r.correct_answer || <em className="muted">—</em>}</div>
                </>
              )}

              {r.explanation && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>Explanation</summary>
                  <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }} className="muted">{r.explanation}</div>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {icon}
      <div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
        <div className="muted small">{label}</div>
      </div>
    </div>
  );
}
