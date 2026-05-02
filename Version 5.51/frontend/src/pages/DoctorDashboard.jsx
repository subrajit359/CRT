import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Reorder, useDragControls } from "framer-motion";
import { CheckCircle2, Flag, Star, XCircle, Sparkles, Activity } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import Sparkline from "../components/Sparkline.jsx";
import Counter from "../components/Counter.jsx";
import Skeleton, { SkeletonStack } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";

const TRIAGE_ORDER_KEY = "crt:triage:order:v1";

function DragHandle({ controls }) {
  return (
    <span
      className="triage-drag"
      aria-label="Drag to reorder"
      role="button"
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        controls?.start(e);
      }}
      style={{ touchAction: "none", cursor: "grab", userSelect: "none" }}
    >
      <svg viewBox="0 0 12 16" width="14" height="18">
        <circle cx="3" cy="3" r="1.4" fill="currentColor" />
        <circle cx="9" cy="3" r="1.4" fill="currentColor" />
        <circle cx="3" cy="8" r="1.4" fill="currentColor" />
        <circle cx="9" cy="8" r="1.4" fill="currentColor" />
        <circle cx="3" cy="13" r="1.4" fill="currentColor" />
        <circle cx="9" cy="13" r="1.4" fill="currentColor" />
      </svg>
    </span>
  );
}

function TriageItem({ c, children }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      key={c.id}
      value={c}
      as="div"
      className={`triage-row is-draggable ${c.specialty_match ? "is-match" : ""}`}
      whileDrag={{ scale: 1.01, boxShadow: "0 18px 40px rgba(15,76,58,0.18)", cursor: "grabbing" }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      dragListener={false}
      dragControls={controls}
    >
      <DragHandle controls={controls} />
      {children}
    </Reorder.Item>
  );
}

