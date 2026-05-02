import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { notify } from "../notify.js";

const router = express.Router();

async function getOrCreateThread(doctorUserId) {
  const { rows } = await query(
    `SELECT id FROM support_threads WHERE doctor_user_id=$1`,
    [doctorUserId]
  );
  if (rows[0]) return rows[0].id;
  const { rows: ins } = await query(
    `INSERT INTO support_threads (doctor_user_id) VALUES ($1) RETURNING id`,
    [doctorUserId]
  );
  return ins[0].id;
}

async function markRead(userId, threadId) {
  await query(
    `INSERT INTO support_reads (user_id, thread_id, read_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, thread_id)
     DO UPDATE SET read_at = EXCLUDED.read_at`,
    [userId, threadId]
  );
}

const MESSAGE_SELECT = `
  SELECT m.id, m.sender_id, m.body, m.kind, m.meta, m.created_at, m.expires_at,
         u.username AS sender_username, u.full_name AS sender_full_name,
         u.role AS sender_role, u.avatar_url AS sender_avatar_url
    FROM support_messages m
    JOIN users u ON u.id = m.sender_id
`;

// Validate a disappearing-timer payload. Returns null (OFF), an integer
// number of seconds, or false if the input is invalid.
function parseDisappearSeconds(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 60 || n > 90 * 24 * 3600) return false;
  return n;
}

// Insert a support message with expires_at derived from the thread's current
// disappear_seconds setting. Returns the new row id.
async function insertSupportMessage(threadId, senderId, body, kind = "text", meta = null) {
  const { rows } = await query(
    `INSERT INTO support_messages (thread_id, sender_id, body, kind, meta, expires_at)
       VALUES ($1, $2, $3, $4, $5,
         (SELECT CASE WHEN disappear_seconds IS NULL THEN NULL
                      ELSE NOW() + (disappear_seconds || ' seconds')::interval END
            FROM support_threads WHERE id=$1))
     RETURNING id`,
    [threadId, senderId, body, kind, meta ? JSON.stringify(meta) : null]
  );
  return rows[0].id;
}

// ----- Doctor-side: their own application + chat -----

// Returns the pending/rejected doctor's profile status, optional reviewer
// note (rejection reason), and the support thread + messages.
router.get("/me", requireAuth({ roles: ["doctor"], allowPending: true }), async (req, res) => {
  const me = req.user.id;
  const { rows: dp } = await query(
    `SELECT status, reviewer_note, reviewed_at, degree, specialty, years_exp,
            license_number, hospital, proof_text
       FROM doctor_profiles WHERE user_id=$1`,
    [me]
  );
  const profile = dp[0] || null;
  const threadId = await getOrCreateThread(me);
  const { rows: tRow } = await query(
    `SELECT disappear_seconds FROM support_threads WHERE id=$1`,
    [threadId]
  );
  const { rows: msgs } = await query(
    `${MESSAGE_SELECT}
       WHERE m.thread_id = $1
       ORDER BY m.created_at ASC
       LIMIT 500`,
    [threadId]
  );
  await markRead(me, threadId);
  res.json({
    profile,
    thread: { id: threadId, disappear_seconds: tRow[0]?.disappear_seconds ?? null },
    messages: msgs,
  });
});

// Doctor changes the disappearing-message timer for their own support thread.
router.patch("/me/disappear", requireAuth({ roles: ["doctor"], allowPending: true }), async (req, res) => {
  const seconds = parseDisappearSeconds(req.body.seconds);
  if (seconds === false) return res.status(400).json({ error: "Invalid timer (60s – 90 days, or null for off)" });
  const threadId = await getOrCreateThread(req.user.id);
  await query(`UPDATE support_threads SET disappear_seconds=$1 WHERE id=$2`, [seconds, threadId]);
  res.json({ ok: true, thread_id: threadId, disappear_seconds: seconds });
});

