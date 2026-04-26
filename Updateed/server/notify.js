import { EventEmitter } from "events";
import { query } from "./db.js";
import { sendPushToUser } from "./push.js";

export const notifyBus = new EventEmitter();
notifyBus.setMaxListeners(0);

export async function notify(userId, kind, title, body, link) {
  if (!userId) return;
  const { rows } = await query(
    `INSERT INTO notifications (user_id, kind, title, body, link)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, kind, title, body, link, created_at`,
    [userId, kind, title, body || null, link || null]
  );
  const inserted = rows[0];

  // Stream to any active SSE listeners (best-effort, non-blocking).
  try { notifyBus.emit(`user:${userId}`, inserted); } catch {}

  // Fan out to web push devices (best-effort, non-blocking).
  sendPushToUser(userId, { kind, title, body, link, tag: kind }).catch(() => {});
}
