import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";

const router = express.Router();

router.get("/", requireAuth(), async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ users: [], cases: [] });
  const like = `%${q}%`;
  const { rows: users } = await query(
    `SELECT u.id, u.username, u.full_name, u.role, dp.specialty, sp.year_of_study, u.country
       FROM users u
       LEFT JOIN doctor_profiles dp ON dp.user_id=u.id
       LEFT JOIN student_profiles sp ON sp.user_id=u.id
       WHERE u.username ILIKE $1 OR u.full_name ILIKE $1
       ORDER BY u.role, u.username LIMIT 30`,
    [like]
  );
  const { rows: cases } = await query(
    `SELECT id, title, specialty, level FROM cases
       WHERE deleted_at IS NULL AND (title ILIKE $1 OR body ILIKE $1)
       ORDER BY created_at DESC LIMIT 30`,
    [like]
  );
  res.json({ users, cases });
});

export default router;
