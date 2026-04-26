import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

export default function PracticeStart() {
  const [, navigate] = useLocation();
  const [specialties, setSpecialties] = useState([]);
  const [specialty, setSpecialty] = useState("");
  const [level, setLevel] = useState("");
  const [busy, setBusy] = useState(false);
  const [groupsData, setGroupsData] = useState(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.get("/api/cases/specialties").then((r) => setSpecialties(r.specialties));
  }, []);

  // When a specialty is picked, load the group breakdown for this student.
  // If "Any level" is left selected, groups span all levels for that specialty.
  useEffect(() => {
    if (!specialty) { setGroupsData(null); return; }
    let cancelled = false;
    setLoadingGroups(true);
    setGroupsData(null);
    const params = new URLSearchParams({ specialty });
    if (level) params.set("level", level);
    api.get(`/api/cases/groups?${params.toString()}`)
      .then((r) => { if (!cancelled) setGroupsData(r); })
      .catch((e) => { if (!cancelled) toast.error(e.message || "Failed to load groups"); })
      .finally(() => { if (!cancelled) setLoadingGroups(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialty, level]);

  async function startRandom() {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (specialty) params.set("specialty", specialty);
      if (level) params.set("level", level);
      const r = await api.get(`/api/cases/random?${params.toString()}`);
      navigate(`/case/${r.id}`);
    } catch (e) {
      toast.error(e.message || "No cases available with those filters");
    } finally { setBusy(false); }
  }

  function openGroup(group) {
    // Send the student to the first un-attempted case in the group;
    // if everything in the group is already attempted, start at the first case (practice mode).
    const firstUnattempted = group.cases.find((c) => !c.attempted);
    const target = firstUnattempted || group.cases[0];
    if (!target) return;
    const qs = new URLSearchParams({ specialty, group: String(group.index) });
    if (level) qs.set("level", String(level));
    navigate(`/case/${target.id}?${qs.toString()}`);
  }

  const totalAttempted = useMemo(() => {
    if (!groupsData) return 0;
    return groupsData.groups.reduce((s, g) => s + g.attemptedCount, 0);
  }, [groupsData]);

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 920 }}>
        <h2>Start a case</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Pick a specialty and level to see your groups, or jump into a random case.
        </p>
        <div className="spacer-7" />

        <div className="card">
          <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 240 }}>
              <label className="label">Specialty</label>
              <select className="select" value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                <option value="">Any specialty</option>
                {specialties.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Difficulty</label>
              <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Any level</option>
                {[1,2,3,4,5,6,7].map((l) => <option key={l} value={l}>Level {l}</option>)}
              </select>
            </div>
          </div>
          <div className="spacer-7" />
          <button className="btn btn-ghost btn-block" disabled={busy} onClick={startRandom}>
            {busy ? <span className="spinner" /> : "🎲 Pick a random case for me"}
          </button>
          <div className="muted small" style={{ marginTop: 8, textAlign: "center" }}>
            Tip: choose a specialty to unlock group practice below. Leave Difficulty as <em>Any level</em> to mix all levels.
          </div>
        </div>

        {specialty && (
          <>
            <div className="spacer-7" />
            <GroupsPanel
              loading={loadingGroups}
              data={groupsData}
              specialty={specialty}
              level={level}
              totalAttempted={totalAttempted}
              onOpen={openGroup}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

function GroupsPanel({ loading, data, specialty, level, totalAttempted, onOpen }) {
  if (loading) {
    return (
      <div className="card">
        <div className="row" style={{ alignItems: "center", gap: 10 }}>
          <span className="spinner" /> <span className="muted">Loading groups…</span>
        </div>
      </div>
    );
  }
  if (!data) return null;
  const levelLabel = level ? `Level ${level}` : "All levels";
  if (!data.groups.length) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>No cases yet</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          There are no cases in <strong>{specialty}</strong> · {levelLabel} yet. Try a different combination, or use the random pick above.
        </p>
      </div>
    );
  }

  const overallPct = data.totalCases ? Math.round((totalAttempted / data.totalCases) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="card" style={{ background: "linear-gradient(135deg, rgba(200,169,106,0.10), rgba(200,169,106,0.02))" }}>
        <div className="row-between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>{specialty} · {levelLabel}</h3>
            <div className="muted small" style={{ marginTop: 4 }}>
              {data.totalCases} case{data.totalCases === 1 ? "" : "s"} in {data.groups.length} group{data.groups.length === 1 ? "" : "s"} of {data.groupSize}
              {data.suggestedGroup && ` · Continue with Group ${data.suggestedGroup}`}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{overallPct}%</div>
            <div className="muted small">{totalAttempted} / {data.totalCases} attempted</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <ProgressBar pct={overallPct} />
        </div>
      </div>

      <div className="spacer-7" />

      <div className="group-grid">
        {data.groups.map((g) => (
          <GroupCard
            key={g.index}
            group={g}
            isSuggested={g.index === data.suggestedGroup}
            onOpen={() => onOpen(g)}
          />
        ))}
      </div>

      <style>{`
        .group-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 14px;
        }
        .group-card {
          position: relative;
          padding: 16px;
          border-radius: 14px;
          border: 1px solid var(--line, #e5e3da);
          background: var(--bg-1, #fff);
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: hidden;
        }
        .group-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(20,20,30,0.08);
          border-color: var(--accent, #c8a96a);
        }
        .group-card.completed {
          background: linear-gradient(160deg, rgba(76,175,80,0.10), rgba(76,175,80,0.02));
          border-color: rgba(76,175,80,0.45);
        }
        .group-card.in-progress {
          background: linear-gradient(160deg, rgba(200,169,106,0.12), rgba(200,169,106,0.02));
          border-color: var(--accent, #c8a96a);
        }
        .group-card.suggested::after {
          content: "▶ continue";
          position: absolute;
          top: 10px;
          right: 10px;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 999px;
          background: var(--accent, #c8a96a);
          color: #1a1a1a;
        }
        .group-num {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted, #666);
        }
        .group-title {
          font-size: 18px;
          font-weight: 700;
          margin: 0;
        }
        .group-dots {
          display: flex;
          gap: 6px;
          margin-top: 2px;
        }
        .group-dot {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(0,0,0,0.08);
          transition: background 200ms ease;
        }
        .group-dot.done { background: #4caf50; }
        .group-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
        }
        .group-status {
          font-weight: 600;
        }
        .group-status.completed { color: #2e7d32; }
        .group-status.in-progress { color: #b8860b; }
        .group-status.fresh { color: var(--muted, #666); }
        .pbar {
          width: 100%;
          height: 8px;
          border-radius: 999px;
          background: rgba(0,0,0,0.08);
          overflow: hidden;
        }
        .pbar > span {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, var(--accent, #c8a96a), #d4b97a);
          transition: width 400ms ease;
        }
      `}</style>
    </motion.div>
  );
}

function GroupCard({ group, isSuggested, onOpen }) {
  const isCompleted = group.completed;
  const isInProgress = !isCompleted && group.attemptedCount > 0;
  const statusClass = isCompleted ? "completed" : isInProgress ? "in-progress" : "fresh";
  const statusLabel = isCompleted ? "✓ Completed" : isInProgress ? "In progress" : "Not started";
  const cardClass = ["group-card", statusClass, isSuggested ? "suggested" : ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={cardClass} onClick={onOpen}>
      <div className="group-num">Group {group.index}</div>
      <div className="group-title">
        {group.attemptedCount} / {group.total}
      </div>
      <div className="group-dots" aria-hidden="true">
        {group.cases.map((c, i) => (
          <div key={c.id} className={`group-dot ${c.attempted ? "done" : ""}`} title={`Case ${i + 1}: ${c.attempted ? "attempted" : "not attempted"}`} />
        ))}
      </div>
      <div className="group-meta">
        <span className={`group-status ${statusClass}`}>{statusLabel}</span>
        <span className="muted small">
          {isCompleted ? "Practice again →" : isInProgress ? "Continue →" : "Start →"}
        </span>
      </div>
    </button>
  );
}

function ProgressBar({ pct }) {
  return (
    <div className="pbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
