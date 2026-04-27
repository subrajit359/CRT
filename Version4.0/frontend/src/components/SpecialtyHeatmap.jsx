export default function SpecialtyHeatmap({ data = [], specialties = [] }) {
  // data: [{ specialty, attempts, avg_score, mastery (0..1) }]
  const map = new Map(data.map((d) => [d.specialty, d]));
  const list = specialties.length
    ? specialties.map((s) => map.get(s) || { specialty: s, attempts: 0, avg_score: null, mastery: null })
    : data;

  const cellColor = (m, attempts) => {
    if (attempts === 0 || m == null) return "var(--ink-100)";
    if (m >= 0.85) return "var(--green-700)";
    if (m >= 0.7) return "var(--green-100)";
    if (m >= 0.55) return "var(--amber-100)";
    return "var(--rose-100)";
  };
  const textColor = (m, attempts) => {
    if (attempts === 0 || m == null) return "var(--text-muted)";
    if (m >= 0.85) return "white";
    if (m >= 0.7) return "var(--green-700)";
    if (m >= 0.55) return "var(--amber-700)";
    return "var(--rose-700)";
  };

  return (
    <div className="heatmap">
      {list.map((s) => {
        const attempts = s.attempts || 0;
        const score = s.avg_score != null ? s.avg_score.toFixed(1) : "—";
        return (
          <div
            key={s.specialty}
            className="heatmap-cell"
            style={{ background: cellColor(s.mastery, attempts), color: textColor(s.mastery, attempts) }}
            title={`${s.specialty} · ${attempts} attempts · avg ${score}/10`}
          >
            <div className="heatmap-spec">{s.specialty}</div>
            <div className="heatmap-val">{attempts === 0 ? "—" : score}</div>
          </div>
        );
      })}
    </div>
  );
}