router.post("/me/messages", requireAuth({ roles: ["doctor"], allowPending: true }), async (req, res) => {
  const me = req.user.id;
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "Empty message" });
  if (body.length > 4000) return res.status(400).json({ error: "Message too long" });

  const threadId = await getOrCreateThread(me);
  const newId = await insertSupportMessage(threadId, me, body, "text");
  await query(`UPDATE support_threads SET last_at = NOW() WHERE id = $1`, [threadId]);
  await markRead(me, threadId);

  // Notify every admin so any of them can pick it up.
  const { rows: admins } = await query(`SELECT id FROM users WHERE role='admin'`);
  for (const a of admins) {
    await notify(
      a.id,
      "doctor_support",
      `New message from ${req.user.full_name || req.user.username}`,
      body.slice(0, 140),
      `/admin/support/${threadId}`
    );
  }

  const { rows: msg } = await query(`${MESSAGE_SELECT} WHERE m.id = $1`, [newId]);
  res.json({ ok: true, message: msg[0] });
});

// Unread count for the doctor's own thread.
router.get("/me/unread", requireAuth({ roles: ["doctor"], allowPending: true }), async (req, res) => {
  const me = req.user.id;
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
       FROM support_messages m
       JOIN support_threads t ON t.id = m.thread_id
       LEFT JOIN support_reads r ON r.user_id = $1 AND r.thread_id = t.id
       WHERE t.doctor_user_id = $1
         AND m.sender_id <> $1
         AND (r.read_at IS NULL OR m.created_at > r.read_at)`,
    [me]
  );
  res.json({ unread: rows[0]?.n || 0 });
});

// ----- Admin-side: list + view + reply -----

router.get("/", requireAuth(["admin"]), async (req, res) => {
  const me = req.user.id;
  const { rows } = await query(
    `SELECT t.id AS thread_id, t.last_at,
            u.id AS doctor_id, u.username AS doctor_username,
            u.full_name AS doctor_full_name, u.email AS doctor_email,
            u.avatar_url AS doctor_avatar_url,
            dp.status AS doctor_status, dp.specialty,
            (SELECT body FROM support_messages WHERE thread_id=t.id ORDER BY created_at DESC LIMIT 1) AS last_body,
            (SELECT created_at FROM support_messages WHERE thread_id=t.id ORDER BY created_at DESC LIMIT 1) AS last_created,
            (SELECT COUNT(*)::int FROM support_messages m
                LEFT JOIN support_reads r ON r.user_id=$1 AND r.thread_id=t.id
                WHERE m.thread_id=t.id AND m.sender_id <> $1
                  AND (r.read_at IS NULL OR m.created_at > r.read_at)) AS unread
       FROM support_threads t
       JOIN users u ON u.id = t.doctor_user_id
       LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
       ORDER BY t.last_at DESC
       LIMIT 200`,
    [me]
  );
  res.json({ threads: rows });
});

router.get("/unread", requireAuth(["admin"]), async (req, res) => {
  const me = req.user.id;
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
       FROM support_messages m
       LEFT JOIN support_reads r ON r.user_id = $1 AND r.thread_id = m.thread_id
       WHERE m.sender_id <> $1
         AND (r.read_at IS NULL OR m.created_at > r.read_at)`,
    [me]
  );
  res.json({ unread: rows[0]?.n || 0 });
});

