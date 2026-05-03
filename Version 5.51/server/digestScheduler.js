/**
 * digestScheduler.js — Weekly email + push digest for students.
 *
 * Every Monday at 09:00 UTC (configurable via app_config), each student
 * with ≥ 3 completed cases receives:
 *   • An HTML email showing readiness scores + top AI coaching tip + CTA
 *   • A web push notification summarising their top specialty readiness
 *
 * Admin API (wired in routes/admin.js):
 *   GET  /api/admin/digest/status      — settings + last run + student count
 *   POST /api/admin/digest/send-now    — manual trigger (runs in background)
 *   PATCH /api/admin/digest/settings   — toggle enabled, change hour/day
 *   GET  /api/admin/digest/runs        — last 20 run records
 */

import { randomUUID } from "node:crypto";
import { query } from "./db.js";
import { sendMail, isMailerConfigured } from "./mailer.js";
import { sendPushToUser, ensurePushConfigured } from "./push.js";

// ── Readiness helper (mirrors insights.js) ───────────────────────────────────
function computeReadiness(entries) {
  if (!entries || !entries.length) return 0;
  const sorted = [...entries].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  let wSum = 0, wTotal = 0;
  sorted.forEach((e, i) => {
    const w = Math.exp(-i * 0.25);
    wSum   += (e.score ?? 0) * w;
    wTotal += w;
  });
  return Math.round((wTotal > 0 ? wSum / wTotal : 0) / 10 * 100);
}

// ── Settings helpers ─────────────────────────────────────────────────────────
export async function getDigestSettings() {
  const { rows } = await query(
    `SELECT key, value FROM app_config
     WHERE key IN ('digest_enabled','digest_hour_utc','digest_day_utc')`
  );
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    enabled:  m.digest_enabled !== "false",
    hourUtc:  parseInt(m.digest_hour_utc  || "9", 10),
    dayUtc:   parseInt(m.digest_day_utc   || "1", 10), // 0=Sun 1=Mon … 6=Sat
  };
}

