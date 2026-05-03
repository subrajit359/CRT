import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Cpu, CheckCircle2, XCircle, Loader2, RefreshCw,
  Zap, ChevronDown, ChevronUp,
} from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

// ── AI metadata displayed in the cards ───────────────────────────────────────
const AI_META = {
  assistant: {
    color: "#6366f1",
    bg: "#eef2ff",
    tagline: "Dr. Rio chat · AI Insights coaching",
  },
  eval: {
    color: "#0891b2",
    bg: "#ecfeff",
    tagline: "Case scoring · Feedback generation",
  },
  match: {
    color: "#7c3aed",
    bg: "#f5f3ff",
    tagline: "Response matching · Mock test evaluation",
  },
  case: {
    color: "#059669",
    bg: "#ecfdf5",
    tagline: "Case generation · Mock questions",
  },
  coach: {
    color: "#d97706",
    bg: "#fffbeb",
    tagline: "Weekly digest tips · Insights coaching",
  },
  task: {
    color: "#dc2626",
    bg: "#fef2f2",
    tagline: "Morning · Night · Festival · Learning nudge notifications",
  },
};

// ── Small helpers ─────────────────────────────────────────────────────────────
function StatusPill({ ok, label }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600,
      background: ok ? "#dcfce7" : "#fee2e2",
      color: ok ? "#15803d" : "#dc2626",
    }}>
      {ok
        ? <CheckCircle2 size={13} strokeWidth={2} />
        : <XCircle      size={13} strokeWidth={2} />
      }
      {label}
    </span>
  );
}

function ConfigDot({ configured }) {
  return (
    <span title={configured ? "Env vars set" : "Env vars missing"} style={{
      display: "inline-block", width: 9, height: 9, borderRadius: "50%",
      background: configured ? "#22c55e" : "#f59e0b",
      boxShadow: configured ? "0 0 0 2px #bbf7d0" : "0 0 0 2px #fde68a",
      flexShrink: 0,
    }} />
  );
}

