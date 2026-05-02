import nodemailer from "nodemailer";

let cached = null;
let cachedSig = "";

function readSmtpConfig() {
  const host = process.env.SMTP_HOST || "";
  const port = parseInt(process.env.SMTP_PORT || "0", 10);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const rawFrom = process.env.SMTP_FROM || (user ? user : "");
  const from = /</.test(rawFrom) ? rawFrom : (rawFrom ? `CrLearn <${rawFrom}>` : "");
  const replyTo = process.env.SMTP_REPLY_TO || rawFrom || user;
  const secure =
    typeof process.env.SMTP_SECURE === "string"
      ? /^(1|true|yes|on)$/i.test(process.env.SMTP_SECURE)
      : port === 465;
  const ready = !!(host && port && user && pass && from);
  return { host, port, user, pass, from, replyTo, secure, ready };
}

function readBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY || "";
  const rawFrom = process.env.BREVO_FROM || process.env.SMTP_FROM || "";
  const fromEmailMatch = rawFrom.match(/<([^>]+)>/);
  const fromEmail = (fromEmailMatch ? fromEmailMatch[1] : rawFrom).trim();
  const fromNameMatch = rawFrom.match(/^([^<]+)</);
  const fromName = (fromNameMatch ? fromNameMatch[1] : "CrLearn").trim();
  const replyTo = process.env.SMTP_REPLY_TO || fromEmail;
  const ready = !!(apiKey && fromEmail);
  return { apiKey, fromEmail, fromName, replyTo, ready };
}

function getTransporter(cfg) {
  const sig = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.secure}`;
  if (cached && cachedSig === sig) return cached;
  cached = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
  cachedSig = sig;
  return cached;
}

export function isMailerConfigured() {
  return readBrevoConfig().ready || readSmtpConfig().ready;
}

export function mailerProvider() {
  if (readBrevoConfig().ready) return "brevo";
  if (readSmtpConfig().ready) return "smtp";
  return "none";
}

export async function verifyMailer() {
  const brevo = readBrevoConfig();
  if (brevo.ready) return { ok: true, provider: "brevo" };
  const cfg = readSmtpConfig();
  if (!cfg.ready) return { ok: false, reason: "missing_config" };
  try {
    const t = getTransporter(cfg);
    await t.verify();
    return { ok: true, provider: "smtp" };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function sendViaBrevo(cfg, { to, subject, text, html, headers }) {
  const body = {
    sender: { email: cfg.fromEmail, name: cfg.fromName },
    to: [{ email: to }],
    subject,
    htmlContent: html || (text ? `<pre style="font-family:inherit;white-space:pre-wrap">${text}</pre>` : undefined),
    textContent: text || undefined,
    replyTo: cfg.replyTo ? { email: cfg.replyTo } : undefined,
    headers: headers && Object.keys(headers).length ? headers : undefined,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": cfg.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json && (json.message || json.code) ? `Brevo ${res.status}: ${json.code || ""} ${json.message || ""}`.trim() : `Brevo ${res.status}`;
    throw new Error(msg);
  }
  return { messageId: json.messageId || `brevo-${Date.now()}` };
}

async function sendViaSmtp(cfg, { to, subject, text, html, headers }) {
  const t = getTransporter(cfg);
  const baseHeaders = {
    "List-Unsubscribe": `<mailto:${cfg.replyTo}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "Auto-Submitted": "auto-generated",
    Precedence: "transactional",
    "X-Entity-Ref-ID": `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
  return t.sendMail({
    from: cfg.from,
    replyTo: cfg.replyTo,
    to,
    subject,
    text,
    html,
    headers: { ...baseHeaders, ...(headers || {}) },
  });
}

export async function sendMail({ to, subject, text, html, headers }) {
  const brevo = readBrevoConfig();
  if (brevo.ready) {
    return sendViaBrevo(brevo, { to, subject, text, html, headers });
  }
  const smtp = readSmtpConfig();
  if (!smtp.ready) {
    const err = new Error(
      "Email is not configured. Set BREVO_API_KEY and BREVO_FROM, or SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM."
    );
    err.code = "MAILER_NOT_CONFIGURED";
    throw err;
  }
  return sendViaSmtp(smtp, { to, subject, text, html, headers });
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
  const subject = `Your CrLearn ${label} code`;
  const text = [
    `Your CrLearn code is: ${code}`,
    ``,
    `Use this code to ${verb}. It expires in ${ttlMinutes} minutes.`,
    ``,
    `If you didn't request this, you can safely ignore this email.`,
    ``,
    `— CrLearn`,
  ].join("\n");

  const html = `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:#FBFAF7;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#11141A;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBFAF7;padding:32px 16px;">
        <tr><td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #ECE7DD;border-radius:14px;overflow:hidden;">
            <tr><td style="padding:28px 28px 8px 28px;">
              <img src="${process.env.APP_URL || ""}/logo.png" alt="CrLearn" width="32" height="32" style="display:inline-block;vertical-align:middle;border-radius:8px;width:32px;height:32px;object-fit:contain;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block';" />
              <div style="display:none;background:#1F9B71;color:#fff;width:32px;height:32px;border-radius:8px;text-align:center;line-height:32px;font-weight:700;font-family:'Fraunces',Georgia,serif;vertical-align:middle;">C</div>
              <div style="display:inline-block;margin-left:10px;font-family:'Fraunces',Georgia,serif;font-size:18px;font-weight:600;vertical-align:middle;">CrLearn</div>
            </td></tr>
            <tr><td style="padding:8px 28px 0 28px;">
              <h1 style="font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:22px;margin:14px 0 6px 0;color:#11141A;">
                Your code to ${verb}
              </h1>
              <p style="margin:0;color:#4A5160;font-size:14.5px;line-height:1.55;">
                Enter this code in the CrLearn app. It expires in ${ttlMinutes} minutes.
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
            CrLearn — Trains thinking, not memory.
          </div>
        </td></tr>
      </table>
    </body>
  </html>`;

  return { subject, text, html };
}
