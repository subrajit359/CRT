import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { notifyBus } from "../notify.js";

const router = express.Router();

router.get("/", requireAuth(), async (req, res) => {
  const { rows } = await query(
    `SELECT id, kind, title, body, link, read_at, created_at
       FROM notifications
       WHERE user_id=$1 AND read_at IS NULL
       ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ notifications: rows, unread: rows.length });
});

router.post("/read-all", requireAuth(), async (req, res) => {
  await query(`UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL`, [req.user.id]);
  // Tell open SSE listeners to update their badge to 0.
  try { notifyBus.emit(`user:${req.user.id}:unread`, 0); } catch {}
  res.json({ ok: true });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/:id/read", requireAuth(), async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid id" });
    await query(
      `UPDATE notifications SET read_at=NOW()
         WHERE id=$1 AND user_id=$2 AND read_at IS NULL`,
      [id, req.user.id]
    );
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL`,
      [req.user.id]
    );
    try { notifyBus.emit(`user:${req.user.id}:unread`, rows[0].n); } catch {}
    res.json({ ok: true, unread: rows[0].n });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Server-Sent Events stream for live notifications.
router.get("/stream", requireAuth(), async (req, res) => {
  const userId = req.user.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  function send(event, data) {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  }

  // Initial hello with current unread count.
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL`,
      [userId]
    );
    send("hello", { unread: rows[0].n, time: new Date().toISOString() });
  } catch {
    send("hello", { unread: 0 });
  }

  const onNotif = (payload) => send("notification", payload);
  const onUnread = (n) => send("unread", { unread: n });

  notifyBus.on(`user:${userId}`, onNotif);
  notifyBus.on(`user:${userId}:unread`, onUnread);

  // Heartbeat to keep proxies from killing the connection.
  const hb = setInterval(() => {
    try { res.write(`: ping ${Date.now()}\n\n`); } catch {}
  }, 25000);

  req.on("close", () => {
    clearInterval(hb);
    notifyBus.off(`user:${userId}`, onNotif);
    notifyBus.off(`user:${userId}:unread`, onUnread);
    try { res.end(); } catch {}
  });
});

export default router;