router.get("/:threadId", requireAuth(["admin"]), async (req, res) => {
  const me = req.user.id;
  const { rows: t } = await query(
    `SELECT t.id, t.doctor_user_id, t.disappear_seconds,
            u.username AS doctor_username, u.full_name AS doctor_full_name,
            u.email AS doctor_email, u.avatar_url AS doctor_avatar_url,
            dp.status AS doctor_status, dp.specialty, dp.license_number,
            dp.hospital, dp.proof_text, dp.years_exp,
            dp.reviewer_note, dp.reviewed_at
       FROM support_threads t
       JOIN users u ON u.id = t.doctor_user_id
       LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
       WHERE t.id = $1`,
    [req.params.threadId]
  );
  if (!t[0]) return res.status(404).json({ error: "Thread not found" });

  const { rows: msgs } = await query(
    `${MESSAGE_SELECT}
       WHERE m.thread_id = $1
       ORDER BY m.created_at ASC
       LIMIT 500`,
    [req.params.threadId]
  );
  await markRead(me, req.params.threadId);
  res.json({ thread: t[0], messages: msgs });
});

router.post("/:threadId/messages", requireAuth(["admin"]), async (req, res) => {
  const me = req.user.id;
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "Empty message" });
  if (body.length > 4000) return res.status(400).json({ error: "Message too long" });

  const { rows: t } = await query(
    `SELECT id, doctor_user_id FROM support_threads WHERE id=$1`,
    [req.params.threadId]
  );
  if (!t[0]) return res.status(404).json({ error: "Thread not found" });

  const newId = await insertSupportMessage(t[0].id, me, body, "text");
  await query(`UPDATE support_threads SET last_at = NOW() WHERE id = $1`, [t[0].id]);
  await markRead(me, t[0].id);

  await notify(
    t[0].doctor_user_id,
    "doctor_support",
    `Reply from ${req.user.full_name || req.user.username}`,
    body.slice(0, 140),
    `/inbox`
  );

  const { rows: msg } = await query(`${MESSAGE_SELECT} WHERE m.id = $1`, [newId]);
  res.json({ ok: true, message: msg[0] });
});

// Admin changes the disappearing-message timer for a specific support thread.
router.patch("/:threadId/disappear", requireAuth(["admin"]), async (req, res) => {
  const seconds = parseDisappearSeconds(req.body.seconds);
  if (seconds === false) return res.status(400).json({ error: "Invalid timer (60s – 90 days, or null for off)" });
  const { rows: t } = await query(
    `SELECT id FROM support_threads WHERE id=$1`,
    [req.params.threadId]
  );
  if (!t[0]) return res.status(404).json({ error: "Thread not found" });
  await query(`UPDATE support_threads SET disappear_seconds=$1 WHERE id=$2`, [seconds, t[0].id]);
  res.json({ ok: true, thread_id: t[0].id, disappear_seconds: seconds });
});

// Admin posts a "reapply" invitation into the thread. The doctor sees this
// message rendered as a button which opens a prefilled re-application form
// where they can correct their details and resubmit.
router.post("/:threadId/reapply-invite", requireAuth(["admin"]), async (req, res) => {
  const me = req.user.id;
  const note = String(req.body.note || "").trim();
  const adminBody = note
    ? `Please update your application with the following: ${note}`
    : "You can reapply with corrected details. Tap the button below to open a prefilled form.";

  const { rows: t } = await query(
    `SELECT t.id, t.doctor_user_id, dp.status AS doctor_status
       FROM support_threads t
       LEFT JOIN doctor_profiles dp ON dp.user_id = t.doctor_user_id
       WHERE t.id=$1`,
    [req.params.threadId]
  );
  if (!t[0]) return res.status(404).json({ error: "Thread not found" });

  const newId = await insertSupportMessage(
    t[0].id, me, adminBody, "reapply_invite", { note: note || null }
  );
  await query(`UPDATE support_threads SET last_at = NOW() WHERE id = $1`, [t[0].id]);
  await markRead(me, t[0].id);

  await notify(
    t[0].doctor_user_id,
    "doctor_support",
    "An admin invited you to reapply",
    note ? note.slice(0, 140) : "Open the inbox to update and resubmit your application.",
    `/inbox`
  );

  const { rows: msg } = await query(`${MESSAGE_SELECT} WHERE m.id = $1`, [newId]);
  res.json({ ok: true, message: msg[0] });
});

export default router;
