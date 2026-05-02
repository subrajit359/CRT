import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { notify } from "../notify.js";

const router = express.Router();

function pair(a, b) {
  return a < b ? [a, b] : [b, a];
}

async function getOrCreateThread(meId, otherId) {
  if (meId === otherId) throw new Error("Cannot message yourself");
  const [a, b] = pair(meId, otherId);
  const { rows } = await query(
    `SELECT id FROM dm_threads WHERE user_a=$1 AND user_b=$2`,
    [a, b]
  );
  if (rows[0]) return rows[0].id;
  const { rows: ins } = await query(
    `INSERT INTO dm_threads (user_a, user_b) VALUES ($1,$2) RETURNING id`,
    [a, b]
  );
  return ins[0].id;
}

router.get("/threads", requireAuth(), async (req, res) => {
  const me = req.user.id;
  const { rows } = await query(
    `SELECT t.id AS thread_id, t.last_at,
            o.id AS other_id, o.username AS other_username,
            o.full_name AS other_full_name, o.role AS other_role,
            o.avatar_url AS other_avatar_url,
            o.last_seen_at AS other_last_seen_at,
            (CASE WHEN o.typing_to_user_id=$1 AND o.typing_at > NOW() - INTERVAL '6 seconds'
                  THEN TRUE ELSE FALSE END) AS other_is_typing,
            (SELECT body FROM dm_messages WHERE thread_id=t.id ORDER BY created_at DESC LIMIT 1) AS last_body,
            (SELECT created_at FROM dm_messages WHERE thread_id=t.id ORDER BY created_at DESC LIMIT 1) AS last_created,
            (SELECT COUNT(*)::int FROM dm_messages
              WHERE thread_id=t.id AND sender_id <> $1 AND read_at IS NULL) AS unread
       FROM dm_threads t
       JOIN users o ON o.id = CASE WHEN t.user_a=$1 THEN t.user_b ELSE t.user_a END
       WHERE t.user_a=$1 OR t.user_b=$1
       ORDER BY t.last_at DESC
       LIMIT 200`,
    [me]
  );
  res.json({ threads: rows });
});

router.get("/unread", requireAuth(), async (req, res) => {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
       FROM dm_messages m
       JOIN dm_threads t ON t.id=m.thread_id
       WHERE (t.user_a=$1 OR t.user_b=$1)
         AND m.sender_id <> $1
         AND m.read_at IS NULL`,
    [req.user.id]
  );
  res.json({ unread: rows[0].n });
});

router.get("/with/:username", requireAuth(), async (req, res) => {
  const { rows: u } = await query(
    `SELECT id, username, full_name, role, avatar_url, last_seen_at,
            (CASE WHEN typing_to_user_id=$2 AND typing_at > NOW() - INTERVAL '6 seconds'
                  THEN TRUE ELSE FALSE END) AS is_typing
       FROM users WHERE username=$1`,
    [req.params.username, req.user.id]
  );
  if (!u[0]) return res.status(404).json({ error: "User not found" });
  if (u[0].id === req.user.id) return res.status(400).json({ error: "Cannot message yourself" });
  const threadId = await getOrCreateThread(req.user.id, u[0].id);

  // Read the thread's current disappearing-message setting so the client
  // knows the timer (NULL = OFF; otherwise integer seconds).
  const { rows: tRow } = await query(
    `SELECT disappear_seconds FROM dm_threads WHERE id=$1`,
    [threadId]
  );
  const disappearSeconds = tRow[0]?.disappear_seconds ?? null;

  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const before = req.query.before ? new Date(req.query.before) : null;
  const params = [threadId];
  let where = "thread_id=$1";
  if (before && !isNaN(before.getTime())) {
    params.push(before.toISOString());
    where += ` AND created_at < $${params.length}`;
  }
  params.push(limit + 1);
  const { rows: msgs } = await query(
    `SELECT id, sender_id, body, read_at, created_at, edited_at, deleted_at, expires_at
       FROM dm_messages WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
    params
  );
  const hasMore = msgs.length > limit;
  const trimmed = hasMore ? msgs.slice(0, limit) : msgs;
  trimmed.reverse();

  if (!before) {
    await query(
      `UPDATE dm_messages SET read_at=NOW()
        WHERE thread_id=$1 AND sender_id<>$2 AND read_at IS NULL`,
      [threadId, req.user.id]
    );
  }

  res.json({
    thread: { id: threadId, other: u[0], disappear_seconds: disappearSeconds },
    messages: trimmed,
    hasMore,
  });
});

