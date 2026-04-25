import express from "express";
import multer from "multer";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { notify } from "../notify.js";
import { uploadBuffer, destroyAsset, isConfigured as cloudinaryReady } from "../cloudinary.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|gif|webp|heic)$|^application\/pdf$/i.test(file.mimetype);
    cb(ok ? null : new Error("Only images and PDFs are allowed"), ok);
  },
});

const SPECIALTIES = [
  "General Medicine", "Cardiology", "Neurology", "Pediatrics", "Surgery",
  "Obstetrics & Gynecology", "Psychiatry", "Emergency Medicine", "Endocrinology",
  "Pulmonology", "Gastroenterology", "Nephrology", "Infectious Disease", "Dermatology",
];

router.get("/specialties", (req, res) => res.json({ specialties: SPECIALTIES }));

router.get("/", requireAuth(), async (req, res) => {
  const { specialty, level, q } = req.query;
  const params = [];
  let where = "deleted_at IS NULL";
  if (specialty) { params.push(specialty); where += ` AND specialty=$${params.length}`; }
  if (level) { params.push(parseInt(level, 10)); where += ` AND level=$${params.length}`; }
  if (q) { params.push(`%${q}%`); where += ` AND (title ILIKE $${params.length} OR body ILIKE $${params.length})`; }
  const { rows } = await query(
    `SELECT c.id, c.title, c.specialty, c.level, c.source, c.source_kind, c.created_at,
            u.username AS uploader_username, u.full_name AS uploader_name,
            (SELECT COUNT(*)::int FROM case_verifications WHERE case_id=c.id AND action='verify') AS verify_count,
            (SELECT COUNT(*)::int FROM case_verifications WHERE case_id=c.id AND action='unverify') AS unverify_count,
            (SELECT COUNT(*)::int FROM thumbs_up WHERE case_id=c.id) AS thumbs_count
       FROM cases c LEFT JOIN users u ON u.id=c.uploader_id
       WHERE ${where}
       ORDER BY c.created_at DESC LIMIT 100`,
    params
  );
  res.json({ cases: rows });
});

// Groups view: chunk this specialty+level into groups of 5 cases (sequential),
// annotate each case with whether the current user has attempted it, and which
// group is "active" (first not-yet-completed). Re-attempts don't create new
// response rows, so "attempted" reflects the very first attempt only.
router.get("/groups", requireAuth(), async (req, res) => {
  const specialty = String(req.query.specialty || "").trim();
  const level = parseInt(req.query.level, 10);
  if (!specialty || !level) {
    return res.status(400).json({ error: "specialty and level are required" });
  }
  const { rows: cases } = await query(
    `SELECT c.id, c.title, c.created_at,
            EXISTS(SELECT 1 FROM responses r WHERE r.case_id=c.id AND r.user_id=$3) AS attempted
       FROM cases c
       WHERE c.specialty=$1 AND c.level=$2 AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC, c.id ASC`,
    [specialty, level, req.user.id]
  );
  const GROUP_SIZE = 5;
  const groups = [];
  for (let i = 0; i < cases.length; i += GROUP_SIZE) {
    const slice = cases.slice(i, i + GROUP_SIZE);
    const attemptedCount = slice.filter((c) => c.attempted).length;
    groups.push({
      index: groups.length + 1,
      cases: slice.map((c) => ({ id: c.id, title: c.title, attempted: !!c.attempted })),
      total: slice.length,
      attemptedCount,
      // A group only counts as "completed" when it has the full 5 cases AND all 5 are attempted.
      // Partial groups (fewer than 5 cases at the tail) stay "in progress" so the student knows more cases will appear.
      completed: slice.length === GROUP_SIZE && attemptedCount === GROUP_SIZE,
    });
  }
  // Suggested group = first group that is not yet fully completed.
  const activeIdx = groups.findIndex((g) => !g.completed);
  res.json({
    specialty,
    level,
    groupSize: GROUP_SIZE,
    totalCases: cases.length,
    suggestedGroup: activeIdx >= 0 ? groups[activeIdx].index : null,
    groups,
  });
});

router.get("/random", requireAuth(), async (req, res) => {
  const { specialty, level } = req.query;
  const params = [];
  let where = "deleted_at IS NULL";
  if (specialty) { params.push(specialty); where += ` AND specialty=$${params.length}`; }
  if (level) { params.push(parseInt(level, 10)); where += ` AND level=$${params.length}`; }
  const { rows } = await query(
    `SELECT id FROM cases WHERE ${where} ORDER BY RANDOM() LIMIT 1`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: "No cases match" });
  res.json({ id: rows[0].id });
});