export async function setDigestSettings({ enabled, hourUtc, dayUtc } = {}) {
  const updates = [];
  if (enabled  !== undefined) updates.push(["digest_enabled",  String(enabled)]);
  if (hourUtc  !== undefined) updates.push(["digest_hour_utc", String(hourUtc)]);
  if (dayUtc   !== undefined) updates.push(["digest_day_utc",  String(dayUtc)]);
  for (const [key, value] of updates) {
    await query(
      `INSERT INTO app_config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
}

// ── Email template ────────────────────────────────────────────────────────────
function buildDigestEmail({ name, specialties, topTip, totalCases, streak, appUrl }) {
  const url   = appUrl || "https://crlearn.app";
  const top3  = [...specialties].sort((a, b) => b.readiness - a.readiness).slice(0, 3);
  const weak  = [...specialties].sort((a, b) => a.readiness - b.readiness)[0];

  const barRow = (s) => `
    <tr>
      <td style="padding:7px 0;font-size:13px;font-weight:600;color:#11141A;width:130px;white-space:nowrap;">
        ${s.specialty}
      </td>
      <td style="padding:7px 0 7px 12px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:7px;border-radius:99px;background:#E5E7EB;overflow:hidden;min-width:100px;">
            <div style="height:100%;width:${s.readiness}%;background:#059669;border-radius:99px;"></div>
          </div>
          <span style="font-size:13px;font-weight:700;color:#059669;min-width:34px;text-align:right;">
            ${s.readiness}%
          </span>
        </div>
      </td>
    </tr>`;

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FBFAF7;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#11141A;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBFAF7;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px;background:#ffffff;border:1px solid #ECE7DD;border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="padding:22px 28px 18px;border-bottom:1px solid #ECE7DD;">
          <div style="display:inline-flex;align-items:center;gap:10px;">
            <div style="background:#059669;color:#fff;width:32px;height:32px;border-radius:8px;
                        text-align:center;line-height:32px;font-weight:700;font-size:17px;
                        font-family:Georgia,serif;display:inline-block;">C</div>
            <span style="font-family:Georgia,serif;font-size:19px;font-weight:600;
                         color:#11141A;vertical-align:middle;">CrLearn</span>
          </div>
          <span style="float:right;font-size:11px;font-weight:700;letter-spacing:0.1em;
                       text-transform:uppercase;color:#059669;line-height:32px;">
            Weekly Digest
          </span>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:28px 28px 20px;">
          <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:22px;
                     font-weight:600;color:#11141A;line-height:1.3;">
            Good Monday, ${name}!
          </h1>
          <p style="margin:0;color:#4A5160;font-size:14.5px;line-height:1.65;">
            Here's your personalised weekly performance summary from CrLearn.
            ${totalCases} case${totalCases !== 1 ? "s" : ""} completed &nbsp;·&nbsp;
            ${streak} day streak
          </p>
        </td></tr>

        ${top3.length > 0 ? `
        <!-- Readiness bars -->
        <tr><td style="padding:0 28px 22px;">
          <div style="background:#F4F1EA;border-radius:12px;padding:18px 20px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.09em;
                        text-transform:uppercase;color:#7A8194;margin-bottom:12px;">
              Readiness Scores
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${top3.map(barRow).join("")}
            </table>
            ${weak && weak.readiness < 70 ? `
            <div style="margin-top:12px;padding:10px 12px;background:#FEF3C7;
                        border-radius:8px;border:1px solid #FDE68A;font-size:13px;color:#92400E;">
              Focus area this week: <strong>${weak.specialty}</strong> — only ${weak.readiness}% ready.
              Try 2–3 cases in this specialty!
            </div>` : ""}
          </div>
        </td></tr>` : ""}

        ${topTip ? `
        <!-- AI Coach Tip -->
        <tr><td style="padding:0 28px 22px;">
          <div style="background:linear-gradient(135deg,#ECFDF5 0%,#D1FAE5 100%);
                      border:1px solid #A7F3D0;border-radius:12px;padding:18px 20px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.09em;
                        text-transform:uppercase;color:#065F46;margin-bottom:10px;">
              AI Coach Tip of the Week
            </div>
            <p style="margin:0;font-size:14.5px;color:#1A4A38;line-height:1.7;">${topTip}</p>
          </div>
        </td></tr>` : ""}

        <!-- CTA -->
        <tr><td style="padding:0 28px 28px;">
          <div style="background:#F4F1EA;border-radius:12px;padding:20px;text-align:center;">
            <p style="margin:0 0 16px;font-size:14px;color:#4A5160;line-height:1.6;">
              Keep your streak alive — practice at least one case today to stay sharp!
            </p>
            <a href="${url}/practice"
               style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;
                      font-weight:600;font-size:14px;padding:12px 30px;border-radius:8px;
                      letter-spacing:0.01em;">
              Start Practicing
            </a>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 28px;border-top:1px solid #ECE7DD;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.55;">
            CrLearn — Trains thinking, not memory.<br>
            You're receiving this weekly digest as a registered student.
            To unsubscribe, reply with "unsubscribe" in the subject.
          </p>
        </td></tr>

      </table>

      <div style="margin-top:16px;color:#9CA3AF;font-size:12px;text-align:center;">
        CrLearn &mdash; Trains thinking, not memory.
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Core run function ─────────────────────────────────────────────────────────
export async function runDigest({ triggeredBy = "scheduler" } = {}) {
  const runId    = randomUUID();
  const startedAt = new Date();

  await query(
    `INSERT INTO digest_runs (id, triggered_by, started_at) VALUES ($1, $2, $3)`,
    [runId, triggeredBy, startedAt]
  );

  console.log(`[digest] run ${runId} started (${triggeredBy})`);

  let totalStudents = 0, emailsSent = 0, pushesSent = 0, errors = 0;

  try {
    const { rows: students } = await query(
      `SELECT u.id, u.email, u.full_name
         FROM users u
        WHERE u.role = 'student'
          AND (SELECT COUNT(*) FROM responses r WHERE r.user_id = u.id) >= 3
        ORDER BY u.created_at ASC`
    );

    totalStudents = students.length;
    const appUrl  = process.env.APP_URL || "";

    for (const student of students) {
      let emailOk = false, pushOk = false, errMsg = null;
      try {
        // ── Fetch student data ───────────────────────────────────────────────
        const [{ rows: specRows }, { rows: allResp }, { rows: streakRows }, { rows: cached }] =
          await Promise.all([
            query(
              `SELECT c.specialty,
                      COUNT(*)::int AS n,
                      AVG(r.score)::float AS avg_score,
                      json_agg(
                        json_build_object('score', r.score, 'ts', r.created_at)
                        ORDER BY r.created_at
                      ) AS entries
                 FROM responses r
                 JOIN cases c ON c.id = r.case_id
                WHERE r.user_id = $1
                GROUP BY c.specialty
                ORDER BY AVG(r.score) ASC`,
              [student.id]
            ),
            query(`SELECT score FROM responses WHERE user_id = $1`, [student.id]),
            query(
              `SELECT DISTINCT date_trunc('day', created_at)::date AS d
                 FROM responses WHERE user_id = $1
                ORDER BY d DESC LIMIT 60`,
              [student.id]
            ),
            query(
              `SELECT tips FROM insight_cache
                WHERE user_id = $1 AND generated_at > NOW() - INTERVAL '7 days'`,
              [student.id]
            ),
          ]);

        const totalCases = allResp.length;

        // ── Streak ───────────────────────────────────────────────────────────
        let streak = 0;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        for (let i = 0; i < streakRows.length; i++) {
          const d = new Date(streakRows[i].d); d.setHours(0, 0, 0, 0);
          const expected = new Date(today); expected.setDate(today.getDate() - i);
          if (i === 0 && d.getTime() === today.getTime() - 86400000) { streak = 1; continue; }
          if (d.getTime() === expected.getTime()) streak++;
          else if (i === 0 && d.getTime() === today.getTime()) streak++;
          else break;
        }

        // ── Specialties with readiness ───────────────────────────────────────
        const specialties = specRows
          .filter((s) => s.n >= 2)
          .map((s) => ({
            specialty: s.specialty,
            n:         s.n,
            readiness: computeReadiness(s.entries || []),
          }))
          .sort((a, b) => b.readiness - a.readiness);

        // ── Top coaching tip from cache ──────────────────────────────────────
        const topTip = cached[0]?.tips?.[0] || null;

        // ── Email ────────────────────────────────────────────────────────────
        if (isMailerConfigured() && student.email) {
          try {
            const firstName = student.full_name.split(" ")[0] || student.full_name;
            const html = buildDigestEmail({
              name: firstName, specialties, topTip, totalCases, streak, appUrl,
            });
            await sendMail({
              to:      student.email,
              subject: "Your Weekly CrLearn Digest",
              html,
              headers: {
                "X-Mailer":         "CrLearn Digest",
                "List-Unsubscribe": `<mailto:clinicalreasoningofficial@gmail.com?subject=unsubscribe>`,
              },
            });
            emailOk = true;
            emailsSent++;
          } catch (e) {
            errMsg = `email: ${e.message}`;
            console.warn(`[digest] email failed for ${student.email}:`, e.message);
          }
        }

        // ── Push notification ────────────────────────────────────────────────
        try {
          await ensurePushConfigured();
          const pushBody = specialties.length > 0
            ? `Top specialty: ${specialties[0].specialty} at ${specialties[0].readiness}% readiness. Keep it up!`
            : "Check your weekly performance summary on CrLearn!";
          const result = await sendPushToUser(student.id, {
            title: "Your Weekly CrLearn Digest",
            body:  pushBody,
            link:  "/insights",
            kind:  "digest",
            tag:   "weekly-digest",
          });
          if ((result?.sent ?? 0) > 0) {
            pushOk = true;
            pushesSent++;
          }
        } catch (e) {
          console.warn(`[digest] push failed for ${student.id}:`, e.message);
        }

        if (!emailOk && !pushOk) errors++;
      } catch (e) {
        errors++;
        errMsg = e.message;
        console.warn(`[digest] student ${student.id} failed:`, e.message);
      }

      // Log per-student result
      await query(
        `INSERT INTO digest_log (run_id, user_id, sent_at, email_ok, push_ok, error)
         VALUES ($1, $2, NOW(), $3, $4, $5)`,
        [runId, student.id, emailOk, pushOk, errMsg]
      ).catch(() => {});

      // Throttle: 200 ms between students to avoid hammering email/push APIs
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (e) {
    errors++;
    console.error("[digest] run error:", e.message);
  }

  // Finalise run record
  await query(
    `UPDATE digest_runs
        SET finished_at = NOW(), total_students=$1, emails_sent=$2, pushes_sent=$3, errors=$4
      WHERE id = $5`,
    [totalStudents, emailsSent, pushesSent, errors, runId]
  ).catch(() => {});

  console.log(
    `[digest] run ${runId} done — ${totalStudents} students, ` +
    `${emailsSent} emails, ${pushesSent} pushes, ${errors} errors`
  );

  return { runId, totalStudents, emailsSent, pushesSent, errors };
}

// ── Scheduler ────────────────────────────────────────────────────────────────
let _started     = false;
let _lastSentKey = null; // "YYYY-M-D" on the day we fired — prevents double-fire

export function startDigestScheduler() {
  if (_started) return;
  _started = true;

  async function tick() {
    try {
      const settings = await getDigestSettings();
      if (!settings.enabled) return;

      const now      = new Date();
      const dayUtc   = now.getUTCDay();
      const hourUtc  = now.getUTCHours();
      const minuteUtc = now.getUTCMinutes();
      const todayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;

      if (
        dayUtc  === settings.dayUtc  &&
        hourUtc === settings.hourUtc &&
        minuteUtc < 10               &&
        _lastSentKey !== todayKey
      ) {
        _lastSentKey = todayKey;
        console.log("[digest] scheduled trigger — firing digest");
        runDigest({ triggeredBy: "scheduler" }).catch((e) =>
          console.error("[digest] scheduled run error:", e.message)
        );
      }
    } catch (e) {
      console.warn("[digest] scheduler tick error:", e.message);
    }
  }

  // First check 15 s after boot, then every 5 minutes
  setTimeout(tick, 15_000);
  setInterval(tick, 5 * 60 * 1000);
  console.log("[digest] scheduler started (Monday 09:00 UTC by default)");
}
