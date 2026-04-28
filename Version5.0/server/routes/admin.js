import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { notify } from "../notify.js";
import { caseOpenai as openai, loadPrompt } from "../openai.js";
import { isMailerConfigured, sendMail } from "../mailer.js";

const router = express.Router();

const SPECIALTIES = [
  "General Medicine", "Cardiology", "Neurology", "Pediatrics", "Surgery",
  "Obstetrics & Gynecology", "Psychiatry", "Emergency Medicine", "Endocrinology",
  "Pulmonology", "Gastroenterology", "Nephrology", "Infectious Disease", "Dermatology",
];

const LEVEL_LABEL = { 1: "first-year", 2: "second-year", 3: "third-year", 4: "fourth-year", 5: "intern", 6: "resident", 7: "advanced resident" };

function tryParseJson(text) {
  if (!text) return null;
  // strip ```json fences if model wraps them
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  // fallback: extract first {...} block
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// Strip the diagnosis (and any obvious aliases) out of the body / question stems
// in case the model leaked it. Belt-and-braces over the prompt rule.
function scrubLeak(text, diagnosis, aliases = []) {
  if (!text) return text;
  let out = text;
  const terms = [diagnosis, ...aliases].filter((t) => t && String(t).trim().length > 2);
  for (const t of terms) {
    const safe = String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${safe}\\b`, "gi"), "[redacted]");
  }
  return out;
}

// Ask the model to silently audit its own draft for clinical contradictions and
// fix them. Cheap, single round-trip, large accuracy uplift in practice.
async function reviseCaseForAccuracy(draft, { specialty, level, model }) {
  const review = `You are a board-certified ${specialty} physician auditing a teaching case for clinical errors before it reaches students.

Audit this case for:
- Contradictions between vitals, labs, exam, and the stated diagnosis.
- Missing units or implausible reference ranges.
- Drug names / doses that are non-standard.
- Diagnosis or accepted aliases accidentally appearing in the body or question stems.
- Demographics or time course that do not fit the diagnosis.
- Differentials that should have been included or ruled out.

If the case is already clinically sound, return it UNCHANGED.
If you find errors, return a CORRECTED version that fixes them while preserving the same diagnosis and educational intent.

Return STRICT JSON with the exact same schema as the input. No prose, no fences.

INPUT CASE:
${JSON.stringify(draft, null, 2)}`;
  try {
    const resp = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You output ONLY valid JSON. No prose, no markdown fences." },
        { role: "user", content: review },
      ],
    });
    const text = resp.choices[0]?.message?.content || "";
    const parsed = tryParseJson(text);
    if (parsed && parsed.title && parsed.body && parsed.diagnosis) return parsed;
  } catch (e) {
    console.warn("[admin/cases/generate] revision pass failed (using draft)", e.message);
  }
  return draft;
}

async function generateOneCase({ specialty, level }) {
  const prompt = loadPrompt("casePrompt.txt")
    .replaceAll("{LEVEL}", LEVEL_LABEL[level] || "third-year")
    .replaceAll("{SPECIALTY}", specialty);

  // Allow a stronger model to be configured just for case authoring.
  const model = process.env.AI_CASE_MODEL || process.env.AI_MODEL || "gpt-4o-mini";

  const resp = await openai.chat.completions.create({
    model,
    temperature: 0.4, // factual + creative balance
    top_p: 0.9,
    max_tokens: 6000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are a board-certified physician and medical educator. You output ONLY valid JSON matching the user's schema. No prose, no markdown fences. Clinical accuracy is non-negotiable." },
      { role: "user", content: prompt },
    ],
  });
  const text = resp.choices[0]?.message?.content || "";
  let parsed = tryParseJson(text);
  if (!parsed || !parsed.title || !parsed.body || !parsed.diagnosis) {
    throw new Error("AI returned malformed case");
  }

  // Self-audit pass — opt-out via AI_CASE_REVISE=0
  if (process.env.AI_CASE_REVISE !== "0") {
    parsed = await reviseCaseForAccuracy(parsed, { specialty, level, model });
  }

  const diagnosis = String(parsed.diagnosis);
  const aliases = Array.isArray(parsed.acceptedDiagnoses)
    ? parsed.acceptedDiagnoses.map((s) => String(s)).filter(Boolean).slice(0, 20)
    : [];

  return {
    title: scrubLeak(String(parsed.title).slice(0, 200), diagnosis, aliases),
    specialty: parsed.specialty || specialty,
    level: Math.max(1, Math.min(7, parseInt(parsed.level, 10) || level)),
    body: scrubLeak(String(parsed.body), diagnosis, aliases),
    questions: Array.isArray(parsed.questions) && parsed.questions.length
      ? parsed.questions.map((q) => ({
          prompt: scrubLeak(String(q.prompt || "Provide your reasoning."), diagnosis, aliases),
          expectation: String(q.expectation || ""),
        }))
      : [{ prompt: "What is the most likely diagnosis and your next step?", expectation: "" }],
    diagnosis,
    acceptedDiagnoses: aliases,
    diagnosisExplanation: parsed.diagnosisExplanation ? String(parsed.diagnosisExplanation) : null,
  };
}

router.post("/cases/generate", requireAuth(["admin"]), async (req, res) => {
  const count = Math.max(1, Math.min(10, parseInt(req.body.count, 10) || 5));
  const specialty = req.body.specialty && SPECIALTIES.includes(req.body.specialty) ? req.body.specialty : null;
  const level = parseInt(req.body.level, 10) || 3;

  const inserted = [];
  const failed = [];
  for (let i = 0; i < count; i++) {
    const spec = specialty || SPECIALTIES[Math.floor(Math.random() * SPECIALTIES.length)];
    try {
      const c = await generateOneCase({ specialty: spec, level });
      const { rows } = await query(
        `INSERT INTO cases (title, specialty, level, body, questions, source, source_kind, uploader_id,
                            diagnosis, accepted_diagnoses, diagnosis_explanation)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,'ai',$7,$8,$9::jsonb,$10) RETURNING id`,
        [c.title, c.specialty, c.level, c.body, JSON.stringify(c.questions),
         "AI generated", req.user.id, c.diagnosis, JSON.stringify(c.acceptedDiagnoses), c.diagnosisExplanation]
      );
      inserted.push({ id: rows[0].id, title: c.title, specialty: c.specialty });
    } catch (e) {
      console.error("[admin/cases/generate] failed", e.message);
      failed.push(e.message);
    }
  }
  res.json({ ok: true, inserted, failedCount: failed.length });
});

// Shared helper: clamp ?page / ?pageSize and return SQL LIMIT/OFFSET.
function pagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

router.get("/doctors/pending", requireAuth(["admin"]), async (req, res) => {
  const { page, pageSize, offset } = pagination(req);
  const q = String(req.query.q || "").trim();
  const params = [];
  let where = "dp.status='pending'";
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where += ` AND (u.full_name ILIKE $${i} OR u.email ILIKE $${i} OR u.username ILIKE $${i}
                   OR dp.license_number ILIKE $${i} OR dp.hospital ILIKE $${i})`;
  }
  const { rows: countRow } = await query(
    `SELECT COUNT(*)::int AS n FROM users u JOIN doctor_profiles dp ON dp.user_id=u.id WHERE ${where}`,
    params
  );
  const total = countRow[0].n;
  params.push(pageSize, offset);
  const { rows } = await query(
    `SELECT u.id, u.email, u.username, u.full_name, u.country, u.created_at,
            dp.degree, dp.specialty, dp.years_exp, dp.license_number, dp.hospital, dp.proof_text, dp.status
       FROM users u JOIN doctor_profiles dp ON dp.user_id=u.id
       WHERE ${where} ORDER BY u.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({
    items: rows,
    doctors: rows, // backwards-compatible alias for any older clients
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

router.patch("/doctors/:id/approve", requireAuth(["admin"]), async (req, res) => {
  const note = (req.body.note || "").toString().trim() || null;
  await query(
    `UPDATE doctor_profiles SET status='approved', reviewed_at=NOW(), reviewer_note=$2 WHERE user_id=$1`,
    [req.params.id, note]
  );
  const body = note
    ? `You can now log in and verify cases.\n\nFrom the admin: ${note}`
    : "You can now log in and verify cases.";
  await notify(req.params.id, "doctor_approved", "Doctor account approved", body, "/");
  res.json({ ok: true });
});

router.patch("/doctors/:id/reject", requireAuth(["admin"]), async (req, res) => {
  const note = (req.body.note || "").toString().trim();
  if (!note) {
    return res.status(400).json({ error: "A reason is required when rejecting an applicant." });
  }
  await query(
    `UPDATE doctor_profiles SET status='rejected', reviewed_at=NOW(), reviewer_note=$2 WHERE user_id=$1`,
    [req.params.id, note]
  );
  await notify(req.params.id, "doctor_rejected", "Doctor application rejected", note, "/inbox");
  res.json({ ok: true });
});

// Direct admin soft-delete of a case (used by the admin Activity row's Delete
// icon). Mirrors the side-effects of approving a delete request: the case is
// hidden from learners but historical responses remain.
router.delete("/cases/:id", requireAuth(["admin"]), async (req, res) => {
  const { rows } = await query(
    `SELECT id, title, uploader_id FROM cases WHERE id=$1 AND deleted_at IS NULL`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Case not found" });
  await query(`UPDATE cases SET deleted_at=NOW() WHERE id=$1`, [rows[0].id]);
  if (rows[0].uploader_id && rows[0].uploader_id !== req.user.id) {
    try {
      await notify(
        rows[0].uploader_id,
        "case_deleted",
        "Your case was removed by an admin",
        `"${rows[0].title || `Case #${rows[0].id}`}" was removed.`,
        `/admin`
      );
    } catch (e) {
      // Notification is best-effort; surface to logs but don't fail the delete.
      console.warn("notify on admin case delete failed:", e?.message || e);
    }
  }
  res.json({ ok: true });
});

router.patch("/delete-requests/:id", requireAuth(["admin"]), async (req, res) => {
  const decision = req.body.decision;
  if (!["approved", "rejected", "edit_instead"].includes(decision)) {
    return res.status(400).json({ error: "Invalid decision" });
  }
  const { rows } = await query(`SELECT case_id, requested_by FROM delete_requests WHERE id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  await query(
    `UPDATE delete_requests SET status=$1, decided_by=$2, decided_at=NOW() WHERE id=$3`,
    [decision, req.user.id, req.params.id]
  );
  if (decision === "approved") {
    await query(`UPDATE cases SET deleted_at=NOW() WHERE id=$1`, [rows[0].case_id]);
  }
  const titles = {
    approved: "Your delete request was approved",
    rejected: "Your delete request was rejected",
    edit_instead: "An admin edited the case instead of deleting it",
  };
  const bodies = {
    approved: "The admin agreed and removed the case.",
    rejected: "The admin reviewed the case and decided to keep it. Open the discussion for details.",
    edit_instead: "The admin updated the case to address the issue. Please re-open it and confirm.",
  };
  await notify(
    rows[0].requested_by,
    "delete_decision",
    titles[decision],
    bodies[decision],
    decision === "edit_instead" ? `/case/${rows[0].case_id}` : `/discussion/${rows[0].case_id}`
  );
  res.json({ ok: true });
});

router.get("/stats", requireAuth(["admin"]), async (req, res) => {
  const { rows: u } = await query(`SELECT role, COUNT(*)::int AS n FROM users GROUP BY role`);
  const { rows: c } = await query(`SELECT COUNT(*)::int AS n FROM cases WHERE deleted_at IS NULL`);
  const { rows: r } = await query(`SELECT COUNT(*)::int AS n FROM responses`);
  const { rows: pendingDocs } = await query(`SELECT COUNT(*)::int AS n FROM doctor_profiles WHERE status='pending'`);
  const { rows: openDr } = await query(`SELECT COUNT(*)::int AS n FROM delete_requests WHERE status='open'`);
  const { rows: openReports } = await query(
    `SELECT COUNT(*)::int AS n FROM reports WHERE COALESCE(status,'open')='open'`
  );
  const { rows: distinctAttempters } = await query(
    `SELECT COUNT(DISTINCT user_id)::int AS n FROM responses`
  );
  const { rows: attemptedCases } = await query(
    `SELECT COUNT(DISTINCT case_id)::int AS n FROM responses`
  );
  res.json({
    users: u,
    cases: c[0].n,
    responses: r[0].n,
    pendingDoctors: pendingDocs[0].n,
    openDeleteRequests: openDr[0].n,
    openReports: openReports[0].n,
    distinctAttempters: distinctAttempters[0].n,
    attemptedCases: attemptedCases[0].n,
  });
});

// Per-case attempt counts: which cases have been practiced and by how many
// distinct students, plus total attempts. Useful to spot popular / unused cases.
router.get("/case-attempts", requireAuth(["admin"]), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "100", 10) || 100, 500);
  const sort = req.query.sort === "least" ? "ASC" : "DESC";
  const { rows } = await query(
    `SELECT c.id, c.title, c.specialty, c.level,
            COUNT(r.id)::int AS attempts,
            COUNT(DISTINCT r.user_id)::int AS unique_students,
            MAX(r.created_at) AS last_attempt
       FROM cases c
       LEFT JOIN responses r ON r.case_id = c.id
      WHERE c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY attempts ${sort}, c.created_at DESC
      LIMIT $1`,
    [limit]
  );
  res.json({ cases: rows });
});

// Per-student attempt counts: who is practicing and how much.
router.get("/student-attempts", requireAuth(["admin"]), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "100", 10) || 100, 500);
  const { rows } = await query(
    `SELECT u.id, u.username, u.full_name, u.role,
            COUNT(r.id)::int AS attempts,
            COUNT(DISTINCT r.case_id)::int AS unique_cases,
            MAX(r.created_at) AS last_attempt
       FROM users u
       LEFT JOIN responses r ON r.user_id = u.id
      WHERE u.role IN ('student','doctor')
      GROUP BY u.id
     HAVING COUNT(r.id) > 0
      ORDER BY attempts DESC
      LIMIT $1`,
    [limit]
  );
  res.json({ users: rows });
});

// Live server logs from the in-memory ring buffer.
// Use ?sinceId=<n> for incremental polling. Optional ?level=info|warn|error|all and ?q=<text>.
router.get("/logs", requireAuth(["admin"]), async (req, res) => {
  const { getLogs } = await import("../log-buffer.js");
  const sinceId = parseInt(req.query.sinceId || "0", 10) || 0;
  const level = String(req.query.level || "all");
  const q = String(req.query.q || "");
  const limit = Math.min(parseInt(req.query.limit || "500", 10) || 500, 1000);
  res.json(getLogs({ sinceId, level, q, limit }));
});

router.delete("/logs", requireAuth(["admin"]), async (req, res) => {
  const { clearLogs } = await import("../log-buffer.js");
  clearLogs();
  res.json({ ok: true });
});

router.get("/reports", requireAuth(["admin"]), async (req, res) => {
  const { page, pageSize, offset } = pagination(req);
  // Default to "open" so admins see fresh reports first; pass status=all to see everything.
  const status = String(req.query.status || "open");
  const q = String(req.query.q || "").trim();
  const params = [];
  let where = "1=1";
  if (status !== "all") {
    params.push(status);
    where += ` AND r.status=$${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where += ` AND (r.reason ILIKE $${i} OR c.title ILIKE $${i} OR u.username ILIKE $${i})`;
  }
  const { rows: countRow } = await query(
    `SELECT COUNT(*)::int AS n FROM reports r
       JOIN cases c ON c.id=r.case_id JOIN users u ON u.id=r.user_id
       WHERE ${where}`,
    params
  );
  const total = countRow[0].n;
  params.push(pageSize, offset);
  const { rows } = await query(
    `SELECT r.id, r.reason, r.created_at, r.status, r.action_note, r.actioned_at,
            c.id AS case_id, c.title, c.specialty, u.username
       FROM reports r JOIN cases c ON c.id=r.case_id JOIN users u ON u.id=r.user_id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({
    items: rows,
    reports: rows, // backwards-compatible alias
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

// Admin can mark a report as actioned or dismissed (or re-open it).
router.patch("/reports/:id", requireAuth(["admin"]), async (req, res) => {
  const status = String(req.body.status || "");
  if (!["open", "actioned", "dismissed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const note = (req.body.note || "").toString().trim() || null;
  await query(
    `UPDATE reports SET status=$1, actioned_by=$2,
            actioned_at = CASE WHEN $1='open' THEN NULL ELSE NOW() END,
            action_note=$3
       WHERE id=$4`,
    [status, req.user.id, note, req.params.id]
  );
  res.json({ ok: true });
});

// All users (students + doctors) with attempt stats and ban info
router.get("/all-users", requireAuth(["admin"]), async (req, res) => {
  const { page, pageSize, offset } = pagination(req);
  const q = String(req.query.q || "").trim();
  const roleFilter = String(req.query.role || "all");
  const params = [];
  let where = "u.role IN ('student','doctor')";
  if (roleFilter === "student" || roleFilter === "doctor") {
    params.push(roleFilter);
    where += ` AND u.role=$${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where += ` AND (u.username ILIKE $${i} OR u.full_name ILIKE $${i} OR u.email ILIKE $${i})`;
  }
  const { rows: countRow } = await query(
    `SELECT COUNT(*)::int AS n FROM users u WHERE ${where}`, params
  );
  const total = countRow[0].n;
  params.push(pageSize, offset);
  const { rows } = await query(
    `SELECT u.id, u.email, u.username, u.full_name, u.role, u.country,
            u.created_at, u.last_login, u.ban_until, u.ban_reason,
            dp.status AS doctor_status,
            (SELECT COUNT(*)::int FROM responses r WHERE r.user_id=u.id) AS attempts,
            (SELECT COUNT(DISTINCT r2.case_id)::int FROM responses r2 WHERE r2.user_id=u.id) AS unique_cases,
            (SELECT MAX(r3.created_at) FROM responses r3 WHERE r3.user_id=u.id) AS last_attempt
       FROM users u
       LEFT JOIN doctor_profiles dp ON dp.user_id = u.id AND u.role = 'doctor'
       WHERE ${where}
       ORDER BY u.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ users: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

// Ban a user (pass duration_hours or duration_days, or permanent=true)
router.post("/users/:id/ban", requireAuth(["admin"]), async (req, res) => {
  const reason = String(req.body.reason || "").trim() || null;
  const permanent = req.body.permanent === true || req.body.permanent === "true";
  const hours = parseInt(req.body.duration_hours || "0", 10);
  const days = parseInt(req.body.duration_days || "0", 10);
  const totalHours = hours + days * 24;
  const banUntil = permanent ? new Date("9999-12-31") : (totalHours > 0 ? new Date(Date.now() + totalHours * 3600000) : null);
  if (!banUntil) return res.status(400).json({ error: "Specify duration or permanent=true" });
  await query(
    `UPDATE users SET ban_until=$1, ban_reason=$2 WHERE id=$3 AND role <> 'admin'`,
    [banUntil.toISOString(), reason, req.params.id]
  );
  const label = permanent ? "permanently" : `until ${banUntil.toLocaleDateString()}`;
  await notify(req.params.id, "system", "Account suspended",
    `Your account has been suspended ${label}.${reason ? ` Reason: ${reason}` : ""}`, "/");
  res.json({ ok: true });
});

// Unban a user
router.post("/users/:id/unban", requireAuth(["admin"]), async (req, res) => {
  await query(`UPDATE users SET ban_until=NULL, ban_reason=NULL WHERE id=$1`, [req.params.id]);
  await notify(req.params.id, "system", "Account unsuspended", "Your account suspension has been lifted.", "/");
  res.json({ ok: true });
});

// Send a warning / custom message notification to a user
router.post("/users/:id/warn", requireAuth(["admin"]), async (req, res) => {
  // Accepts { title, message } (preferred) or legacy { message } only.
  // Sent as kind="warning" so the client can show it as a center-screen popup
  // the next time the target user opens any page.
  const title = String(req.body.title || "").trim() || "Message from admin";
  const message = String(req.body.message || req.body.description || "").trim();
  if (!message) return res.status(400).json({ error: "Message is required" });
  await notify(req.params.id, "warning", title, message, "/");
  res.json({ ok: true });
});

// Send an email to a user's registered address (subject + body).
router.post("/users/:id/email", requireAuth(["admin"]), async (req, res) => {
  const subject = String(req.body.subject || req.body.title || "").trim();
  const body = String(req.body.body || req.body.description || req.body.message || "").trim();
  if (!subject) return res.status(400).json({ error: "Subject is required" });
  if (!body) return res.status(400).json({ error: "Body is required" });
  const { rows } = await query(`SELECT id, email, full_name, username FROM users WHERE id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  if (!rows[0].email) return res.status(400).json({ error: "User has no email on file" });
  if (!isMailerConfigured()) {
    return res.status(503).json({ error: "Email is not configured on this server (missing SMTP_*)" });
  }
  try {
    const text = body;
    const html = `<div style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#11141A;line-height:1.55;font-size:14.5px;white-space:pre-wrap;">${
      body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
    }</div>`;
    await sendMail({ to: rows[0].email, subject, text, html });
    res.json({ ok: true, sentTo: rows[0].email });
  } catch (e) {
    res.status(500).json({ error: e.message || "Email send failed" });
  }
});

// Delete a user account
router.delete("/users/:id", requireAuth(["admin"]), async (req, res) => {
  const { rows } = await query(`SELECT id, role FROM users WHERE id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  if (rows[0].role === "admin") return res.status(403).json({ error: "Cannot delete an admin account" });
  await query(`DELETE FROM users WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// Account delete requests
router.get("/account-delete-requests", requireAuth(["admin"]), async (req, res) => {
  const { page, pageSize, offset } = pagination(req);
  const status = String(req.query.status || "pending");
  const params = [];
  let where = "1=1";
  if (status !== "all") {
    params.push(status);
    where += ` AND adr.status=$${params.length}`;
  }
  const { rows: countRow } = await query(
    `SELECT COUNT(*)::int AS n FROM account_delete_requests adr WHERE ${where}`, params
  );
  const total = countRow[0].n;
  params.push(pageSize, offset);
  const { rows } = await query(
    `SELECT adr.id, adr.reason, adr.status, adr.admin_note, adr.created_at,
            u.id AS user_id, u.username, u.full_name, u.email, u.role, u.avatar_url,
            d.full_name AS decided_by_name
       FROM account_delete_requests adr
       JOIN users u ON u.id=adr.user_id
       LEFT JOIN users d ON d.id=adr.decided_by
       WHERE ${where}
       ORDER BY adr.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ requests: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.patch("/account-delete-requests/:id", requireAuth(["admin"]), async (req, res) => {
  const decision = String(req.body.decision || "");
  if (!["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ error: "decision must be approved or rejected" });
  }
  const adminNote = String(req.body.admin_note || "").trim() || null;
  const { rows } = await query(
    `SELECT adr.id, adr.user_id FROM account_delete_requests adr WHERE adr.id=$1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Request not found" });
  await query(
    `UPDATE account_delete_requests SET status=$1, decided_by=$2, decided_at=NOW(), admin_note=$3 WHERE id=$4`,
    [decision, req.user.id, adminNote, req.params.id]
  );
  if (decision === "approved") {
    await query(`DELETE FROM users WHERE id=$1`, [rows[0].user_id]);
  } else {
    await notify(rows[0].user_id, "system", "Account deletion request rejected",
      adminNote || "Your account deletion request was reviewed and declined.", "/settings");
  }
  res.json({ ok: true });
});

export default router;
