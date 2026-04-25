import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { notify } from "../notify.js";

const router = express.Router();

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
