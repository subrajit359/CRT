import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { notify } from "../notify.js";

const router = express.Router();

router.get("/case/:caseId", requireAuth(), async (req, res) => {
  // Pagination: by default the server returns the most recent `limit` messages
  // for each discussion (ASC for display). Pass `?before=<iso>` to fetch the
  // page of older messages preceding `before`. `?kind=` narrows to one
  // discussion kind so older-page requests don't refetch the other tab.
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
  const before = req.query.before ? new Date(req.query.before) : null;
  const beforeOk = before && !isNaN(before.getTime());
  const kindFilter = req.query.kind ? String(req.query.kind) : null;

  const { rows: discs } = await query(
    `SELECT id, kind FROM discussions WHERE case_id=$1`, [req.params.caseId]
  );
  const out = {};
  for (const d of discs) {
    if (d.kind === "delete-request" && req.user.role === "student") continue;
    if (kindFilter && d.kind !== kindFilter) continue;

    const params = [d.id];
    let beforeClause = "";
    if (beforeOk) {
      params.push(before.toISOString());
      beforeClause = `AND m.created_at < $${params.length}`;
    }
    params.push(limit);
    const limitParam = `$${params.length}`;

    // Pull the latest N (optionally before a cursor) descending, then reverse
    // for display. `hasMore` is true when we filled the page, signalling the
    // client that an older page may exist.
    const { rows: msgsDesc } = await query(
      `SELECT m.id, m.body, m.created_at, m.user_id,
              u.username, u.full_name, u.role, u.avatar_url,
              dp.specialty, dp.years_exp,
              sp.year_of_study
         FROM discussion_messages m
         JOIN users u ON u.id=m.user_id
         LEFT JOIN doctor_profiles dp ON dp.user_id=u.id
         LEFT JOIN student_profiles sp ON sp.user_id=u.id
         WHERE m.discussion_id=$1 ${beforeClause}
         ORDER BY m.created_at DESC
         LIMIT ${limitParam}`,
      params
    );
    const msgs = msgsDesc.slice().reverse();
    out[d.kind] = { id: d.id, messages: msgs, hasMore: msgsDesc.length === limit };
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

  // If a doctor/admin posts in the delete-request thread and there is no open
  // tracked delete_requests row for this case yet, auto-open one so that the
  // admin dashboard's "Delete requests" table actually surfaces it. Without
  // this, posting in the Delete-request tab on the case discussion page only
  // wrote a chat message and the admin would never see the request.
  let openedDeleteRequest = false;
  if (kind === "delete-request" && ["doctor", "admin"].includes(req.user.role)) {
    const { rows: openDr } = await query(
      `SELECT id FROM delete_requests WHERE case_id=$1 AND status='open' LIMIT 1`,
      [req.params.caseId]
    );
    if (!openDr[0]) {
      await query(
        `INSERT INTO delete_requests (case_id, requested_by, reason) VALUES ($1,$2,$3)`,
        [req.params.caseId, req.user.id, body.slice(0, 1000)]
      );
      openedDeleteRequest = true;
      const { rows: admins } = await query(`SELECT id FROM users WHERE role='admin'`);
      for (const a of admins) {
        if (a.id === req.user.id) continue;
        await notify(
          a.id,
          "delete_request",
          "Delete request opened",
          `${req.user.full_name} flagged a case for deletion.`,
          `/discussion/${req.params.caseId}`
        );
      }
    }
  }

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
  res.json({ ok: true, openedDeleteRequest });
});

// Look up the most recent open delete_requests row for a given case.
// Used by the discussion page so admins can act on the request from there.
router.get("/delete-requests/by-case/:caseId", requireAuth(["doctor", "admin"]), async (req, res) => {
  const { rows } = await query(
    `SELECT id, case_id, requested_by, reason, status, created_at
       FROM delete_requests
      WHERE case_id=$1 AND status='open'
      ORDER BY created_at DESC LIMIT 1`,
    [req.params.caseId]
  );
  res.json({ request: rows[0] || null });
});

router.get("/delete-requests", requireAuth(["doctor", "admin"]), async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;
  const status = String(req.query.status || "open"); // open | all | approved | rejected | edit_instead
  const q = String(req.query.q || "").trim();
  const params = [];
  let where = "1=1";
  if (status !== "all") {
    params.push(status);
    where += ` AND dr.status=$${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where += ` AND (c.title ILIKE $${i} OR u.username ILIKE $${i} OR u.full_name ILIKE $${i} OR dr.reason ILIKE $${i})`;
  }
  const { rows: countRow } = await query(
    `SELECT COUNT(*)::int AS n FROM delete_requests dr
       JOIN cases c ON c.id=dr.case_id JOIN users u ON u.id=dr.requested_by
       WHERE ${where}`,
    params
  );
  const total = countRow[0].n;
  params.push(pageSize, offset);
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
       WHERE ${where}
       ORDER BY COALESCE((SELECT MAX(dm.created_at) FROM discussion_messages dm
                            JOIN discussions d ON d.id=dm.discussion_id
                          WHERE d.case_id=dr.case_id AND d.kind='delete-request'),
                          dr.created_at) DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({
    items: rows,
    requests: rows, // backwards-compatible alias
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

export default router;
