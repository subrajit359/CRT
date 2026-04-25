import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { openai, loadPrompt } from "../openai.js";

const router = express.Router();

function parseEvalScore(text) {
  const m = text.match(/Score:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  if (!m) return null;
  return Math.max(0, Math.min(10, Math.round(parseFloat(m[1]))));
}

router.post("/", requireAuth(), async (req, res) => {
  try {
    const caseId = req.body.caseId;
    const userAnswer = String(req.body.userAnswer || "").trim();
    const questionIdx = parseInt(req.body.questionIdx, 10) || 0;
    if (!caseId || !userAnswer) return res.status(400).json({ error: "caseId and userAnswer required" });

    const { rows } = await query(`SELECT id, body, questions FROM cases WHERE id=$1 AND deleted_at IS NULL`, [caseId]);
    if (!rows[0]) return res.status(404).json({ error: "Case not found" });
    const c = rows[0];
    const q = (c.questions || [])[questionIdx];
    const caseText = `${c.body}\n\nQuestion: ${q ? q.prompt : "Provide your reasoning."}`;

    const promptTemplate = loadPrompt("evaluationPrompt.txt");
    const prompt = promptTemplate
      .replace("{CASE_TEXT}", caseText)
      .replace("{STUDENT_ANSWER}", userAnswer);

    let evalText;
    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_completion_tokens: 1200,
        messages: [
          { role: "system", content: "You evaluate clinical reasoning strictly per the user's instructions. Output only the structured format requested." },
          { role: "user", content: prompt },
        ],
      });
      evalText = resp.choices[0]?.message?.content || "";
    } catch (e) {
      console.error("[eval] openai error", e);
      return res.status(502).json({ error: "AI evaluator unavailable. Try again in a moment." });
    }
    const score = parseEvalScore(evalText);

    await query(
      `INSERT INTO responses (user_id, case_id, question_idx, user_answer, eval_json, score)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [req.user.id, caseId, questionIdx, userAnswer, JSON.stringify({ raw: evalText }), score]
    );

    if (req.user.role === "student" && score !== null) {
      const { rows: stats } = await query(
        `SELECT AVG(score)::float AS avg, COUNT(*)::int AS n FROM responses
           WHERE user_id=$1 AND created_at > NOW() - INTERVAL '60 days'`,
        [req.user.id]
      );
      const avg = stats[0].avg || 0;
      const n = stats[0].n || 0;
      if (n >= 5 && avg > 7.5) {
        await query(
          `UPDATE student_profiles SET global_level = LEAST(global_level + 1, 7)
             WHERE user_id=$1 AND (SELECT COUNT(*) FROM responses WHERE user_id=$1) IN (5, 10, 20, 35, 55, 80)`,
          [req.user.id]
        );
      }
    }

    res.json({ ok: true, score, evalText });
  } catch (e) {
    console.error("[eval] error", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/history", requireAuth(), async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.case_id, r.score, r.created_at, c.title, c.specialty
       FROM responses r JOIN cases c ON c.id=r.case_id
       WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ responses: rows });
});

router.get("/stats", requireAuth(), async (req, res) => {
  const userId = req.user.id;

  const { rows: agg } = await query(
    `SELECT COUNT(*)::int AS attempts, AVG(score)::float AS avg_score
       FROM responses WHERE user_id=$1`,
    [userId]
  );
  const { rows: bySpec } = await query(
    `SELECT c.specialty, COUNT(*)::int AS attempts, AVG(r.score)::float AS avg_score
       FROM responses r JOIN cases c ON c.id=r.case_id
       WHERE r.user_id=$1 GROUP BY c.specialty ORDER BY attempts DESC`,
    [userId]
  );
  const { rows: weak } = await query(
    `SELECT c.specialty, AVG(r.score)::float AS avg_score, COUNT(*)::int AS attempts
       FROM responses r JOIN cases c ON c.id=r.case_id
       WHERE r.user_id=$1 GROUP BY c.specialty
       HAVING COUNT(*) >= 2 AND AVG(r.score) < 6 ORDER BY AVG(r.score) ASC LIMIT 5`,
    [userId]
  );

  // 14-day daily average for sparkline
  const { rows: daily } = await query(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
            AVG(score)::float AS avg_score, COUNT(*)::int AS n
       FROM responses
       WHERE user_id=$1 AND created_at > NOW() - INTERVAL '14 days'
       GROUP BY 1 ORDER BY 1 ASC`,
    [userId]
  );
  const dailyMap = new Map(daily.map((d) => [d.day, d]));
  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = dailyMap.get(key);
    trend.push({ day: key, avg_score: row ? row.avg_score : null, n: row ? row.n : 0 });
  }

  // Trend delta (this week avg vs prior week avg)
  const recent = trend.slice(-7).filter((t) => t.avg_score != null);
  const prior = trend.slice(0, 7).filter((t) => t.avg_score != null);
  const recentAvg = recent.length ? recent.reduce((s, t) => s + t.avg_score, 0) / recent.length : null;
  const priorAvg = prior.length ? prior.reduce((s, t) => s + t.avg_score, 0) / prior.length : null;
  const delta = recentAvg != null && priorAvg != null ? recentAvg - priorAvg : null;

  // Streak (consecutive days ending today with attempts)
  const { rows: streakRows } = await query(
    `SELECT DISTINCT date_trunc('day', created_at)::date AS d
       FROM responses WHERE user_id=$1 ORDER BY d DESC LIMIT 60`,
    [userId]
  );
  let streak = 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < streakRows.length; i++) {
    const d = new Date(streakRows[i].d); d.setHours(0, 0, 0, 0);
    const expected = new Date(today); expected.setDate(today.getDate() - i);
    // allow today missing → start at yesterday
    if (i === 0 && d.getTime() === today.getTime() - 86400000) { streak = 1; continue; }
    if (d.getTime() === expected.getTime()) streak++;
    else if (i === 0 && d.getTime() === today.getTime()) streak++;
    else break;
  }

  // Weekly count (Mon–Sun rolling 7 days)
  const { rows: wk } = await query(
    `SELECT COUNT(*)::int AS n FROM responses
       WHERE user_id=$1 AND created_at > NOW() - INTERVAL '7 days'`,
    [userId]
  );
  const weeklyCount = wk[0].n;
  const weeklyTarget = 7;

  // Mastery per specialty (0-1 scale derived from avg score)
  const mastery = bySpec.map((s) => ({
    specialty: s.specialty,
    attempts: s.attempts,
    avg_score: s.avg_score,
    mastery: s.avg_score != null ? Math.max(0, Math.min(1, s.avg_score / 10)) : null,
  }));

  res.json({
    attempts: agg[0].attempts,
    averageScore: agg[0].avg_score,
    bySpecialty: bySpec,
    weakAreas: weak,
    trend,
    delta,
    streak,
    weeklyCount,
    weeklyTarget,
    mastery,
  });
});

