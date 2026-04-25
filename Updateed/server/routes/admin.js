import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { notify } from "../notify.js";
import { openai, loadPrompt } from "../openai.js";

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
  const model = process.env.AI_CASE_MODEL || process.env.AI_MODEL || "gemini-2.5-flash";

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

router.get("/doctors/pending", requireAuth(["admin"]), async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.email, u.username, u.full_name, u.country, u.created_at,
            dp.degree, dp.specialty, dp.years_exp, dp.license_number, dp.hospital, dp.proof_text, dp.status
       FROM users u JOIN doctor_profiles dp ON dp.user_id=u.id
       WHERE dp.status='pending' ORDER BY u.created_at DESC`
  );
  res.json({ doctors: rows });
});

router.patch("/doctors/:id/approve", requireAuth(["admin"]), async (req, res) => {
  await query(
    `UPDATE doctor_profiles SET status='approved', reviewed_at=NOW(), reviewer_note=$2 WHERE user_id=$1`,
    [req.params.id, req.body.note || null]
  );
  await notify(req.params.id, "doctor_approved", "Doctor account approved", "You can now log in and verify cases.", "/login");
  res.json({ ok: true });
});

router.patch("/doctors/:id/reject", requireAuth(["admin"]), async (req, res) => {
  await query(
    `UPDATE doctor_profiles SET status='rejected', reviewed_at=NOW(), reviewer_note=$2 WHERE user_id=$1`,
    [req.params.id, req.body.note || null]
  );
  await notify(req.params.id, "doctor_rejected", "Doctor application rejected", req.body.note || "Application rejected.", null);
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
  await notify(rows[0].requested_by, "delete_decision", "Delete decision", `Decision: ${decision}`, `/discussion/${rows[0].case_id}`);
  res.json({ ok: true });
});

router.get("/stats", requireAuth(["admin"]), async (req, res) => {
  const { rows: u } = await query(`SELECT role, COUNT(*)::int AS n FROM users GROUP BY role`);
  const { rows: c } = await query(`SELECT COUNT(*)::int AS n FROM cases WHERE deleted_at IS NULL`);
  const { rows: r } = await query(`SELECT COUNT(*)::int AS n FROM responses`);
  const { rows: pendingDocs } = await query(`SELECT COUNT(*)::int AS n FROM doctor_profiles WHERE status='pending'`);
  const { rows: openDr } = await query(`SELECT COUNT(*)::int AS n FROM delete_requests WHERE status='open'`);
  res.json({
    users: u,
    cases: c[0].n,
    responses: r[0].n,
    pendingDoctors: pendingDocs[0].n,
    openDeleteRequests: openDr[0].n,
  });
});

router.get("/reports", requireAuth(["admin"]), async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.reason, r.created_at, c.id AS case_id, c.title, u.username
       FROM reports r JOIN cases c ON c.id=r.case_id JOIN users u ON u.id=r.user_id
       ORDER BY r.created_at DESC LIMIT 100`
  );
  res.json({ reports: rows });
});

export default router;
