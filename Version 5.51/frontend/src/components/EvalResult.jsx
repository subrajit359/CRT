import { useMemo } from "react";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

function parseSections(text) {
  if (!text) return { score: null, verdict: "", sections: [] };
  const scoreMatch = text.match(/Score:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  const verdictMatch = text.match(/Verdict:\s*(.+)/i);
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;
  const verdict = verdictMatch ? verdictMatch[1].trim() : "";

  const sectionTitles = [
    "What You Got Right",
    "Critical Misses",
    "Expected Answer",
    "Immediate Actions",
    "One-Line Improvement Rule",
  ];
  const sections = [];
  for (let i = 0; i < sectionTitles.length; i++) {
    const t = sectionTitles[i];
    const next = sectionTitles.slice(i + 1);
    const startRe = new RegExp(`${t}\\s*:\\s*`, "i");
    const startMatch = text.match(startRe);
    if (!startMatch) continue;
    const startIdx = startMatch.index + startMatch[0].length;
    let endIdx = text.length;
    for (const n of next) {
      const m = text.slice(startIdx).match(new RegExp(`${n}\\s*:`, "i"));
      if (m) { endIdx = Math.min(endIdx, startIdx + m.index); break; }
    }
    const body = text.slice(startIdx, endIdx).trim();
    sections.push({ title: t, body });
  }
  return { score, verdict, sections };
}

function renderBody(body) {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const isList = lines.every((l) => /^[-*•]/.test(l));
  if (isList) {
    return (
      <ul className="eval-list">
        {lines.map((l, i) => <li key={i}>{l.replace(/^[-*•]\s*/, "")}</li>)}
      </ul>
    );
  }
  return <p className="eval-p">{body}</p>;
}

export default function EvalResult({ text, diagnosisCorrect, semanticMatch, correctDiagnosis, diagnosisExplanation, verifyCount = 0 }) {
  const { score, verdict, sections } = useMemo(() => parseSections(text), [text]);
  const scoreClass = score == null ? "score-na" : score >= 8 ? "score-high" : score >= 5 ? "score-mid" : "score-low";

  const isPartial = diagnosisCorrect === false && semanticMatch?.verdict === "PARTIAL";
  const showDxVerdict = diagnosisCorrect === true || diagnosisCorrect === false;

  const dxStyle = diagnosisCorrect
    ? { bg: "rgba(34,160,90,0.12)", border: "rgba(34,160,90,0.55)", color: "var(--emerald-700)" }
    : isPartial
    ? { bg: "rgba(200,140,20,0.10)", border: "rgba(200,140,20,0.55)", color: "#a06a00" }
    : { bg: "rgba(220,60,60,0.10)", border: "rgba(220,60,60,0.55)", color: "var(--red-700, #b91c1c)" };

  const dxIcon = diagnosisCorrect
    ? <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" />
    : isPartial
    ? <AlertCircle size={18} strokeWidth={2} aria-hidden="true" />
    : <XCircle size={18} strokeWidth={2} aria-hidden="true" />;

  const dxLabel = diagnosisCorrect
    ? "Correct diagnosis"
    : isPartial
    ? "Partially correct"
    : "Incorrect diagnosis";

  return (
    <div className="eval fade-in">
      {showDxVerdict && (
        <div
          className="eval-dx-verdict"
          style={{
            padding: "14px 16px",
            borderRadius: 10,
            marginBottom: 14,
            background: dxStyle.bg,
            border: `1px solid ${dxStyle.border}`,
          }}
        >
          <div className="row" style={{ fontWeight: 700, fontSize: 16, gap: 6, alignItems: "center", color: dxStyle.color }}>
            {dxIcon}
            {dxLabel}
          </div>

          {isPartial && semanticMatch?.reason && (
            <div className="muted small" style={{ marginTop: 6, color: "#7a5000" }}>
              {semanticMatch.reason}
            </div>
          )}

          {correctDiagnosis && (
            <div style={{ marginTop: 6 }}>
              <span className="muted small">Expected diagnosis: </span>
              <strong>{correctDiagnosis}</strong>
            </div>
          )}
          {diagnosisExplanation && (
            <div className="muted small" style={{ marginTop: 6, lineHeight: 1.45 }}>
              {diagnosisExplanation}
            </div>
          )}
          <div className="muted small" style={{ marginTop: 8, fontStyle: "italic" }}>
            {verifyCount > 0 ? (
              <>This verdict is a direct match against the doctor-verified diagnosis — not an AI judgment.</>
            ) : (
              <>This verdict is matched against the case's reference diagnosis (set by the uploader). This case is <strong>not yet doctor-verified</strong>.</>
            )}
          </div>
        </div>
      )}

      {(text || verdict) && (
        <>
          <div className="eval-header">
            <div className={`eval-score ${scoreClass}`}>
              {score == null ? "—" : `${score}`}<span className="eval-score-of">/10</span>
            </div>
            <div className="eval-verdict">
              <div className="eval-label">Reasoning quality (AI feedback)</div>
              <div className="eval-verdict-text">{verdict || "—"}</div>
            </div>
          </div>
          <div className="eval-sections">
            {sections.map((s) => (
              <div key={s.title} className="eval-section">
                <div className="eval-section-title">{s.title}</div>
                {renderBody(s.body)}
              </div>
            ))}
          </div>
          {!sections.length && text && (
            <pre className="eval-raw">{text}</pre>
          )}
        </>
      )}
    </div>
  );
}
