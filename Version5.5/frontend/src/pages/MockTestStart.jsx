import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Brain, History, Settings as Cog, Loader2, ChevronDown } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../lib/auth.jsx";

const MARK_PRESETS = [20, 50, 100];
const TYPE_LABELS = { mcq: "MCQ", saq: "Short Answer", laq: "Long Answer" };

/* A select that also allows typing a custom value */
function SelectOrCustom({ value, onChange, options, placeholder, id, loading }) {
  const isCustom = value && !options.includes(value);
  const [mode, setMode] = useState(isCustom ? "custom" : "select");

  function handleSelect(e) {
    const v = e.target.value;
    if (v === "__custom__") { setMode("custom"); onChange(""); }
    else { setMode("select"); onChange(v); }
  }

  if (mode === "custom") {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input
          id={id}
          className="input"
          style={{ flex: 1 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type custom value…"
          autoFocus
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => { setMode("select"); onChange(""); }}
          style={{ whiteSpace: "nowrap", flexShrink: 0 }}
        >
          Pick from list
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <select
        id={id}
        className="input"
        value={value}
        onChange={handleSelect}
        disabled={loading}
        style={{ paddingRight: 32, appearance: "none", width: "100%", cursor: "pointer" }}
      >
        <option value="">{loading ? "Loading…" : placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__custom__">+ Type custom…</option>
      </select>
      <ChevronDown
        size={16}
        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ink-400)" }}
      />
    </div>
  );
}

export default function MockTestStart() {
  const [, navigate] = useLocation();
  const toast = useToast();
  const { user } = useAuth();
  const [specialties, setSpecialties] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [busy, setBusy] = useState(false);

  const [specialty, setSpecialty] = useState("");
  const [topic, setTopic] = useState("");
  const [types, setTypes] = useState({ mcq: true, saq: false, laq: false });
  const [totalMarks, setTotalMarks] = useState(20);
  const [negative, setNegative] = useState(true);

  useEffect(() => {
    api.get("/api/mock/specialties")
      .then((r) => setSpecialties(Array.isArray(r.specialties) ? r.specialties : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setTopic("");
    if (!specialty) { setTopics([]); return; }
    setLoadingTopics(true);
    api.get(`/api/mock/topics?specialty=${encodeURIComponent(specialty)}`)
      .then((r) => setTopics(Array.isArray(r.topics) ? r.topics : []))
      .catch(() => setTopics([]))
      .finally(() => setLoadingTopics(false));
  }, [specialty]);

  async function start() {
    const selectedTypes = Object.entries(types).filter(([, v]) => v).map(([k]) => k);
    if (selectedTypes.length === 0) { toast.error("Pick at least one question type"); return; }
    setBusy(true);
    try {
      const r = await api.post("/api/mock/tests", {
        specialty: specialty.trim() || undefined,
        topic: topic.trim() || undefined,
        types: selectedTypes,
        totalMarks,
        negativeMarking: negative,
      });
      navigate(`/mock/play/${r.id}`);
    } catch (e) {
      toast.error(e.message || "Could not start test");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 620 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, var(--emerald-600), var(--emerald-800))", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Brain size={20} color="#fff" />
            </div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Mock Test</h2>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Configure your exam. Questions come from the bank first; AI fills any gaps.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <Link href="/mock/history" className="btn btn-ghost btn-sm">
              <History size={14} style={{ marginRight: 5 }} />History
            </Link>
            {(user?.role === "admin" || user?.role === "doctor") && (
              <Link href="/admin/mock-questions" className="btn btn-ghost btn-sm">
                <Cog size={14} style={{ marginRight: 5 }} />Question bank
              </Link>
            )}
          </div>
        </div>

        {/* Setup card */}
        <div style={{ background: "var(--bg-elev)", borderRadius: 18, border: "1px solid var(--line)", boxShadow: "0 4px 20px rgba(15,76,58,0.07)", padding: "24px 22px", display: "flex", flexDirection: "column", gap: 22 }}>

          {/* Specialty */}
          <div>
            <label htmlFor="mt-spec" style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "var(--ink-700)" }}>
              Specialty <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>(optional)</span>
            </label>
            <SelectOrCustom
              id="mt-spec"
              value={specialty}
              onChange={setSpecialty}
              options={specialties}
              placeholder="Any specialty"
            />
          </div>

          {/* Topic */}
          <div>
            <label htmlFor="mt-topic" style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "var(--ink-700)" }}>
              Topic <span style={{ fontWeight: 400, color: "var(--ink-400)" }}>(optional)</span>
            </label>
            <SelectOrCustom
              id="mt-topic"
              value={topic}
              onChange={setTopic}
              options={topics}
              placeholder="Any topic"
              loading={loadingTopics}
            />
            {specialty && !loadingTopics && topics.length > 0 && (
              <div style={{ marginTop: 5, fontSize: 12, color: "var(--ink-400)" }}>
                {topics.length} topic{topics.length === 1 ? "" : "s"} available for {specialty}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--line)" }} />

          {/* Question types */}
          <div>
            <label style={{ display: "block", marginBottom: 10, fontSize: 13, fontWeight: 600, color: "var(--ink-700)" }}>
              Question types
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {Object.entries(TYPE_LABELS).map(([k, label]) => {
                const on = types[k];
                return (
                  <label key={k} style={{
                    display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                    padding: "9px 16px", borderRadius: 10,
                    border: `1.5px solid ${on ? "var(--primary)" : "var(--line)"}`,
                    background: on ? "rgba(15,76,58,0.07)" : "var(--bg-muted)",
                    transition: "all 140ms", userSelect: "none",
                    fontWeight: 600, fontSize: 13,
                  }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setTypes((prev) => ({ ...prev, [k]: e.target.checked }))}
                      style={{ accentColor: "var(--primary)", width: 16, height: 16 }}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Total marks */}
          <div>
            <label style={{ display: "block", marginBottom: 10, fontSize: 13, fontWeight: 600, color: "var(--ink-700)" }}>
              Total marks
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {MARK_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTotalMarks(m)}
                  style={{
                    padding: "9px 20px", borderRadius: 10, border: "1.5px solid",
                    borderColor: totalMarks === m ? "var(--primary)" : "var(--line)",
                    background: totalMarks === m ? "var(--primary)" : "var(--bg-muted)",
                    color: totalMarks === m ? "#fff" : "var(--ink-700)",
                    fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                    transition: "all 140ms",
                  }}
                >{m}</button>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  className="input"
                  style={{ width: 90 }}
                  min={5}
                  max={500}
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(Math.max(5, Math.min(500, Number(e.target.value) || 20)))}
                />
                <span style={{ fontSize: 12, color: "var(--ink-400)" }}>custom</span>
              </div>
            </div>
          </div>

          {/* Negative marking */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
            padding: "12px 14px", borderRadius: 10,
            border: `1.5px solid ${negative ? "var(--primary)" : "var(--line)"}`,
            background: negative ? "rgba(15,76,58,0.05)" : "var(--bg-muted)",
            transition: "all 140ms",
          }}>
            <input
              type="checkbox"
              checked={negative}
              onChange={(e) => setNegative(e.target.checked)}
              style={{ accentColor: "var(--primary)", width: 18, height: 18, marginTop: 1, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>NEET-style negative marking</div>
              <div style={{ fontSize: 12, color: "var(--ink-400)", marginTop: 2 }}>−0.25 × marks deducted per wrong MCQ answer</div>
            </div>
          </label>

          {/* Start button */}
          <button
            className="btn btn-primary"
            style={{ width: "100%", padding: "14px 20px", fontSize: 16, borderRadius: 12 }}
            disabled={busy}
            onClick={start}
          >
            {busy
              ? <><Loader2 size={16} className="spinner" style={{ marginRight: 8 }} />Preparing test…</>
              : "Start test →"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