// Recommend the next case to practice (weakest area + level matching)
router.get("/next", requireAuth(), async (req, res) => {
  const userId = req.user.id;

  // Find weakest specialty (avg < 6, at least 2 attempts)
  const { rows: weak } = await query(
    `SELECT c.specialty, AVG(r.score)::float AS avg_score, COUNT(*)::int AS n
       FROM responses r JOIN cases c ON c.id=r.case_id
       WHERE r.user_id=$1 GROUP BY c.specialty
       HAVING COUNT(*) >= 2 AND AVG(r.score) < 7 ORDER BY AVG(r.score) ASC LIMIT 1`,
    [userId]
  );

  let targetSpecialty = weak[0]?.specialty || null;
  let why = null;
  if (targetSpecialty) {
    why = `Your average in ${targetSpecialty} is ${weak[0].avg_score.toFixed(1)}/10 — sharpening this lifts your overall score the fastest.`;
  }

  // Get user's level
  const { rows: profile } = await query(
    `SELECT global_level FROM student_profiles WHERE user_id=$1`,
    [userId]
  );
  const level = profile[0]?.global_level || 1;

  const params = [userId];
  let where = `c.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM responses rr WHERE rr.user_id=$1 AND rr.case_id=c.id)`;

  if (targetSpecialty) {
    params.push(targetSpecialty);
    where += ` AND c.specialty=$${params.length}`;
  }
  params.push(level + 1);
  params.push(Math.max(1, level - 1));
  where += ` AND c.level <= $${params.length - 1} AND c.level >= $${params.length}`;

  let { rows } = await query(
    `SELECT c.id, c.title, c.specialty, c.level, c.body,
            (SELECT COUNT(*)::int FROM case_verifications WHERE case_id=c.id AND action='verify') AS verify_count
       FROM cases c
       WHERE ${where}
       ORDER BY (SELECT COUNT(*)::int FROM case_verifications WHERE case_id=c.id AND action='verify') DESC,
                RANDOM()
       LIMIT 1`,
    params
  );

  // Fallback: any unattempted case at any level
  if (!rows[0]) {
    const fb = await query(
      `SELECT c.id, c.title, c.specialty, c.level, c.body,
              (SELECT COUNT(*)::int FROM case_verifications WHERE case_id=c.id AND action='verify') AS verify_count
         FROM cases c
         WHERE c.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM responses rr WHERE rr.user_id=$1 AND rr.case_id=c.id)
         ORDER BY RANDOM() LIMIT 1`,
      [userId]
    );
    rows = fb.rows;
    why = why || "A fresh case to keep your reasoning warm.";
  }

  if (!rows[0]) return res.json({ case: null, why: "You've practiced every case in the library. New ones land weekly." });

  const c = rows[0];
  const preview = (c.body || "").replace(/\s+/g, " ").trim().slice(0, 220);
  res.json({
    case: { id: c.id, title: c.title, specialty: c.specialty, level: c.level, verify_count: c.verify_count, preview },
    why,
    targetSpecialty,
    targetLevel: level,
  });
});

// "What changed" feed — last 10 meaningful events for this user
router.get("/changes", requireAuth(), async (req, res) => {
  const userId = req.user.id;
  const events = [];

  // Recent notifications
  const { rows: notifs } = await query(
    `SELECT id, kind, title, body, link, created_at
       FROM notifications WHERE user_id=$1
       ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );
  for (const n of notifs) {
    events.push({
      id: `n-${n.id}`,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      created_at: n.created_at,
    });
  }

  // Recent attempts (with score) — meaningful when high or low
  const { rows: attempts } = await query(
    `SELECT r.id, r.score, r.created_at, c.title, c.specialty
       FROM responses r JOIN cases c ON c.id=r.case_id
       WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 6`,
    [userId]
  );
  for (const a of attempts) {
    const score = a.score;
    let title, kind;
    if (score == null) { title = `Practiced ${a.specialty}`; kind = "attempt"; }
    else if (score >= 8) { title = `Strong attempt — ${a.specialty}`; kind = "attempt-high"; }
    else if (score < 5) { title = `Tough case — ${a.specialty}`; kind = "attempt-low"; }
    else { title = `Practiced ${a.specialty}`; kind = "attempt"; }
    events.push({
      id: `a-${a.id}`,
      kind,
      title,
      body: `${a.title} · ${score != null ? `${score}/10` : "evaluated"}`,
      link: `/case/${a.id ? "" : ""}`,
      created_at: a.created_at,
    });
  }

  events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ events: events.slice(0, 12) });
});

export default router;
