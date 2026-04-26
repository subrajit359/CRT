import crypto from "crypto";
import bcrypt from "bcryptjs";
import { query } from "./db.js";
import { isMailerConfigured, sendMail, buildOtpEmail } from "./mailer.js";

const OTP_TTL_MIN = 10;
const RATE_LIMIT_PER_HOUR = 3;

function generateCode() {
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, "0");
}

export async function issueOtp(email, purpose) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS n FROM otp_codes WHERE email=$1 AND created_at > $2`,
    [email, since]
  );
  if (countRows[0].n >= RATE_LIMIT_PER_HOUR) {
    const err = new Error("Too many OTP requests. Try again later.");
    err.status = 429;
    throw err;
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 8);
  const expires = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();
  await query(
    `INSERT INTO otp_codes (email, code_hash, purpose, expires_at) VALUES ($1,$2,$3,$4)`,
    [email, codeHash, purpose, expires]
  );

  await deliverOtp(email, code, purpose);

  return { sent: true, ttlMinutes: OTP_TTL_MIN };
}

async function deliverOtp(email, code, purpose) {
  const banner = "═".repeat(60);
  if (isMailerConfigured()) {
    try {
      const { subject, text, html } = buildOtpEmail({ code, purpose, ttlMinutes: OTP_TTL_MIN });
      const info = await sendMail({ to: email, subject, text, html });
      console.log(`[OTP] sent via SMTP to=${email} purpose=${purpose} messageId=${info.messageId}`);
      return;
    } catch (e) {
      console.error(`[OTP] SMTP send failed for ${email}: ${e.message}. Falling back to console.`);
      console.log(`\n${banner}\n[OTP] purpose=${purpose}  to=${email}\n[OTP] CODE: ${code}   (valid ${OTP_TTL_MIN} min)\n${banner}\n`);
      return;
    }
  }
  console.log(`\n${banner}\n[OTP] (dev — SMTP not configured) purpose=${purpose}  to=${email}\n[OTP] CODE: ${code}   (valid ${OTP_TTL_MIN} min)\n${banner}\n`);
}

export async function consumeOtp(email, code, purpose) {
  const { rows } = await query(
    `SELECT id, code_hash, expires_at, consumed FROM otp_codes
       WHERE email=$1 AND purpose=$2
       ORDER BY created_at DESC LIMIT 5`,
    [email, purpose]
  );
  for (const r of rows) {
    if (r.consumed) continue;
    if (new Date(r.expires_at).getTime() < Date.now()) continue;
    const ok = await bcrypt.compare(code, r.code_hash);
    if (ok) {
      await query(`UPDATE otp_codes SET consumed=TRUE WHERE id=$1`, [r.id]);
      return true;
    }
  }
  return false;
}
