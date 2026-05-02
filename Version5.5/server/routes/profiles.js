import express from "express";
import multer from "multer";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { uploadBuffer, destroyAsset, isConfigured as cloudinaryReady } from "../cloudinary.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|gif|webp|heic)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Only image uploads are allowed"), ok);
  },
});

router.get("/:username", requireAuth(), async (req, res) => {
  const { rows } = await query(
    `SELECT id, username, full_name, role, country, created_at, avatar_url
       FROM users WHERE username=$1`,
    [req.params.username]
  );
  const u = rows[0];
  if (!u) return res.status(404).json({ error: "Not found" });

  if (u.role === "doctor") {
    const { rows: dp } = await query(
      `SELECT degree, specialty, years_exp, hospital, status FROM doctor_profiles WHERE user_id=$1`,
      [u.id]
    );
    const { rows: uploaded } = await query(
      `SELECT id, title, specialty, created_at FROM cases WHERE uploader_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,
      [u.id]
    );
    const { rows: verifs } = await query(
      `SELECT v.action, v.reason, v.created_at, c.id AS case_id, c.title, c.specialty
         FROM case_verifications v JOIN cases c ON c.id=v.case_id
         WHERE v.doctor_id=$1 ORDER BY v.created_at DESC LIMIT 50`,
      [u.id]
    );
    const { rows: discCount } = await query(
      `SELECT COUNT(*)::int AS n FROM discussion_messages WHERE user_id=$1`, [u.id]
    );
    return res.json({
      user: u,
      doctor: dp[0] || null,
      uploaded,
      verifications: verifs,
      discussionContributions: discCount[0].n,
    });
  }

  if (u.role === "student") {
    const { rows: sp } = await query(
      `SELECT year_of_study, global_level, specialty_levels, show_scores, COALESCE(xp, 0) AS xp FROM student_profiles WHERE user_id=$1`,
      [u.id]
    );
    const { rows: stats } = await query(
      `SELECT COUNT(*)::int AS attempts, AVG(score)::float AS avg_score FROM responses WHERE user_id=$1`,
      [u.id]
    );
    const showScores = !!(sp[0] && sp[0].show_scores);
    return res.json({
      user: u,
      student: sp[0] || null,
      attempts: stats[0].attempts,
      averageScore: showScores ? stats[0].avg_score : null,
      showScores,
      xp: sp[0]?.xp ?? 0,
    });
  }

  res.json({ user: u });
});

router.patch("/me", requireAuth(), async (req, res) => {
  if (req.user.role === "student" && req.body.showScores !== undefined) {
    await query(
      `UPDATE student_profiles SET show_scores=$1 WHERE user_id=$2`,
      [!!req.body.showScores, req.user.id]
    );
  }
  if (req.body.country !== undefined) {
    await query(`UPDATE users SET country=$1 WHERE id=$2`, [String(req.body.country).trim(), req.user.id]);
  }
  res.json({ ok: true });
});

router.post("/me/avatar", requireAuth(), upload.single("file"), async (req, res) => {
  try {
    if (!cloudinaryReady()) return res.status(503).json({ error: "Image uploads not configured" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { rows: prev } = await query(`SELECT avatar_key FROM users WHERE id=$1`, [req.user.id]);
    const result = await uploadBuffer(req.file.buffer, {
      folder: `reasonal/avatars/${req.user.id}`,
      resourceType: "image",
    });
    const newKey = `image:${result.public_id}`;
    await query(
      `UPDATE users SET avatar_url=$1, avatar_key=$2 WHERE id=$3`,
      [result.secure_url, newKey, req.user.id]
    );
    if (prev[0]?.avatar_key && prev[0].avatar_key !== newKey) {
      const [type, ...rest] = prev[0].avatar_key.split(":");
      await destroyAsset(rest.join(":"), type);
    }
    res.json({ ok: true, avatar_url: result.secure_url });
  } catch (e) {
    console.error("[avatar] failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/me/avatar", requireAuth(), async (req, res) => {
  const { rows } = await query(`SELECT avatar_key FROM users WHERE id=$1`, [req.user.id]);
  if (rows[0]?.avatar_key) {
    const [type, ...rest] = rows[0].avatar_key.split(":");
    await destroyAsset(rest.join(":"), type);
  }
  await query(`UPDATE users SET avatar_url=NULL, avatar_key=NULL WHERE id=$1`, [req.user.id]);
  res.json({ ok: true });
});

export default router;