router.get("/:id", requireAuth(), async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, u.username AS uploader_username, u.full_name AS uploader_name,
            up.specialty AS uploader_specialty
       FROM cases c
       LEFT JOIN users u ON u.id=c.uploader_id
       LEFT JOIN doctor_profiles up ON up.user_id=u.id
       WHERE c.id=$1 AND c.deleted_at IS NULL`,
    [req.params.id]
  );
  const c = rows[0];
  if (!c) return res.status(404).json({ error: "Not found" });

  // Diagnosis fields are visible only to doctors and admins.
  const isClinician = req.user.role === "doctor" || req.user.role === "admin";
  if (!isClinician) {
    delete c.diagnosis;
    delete c.accepted_diagnoses;
    delete c.diagnosis_explanation;
  }

  const { rows: verifs } = await query(
    `SELECT v.id, v.action, v.reason, v.created_at, u.username, u.full_name,
            dp.specialty, dp.years_exp
       FROM case_verifications v
       JOIN users u ON u.id=v.doctor_id
       LEFT JOIN doctor_profiles dp ON dp.user_id=u.id
       WHERE v.case_id=$1 ORDER BY v.created_at DESC`,
    [c.id]
  );
  const { rows: thumbs } = await query(
    `SELECT COUNT(*)::int AS n FROM thumbs_up WHERE case_id=$1`, [c.id]
  );
  const { rows: myThumb } = await query(
    `SELECT 1 FROM thumbs_up WHERE case_id=$1 AND user_id=$2`, [c.id, req.user.id]
  );
  const { rows: attachments } = await query(
    `SELECT id, filename, mime_type, size_bytes, storage_url, kind, created_at
       FROM case_attachments WHERE case_id=$1 ORDER BY created_at ASC`,
    [c.id]
  );
  // Has the current user already submitted a graded answer for this case?
  // Used by the client to show "practice mode" UI (re-attempts don't count toward rating).
  const { rows: prevAttempt } = await query(
    `SELECT 1 FROM responses WHERE case_id=$1 AND user_id=$2 LIMIT 1`,
    [c.id, req.user.id]
  );
  res.json({
    case: { ...c, questions: c.questions },
    verifications: verifs,
    thumbs: { count: thumbs[0].n, mine: !!myThumb[0] },
    attachments,
    attempted: prevAttempt.length > 0,
  });
});

router.post("/", requireAuth(["doctor", "admin"]), async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const specialty = String(req.body.specialty || "").trim();
    const level = parseInt(req.body.level, 10) || 1;
    const body = String(req.body.body || "").trim();
    const source = String(req.body.source || "Original").trim();
    const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
    const diagnosis = String(req.body.diagnosis || "").trim();
    const acceptedDiagnoses = Array.isArray(req.body.acceptedDiagnoses)
      ? req.body.acceptedDiagnoses.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const diagnosisExplanation = req.body.diagnosisExplanation
      ? String(req.body.diagnosisExplanation).trim() || null
      : null;
    if (!title || !specialty || !body || questions.length === 0) {
      return res.status(400).json({ error: "Title, specialty, body, and at least one question required" });
    }
    if (!diagnosis) {
      return res.status(400).json({ error: "Diagnosis is required (used to grade student answers)" });
    }
    const sourceKind = req.user.role === "admin" ? "admin" : "doctor";
    const { rows } = await query(
      `INSERT INTO cases (title, specialty, level, body, questions, source, source_kind, uploader_id,
                          diagnosis, accepted_diagnoses, diagnosis_explanation)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb,$11) RETURNING id`,
      [title, specialty, level, body, JSON.stringify(questions), source, sourceKind, req.user.id,
       diagnosis, JSON.stringify(acceptedDiagnoses), diagnosisExplanation]
    );
    await query(
      `INSERT INTO case_verifications (case_id, doctor_id, action) VALUES ($1,$2,'verify')`,
      [rows[0].id, req.user.id]
    );
    await query(
      `INSERT INTO discussions (case_id, kind) VALUES ($1,'doctor') ON CONFLICT DO NOTHING`,
      [rows[0].id]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/:id", requireAuth(["doctor", "admin"]), async (req, res) => {
  try {
    const { rows } = await query(`SELECT id, uploader_id FROM cases WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const fields = [];
    const params = [];
    for (const k of ["title", "specialty", "level", "body", "diagnosis", "diagnosis_explanation"]) {
      const camel = k === "diagnosis_explanation" ? "diagnosisExplanation" : k;
      const v = req.body[k] !== undefined ? req.body[k] : req.body[camel];
      if (v !== undefined) {
        params.push(k === "level" ? parseInt(v, 10) : v);
        fields.push(`${k}=$${params.length}`);
      }
    }
    if (req.body.questions) {
      params.push(JSON.stringify(req.body.questions));
      fields.push(`questions=$${params.length}::jsonb`);
    }
    if (req.body.acceptedDiagnoses !== undefined) {
      const arr = Array.isArray(req.body.acceptedDiagnoses)
        ? req.body.acceptedDiagnoses.map((s) => String(s).trim()).filter(Boolean)
        : [];
      params.push(JSON.stringify(arr));
      fields.push(`accepted_diagnoses=$${params.length}::jsonb`);
    }
    if (!fields.length) return res.json({ ok: true });
    params.push(req.params.id);
    await query(`UPDATE cases SET ${fields.join(", ")}, updated_at=NOW() WHERE id=$${params.length}`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/thumbs-up", requireAuth(), async (req, res) => {
  await query(
    `INSERT INTO thumbs_up (user_id, case_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [req.user.id, req.params.id]
  );
  res.json({ ok: true });
});

router.post("/:id/report", requireAuth(), async (req, res) => {
  const reason = String(req.body.reason || "").trim();
  if (!reason) return res.status(400).json({ error: "Reason required" });
  await query(`INSERT INTO reports (user_id, case_id, reason) VALUES ($1,$2,$3)`, [req.user.id, req.params.id, reason]);
  res.json({ ok: true });
});

router.post("/:id/delete-request", requireAuth(["doctor", "admin"]), async (req, res) => {
  const reason = String(req.body.reason || "").trim();
  if (!reason) return res.status(400).json({ error: "Reason required" });
  const { rows } = await query(
    `INSERT INTO delete_requests (case_id, requested_by, reason) VALUES ($1,$2,$3) RETURNING id`,
    [req.params.id, req.user.id, reason]
  );
  await query(
    `INSERT INTO discussions (case_id, kind) VALUES ($1,'delete-request') ON CONFLICT DO NOTHING`,
    [req.params.id]
  );
  const { rows: admins } = await query(`SELECT id FROM users WHERE role='admin'`);
  for (const a of admins) {
    await notify(a.id, "delete_request", "Delete request opened", `Case ${req.params.id} flagged for deletion.`, `/discussion/${req.params.id}`);
  }
  res.json({ ok: true, id: rows[0].id });
});

router.post("/:id/attachments", requireAuth(["doctor", "admin"]), upload.array("files", 8), async (req, res) => {
  try {
    if (!cloudinaryReady()) return res.status(503).json({ error: "File uploads not configured" });
    const { rows: caseRow } = await query(
      `SELECT id, uploader_id FROM cases WHERE id=$1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!caseRow[0]) return res.status(404).json({ error: "Case not found" });
    if (req.user.role !== "admin" && caseRow[0].uploader_id !== req.user.id) {
      return res.status(403).json({ error: "Only the case uploader or an admin can add attachments" });
    }
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "No files provided" });

    const inserted = [];
    for (const f of files) {
      const isImage = f.mimetype.startsWith("image/");
      const isPdf = f.mimetype === "application/pdf";
      const kind = isImage ? "image" : isPdf ? "pdf" : "other";
      const resourceType = isImage ? "image" : "raw";
      const result = await uploadBuffer(f.buffer, {
        folder: `reasonal/cases/${req.params.id}`,
        resourceType,
        filename: f.originalname.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60),
      });
      const { rows: ins } = await query(
        `INSERT INTO case_attachments (case_id, uploader_id, filename, mime_type, size_bytes, storage_url, storage_key, kind)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, filename, mime_type, size_bytes, storage_url, kind, created_at`,
        [req.params.id, req.user.id, f.originalname, f.mimetype, f.size, result.secure_url, `${resourceType}:${result.public_id}`, kind]
      );
      inserted.push(ins[0]);
    }
    res.json({ ok: true, attachments: inserted });
  } catch (e) {
    console.error("[attachments] upload failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/attachments", requireAuth(), async (req, res) => {
  const { rows } = await query(
    `SELECT id, filename, mime_type, size_bytes, storage_url, kind, created_at
       FROM case_attachments WHERE case_id=$1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  res.json({ attachments: rows });
});

router.delete("/:id/attachments/:attId", requireAuth(["doctor", "admin"]), async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, c.uploader_id AS case_uploader
       FROM case_attachments a JOIN cases c ON c.id=a.case_id
       WHERE a.id=$1 AND a.case_id=$2`,
    [req.params.attId, req.params.id]
  );
  const att = rows[0];
  if (!att) return res.status(404).json({ error: "Attachment not found" });
  if (req.user.role !== "admin" && att.uploader_id !== req.user.id && att.case_uploader !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (att.storage_key) {
    const [resourceType, ...rest] = att.storage_key.split(":");
    await destroyAsset(rest.join(":"), resourceType);
  }
  await query(`DELETE FROM case_attachments WHERE id=$1`, [att.id]);
  res.json({ ok: true });
});

export default router;
