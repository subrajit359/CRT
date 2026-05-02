import webpush from "web-push";
import { query } from "./db.js";

let configured = false;
let publicKey = null;

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@reasonal.local";

async function getOrCreateVapidKeys() {
  const { rows } = await query(
    `SELECT key, value FROM app_config WHERE key IN ('vapid_public_key', 'vapid_private_key')`
  );
  let pub = rows.find((r) => r.key === "vapid_public_key")?.value || null;
  let priv = rows.find((r) => r.key === "vapid_private_key")?.value || null;
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey;
    priv = keys.privateKey;
    await query(
      `INSERT INTO app_config (key, value) VALUES ('vapid_public_key', $1)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [pub]
    );
    await query(
      `INSERT INTO app_config (key, value) VALUES ('vapid_private_key', $1)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [priv]
    );
    console.log("[push] generated new VAPID keys (stored in app_config)");
  }
  return { pub, priv };
}

export async function ensurePushConfigured() {
  if (configured) return publicKey;
  const { pub, priv } = await getOrCreateVapidKeys();
  webpush.setVapidDetails(VAPID_SUBJECT, pub, priv);
  publicKey = pub;
  configured = true;
  return publicKey;
}

export async function getPublicKey() {
  return await ensurePushConfigured();
}

export async function saveSubscription(userId, sub, userAgent) {
  if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error("Invalid subscription");
  }
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id=EXCLUDED.user_id,
           p256dh=EXCLUDED.p256dh,
           auth=EXCLUDED.auth,
           user_agent=EXCLUDED.user_agent,
           last_used_at=NOW()`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent || null]
  );
}

export async function removeSubscription(endpoint) {
  await query(`DELETE FROM push_subscriptions WHERE endpoint=$1`, [endpoint]);
}

export async function listSubscriptionsForUser(userId) {
  const { rows } = await query(
    `SELECT id, endpoint, user_agent, created_at, last_used_at
       FROM push_subscriptions WHERE user_id=$1 ORDER BY last_used_at DESC`,
    [userId]
  );
  return rows;
}

export async function getPrefs(userId) {
  const { rows } = await query(
    `SELECT push_on, kinds FROM notification_prefs WHERE user_id=$1`,
    [userId]
  );
  if (rows[0]) return { push_on: rows[0].push_on, kinds: rows[0].kinds || {} };
  return { push_on: true, kinds: {} };
}

export async function setPrefs(userId, { push_on, kinds }) {
  const current = await getPrefs(userId);
  const next = {
    push_on: typeof push_on === "boolean" ? push_on : current.push_on,
    kinds: kinds && typeof kinds === "object" ? kinds : current.kinds,
  };
  await query(
    `INSERT INTO notification_prefs (user_id, push_on, kinds, updated_at)
     VALUES ($1,$2,$3::jsonb,NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET push_on=EXCLUDED.push_on,
           kinds=EXCLUDED.kinds,
           updated_at=NOW()`,
    [userId, next.push_on, JSON.stringify(next.kinds)]
  );
  return next;
}

// Best-effort push fanout. Never throws to caller.
export async function sendPushToUser(userId, payload) {
  try {
    await ensurePushConfigured();
    const prefs = await getPrefs(userId);
    if (prefs.push_on === false) return { sent: 0, skipped: "user_disabled" };
    if (payload?.kind && prefs.kinds && prefs.kinds[payload.kind] === false) {
      return { sent: 0, skipped: "kind_disabled" };
    }

    const { rows } = await query(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1`,
      [userId]
    );
    if (!rows.length) return { sent: 0 };

    const body = JSON.stringify({
      title: payload.title || "CrLearn",
      body: payload.body || "",
      link: payload.link || "/notifications",
      kind: payload.kind || "general",
      tag: payload.tag || payload.kind || "reasonal",
      icon: "/notification-icon.png",
      badge: "/notification-icon.png",
      ts: Date.now(),
    });

    const results = await Promise.allSettled(
      rows.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            { TTL: 60 * 60 * 24 }
          );
          await query(`UPDATE push_subscriptions SET last_used_at=NOW() WHERE id=$1`, [s.id]);
          return "ok";
        } catch (err) {
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            await query(`DELETE FROM push_subscriptions WHERE id=$1`, [s.id]);
            return "gone";
          }
          throw err;
        }
      })
    );
    const sent = results.filter((r) => r.status === "fulfilled").length;
    return { sent };
  } catch (err) {
    console.warn("[push] sendPushToUser failed:", err?.message || err);
    return { sent: 0, error: err?.message };
  }
}