router.post("/with/:username", requireAuth(), async (req, res) => {
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "Empty message" });
  if (body.length > 4000) return res.status(400).json({ error: "Message too long" });
  const { rows: u } = await query(
    `SELECT id, username, full_name FROM users WHERE username=$1`,
    [req.params.username]
  );
  if (!u[0]) return res.status(404).json({ error: "User not found" });
  if (u[0].id === req.user.id) return res.status(400).json({ error: "Cannot message yourself" });
  const threadId = await getOrCreateThread(req.user.id, u[0].id);
  // expires_at is computed from the thread's current disappear_seconds; if
  // the thread has the timer turned off it stays NULL and the message lives
  // forever. The subquery keeps this race-free for concurrent timer changes.
  const { rows: ins } = await query(
    `INSERT INTO dm_messages (thread_id, sender_id, body, expires_at)
     VALUES ($1, $2, $3,
       (SELECT CASE WHEN disappear_seconds IS NULL THEN NULL
                    ELSE NOW() + (disappear_seconds || ' seconds')::interval END
          FROM dm_threads WHERE id=$1))
     RETURNING id, sender_id, body, read_at, created_at, expires_at`,
    [threadId, req.user.id, body]
  );
  await query(`UPDATE dm_threads SET last_at=NOW() WHERE id=$1`, [threadId]);
  await notify(
    u[0].id,
    "dm",
    `Message from ${req.user.full_name}`,
    body.slice(0, 140),
    `/messages/u/${req.user.username}`
  );
  res.json({ ok: true, message: ins[0], thread_id: threadId });
});

// Either participant can change the disappearing-message timer for the
// thread. `seconds` may be null (OFF) or an integer in [60, 90 days].
router.patch("/with/:username/disappear", requireAuth(), async (req, res) => {
  const raw = req.body.seconds;
  let seconds = null;
  if (raw !== null && raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 60 || n > 90 * 24 * 3600) {
      return res.status(400).json({ error: "Invalid timer (60s – 90 days, or null for off)" });
    }
    seconds = n;
  }
  const { rows: u } = await query(`SELECT id FROM users WHERE username=$1`, [req.params.username]);
  if (!u[0]) return res.status(404).json({ error: "User not found" });
  if (u[0].id === req.user.id) return res.status(400).json({ error: "Cannot message yourself" });
  const threadId = await getOrCreateThread(req.user.id, u[0].id);
  await query(`UPDATE dm_threads SET disappear_seconds=$1 WHERE id=$2`, [seconds, threadId]);
  res.json({ ok: true, thread_id: threadId, disappear_seconds: seconds });
});

router.post("/with/:username/typing", requireAuth(), async (req, res) => {
  const { rows: u } = await query(`SELECT id FROM users WHERE username=$1`, [req.params.username]);
  if (!u[0]) return res.status(404).json({ error: "User not found" });
  if (u[0].id === req.user.id) return res.json({ ok: true });
  await query(
    `UPDATE users SET typing_to_user_id=$1, typing_at=NOW() WHERE id=$2`,
    [u[0].id, req.user.id]
  );
  res.json({ ok: true });
});

// Edit own DM
router.patch("/msg/:id", requireAuth(), async (req, res) => {
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "Message cannot be empty" });
  if (body.length > 4000) return res.status(400).json({ error: "Message too long" });
  const { rows } = await query(
    `SELECT id, sender_id, deleted_at FROM dm_messages WHERE id=$1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Message not found" });
  if (rows[0].sender_id !== req.user.id) return res.status(403).json({ error: "Not your message" });
  if (rows[0].deleted_at) return res.status(400).json({ error: "Cannot edit a deleted message" });
  const { rows: updated } = await query(
    `UPDATE dm_messages SET body=$1, edited_at=NOW() WHERE id=$2
     RETURNING id, sender_id, body, read_at, created_at, edited_at, deleted_at`,
    [body, req.params.id]
  );
  res.json({ ok: true, message: updated[0] });
});

// Delete own DM (soft-delete)
router.delete("/msg/:id", requireAuth(), async (req, res) => {
  const { rows } = await query(
    `SELECT id, sender_id, deleted_at FROM dm_messages WHERE id=$1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Message not found" });
  if (rows[0].sender_id !== req.user.id) return res.status(403).json({ error: "Not your message" });
  if (rows[0].deleted_at) return res.status(400).json({ error: "Already deleted" });
  const { rows: updated } = await query(
    `UPDATE dm_messages SET deleted_at=NOW() WHERE id=$1
     RETURNING id, sender_id, body, read_at, created_at, edited_at, deleted_at`,
    [req.params.id]
  );
  res.json({ ok: true, message: updated[0] });
});

router.post("/with/:username/read", requireAuth(), async (req, res) => {
  const { rows: u } = await query(`SELECT id FROM users WHERE username=$1`, [req.params.username]);
  if (!u[0]) return res.status(404).json({ error: "User not found" });
  const [a, b] = pair(req.user.id, u[0].id);
  const { rows: t } = await query(
    `SELECT id FROM dm_threads WHERE user_a=$1 AND user_b=$2`,
    [a, b]
  );
  if (t[0]) {
    await query(
      `UPDATE dm_messages SET read_at=NOW()
        WHERE thread_id=$1 AND sender_id<>$2 AND read_at IS NULL`,
      [t[0].id, req.user.id]
    );
  }
  res.json({ ok: true });
});

export default router;