function timeAgoShort(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24); return `${dd}d`;
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [health, setHealth] = useState(null);
  const [triage, setTriage] = useState(null);
  const [triageOrder, setTriageOrder] = useState([]);
  const [touched, setTouched] = useState([]);
  const [drs, setDrs] = useState([]);
  const [lounge, setLounge] = useState([]);
  const [totalCases, setTotalCases] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const softFetch = (path, fallback) =>
      api.get(path).catch((err) => {
        console.warn(`[DoctorDashboard] optional fetch failed: ${path}`, err);
        return fallback;
      });
    Promise.all([
      softFetch("/api/verify/health", null),
      softFetch("/api/verify/triage", { cases: [], mySpecialty: null, quorum: 3 }),
      softFetch("/api/verify/touched", { cases: [] }),
      softFetch("/api/cases/count", { total: 0 }),
      softFetch("/api/discussions/delete-requests", { requests: [] }),
      softFetch("/api/lounge?limit=4", { messages: [] }),
    ]).then(([h, t, tt, tc, dr, lg]) => {
      if (!alive) return;
      setHealth(h);
      setTriage(t);
      setTotalCases(tc?.total ?? 0);
      const fresh = (t?.cases || []).slice(0, 6);
      let savedIds = [];
      try {
        const raw = localStorage.getItem(TRIAGE_ORDER_KEY);
        if (raw) savedIds = JSON.parse(raw) || [];
      } catch {}
      const byId = new Map(fresh.map((c) => [c.id, c]));
      const ordered = [];
      for (const id of savedIds) if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); }
      for (const c of fresh) if (byId.has(c.id)) ordered.push(c);
      setTriageOrder(ordered);
      setTouched(tt.cases || []);
      setDrs(dr.requests || []);
      const recent = (lg.messages || []).slice(-4).reverse();
      setLounge(recent);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const openDrs = drs.filter((d) => d.status === "open").length;
  const throughputValues = useMemo(
    () => (health?.throughput || []).map((d) => d.n),
    [health]
  );

  return (
    <AppShell>
      <div className="container fade-in">
        {/* Top greeting */}
        <div className="row-between" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Welcome, Dr. {user?.full_name?.split(" ").slice(-1)[0] || ""}</h2>
            <p className="muted">
              {user?.specialty || triage?.mySpecialty || "Reviewer"}
              {user?.years_exp != null ? ` · ${user.years_exp}y experience` : ""}
              {triage?.mySpecialty && (
                <> · queue prioritized for <strong>{triage.mySpecialty}</strong></>
              )}
            </p>
          </div>
          <div className="doc-top-actions">
            <button className="btn btn-ghost" onClick={() => navigate("/lounge")}>Open lounge</button>
            <button className="btn btn-secondary" onClick={() => navigate("/practice")}>Practice cases</button>
            <button className="btn btn-secondary" onClick={() => navigate("/upload")}>Upload case</button>
            <button className="btn btn-primary" onClick={() => navigate("/verify")}>Verify queue</button>
          </div>
        </div>

        <div className="spacer-7" />

        {/* Queue health bar */}
        <div className="queue-health stagger">
          <div className="qh-cell lift">
            <span className="qh-cell-label">Total cases available</span>
            <span className="qh-cell-value">
              {loading ? <Skeleton height={26} width={50} /> : <Counter value={totalCases} />}
            </span>
            <span className="qh-cell-sub">
              <Link href="/practice" className="nav-link">Browse library →</Link>
            </span>
          </div>
          <div className="qh-cell lift">
            <span className="qh-cell-label">Cases in queue</span>
            <span className="qh-cell-value">
              {loading ? <Skeleton height={26} width={50} /> : <Counter value={health?.total ?? 0} />}
            </span>
            <span className="qh-cell-sub">awaiting quorum (3 verifies)</span>
          </div>
          <div className="qh-cell lift">
            <span className="qh-cell-label">Oldest awaiting you</span>
            <span className="qh-cell-value">
              {loading ? <Skeleton height={26} width={50} /> : (
                health?.oldestHours > 0 ? <><Counter value={health.oldestHours} />h</> : <span className="muted">—</span>
              )}
            </span>
            <span className="qh-cell-sub">
              {health?.oldestHours > 72 ? <span style={{ color: "var(--rose-700)" }}>● needs attention</span>
                : health?.oldestHours > 24 ? <span style={{ color: "var(--amber-700)" }}>● aging</span>
                : <span style={{ color: "var(--green-700)" }}>● fresh</span>}
            </span>
          </div>
          <div className="qh-cell lift">
            <span className="qh-cell-label">Your week</span>
            <span className="qh-cell-value" style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              {loading ? <Skeleton height={26} width={50} /> : <><Counter value={health?.myWeek ?? 0} /></>}
              {!loading && throughputValues.length > 0 && (
                <Sparkline data={throughputValues} width={80} height={28} />
              )}
            </span>
            <span className="qh-cell-sub">
              {health?.myShare != null ? `${health.myShare}% of community throughput` : "verifies in 7d"}
            </span>
          </div>
          <div className="qh-cell lift">
            <span className="qh-cell-label">Open delete requests</span>
            <span className="qh-cell-value">
              {loading ? <Skeleton height={26} width={50} /> : <Counter value={openDrs} />}
            </span>
            <span className="qh-cell-sub">{openDrs > 0 ? <Link href="/delete-requests" className="nav-link">Review →</Link> : "all clear"}</span>
          </div>
        </div>

        <div className="spacer-7" />

        {/* Two columns */}
        <div className="dash-2col">
          {/* Smart triage */}
          <div className="card lift">
            <div className="dash-section-head">
              <h3>Smart triage</h3>
              <Link href="/verify" className="nav-link small">Open full queue →</Link>
            </div>
            {loading ? (
              <SkeletonStack rows={4} height={64} />
            ) : !triageOrder.length ? (
              <EmptyState
                icon={<CheckCircle2 size={24} strokeWidth={1.75} aria-hidden="true" />}
                title="Inbox zero"
                body="Nothing waiting on you right now. Browse the library or chat in the lounge."
                action={<button className="btn btn-secondary btn-sm" onClick={() => navigate("/lounge")}>Open lounge</button>}
              />
            ) : (
              <>
                <div className="triage-hint muted small">Drag the handle to reorder cases — your custom queue is saved on this device.</div>
                <Reorder.Group
                  axis="y"
                  values={triageOrder}
                  onReorder={(next) => {
                    setTriageOrder(next);
                    try { localStorage.setItem(TRIAGE_ORDER_KEY, JSON.stringify(next.map((c) => c.id))); } catch {}
                  }}
                  className="triage-list"
                >
                  {triageOrder.map((c) => (
                    <TriageItem key={c.id} c={c}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="triage-head">
                          <Link href={`/case/${c.id}`} className="triage-title">{c.title}</Link>
                          {c.specialty_match && <span className="badge badge-primary">Your specialty</span>}
                          {c.report_count > 0 && (
                            <span className="quorum-pill reports row" style={{ gap: 4, alignItems: "center", display: "inline-flex" }}>
                              <Flag size={12} strokeWidth={1.75} aria-hidden="true" />
                              {c.report_count} report{c.report_count > 1 ? "s" : ""}
                            </span>
                          )}
                          {c.tips_quorum && (
                            <span className="quorum-pill tips row" style={{ gap: 4, alignItems: "center", display: "inline-flex" }}>
                              <Star size={12} strokeWidth={1.75} aria-hidden="true" />
                              Tips quorum
                            </span>
                          )}
                        </div>
                        <div className="triage-preview">{c.preview || <span className="muted">No preview available.</span>}</div>
                        <div className="triage-meta">
                          <span className="muted small">{c.specialty} · L{c.level}</span>
                          <span className="muted small">·</span>
                          <span className="muted small">{c.age_hours < 24 ? `${c.age_hours}h old` : `${Math.round(c.age_hours / 24)}d old`}</span>
                          <span className="muted small">·</span>
                          <span className="quorum-pill row" style={{ gap: 4, alignItems: "center", display: "inline-flex" }}>
                            <CheckCircle2 size={12} strokeWidth={1.75} aria-hidden="true" />
                            {c.verify_count}/{c.quorum_total}
                            {c.remaining_for_quorum > 0 ? ` · ${c.remaining_for_quorum} more for quorum` : " · quorum reached"}
                          </span>
                        </div>
                      </div>
                      <div className="triage-actions">
                        <Link href={`/case/${c.id}`} className="btn btn-primary btn-sm">Review</Link>
                        <span className="muted small">priority {Math.round(c.priority)}</span>
                      </div>
                    </TriageItem>
                  ))}
                </Reorder.Group>
              </>
            )}
          </div>

          {/* Right column: touched + lounge preview */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
            <div className="card lift">
              <div className="dash-section-head">
                <h3>Cases you've touched</h3>
                <span className="muted small">last 8</span>
              </div>
              {loading ? (
                <SkeletonStack rows={3} height={36} />
              ) : touched.length === 0 ? (
                <EmptyState
                  icon={<Activity size={24} strokeWidth={1.75} aria-hidden="true" />}
                  title="No reviews yet"
                  body="Cases you verify or flag will land here for quick re-entry."
                />
              ) : (
                <div className="touched-list">
                  {touched.map((c) => (
                    <Link key={c.id} href={`/case/${c.id}`} className="touched-row">
                      <div>
                        <div className="touched-title">{c.title}</div>
                        <div className="touched-sub">
                          {c.specialty} · L{c.level} · {timeAgoShort(c.my_action_at)} ago
                        </div>
                      </div>
                      <span className={`badge row ${c.my_action === "verify" ? "badge-success" : "badge-warning"}`} style={{ gap: 4, alignItems: "center", display: "inline-flex" }}>
                        {c.my_action === "verify" ? (
                          <CheckCircle2 size={12} strokeWidth={1.75} aria-hidden="true" />
                        ) : (
                          <XCircle size={12} strokeWidth={1.75} aria-hidden="true" />
                        )}
                        {c.my_action === "verify" ? "verified" : "unverified"}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="card lift">
              <div className="dash-section-head">
                <h3>Doctor lounge</h3>
                <Link href="/lounge" className="nav-link small">Open →</Link>
              </div>
              {loading ? (
                <SkeletonStack rows={3} height={42} />
              ) : lounge.length === 0 ? (
                <EmptyState
                  icon={<Sparkles size={24} strokeWidth={1.75} aria-hidden="true" />}
                  title="Quiet in here"
                  body="Be the first to start a thread in the doctor lounge."
                  action={<Link href="/lounge" className="btn btn-secondary btn-sm">Say hello</Link>}
                />
              ) : (
                <div className="lounge-preview">
                  {lounge.map((m) => (
                    <Link key={m.id} href="/lounge" className="lounge-preview-item">
                      <div>
                        <div className="lounge-preview-title">{m.full_name || m.username}</div>
                        <div className="lounge-preview-sub">
                          {(m.body || "").slice(0, 90)}{(m.body || "").length > 90 ? "…" : ""}
                        </div>
                      </div>
                      <span className="muted small" style={{ whiteSpace: "nowrap" }}>{timeAgoShort(m.created_at)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="spacer-7" />
      </div>
    </AppShell>
  );
}
