import crypto from "crypto";
import { query } from "./db.js";

const SESSION_TTL_DAYS = 30;
const COOKIE_NAME = "rsn_sess";

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  await query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)`, [token, userId, expires]);
  return { token, expires };
}

const IS_PROD = process.env.NODE_ENV === "production";
const CROSS_SITE = process.env.COOKIE_CROSS_SITE === "1" || process.env.COOKIE_CROSS_SITE === "true";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: CROSS_SITE ? "none" : "lax",
  secure: CROSS_SITE ? true : IS_PROD,
  path: "/",
};

export function setSessionCookie(res, token, expires) {
  res.cookie(COOKIE_NAME, token, {
    ...COOKIE_OPTS,
    expires: new Date(expires),
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/", sameSite: COOKIE_OPTS.sameSite, secure: COOKIE_OPTS.secure });
}

export async function getUserFromRequest(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  const { rows } = await query(
    `SELECT u.id, u.email, u.username, u.full_name, u.role, u.country, u.avatar_url
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token=$1 AND s.expires_at > NOW()`,
    [token]
  );
  const user = rows[0] || null;
  if (user) {
    query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`, [user.id]).catch(() => {});
  }
  return user;
}

export function requireAuth(roles) {
  return async (req, res, next) => {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Auth required" });
    if (roles && !roles.includes(user.role)) return res.status(403).json({ error: "Forbidden" });
    if (user.role === "doctor") {
      const { rows } = await query(`SELECT status FROM doctor_profiles WHERE user_id=$1`, [user.id]);
      if (!rows[0] || rows[0].status !== "approved") {
        return res.status(403).json({ error: "Doctor account pending approval" });
      }
    }
    req.user = user;
    next();
  };
}

export async function destroySession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) await query(`DELETE FROM sessions WHERE token=$1`, [token]);
}