// ── Per-AI card ───────────────────────────────────────────────────────────────
function AICard({ ai, onToggle }) {
  const toast = useToast();
  const [testing, setTesting]     = useState(false);
  const [result,  setResult]      = useState(null); // { ok, latencyMs, model, error, reply }
  const [toggling, setToggling]   = useState(false);
  const [showEnv, setShowEnv]     = useState(false);

  const meta = AI_META[ai.id] || { color: "#374151", bg: "#f9fafb", tagline: "" };

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const r = await api.post("/api/admin/ai-room/test", { aiId: ai.id });
      setResult(r);
      if (r.ok) toast.success(`${ai.name} connected — ${r.latencyMs}ms`);
      else toast.error(`${ai.name} failed: ${r.error}`);
    } catch (e) {
      const err = { ok: false, error: e.message || "Request failed", latencyMs: null };
      setResult(err);
      toast.error(`${ai.name}: ${err.error}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      const r = await api.post("/api/admin/ai-room/toggle", { aiId: ai.id, enabled: !ai.enabled });
      onToggle(ai.id, r.enabled);
      toast.success(`${ai.name} turned ${r.enabled ? "ON" : "OFF"}`);
    } catch (e) {
      toast.error(e.message || "Toggle failed");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="card" style={{ borderTop: `3px solid ${meta.color}`, padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 18px 12px", background: meta.bg }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: meta.color + "22", display: "grid", placeItems: "center",
            fontSize: 20, flexShrink: 0,
          }}>
            {ai.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15, color: meta.color }}>{ai.name}</strong>
              <ConfigDot configured={ai.configured} />
              {!ai.configured && (
                <span style={{ fontSize: 11, color: "#b45309", fontWeight: 600 }}>env vars missing</span>
              )}
            </div>
            <div className="muted small" style={{ marginTop: 2 }}>{meta.tagline}</div>
          </div>
          {/* ON/OFF toggle */}
          <button
            onClick={handleToggle}
            disabled={toggling}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 13px", borderRadius: 99, border: "none",
              cursor: toggling ? "not-allowed" : "pointer",
              fontWeight: 700, fontSize: 12,
              background: ai.enabled ? meta.color : "#9ca3af",
              color: "#fff", flexShrink: 0, transition: "background 0.2s",
            }}
          >
            {toggling ? <Loader2 size={12} className="spin" /> : null}
            {ai.enabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "12px 18px 16px" }}>
        <p className="muted small" style={{ margin: "0 0 12px" }}>{ai.description}</p>

        {/* Used in */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {ai.usedIn.map((f) => (
            <span key={f} style={{
              padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600,
              background: meta.color + "18", color: meta.color,
            }}>
              {f}
            </span>
          ))}
        </div>

        {/* Env vars toggle */}
        <button
          onClick={() => setShowEnv((v) => !v)}
          style={{
            all: "unset", cursor: "pointer", fontSize: 11, color: "#6b7280",
            display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 10,
          }}
        >
          {showEnv ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Env vars ({ai.envVars.length})
        </button>
        {showEnv && (
          <div style={{
            background: "#f8fafc", borderRadius: 6, padding: "8px 12px",
            marginBottom: 12, fontFamily: "monospace", fontSize: 12, lineHeight: 1.8,
          }}>
            {ai.envVars.map((v) => (
              <div key={v} style={{ color: "#374151" }}>
                <span style={{ color: "#6366f1" }}>{v}</span>
              </div>
            ))}
            {ai.model && (
              <div style={{ color: "#6b7280", marginTop: 4 }}>
                model: <span style={{ color: "#059669" }}>{ai.model}</span>
              </div>
            )}
          </div>
        )}

        {/* Test result */}
        {result && (
          <div style={{
            background: result.ok ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${result.ok ? "#bbf7d0" : "#fecaca"}`,
            borderRadius: 8, padding: "10px 14px", marginBottom: 12,
            fontSize: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: result.ok ? 4 : 0 }}>
              <StatusPill ok={result.ok} label={result.ok ? "Connected" : "Failed"} />
              {result.latencyMs != null && (
                <span className="muted" style={{ fontSize: 11 }}>{result.latencyMs} ms</span>
              )}
            </div>
            {result.ok && result.model && (
              <div className="muted" style={{ fontSize: 11 }}>
                Model: <strong>{result.model}</strong>
                {result.reply && <> · Reply: <em>"{result.reply}"</em></>}
              </div>
            )}
            {!result.ok && (
              <div style={{ color: "#dc2626", marginTop: 4, wordBreak: "break-all" }}>{result.error}</div>
            )}
          </div>
        )}

        {/* Test button */}
        <button
          onClick={handleTest}
          disabled={testing || !ai.configured}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: ai.configured ? meta.color : "#e5e7eb",
            color: ai.configured ? "#fff" : "#9ca3af",
            fontWeight: 600, fontSize: 13, cursor: testing || !ai.configured ? "not-allowed" : "pointer",
            width: "100%", justifyContent: "center",
          }}
          title={!ai.configured ? "Configure env vars first" : ""}
        >
          {testing
            ? <><Loader2 size={14} className="spin" /> Testing…</>
            : <><Zap size={14} /> Test connection</>
          }
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminAIRoom() {
  const toast = useToast();
  const [ais, setAis]         = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/api/admin/ai-room")
      .then((r) => { setAis(r.ais || []); setLoading(false); })
      .catch((e) => { toast.error(e.message || "Failed to load AI Room"); setLoading(false); });
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function handleToggle(aiId, enabled) {
    setAis((prev) => prev.map((a) => a.id === aiId ? { ...a, enabled } : a));
  }

  const configuredCount = ais.filter((a) => a.configured).length;
  const enabledCount    = ais.filter((a) => a.enabled).length;

  return (
    <AppShell>
      <div className="container fade-in">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/admin" className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ArrowLeft size={15} strokeWidth={1.75} /> Admin
            </Link>
            <div>
              <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 9 }}>
                <Cpu size={22} strokeWidth={1.75} />
                AI Room
              </h2>
              <p className="muted" style={{ marginTop: 3 }}>
                Every AI powering CrLearn — monitor, test, and toggle each one.
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={load}
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <RefreshCw size={14} strokeWidth={1.75} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Summary strip */}
        {!loading && ais.length > 0 && (
          <>
            <div className="spacer-7" />
            <div style={{
              display: "flex", gap: 12, flexWrap: "wrap",
              padding: "12px 16px", borderRadius: 10,
              background: "#f8fafc", border: "1px solid #e2e8f0",
            }}>
              <div>
                <div className="muted small">Total AIs</div>
                <div style={{ fontWeight: 700, fontSize: 20 }}>{ais.length}</div>
              </div>
              <div style={{ width: 1, background: "#e2e8f0", margin: "2px 4px" }} />
              <div>
                <div className="muted small">Configured</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: configuredCount === ais.length ? "#059669" : "#d97706" }}>
                  {configuredCount}/{ais.length}
                </div>
              </div>
              <div style={{ width: 1, background: "#e2e8f0", margin: "2px 4px" }} />
              <div>
                <div className="muted small">Enabled</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: enabledCount === ais.length ? "#059669" : "#6b7280" }}>
                  {enabledCount}/{ais.length}
                </div>
              </div>
              {configuredCount < ais.length && (
                <>
                  <div style={{ width: 1, background: "#e2e8f0", margin: "2px 4px" }} />
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{
                      padding: "4px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600,
                      background: "#fef9c3", color: "#92400e",
                    }}>
                      ⚠ {ais.length - configuredCount} AI{ais.length - configuredCount > 1 ? "s" : ""} missing env vars
                    </span>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Grid */}
        <div className="spacer-7" />
        {loading ? (
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} className="card" style={{ height: 220, background: "#f1f5f9", border: "none" }} />
            ))}
          </div>
        ) : ais.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <Cpu size={32} strokeWidth={1.5} style={{ opacity: 0.3, margin: "0 auto 12px" }} />
            <p className="muted">No AI configurations found.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {ais.map((ai) => (
              <AICard key={ai.id} ai={ai} onToggle={handleToggle} />
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="spacer-7" />
        <div className="card" style={{ background: "#fafafa", padding: "12px 18px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 12, color: "#6b7280" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#22c55e", display: "inline-block", boxShadow: "0 0 0 2px #bbf7d0" }} />
              Env vars set
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#f59e0b", display: "inline-block", boxShadow: "0 0 0 2px #fde68a" }} />
              Env vars missing
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ padding: "1px 8px", borderRadius: 99, background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 11 }}>ON</span>
              AI is active and will be called normally
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ padding: "1px 8px", borderRadius: 99, background: "#9ca3af", color: "#fff", fontWeight: 700, fontSize: 11 }}>OFF</span>
              AI is disabled (marked off in DB)
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
