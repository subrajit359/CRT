import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";

const router = express.Router();

router.get("/", requireAuth(), async (req, res) => {
  const q = String(req.query.q || "").trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;
  // ?type lets the page request only one section paginated; default returns
  // the first page of both for the initial overview.
  const type = String(req.query.type || "both"); // both | users | cases
  if (!q) {
    return res.json({
      users: [], cases: [],
      usersTotal: 0, casesTotal: 0,
      page, pageSize,
    });
  }
  const like = `%${q}%`;

  let users = [], usersTotal = 0;
  if (type === "both" || type === "users") {
    const { rows: c } = await query(
      `SELECT COUNT(*)::int AS n FROM users WHERE username ILIKE $1 OR full_name ILIKE $1`,
      [like]
    );
    usersTotal = c[0].n;
    const r = await query(
      `SELECT u.id, u.username, u.full_name, u.role, dp.specialty, sp.year_of_study, u.country
         FROM users u
         LEFT JOIN doctor_profiles dp ON dp.user_id=u.id
         LEFT JOIN student_profiles sp ON sp.user_id=u.id
         WHERE u.username ILIKE $1 OR u.full_name ILIKE $1
         ORDER BY u.role, u.username
         LIMIT $2 OFFSET $3`,
      [like, pageSize, type === "users" ? offset : 0]
    );
    users = r.rows;
  }

  let cases = [], casesTotal = 0;
  if (type === "both" || type === "cases") {
    const { rows: c } = await query(
      `SELECT COUNT(*)::int AS n FROM cases
         WHERE deleted_at IS NULL AND (title ILIKE $1 OR body ILIKE $1)`,
      [like]
    );
    casesTotal = c[0].n;
    const r = await query(
      `SELECT id, title, specialty, level FROM cases
         WHERE deleted_at IS NULL AND (title ILIKE $1 OR body ILIKE $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
      [like, pageSize, type === "cases" ? offset : 0]
    );
    cases = r.rows;
  }

  res.json({
    users, cases,
    usersTotal, casesTotal,
    page, pageSize,
    usersTotalPages: Math.max(1, Math.ceil(usersTotal / pageSize)),
    casesTotalPages: Math.max(1, Math.ceil(casesTotal / pageSize)),
  });
});

export default router;
