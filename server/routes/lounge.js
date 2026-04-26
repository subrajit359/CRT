import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";

const router = express.Router();

router.get("/", requireAuth(["doctor", "admin"]), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const before = req.query.before ? new Date(req.query.before) : null;
  const params = [];
  let where = "";
  if (before && !isNaN(before.getTime())) {
    params.push(before.toISOString());
    where = `WHERE m.created_at < $${params.length}`;
  }
  params.push(limit);
  const { rows } = await query(
    `SELECT m.id, m.body, m.created_at,
            u.id AS user_id, u.username, u.full_name, u.role, u.avatar_url,
            dp.specialty
       FROM lounge_messages m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${params.length}`,
    params
  );
  rows.reverse();
  res.json({ messages: rows });
});

router.post("/", requireAuth(["doctor", "admin"]), async (req, res) => {
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "Empty message" });
  if (body.length > 4000) return res.status(400).json({ error: "Message too long" });
  const { rows } = await query(
    `INSERT INTO lounge_messages (user_id, body) VALUES ($1,$2)
     RETURNING id, body, created_at`,
    [req.user.id, body]
  );
  res.json({
    ok: true,
    message: {
      ...rows[0],
      user_id: req.user.id,
      username: req.user.username,
      full_name: req.user.full_name,
      role: req.user.role,
      avatar_url: req.user.avatar_url || null,
    },
  });
});

export default router;
