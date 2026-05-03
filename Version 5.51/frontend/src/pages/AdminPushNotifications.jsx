import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { Bell, Send, Users, ArrowLeft, Sun, Moon, Star, Zap, RefreshCw, Calendar, BotMessageSquare } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";

const HOUR_LABEL = { 10: "10:00 AM", 13: "1:00 PM", 16: "4:00 PM", 20: "8:00 PM" };

function ScheduleDay({ slot }) {
  const d = new Date(slot.date + "T00:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const istNow = new Date(Date.now() + 330 * 60 * 1000);
  const todayStr = istNow.toISOString().slice(0, 10);
  const isToday = slot.date === todayStr;
  const isPast  = slot.date < todayStr;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px", borderRadius: 10,
      background: isToday ? "rgba(5,150,105,0.08)" : isPast ? "var(--bg-soft,#f1f5f9)" : "var(--bg-card,#fff)",
      border: `1px solid ${isToday ? "rgba(5,150,105,0.25)" : "var(--border,#e5e7eb)"}`,
      opacity: isPast ? 0.55 : 1,
    }}>
      <div style={{ minWidth: 36, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>{days[d.getDay()]}</div>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{d.getDate()}</div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{months[d.getMonth()]}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{HOUR_LABEL[slot.hour] || `${slot.hour}:00`}</div>
        <div className="muted small">Learning nudge{isToday ? " · today" : ""}</div>
      </div>
      {isToday && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", background: "rgba(5,150,105,0.1)", padding: "2px 8px", borderRadius: 99 }}>TODAY</span>}
    </div>
  );
}

export default function AdminPushNotifications() {
  const toast = useToast();

  const [stats, setStats]           = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [title, setTitle]           = useState("");
  const [body, setBody]             = useState("");
  const [link, setLink]             = useState("/");
  const [role, setRole]             = useState("all");
  const [sending, setSending]       = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const [schedule, setSchedule]         = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [firing, setFiring]             = useState(null);
  const [lastTestResult, setLastTestResult] = useState(null);
  const [festivalName, setFestivalName] = useState("");
  const [taskAIResult, setTaskAIResult] = useState(null);
  const [taskAILoading, setTaskAILoading] = useState(false);
  const [schedulerEnabled, setSchedulerEnabled] = useState(null);
  const [schedulerToggling, setSchedulerToggling] = useState(false);

  const loadStats = useCallback(() => {
    setStatsLoading(true);
    api.get("/api/admin/push/stats")
      .then((r) => { setStats(r); setStatsLoading(false); })
      .catch(() => { setStats(null); setStatsLoading(false); });
  }, []);

  const loadSchedule = useCallback(() => {
    setScheduleLoading(true);
    api.get("/api/admin/push/nudge-schedule")
      .then((r) => { setSchedule(r); setScheduleLoading(false); })
      .catch(() => { setSchedule(null); setScheduleLoading(false); });
  }, []);

  const loadSchedulerStatus = useCallback(() => {
    api.get("/api/admin/push/scheduler-status")
      .then((r) => setSchedulerEnabled(r.enabled))
      .catch(() => setSchedulerEnabled(null));
  }, []);

  useEffect(() => { loadStats(); loadSchedule(); loadSchedulerStatus(); }, [loadStats, loadSchedule, loadSchedulerStatus]);

  async function handleToggleScheduler() {
    if (schedulerEnabled === null) return;
    setSchedulerToggling(true);
    try {
      const r = await api.post("/api/admin/push/scheduler-toggle", { enabled: !schedulerEnabled });
      setSchedulerEnabled(r.enabled);
      toast.success(r.enabled ? "Scheduler turned ON" : "Scheduler turned OFF");
    } catch (err) {
      toast.error(err.message || "Toggle failed");
    } finally {
      setSchedulerToggling(false);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!body.trim())  { toast.error("Message is required"); return; }
    setSending(true);
    setLastResult(null);
    try {
      const r = await api.post("/api/admin/push/broadcast", {
        title: title.trim(), body: body.trim(), link: link.trim() || "/", role,
      });
      setLastResult(r);
      if (r.sent > 0) {
        toast.success(`Sent to ${r.sent} of ${r.total} device${r.total !== 1 ? "s" : ""}`);
        setTitle(""); setBody(""); setLink("/"); setRole("all");
      } else {
        toast.error(r.error || `No devices received it (${r.total} subscribed)`);
      }
    } catch (err) {
      toast.error(err.message || "Failed to send");
    } finally {
      setSending(false);
      loadStats();
    }
  }

  async function fireTest(type, extraBody = {}) {
    setFiring(type);
    setLastTestResult(null);
    try {
      const r = await api.post(`/api/admin/push/test-${type}`, extraBody);
      setLastTestResult({ type, ...r });
      if (r.ok === false) {
        toast.error(r.error || "Failed");
      } else if (r.skipped) {
        toast.info?.("Already sent today (use force next time)") || toast.error("Already sent today");
      } else if (r.sent > 0) {
        toast.success(`${type} notification sent to ${r.sent} device${r.sent !== 1 ? "s" : ""}`);
      } else if (type === "festival" && !r.festival) {
        toast.error("No festival detected today — try entering a name manually");
      } else {
        toast.error(`Sent but 0 devices received it`);
      }
    } catch (err) {
      toast.error(err.message || "Request failed");
    } finally {
      setFiring(null);
    }
  }

  async function handleTestTaskAI() {
    setTaskAILoading(true);
    setTaskAIResult(null);
    try {
      const r = await api.post("/api/admin/push/test-task-ai", {});
      setTaskAIResult(r);
      if (r.ok) toast.success(`Task AI responded in ${r.latencyMs}ms`);
      else toast.error(r.error || "Task AI failed");
    } catch (err) {
      setTaskAIResult({ ok: false, error: err.message });
      toast.error(err.message || "Request failed");
    } finally {
      setTaskAILoading(false);
    }
  }

  async function handleRegenerate() {
    setFiring("regen");
    try {
      const r = await api.post("/api/admin/push/regenerate-schedule", {});
      toast.success("New schedule generated");
      setSchedule(r);
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setFiring(null);
    }
  }

  const targetCount = stats
    ? role === "all" ? stats.total : (stats.byRole?.find((r) => r.role === role)?.subs ?? 0)
    : null;

  const btnStyle = (color) => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "9px 16px", borderRadius: 9, border: "none", cursor: "pointer",
    fontWeight: 600, fontSize: 13.5, color: "#fff", background: color,
    opacity: firing ? 0.7 : 1, transition: "opacity 0.15s",
  });

  return (
    <AppShell>
      <div className="container fade-in" style={{ maxWidth: 700 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Link href="/admin" className="btn btn-ghost btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" /> Admin
          </Link>
        </div>

        <h2 style={{ margin: 0 }}>Push Notifications</h2>
        <p className="muted" style={{ marginTop: 4 }}>Broadcast messages and manage the automated notification scheduler.</p>

        <div className="spacer-7" />

        {/* Subscriber stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 24 }}>
          {["all", "student", "doctor", "admin"].map((key) => {
            const count = statsLoading ? null
              : key === "all" ? (stats?.total ?? 0)
              : (stats?.byRole?.find((r) => r.role === key)?.subs ?? 0);
            return (
              <div key={key} className="card" style={{ textAlign: "center", padding: "16px 12px" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: key === "all" ? "var(--primary)" : undefined }}>
                  {count === null ? "…" : count}
                </div>
                <div className="muted small" style={{ marginTop: 4, textTransform: "capitalize" }}>
                  {key === "all" ? "Total devices" : `${key}s`}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Scheduler Test Panel ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={17} strokeWidth={1.75} aria-hidden="true" />
              Automated Scheduler — Test Panel
            </h3>
            <button
              onClick={handleToggleScheduler}
              disabled={schedulerToggling || schedulerEnabled === null}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "7px 16px", borderRadius: 99, border: "none",
                cursor: schedulerToggling || schedulerEnabled === null ? "not-allowed" : "pointer",
                fontWeight: 700, fontSize: 13, transition: "background 0.2s",
                background: schedulerEnabled ? "#059669" : "#6b7280",
                color: "#fff",
              }}
            >
              {schedulerToggling ? (
                <span className="spinner" />
              ) : (
                <span style={{
                  display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                  background: schedulerEnabled ? "#bbf7d0" : "#d1d5db",
                  boxShadow: schedulerEnabled ? "0 0 0 2px #bbf7d0" : "none",
                }} />
              )}
              {schedulerEnabled === null ? "Loading…" : schedulerEnabled ? "ON" : "OFF"}
            </button>
          </div>
          <p className="muted small" style={{ marginBottom: 20 }}>
            All message content is generated by Task AI in real time. Fires immediately to all subscribed devices.
            {schedulerEnabled === false && (
              <span style={{ marginLeft: 6, color: "#dc2626", fontWeight: 600 }}>
                · Scheduler is OFF — no automatic notifications will be sent.
              </span>
            )}
          </p>

          {/* Task AI connection test */}
          <div style={{ marginBottom: 16 }}>
            <button
              style={{ ...btnStyle("#374151"), width: "100%", justifyContent: "center" }}
              disabled={taskAILoading || !!firing}
              onClick={handleTestTaskAI}
            >
              {taskAILoading ? <span className="spinner" /> : <BotMessageSquare size={15} />}
              Test Task AI Connection
            </button>
            {taskAIResult && (
              <div style={{
                marginTop: 8, padding: "10px 14px", borderRadius: 9, fontSize: 13,
                background: taskAIResult.ok ? "rgba(5,150,105,0.07)" : "rgba(220,38,38,0.07)",
                border: `1px solid ${taskAIResult.ok ? "rgba(5,150,105,0.22)" : "rgba(220,38,38,0.22)"}`,
              }}>
                {taskAIResult.ok ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontWeight: 600, color: "var(--success, #059669)" }}>✓ {taskAIResult.reply}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Model: <strong>{taskAIResult.model}</strong> &nbsp;·&nbsp;
                      Latency: <strong>{taskAIResult.latencyMs}ms</strong> &nbsp;·&nbsp;
                      {taskAIResult.baseURL}
                    </div>
                  </div>
                ) : (
                  <span style={{ color: "#dc2626" }}>✗ {taskAIResult.error}</span>
                )}
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border,#e5e7eb)", marginBottom: 16 }} />

          {/* Test buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 20 }}>

            <button
              style={btnStyle("#f59e0b")}
              disabled={!!firing}
              onClick={() => fireTest("morning")}
            >
              {firing === "morning" ? <span className="spinner" /> : <Sun size={15} />}
              Good Morning (8 AM)
            </button>

            <button
              style={btnStyle("#6366f1")}
              disabled={!!firing}
              onClick={() => fireTest("night")}
            >
              {firing === "night" ? <span className="spinner" /> : <Moon size={15} />}
              Good Night (11 PM)
            </button>

            <button
              style={btnStyle("#059669")}
              disabled={!!firing}
              onClick={() => fireTest("nudge")}
            >
              {firing === "nudge" ? <span className="spinner" /> : <Bell size={15} />}
              Learning Nudge
            </button>

          </div>

          {/* Festival row */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
            <input
              className="input"
              style={{ flex: 1, maxWidth: 260 }}
              placeholder="Festival name (e.g. Diwali) — blank = auto-detect"
              value={festivalName}
              onChange={(e) => setFestivalName(e.target.value)}
              disabled={!!firing}
            />
            <button
              style={btnStyle("#e11d48")}
              disabled={!!firing}
              onClick={() => fireTest("festival", festivalName.trim() ? { festival: festivalName.trim() } : {})}
            >
              {firing === "festival" ? <span className="spinner" /> : <Star size={15} />}
              Festival Greeting
            </button>
          </div>

          {/* Last test result */}
          {lastTestResult && (
            <div style={{
              padding: "12px 16px", borderRadius: 10, fontSize: 13.5,
              background: lastTestResult.ok !== false ? "rgba(5,150,105,0.07)" : "rgba(220,38,38,0.07)",
              border: `1px solid ${lastTestResult.ok !== false ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)"}`,
              marginBottom: 4,
            }}>
              {lastTestResult.ok === false ? (
                <span>Error: {lastTestResult.error}</span>
              ) : lastTestResult.festival === null && lastTestResult.type === "festival" ? (
                <span>No festival detected today. Enter a name above to force one.</span>
              ) : (
                <>
                  <div style={{ fontWeight: 600 }}>{lastTestResult.title}</div>
                  <div style={{ color: "var(--muted)", marginTop: 2 }}>{lastTestResult.body}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                    Sent to {lastTestResult.sent ?? 0} of {lastTestResult.total ?? 0} subscribed devices
                    {lastTestResult.festival ? ` · ${lastTestResult.festival}` : ""}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Weekly Nudge Schedule ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar size={17} strokeWidth={1.75} aria-hidden="true" />
              Weekly Nudge Schedule
            </h3>
            <button
              className="btn btn-ghost btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              disabled={firing === "regen"}
              onClick={handleRegenerate}
            >
              {firing === "regen" ? <span className="spinner" /> : <RefreshCw size={13} strokeWidth={2} />}
              Regenerate
            </button>
          </div>
          <p className="muted small" style={{ marginBottom: 14 }}>
            4 random days this week · times chosen from 10 AM / 1 PM / 4 PM / 8 PM (max one repeat) · IST
          </p>

          {scheduleLoading ? (
            <div className="muted small">Loading schedule…</div>
          ) : schedule?.slots?.length ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
                {schedule.week}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {schedule.slots.map((s, i) => <ScheduleDay key={i} slot={s} />)}
              </div>
            </>
          ) : (
            <div className="muted small">No schedule found. Click Regenerate to create one.</div>
          )}
        </div>

        {/* ── Manual Broadcast ── */}
        <div className="card">
          <h3 style={{ margin: "0 0 4px" }}>
            <Bell size={18} strokeWidth={1.75} style={{ verticalAlign: "middle", marginRight: 8 }} aria-hidden="true" />
            Manual Broadcast
          </h3>
          <p className="muted small" style={{ marginBottom: 20 }}>
            Compose and send a custom push notification immediately.
          </p>

          <form onSubmit={handleSend}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label className="label">Audience</label>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)} disabled={sending}>
                <option value="all">Everyone ({statsLoading ? "…" : (stats?.total ?? 0)} devices)</option>
                {["student", "doctor", "admin"].map((key) => {
                  const count = stats?.byRole?.find((r) => r.role === key)?.subs ?? 0;
                  return (
                    <option key={key} value={key}>
                      {key.charAt(0).toUpperCase() + key.slice(1)}s only ({statsLoading ? "…" : count} devices)
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label className="label">Title</label>
              <input
                className="input" type="text" maxLength={80}
                placeholder="e.g. New cases added!"
                value={title} onChange={(e) => setTitle(e.target.value)}
                disabled={sending} required
              />
              <div className="muted small" style={{ marginTop: 4, textAlign: "right" }}>{title.length}/80</div>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label className="label">Message</label>
              <textarea
                className="input" rows={3} maxLength={200}
                placeholder="e.g. 50 new cardiology cases are live. Start practicing now."
                value={body} onChange={(e) => setBody(e.target.value)}
                disabled={sending} required style={{ resize: "vertical" }}
              />
              <div className="muted small" style={{ marginTop: 4, textAlign: "right" }}>{body.length}/200</div>
            </div>

            <div className="field" style={{ marginBottom: 20 }}>
              <label className="label">Link (where tapping opens)</label>
              <input
                className="input" type="text" placeholder="/practice"
                value={link} onChange={(e) => setLink(e.target.value)}
                disabled={sending}
              />
              <div className="muted small" style={{ marginTop: 4 }}>Use a path like /practice or /blog</div>
            </div>

            {targetCount !== null && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px", borderRadius: 10,
                background: "var(--bg-soft, #f1f5f9)",
                marginBottom: 16, fontSize: 14,
              }}>
                <Users size={16} strokeWidth={1.75} aria-hidden="true" className="muted" />
                <span>Will reach <strong>{targetCount}</strong> device{targetCount !== 1 ? "s" : ""}</span>
              </div>
            )}

            <button
              type="submit" className="btn btn-primary"
              disabled={sending || !title.trim() || !body.trim()}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {sending
                ? <><span className="spinner" /> Sending…</>
                : <><Send size={16} strokeWidth={1.75} aria-hidden="true" /> Send notification</>}
            </button>
          </form>

          {lastResult && (
            <div style={{
              marginTop: 16, padding: "12px 16px", borderRadius: 10,
              background: lastResult.sent > 0 ? "rgba(0,168,107,0.08)" : "rgba(220,38,38,0.07)",
              border: `1px solid ${lastResult.sent > 0 ? "rgba(0,168,107,0.2)" : "rgba(220,38,38,0.2)"}`,
              fontSize: 14,
            }}>
              {lastResult.sent > 0
                ? `✓ Delivered to ${lastResult.sent} of ${lastResult.total} subscribed device${lastResult.total !== 1 ? "s" : ""}`
                : `No devices received the push. ${lastResult.total === 0 ? "No subscribed devices in this audience." : `${lastResult.total} subscribed but all failed.`}`}
            </div>
          )}
        </div>

        {/* Scheduler info */}
        <div className="card" style={{ marginTop: 20, background: "var(--bg-soft,#f8f9fa)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
            Daily Automation (IST)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { icon: <Sun size={14} />, color: "#f59e0b", label: "Good Morning", time: "8:00 AM every day" },
              { icon: <Star size={14} />, color: "#e11d48", label: "Festival greeting", time: "8:05 AM (auto-detected by AI)" },
              { icon: <Bell size={14} />, color: "#059669", label: "Learning nudge", time: "4× per week, random days & times" },
              { icon: <Moon size={14} />, color: "#6366f1", label: "Good Night", time: "11:00 PM every day" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                <span style={{ color: row.color }}>{row.icon}</span>
                <span style={{ fontWeight: 600, minWidth: 140 }}>{row.label}</span>
                <span className="muted">{row.time}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AppShell>
  );
}
