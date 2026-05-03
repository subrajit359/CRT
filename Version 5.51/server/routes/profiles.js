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
    // ── v2: Fetch all doctor profile data in parallel ─────────────────────
    const [
      { rows: dp },
      { rows: uploaded },
      { rows: verifs },
      { rows: discCount },
    ] = await Promise.all([
      query(
        `SELECT degree, specialty, years_exp, hospital, status FROM doctor_profiles WHERE user_id=$1`,
        [u.id]
      ),
      query(
        `SELECT id, title, specialty, created_at FROM cases WHERE uploader_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,
        [u.id]
      ),
      query(
        `SELECT v.action, v.reason, v.created_at, c.id AS case_id, c.title, c.specialty
           FROM case_verifications v JOIN cases c ON c.id=v.case_id
           WHERE v.doctor_id=$1 ORDER BY v.created_at DESC LIMIT 50`,
        [u.id]
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM discussion_messages WHERE user_id=$1`, [u.id]
      ),
    ]);

    return res.json({
      user: u,
      doctor: dp[0] || null,
      uploaded,
      verifications: verifs,
      discussionContributions: discCount[0].n,
    });
  }

  if (u.role === "student") {
    // ── v2: Fetch student profile + stats in parallel ─────────────────────
    const [{ rows: sp }, { rows: stats }, { rows: achRows }] = await Promise.all([
      query(
        `SELECT year_of_study, global_level, specialty_levels, show_scores, COALESCE(xp, 0) AS xp FROM student_profiles WHERE user_id=$1`,
        [u.id]
      ),
      query(
        `SELECT COUNT(*)::int AS attempts, AVG(score)::float AS avg_score FROM responses WHERE user_id=$1`,
        [u.id]
      ),
      query(
        `SELECT key, unlocked_at FROM achievements WHERE user_id=$1 ORDER BY unlocked_at ASC`,
        [u.id]
      ),
    ]);

    const showScores = !!(sp[0] && sp[0].show_scores);
    return res.json({
      user: u,
      student: sp[0] || null,
      attempts: stats[0].attempts,
      averageScore: showScores ? stats[0].avg_score : null,
      showScores,
      xp: sp[0]?.xp ?? 0,
      achievements: achRows,
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
  if (req.user.role === "student" && req.body.yearOfStudy !== undefined) {
    await query(
      `UPDATE student_profiles SET year_of_study=$1 WHERE user_id=$2`,
      [req.body.yearOfStudy || null, req.user.id]
    );
  }
  if (req.user.role === "doctor") {
    const { degree, specialty, yearsExp, hospital } = req.body;
    const fields = [];
    const vals = [];
    if (degree !== undefined) { fields.push(`degree=$${vals.push(degree)}`); }
    if (specialty !== undefined) { fields.push(`specialty=$${vals.push(specialty)}`); }
    if (yearsExp !== undefined) { fields.push(`years_exp=$${vals.push(yearsExp)}`); }
    if (hospital !== undefined) { fields.push(`hospital=$${vals.push(hospital)}`); }
    if (fields.length) {
      vals.push(req.user.id);
      await query(
        `UPDATE doctor_profiles SET ${fields.join(",")} WHERE user_id=$${vals.length}`,
        vals
      );
    }
  }
  if (req.body.fullName !== undefined) {
    await query(
      `UPDATE users SET full_name=$1 WHERE id=$2`,
      [req.body.fullName.trim(), req.user.id]
    );
  }
  if (req.body.country !== undefined) {
    await query(
      `UPDATE users SET country=$1 WHERE id=$2`,
      [req.body.country || null, req.user.id]
    );
  }
  res.json({ ok: true });
});

router.post("/me/avatar", requireAuth(), upload.single("avatar"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  if (!cloudinaryReady()) return res.status(503).json({ error: "Image upload not configured" });

  const { rows: existing } = await query(
    `SELECT avatar_key FROM users WHERE id=$1`, [req.user.id]
  );
  const oldKey = existing[0]?.avatar_key;

  const result = await uploadBuffer(req.file.buffer, {
    folder: "avatars",
    public_id: `user_${req.user.id}`,
    overwrite: true,
    transformation: [{ width: 256, height: 256, crop: "fill", gravity: "face" }],
  });

  await query(
    `UPDATE users SET avatar_url=$1, avatar_key=$2 WHERE id=$3`,
    [result.secure_url, result.public_id, req.user.id]
  );

  if (oldKey && oldKey !== result.public_id) {
    destroyAsset(oldKey).catch(() => {});
  }

  res.json({ ok: true, avatarUrl: result.secure_url });
});

router.delete("/me/avatar", requireAuth(), async (req, res) => {
  const { rows } = await query(
    `SELECT avatar_key FROM users WHERE id=$1`, [req.user.id]
  );
  const key = rows[0]?.avatar_key;
  if (key) destroyAsset(key).catch(() => {});
  await query(
    `UPDATE users SET avatar_url=NULL, avatar_key=NULL WHERE id=$1`, [req.user.id]
  );
  res.json({ ok: true });
});

export default router;
