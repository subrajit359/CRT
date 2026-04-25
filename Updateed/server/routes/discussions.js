import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { notify } from "../notify.js";

const router = express.Router();

router.get("/case/:caseId", requireAuth(), async (req, res) => {
  const { rows: discs } = await query(
    `SELECT id, kind FROM discussions WHERE case_id=$1`, [req.params.caseId]
  );
  const out = {};
  for (const d of discs) {
    if (d.kind === "delete-request" && req.user.role === "student") continue;
    const { rows: msgs } = await query(
      `SELECT m.id, m.body, m.created_at, m.user_id,
              u.username, u.full_name, u.role, u.avatar_url,
              dp.specialty, dp.years_exp,
              sp.year_of_study
         FROM discussion_messages m
         JOIN users u ON u.id=m.user_id
         LEFT JOIN doctor_profiles dp ON dp.user_id=u.id
         LEFT JOIN student_profiles sp ON sp.user_id=u.id
         WHERE m.discussion_id=$1 ORDER BY m.created_at ASC`,
      [d.id]
    );
    out[d.kind] = { id: d.id, messages: msgs };
  }
  res.json(out);
});

router.post("/case/:caseId", requireAuth(), async (req, res) => {
  const body = String(req.body.body || "").trim();
  const kind = req.body.kind === "delete-request" ? "delete-request" : "doctor";
  if (!body) return res.status(400).json({ error: "Body required" });

  if (kind === "delete-request" && !["doctor", "admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Only doctors and admins can post in delete-request threads" });
  }

  await query(
    `INSERT INTO discussions (case_id, kind) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [req.params.caseId, kind]
  );
  const { rows: d } = await query(
    `SELECT id FROM discussions WHERE case_id=$1 AND kind=$2`,
    [req.params.caseId, kind]
  );
  await query(
    `INSERT INTO discussion_messages (discussion_id, user_id, body) VALUES ($1,$2,$3)`,
    [d[0].id, req.user.id, body]
  );

  const { rows: others } = await query(
    `SELECT DISTINCT user_id FROM discussion_messages WHERE discussion_id=$1 AND user_id <> $2`,
    [d[0].id, req.user.id]
  );
  for (const o of others) {
    await notify(o.user_id, "discussion_reply", "New reply in discussion", `${req.user.full_name} replied.`, `/discussion/${req.params.caseId}`);
  }

  const { rows: c } = await query(`SELECT uploader_id FROM cases WHERE id=$1`, [req.params.caseId]);
  if (c[0]?.uploader_id && c[0].uploader_id !== req.user.id) {
    const exists = others.some((o) => o.user_id === c[0].uploader_id);
    if (!exists) {
      await notify(c[0].uploader_id, "discussion_reply", "New reply on your case", `${req.user.full_name} replied.`, `/discussion/${req.params.caseId}`);
    }
  }
  res.json({ ok: true });
});

router.get("/delete-requests", requireAuth(["doctor", "admin"]), async (req, res) => {
  const { rows } = await query(
    `SELECT dr.id, dr.case_id, dr.reason, dr.status, dr.created_at,
            c.title AS case_title, c.specialty,
            u.id AS requester_id, u.username AS requester_username,
            u.full_name AS requester_name, u.avatar_url AS requester_avatar_url,
            (SELECT COUNT(*)::int FROM discussion_messages dm
                JOIN discussions d ON d.id = dm.discussion_id
              WHERE d.case_id = dr.case_id AND d.kind = 'delete-request') AS reply_count,
            (SELECT MAX(dm.created_at) FROM discussion_messages dm
                JOIN discussions d ON d.id = dm.discussion_id
              WHERE d.case_id = dr.case_id AND d.kind = 'delete-request') AS last_reply_at
       FROM delete_requests dr
       JOIN cases c ON c.id=dr.case_id
       JOIN users u ON u.id=dr.requested_by
       ORDER BY COALESCE((SELECT MAX(dm.created_at) FROM discussion_messages dm
                            JOIN discussions d ON d.id=dm.discussion_id
                          WHERE d.case_id=dr.case_id AND d.kind='delete-request'),
                          dr.created_at) DESC
       LIMIT 100`
  );
  res.json({ requests: rows });
});

export default router;
