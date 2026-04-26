import { useEffect, useRef, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { motion } from "framer-motion";
import AppShell from "../components/AppShell.jsx";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import VerifiedBadge from "../components/VerifiedBadge.jsx";
import EvalResult from "../components/EvalResult.jsx";
import Lightbox from "../components/Lightbox.jsx";
import ReadingMode from "../components/ReadingMode.jsx";
import Skeleton, { SkeletonStack } from "../components/Skeleton.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useSetRioCase } from "../lib/rioContext.jsx";

export default function CasePlay() {
  const params = useParams();
  const [location, navigate] = useLocation();
  const toast = useToast();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [groupCtx, setGroupCtx] = useState(null); // { specialty, level, groupIndex, cases:[{id,title,attempted}] }
  const [unverifyOpen, setUnverifyOpen] = useState(false);
  const [unverifyReason, setUnverifyReason] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [readingMode, setReadingMode] = useState(false);

  // Optimistic verify state
  const [optimisticVerified, setOptimisticVerified] = useState(false);
  const pendingVerifyRef = useRef(null); // { timer, committed }
  const isAnyModalOpen = unverifyOpen || reportOpen || deleteOpen || lightboxIndex !== null;

  // Tell the global Dr. Rio widget which case is open.
  useSetRioCase({ caseId: params.id, caseTitle: data?.case?.title });

  useEffect(() => {
    setData(null); setResult(null); setAnswer(""); setOptimisticVerified(false);
    cancelPendingVerify();
    api.get(`/api/cases/${params.id}`).then(setData).catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Parse ?specialty=&level=&group= from the URL and load the group context.
  useEffect(() => {
    const qs = location.includes("?") ? location.slice(location.indexOf("?")) : (typeof window !== "undefined" ? window.location.search : "");
    const sp = new URLSearchParams(qs);
    const specialty = sp.get("specialty");
    const level = sp.get("level");
    const groupIndex = sp.get("group");
    if (!specialty || !level || groupIndex === null) {
      setGroupCtx(null);
      return;
    }
    let cancelled = false;
    api.get(`/api/cases/groups?specialty=${encodeURIComponent(specialty)}&level=${encodeURIComponent(level)}`)
      .then((res) => {
        if (cancelled) return;
        const groups = res?.groups || [];
        const g = groups.find((x) => String(x.index) === String(groupIndex)) || groups[Number(groupIndex)];
        if (!g) { setGroupCtx(null); return; }
        setGroupCtx({ specialty, level, groupIndex: Number(groupIndex), cases: g.cases || [] });
      })
      .catch(() => setGroupCtx(null));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, params.id]);

  // Commit any pending verify if user navigates away.
  useEffect(() => () => commitPendingVerify(true), []);

  function cancelPendingVerify() {
    const p = pendingVerifyRef.current;
    if (p && p.timer) clearTimeout(p.timer);
    pendingVerifyRef.current = null;
  }

  async function commitPendingVerify(silent = false) {
    const p = pendingVerifyRef.current;
    if (!p || p.committed) return;
    p.committed = true;
    if (p.timer) clearTimeout(p.timer);
    try {
      await api.post(`/api/verify/${p.caseId}/verify`, {});
      if (!silent) {
        try {
          const fresh = await api.get(`/api/cases/${p.caseId}`);
          setData(fresh);
        } catch {}
      }
    } catch (e) {
      if (!silent) {
        toast.error(e.message || "Verify failed — rolling back");
        setOptimisticVerified(false);
      }
    } finally {
      pendingVerifyRef.current = null;
    }
  }

  async function submit() {
    if (answer.trim().length < 10) {
      toast.error("Write at least a sentence — short answers can't be evaluated.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post("/api/eval", { caseId: params.id, userAnswer: answer });
      setResult(r);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  // Find the current case's index inside the loaded group (or -1 if not in group).
  function currentGroupIndex() {
    if (!groupCtx || !Array.isArray(groupCtx.cases)) return -1;
    return groupCtx.cases.findIndex((x) => String(x.id) === String(params.id));
  }

  function groupQuery() {
    if (!groupCtx) return "";
    return `?specialty=${encodeURIComponent(groupCtx.specialty)}&level=${encodeURIComponent(groupCtx.level)}&group=${groupCtx.groupIndex}`;
  }

  async function nextCase() {
    try {
      await commitPendingVerify(true);
      // If we're inside a group, walk to the next case in the group.
      const idx = currentGroupIndex();
      if (idx >= 0 && groupCtx.cases[idx + 1]) {
        navigate(`/case/${groupCtx.cases[idx + 1].id}${groupQuery()}`);
        return;
      }
      // End of group, or not in a group: fall back to a random next case in the same specialty.
      const spec = data?.case?.specialty;
      if (!spec) { navigate("/practice"); return; }
      const r = await api.get(`/api/cases/random?specialty=${encodeURIComponent(spec)}`);
      navigate(`/case/${r.id}`);
    } catch (e) { toast.error("No more cases in this specialty. Try Practice page."); }
  }

  function prevCase() {
    // If we're inside a group, walk back inside the group.
    const idx = currentGroupIndex();
    if (idx > 0) {
      navigate(`/case/${groupCtx.cases[idx - 1].id}${groupQuery()}`);
      return;
    }
    if (window.history.length > 1) window.history.back();
    else navigate("/practice");
  }

  // Re-attempt: clear the previous result so the user can submit a fresh answer.
  // The server treats this as practice mode and won't update their rating.
  function reattempt() {
    setResult(null);
    setAnswer("");
  }

  async function thumbs() {
    await api.post(`/api/cases/${params.id}/thumbs-up`, {});
    const fresh = await api.get(`/api/cases/${params.id}`);
    setData(fresh);
    toast.success("Thanks for the signal");
  }

  function verify() {
    if (optimisticVerified || pendingVerifyRef.current) return;
    setOptimisticVerified(true);
    const caseId = params.id;
    const timer = setTimeout(() => {
      commitPendingVerify();
    }, 5000);
    pendingVerifyRef.current = { caseId, timer, committed: false };
    toast.success("Verified", {
      action: "Undo",
      duration: 5000,
      onAction: () => {
        cancelPendingVerify();
        setOptimisticVerified(false);
        toast.info("Undone — verify cancelled", { duration: 2500 });
      },
      onTimeout: () => {
        // Make sure the commit fires even if the toast handler is missed.
        commitPendingVerify();
      },
    });
  }
  async function unverify() {
    try {
      await api.post(`/api/verify/${params.id}/unverify`, { reason: unverifyReason.trim() || null });
      const fresh = await api.get(`/api/cases/${params.id}`);
      setData(fresh); setUnverifyOpen(false); setUnverifyReason("");
      toast.success("Marked as un-verified — uploader notified");
    } catch (e) { toast.error(e.message); }
  }
  async function report() {
    if (!reportReason.trim()) return toast.error("Reason required");
    await api.post(`/api/cases/${params.id}/report`, { reason: reportReason });
    setReportOpen(false); setReportReason("");
    toast.success("Reported. Admin will review.");
  }
  async function requestDelete() {
    if (deleteReason.trim().length < 10) return toast.error("Please give a clear reason (at least a sentence).");
    try {
      await api.post(`/api/cases/${params.id}/delete-request`, { reason: deleteReason.trim() });
      setDeleteOpen(false); setDeleteReason("");
      toast.success("Delete request opened in discussions");
      navigate(`/discussion/${params.id}`);
    } catch (e) { toast.error(e.message); }
  }

  // Keyboard arrows for next/prev case (when not typing, no modal/reading mode handles this itself)
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      if (isAnyModalOpen || readingMode) return;
      if (e.key === "ArrowRight") { e.preventDefault(); nextCase(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prevCase(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingMode, isAnyModalOpen, data]);

  if (!data) {
    return (
      <AppShell>
        <div className="container fade-in" style={{ paddingTop: 24 }}>
          <Skeleton height={20} width={140} />
          <div style={{ height: 12 }} />
          <Skeleton height={32} width="55%" />
          <div style={{ height: 24 }} />
          <div className="play-wrap">
            <div className="card"><SkeletonStack rows={6} height={14} /></div>
            <div className="card"><SkeletonStack rows={4} height={20} /></div>
          </div>
        </div>
      </AppShell>
    );
  }
  const c = data.case;
  const liveVerifyCount = (data.verifications || []).filter((v) => v.action === "verify").length;
  const verifyCount = liveVerifyCount + (optimisticVerified ? 1 : 0);
  const isDoc = user?.role === "doctor" || user?.role === "admin";
  const q = (c.questions || [])[0] || { prompt: "Provide your reasoning for this case." };
  const attachments = data.attachments || [];
  const images = attachments.filter((a) => a.kind === "image");
  const docs = attachments.filter((a) => a.kind !== "image");

  if (readingMode) {
    return (
      <AppShell>
        <ReadingMode
          caseId={c.id}
          body={c.body}
          onExit={() => setReadingMode(false)}
          onNext={nextCase}
          onPrev={prevCase}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <motion.div
        className="container fade-in"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="row-between play-head">
          <div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="badge badge-primary">{c.specialty}</span>
              <span className="badge">Level {c.level}</span>
              <span className="badge">Source: {c.source}</span>
              <VerifiedBadge count={verifyCount} />
              {optimisticVerified && (
                <span className="badge badge-success" title="Pending — undo to cancel">✓ pending</span>
              )}
              {data.attempted && user?.role === "student" && (
                <span
                  className="badge"
                  style={{ background: "rgba(200,169,106,0.18)", color: "#7a5a14", border: "1px solid rgba(200,169,106,0.5)" }}
                  title="You've already attempted this case. Re-attempts don't affect your dashboard rating."
                >
                  ↻ Practice mode
                </span>
              )}
            </div>
            <h2 style={{ marginTop: 10 }}>{c.title}</h2>
            <div className="muted small" style={{ marginTop: 6 }}>
              {c.uploader_username
                ? <>Uploaded by <Link href={`/u/${c.uploader_username}`}>@{c.uploader_username}</Link>{c.uploader_specialty ? ` · ${c.uploader_specialty}` : ""}</>
                : "Source: Reasonal library"}
            </div>
          </div>
          <div className="row play-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setReadingMode(true)} title="Reading mode (R)">📖 Reading mode</button>
            <button className="btn btn-ghost btn-sm" onClick={thumbs}>👍 {data.thumbs.count}</button>
            {isDoc && (
              <button
                className={`btn btn-secondary btn-sm`}
                onClick={verify}
                disabled={optimisticVerified}
              >
                {optimisticVerified ? "✓ Verified" : "Verify"}
              </button>
            )}
            {isDoc && <button className="btn btn-secondary btn-sm" onClick={() => setUnverifyOpen(true)}>Un-verify</button>}
            <Link href={`/discussion/${c.id}`} className="btn btn-ghost btn-sm">💬 Discuss</Link>
            {isDoc && <button className="btn btn-ghost btn-sm" onClick={() => setDeleteOpen(true)}>Request delete</button>}
            {!isDoc && <button className="btn btn-ghost btn-sm" onClick={() => setReportOpen(true)}>Report</button>}
          </div>
        </div>

        {verifyCount === 0 && (
          <div className="banner-warn" role="status" aria-live="polite">
            <strong>Unverified case.</strong> No doctor has verified this case yet — interpret answers and explanations with caution.
          </div>
        )}

        <div className="spacer-7" />

        <div className="play-wrap">
          <div className="card">
            <div className="case-body">{c.body}</div>

            {isDoc && c.diagnosis && (
              <div className="banner-warn" style={{ marginTop: 16, background: "var(--bg-2, #f8f5ee)", borderColor: "var(--accent, #c8a96a)" }} role="note">
                <strong>Doctor/admin view — diagnosis:</strong> {c.diagnosis}
                {Array.isArray(c.accepted_diagnoses) && c.accepted_diagnoses.length > 0 && (
                  <div className="muted small" style={{ marginTop: 4 }}>
                    Also accepts: {c.accepted_diagnoses.join(", ")}
                  </div>
                )}
                {c.diagnosis_explanation && (
                  <div className="muted small" style={{ marginTop: 6 }}>{c.diagnosis_explanation}</div>
                )}
                <div className="muted small" style={{ marginTop: 6, fontStyle: "italic" }}>
                  Hidden from students. Used to grade their answers.
                </div>
              </div>
            )}

            {(images.length > 0 || docs.length > 0) && (
              <>
                <div className="spacer-7" />
                <h4 style={{ margin: "4px 0 10px" }}>Attachments</h4>
                {images.length > 0 && (
                  <div className="att-grid">
                    {images.map((a, i) => (
                      <button
                        key={a.id}
                        type="button"
                        className="att-thumb"
                        onClick={() => setLightboxIndex(i)}
                        title={a.filename}
                      >
                        <img src={a.storage_url} alt={a.filename} loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
                {docs.length > 0 && (
                  <ul className="att-doclist">
                    {docs.map((a) => (
                      <li key={a.id}>
                        <a href={a.storage_url} target="_blank" rel="noreferrer">📄 {a.filename}</a>
                        <span className="muted small"> · {(a.size_bytes / 1024).toFixed(0)} KB</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div>
            {data.attempted && user?.role === "student" && !result && (
              <div
                className="banner-warn"
                style={{
                  marginBottom: 14,
                  background: "rgba(200,169,106,0.10)",
                  borderColor: "rgba(200,169,106,0.5)",
                  color: "#5a4410",
                }}
                role="status"
              >
                <strong>Practice mode.</strong> You've already attempted this case. Submit again to see the model answer and AI explanation — this re-attempt won't be saved or counted toward your dashboard rating.
              </div>
            )}
            <div className="question-box">
              <div className="question-prompt">{q.prompt}</div>
              <textarea className="textarea" value={answer} onChange={(e) => setAnswer(e.target.value)}
                placeholder="Write your reasoning. Specifics, not phrases." rows={8}
                disabled={!!result} />
              <div className="next-row">
                <span className="muted small">
                  {answer.length} chars · ← / → next case
                  {groupCtx && currentGroupIndex() >= 0 && (
                    <> · case {currentGroupIndex() + 1} of {groupCtx.cases.length} in group {groupCtx.groupIndex + 1}</>
                  )}
                </span>
                <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {result && data.attempted && user?.role === "student" && (
                    <button className="btn btn-ghost btn-sm" onClick={reattempt} title="Try this case again — won't affect your rating">
                      ↻ Re-attempt
                    </button>
                  )}
                  {!result && groupCtx && currentGroupIndex() >= 0 && groupCtx.cases[currentGroupIndex() + 1] && (
                    <button className="btn btn-ghost btn-sm" onClick={nextCase} title="Skip to the next case in this group without submitting">
                      Skip →
                    </button>
                  )}
                  {!result ? (
                    <button className="btn btn-primary" disabled={busy || answer.trim().length < 10} onClick={submit}>
                      {busy ? <span className="spinner" /> : "Submit for evaluation"}
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={nextCase}>
                      {groupCtx && currentGroupIndex() >= 0 && groupCtx.cases[currentGroupIndex() + 1]
                        ? "Next in group →"
                        : "Next case →"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {result && (
              <EvalResult
                text={result.evalText}
                diagnosisCorrect={result.diagnosisCorrect}
                correctDiagnosis={result.correctDiagnosis}
                diagnosisExplanation={result.diagnosisExplanation}
                verifyCount={liveVerifyCount}
              />
            )}
          </div>
        </div>

        <CaseNav
          onPrev={prevCase}
          onNext={nextCase}
          prevDisabled={groupCtx ? currentGroupIndex() <= 0 : false}
          nextDisabled={
            groupCtx
              ? currentGroupIndex() >= 0 &&
                !groupCtx.cases[currentGroupIndex() + 1]
              : false
          }
          position={
            groupCtx && currentGroupIndex() >= 0
              ? { current: currentGroupIndex() + 1, total: groupCtx.cases.length, group: groupCtx.groupIndex + 1 }
              : null
          }
        />

        {data.verifications && data.verifications.length > 0 && (
          <div className="card" style={{ marginTop: 24 }}>
            <h3>Doctor reviews</h3>
            <div className="spacer-7" />
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {data.verifications.map((v) => (
                <li key={v.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className={`badge ${v.action === "verify" ? "badge-success" : "badge-danger"}`}>
                      {v.action === "verify" ? "Verified" : "Un-verified"}
                    </span>
                    <Link href={`/u/${v.username}`}><strong>@{v.username}</strong></Link>
                    <span className="muted small">{v.specialty} · {v.years_exp || "?"}y</span>
                    <span className="muted small" style={{ marginLeft: "auto" }}>{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                  {v.reason && <div className="muted small" style={{ marginTop: 6 }}>{v.reason}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {unverifyOpen && (
          <Modal onClose={() => setUnverifyOpen(false)} title="Un-verify case">
            <p className="muted small" style={{ marginTop: 0 }}>A reason is optional but encouraged — it helps the uploader fix the case.</p>
            <textarea className="textarea" placeholder="Optional: brief clinical concern (encouraged)" value={unverifyReason} onChange={(e) => setUnverifyReason(e.target.value)} />
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={() => setUnverifyOpen(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={unverify}>Submit un-verify</button>
            </div>
          </Modal>
        )}

        {reportOpen && (
          <Modal onClose={() => setReportOpen(false)} title="Report case">
            <textarea className="textarea" placeholder="Why are you reporting this case?" value={reportReason} onChange={(e) => setReportReason(e.target.value)} />
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={() => setReportOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={report}>Submit report</button>
            </div>
          </Modal>
        )}

        {deleteOpen && (
          <Modal onClose={() => setDeleteOpen(false)} title="Request case deletion">
            <p className="muted small" style={{ marginTop: 0 }}>
              Open a delete-request thread visible to admins and the uploader. Be specific about what is wrong (clinical accuracy, copyright, duplicate, etc.).
            </p>
            <textarea className="textarea" rows={5} placeholder="Why should this case be deleted? (required, at least a sentence)" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={() => setDeleteOpen(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={requestDelete}>Open delete request</button>
            </div>
          </Modal>
        )}

        {lightboxIndex !== null && (
          <Lightbox
            items={images}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onIndexChange={setLightboxIndex}
          />
        )}
      </motion.div>
    </AppShell>
  );
}

function CaseNav({ onPrev, onNext, prevDisabled, nextDisabled, position }) {
  return (
    <div className="case-nav">
      <button
        className="case-nav-btn case-nav-btn--prev"
        onClick={onPrev}
        disabled={prevDisabled}
        title="Previous case (←)"
      >
        <span className="case-nav-arrow" aria-hidden>←</span>
        <span className="case-nav-text">
          <span className="case-nav-label">Previous</span>
          <span className="case-nav-sub">case</span>
        </span>
      </button>

      <div className="case-nav-mid">
        {position ? (
          <>
            <span className="case-nav-counter">
              <strong>{position.current}</strong> / {position.total}
            </span>
            <span className="case-nav-meta">Group {position.group}</span>
          </>
        ) : (
          <span className="case-nav-meta">Use ← / → to navigate</span>
        )}
      </div>

      <button
        className="case-nav-btn case-nav-btn--next"
        onClick={onNext}
        disabled={nextDisabled}
        title="Next case (→)"
      >
        <span className="case-nav-text">
          <span className="case-nav-label">Next</span>
          <span className="case-nav-sub">case</span>
        </span>
        <span className="case-nav-arrow" aria-hidden>→</span>
      </button>
    </div>
  );
}

function Modal({ children, title, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(17,20,26,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 520, animation: "fadeIn 200ms" }}>
        <h3>{title}</h3>
        <div className="spacer-7" />
        {children}
      </div>
    </div>
  );
}
