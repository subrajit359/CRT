import crypto from "crypto";
import { query } from "./db.js";
import { cacheGet, cacheSet, cacheDel, cacheInvalidate } from "./cache.js";

const SESSION_TTL_DAYS = 30;
const COOKIE_NAME = "rsn_sess";

/* ── Session cache ──────────────────────────────────────────────────────────
 * Every authenticated request used to run a 1.5 s DB round-trip to validate
 * the session token.  We now cache the resolved user object for 60 s so that
 * burst traffic (page load fires 8-10 requests simultaneously) only hits the
 * DB once per minute per user instead of once per request.
 *
 * Cache is keyed by the raw session token (64-char hex, already unguessable).
 * On logout the token's cache entry is deleted immediately.
 */
const SESSION_CACHE_TTL = 60_000; // 60 seconds

/* ── last_seen_at throttle ───────────────────────────────────────────────────
 * Firing UPDATE users SET last_seen_at=NOW() on every API request is a costly
 * write.  We throttle it to once per 5 minutes per user using a local Map.
 */
const lastSeenWritten = new Map(); // userId → timestamp
const LAST_SEEN_INTERVAL = 5 * 60_000; // 5 minutes

/* ── Doctor status cache ────────────────────────────────────────────────────
 * requireAuth() ran a second SELECT on doctor_profiles for every request
 * made by a doctor.  Cache the approval status for 2 minutes.
 */
const DOCTOR_STATUS_TTL = 120_000; // 2 minutes

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  await query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)`, [token, userId, expires]);
  return { token, expires };
}

const IS_PROD = process.env.NODE_ENV === "production";
const CROSS_SITE = process.env.COOKIE_CROSS_SITE === "1" || process.env.COOKIE_CROSS_SITE === "true";
const ON_REPLIT = !!process.env.REPLIT_DOMAINS || !!process.env.REPL_ID;
const USE_SECURE = CROSS_SITE || IS_PROD || ON_REPLIT;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: USE_SECURE ? "none" : "lax",
  secure: USE_SECURE,
  path: "/",
};

export function setSessionCookie(res, token, expires) {
  res.cookie(COOKIE_NAME, token, { ...COOKIE_OPTS, expires: new Date(expires) });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/", sameSite: COOKIE_OPTS.sameSite, secure: COOKIE_OPTS.secure });
}

export async function getUserFromRequest(req) {
  let token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    const auth = req.headers["authorization"] || "";
    if (auth.startsWith("Bearer ")) token = auth.slice(7).trim();
  }
  if (!token) return null;

  const cacheKey = `sess:${token}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) {
    maybeUpdateLastSeen(cached.id);
    return cached;
  }

  const { rows } = await query(
    `SELECT u.id, u.email, u.username, u.full_name, u.role, u.country, u.avatar_url, u.ban_until, u.ban_reason
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token=$1 AND s.expires_at > NOW()`,
    [token]
  );
  const user = rows[0] || null;
  if (user) {
    cacheSet(cacheKey, user, SESSION_CACHE_TTL);
    maybeUpdateLastSeen(user.id);
  }
  return user;
}

function maybeUpdateLastSeen(userId) {
  const last = lastSeenWritten.get(userId) || 0;
  if (Date.now() - last < LAST_SEEN_INTERVAL) return;
  lastSeenWritten.set(userId, Date.now());
  query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`, [userId]).catch(() => {});
}

export function requireAuth(rolesOrOpts) {
  const opts =
    rolesOrOpts && !Array.isArray(rolesOrOpts) && typeof rolesOrOpts === "object"
      ? { roles: rolesOrOpts.roles, allowPending: !!rolesOrOpts.allowPending }
      : { roles: rolesOrOpts, allowPending: false };

  return async (req, res, next) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Auth required" });

    if (user.role !== "admin" && user.ban_until && new Date(user.ban_until) > new Date()) {
      const until = new Date(user.ban_until);
      const isPermanent = until.getFullYear() >= 9999;
      const msg = isPermanent
        ? `Your account has been suspended permanently.${user.ban_reason ? " Reason: " + user.ban_reason : ""}`
        : `Your account is suspended until ${until.toLocaleDateString()}.${user.ban_reason ? " Reason: " + user.ban_reason : ""}`;
      return res.status(403).json({ error: msg, banned: true });
    }

    if (opts.roles && !opts.roles.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (user.role === "doctor" && !opts.allowPending) {
      const doctorKey = `doctor:status:${user.id}`;
      let status = cacheGet(doctorKey);
      if (status === undefined) {
        const { rows } = await query(`SELECT status FROM doctor_profiles WHERE user_id=$1`, [user.id]);
        status = rows[0]?.status || null;
        cacheSet(doctorKey, status, DOCTOR_STATUS_TTL);
      }
      if (status !== "approved") {
        return res.status(403).json({ error: "Doctor account pending approval" });
      }
    }

    req.user = user;
    next();
  };
}

export async function destroySession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    cacheDel(`sess:${token}`);
    await query(`DELETE FROM sessions WHERE token=$1`, [token]);
  }
}

export function invalidateUserSession(userId) {
  cacheInvalidate(`sess:`);
  cacheDel(`doctor:status:${userId}`);
}
