import nodemailer from "nodemailer";

let cached = null;
let cachedSig = "";

function readConfig() {
  const host = process.env.SMTP_HOST || "";
  const port = parseInt(process.env.SMTP_PORT || "0", 10);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from =
    process.env.SMTP_FROM ||
    (user ? `Reasonal <${user}>` : "");
  const secure =
    typeof process.env.SMTP_SECURE === "string"
      ? /^(1|true|yes|on)$/i.test(process.env.SMTP_SECURE)
      : port === 465;
  const ready = !!(host && port && user && pass && from);
  return { host, port, user, pass, from, secure, ready };
}

function getTransporter(cfg) {
  const sig = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.secure}`;
  if (cached && cachedSig === sig) return cached;
  cached = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  cachedSig = sig;
  return cached;
}

export function isMailerConfigured() {
  return readConfig().ready;
}

export async function verifyMailer() {
  const cfg = readConfig();
  if (!cfg.ready) return { ok: false, reason: "missing_config" };
  try {
    const t = getTransporter(cfg);
    await t.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export async function sendMail({ to, subject, text, html }) {
  const cfg = readConfig();
  if (!cfg.ready) {
    const err = new Error(
      "SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM."
    );
    err.code = "SMTP_NOT_CONFIGURED";
    throw err;
  }
  const t = getTransporter(cfg);
  return t.sendMail({ from: cfg.from, to, subject, text, html });
}

export function buildOtpEmail({ code, purpose, ttlMinutes }) {
  const verb =
    purpose === "register"
      ? "verify your email"
      : purpose === "reset"
        ? "reset your password"
        : "sign in";
  const label =
    purpose === "register"
      ? "verification"
      : purpose === "reset"
        ? "password reset"
        : "sign-in";
  const subject = `Reasonal — your ${label} code: ${code}`;
  const text = [
    `Your Reasonal code is: ${code}`,
    ``,
    `Use this code to ${verb}. It expires in ${ttlMinutes} minutes.`,
    ``,
    `If you didn't request this, you can safely ignore this email.`,
    ``,
    `— Reasonal`,
  ].join("\n");

  const html = `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:#FBFAF7;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#11141A;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBFAF7;padding:32px 16px;">
        <tr><td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #ECE7DD;border-radius:14px;overflow:hidden;">
            <tr><td style="padding:28px 28px 8px 28px;">
              <div style="display:inline-block;background:#1F9B71;color:#fff;width:32px;height:32px;border-radius:8px;text-align:center;line-height:32px;font-weight:700;font-family:'Fraunces',Georgia,serif;">R</div>
              <div style="display:inline-block;margin-left:10px;font-family:'Fraunces',Georgia,serif;font-size:18px;font-weight:600;vertical-align:middle;">Reasonal</div>
            </td></tr>
            <tr><td style="padding:8px 28px 0 28px;">
              <h1 style="font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:22px;margin:14px 0 6px 0;color:#11141A;">
                Your code to ${verb}
              </h1>
              <p style="margin:0;color:#4A5160;font-size:14.5px;line-height:1.55;">
                Enter this code in the Reasonal app. It expires in ${ttlMinutes} minutes.
              </p>
            </td></tr>
            <tr><td style="padding:22px 28px;">
              <div style="background:#F4F1EA;border:1px solid #ECE7DD;border-radius:10px;padding:18px 0;text-align:center;">
                <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:34px;letter-spacing:10px;font-weight:700;color:#11141A;">
                  ${code}
                </div>
              </div>
            </td></tr>
            <tr><td style="padding:0 28px 28px 28px;">
              <p style="margin:0;color:#7A8194;font-size:12.5px;line-height:1.55;">
                Didn't request this? You can safely ignore this email — no account changes were made.
              </p>
            </td></tr>
          </table>
          <div style="margin-top:14px;color:#7A8194;font-size:12px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">
            Reasonal — Trains thinking, not memory.
          </div>
        </td></tr>
      </table>
    </body>
  </html>`;

  return { subject, text, html };
}
