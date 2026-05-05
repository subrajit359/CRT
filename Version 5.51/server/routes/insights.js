import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { assistantOpenai, coachOpenai } from "../openai.js";
import { cacheGet, cacheSet, cacheInvalidate } from "../cache.js";

const router = express.Router();

// Recency-weighted readiness score (0–100) for a specialty
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

async function generateCoachTips(data) {
  const specialtyLines = data.specialties
    .map(s => `  ${s.specialty}: ${s.readiness}% ready (avg ${(s.avg_score ?? 0).toFixed(1)}/10, ${s.n} cases)`)
    .join("\n");

  const prompt =
`You are a concise medical education coach. Give exactly 3 specific, actionable coaching tips for this student. Each tip is 1–2 sentences. Be specific about specialties and patterns. Be encouraging but honest.

Student data:
- Cases completed: ${data.totalCases}
- Overall avg score: ${data.overallAvg.toFixed(1)}/10
- Streak: ${data.streak} days
- Trend: ${data.trend}

Specialties (worst readiness first):
${specialtyLines}

Respond ONLY with valid JSON — an array of exactly 3 strings. No markdown, no extra text.`;

  const completion = await coachOpenai.chat.completions.create({
    model: process.env.AI_COACH_MODEL || process.env.AI_CASE_MODEL || "gemini-2.0-flash",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 400,
  });

  const raw = completion.choices[0]?.message?.content?.trim() || "[]";
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter(t => typeof t === "string").slice(0, 4);
  } catch {
    const m = raw.match(/\[[\s\S]*?\]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
  }
  return [];
}

// ── GET /api/insights ────────────────────────────────────────────────────────
router.get("/", requireAuth(), async (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ error: "Students only" });
  try {
    const uid = req.user.id;
    const _ck = `insights:${uid}`;
    const _cc = cacheGet(_ck);
    if (_cc !== undefined) return res.json(_cc);

    const [
      { rows: allResp },
      { rows: specRows },
      { rows: heatRows },
      { rows: streakRows },
      { rows: profRow },
      { rows: cached },
    ] = await Promise.all([
      query(`SELECT score, created_at FROM responses WHERE user_id=$1 ORDER BY created_at ASC`, [uid]),
      query(
        `SELECT c.specialty,
                COUNT(*)::int AS n,
                AVG(r.score)::float AS avg_score,
                json_agg(json_build_object('score', r.score, 'ts', r.created_at)
                         ORDER BY r.created_at) AS entries
         FROM responses r JOIN cases c ON c.id = r.case_id
         WHERE r.user_id=$1
         GROUP BY c.specialty
         ORDER BY AVG(r.score) ASC`,
        [uid]
      ),
      query(
        `SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
                COUNT(DISTINCT case_id)::int AS n
         FROM responses
         WHERE user_id=$1 AND created_at >= NOW() - INTERVAL '4 months'
         GROUP BY day ORDER BY day ASC`,
        [uid]
      ),
      query(`SELECT DISTINCT date_trunc('day', created_at)::date AS d FROM responses WHERE user_id=$1 ORDER BY d DESC LIMIT 60`, [uid]),
      query(`SELECT COALESCE(xp,0)::int AS xp FROM student_profiles WHERE user_id=$1`, [uid]),
      query(`SELECT tips, generated_at FROM insight_cache WHERE user_id=$1 AND generated_at > NOW() - INTERVAL '6 hours'`, [uid]),
    ]);

    const totalCases = allResp.length;
    const overallAvg = totalCases > 0
      ? allResp.reduce((s, r) => s + (r.score ?? 0), 0) / totalCases
      : 0;
    const xp = profRow[0]?.xp ?? 0;

    // Compute streak the same way eval.js does
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

    const specialties = specRows.map(s => ({
      specialty: s.specialty,
      n: s.n,
      avg_score: s.avg_score,
      readiness: computeReadiness(s.entries || []),
    }));

    // Trend: last 5 vs previous 5
    let trend = "stable";
    if (allResp.length >= 10) {
      const r5 = allResp.slice(-5).reduce((s, r) => s + (r.score ?? 0), 0) / 5;
      const p5 = allResp.slice(-10, -5).reduce((s, r) => s + (r.score ?? 0), 0) / 5;
      if (r5 - p5 > 0.5) trend = "improving";
      else if (p5 - r5 > 0.5) trend = "declining";
    } else if (allResp.length >= 5) {
      const r5 = allResp.slice(-5).reduce((s, r) => s + (r.score ?? 0), 0) / 5;
      if (r5 - overallAvg > 0.5) trend = "improving";
      else if (overallAvg - r5 > 0.5) trend = "declining";
    }

    const heatmap = heatRows.map(r => ({ day: r.day, n: r.n }));

    const withEnough = specialties.filter(s => s.n >= 2);
    const weakest   = withEnough.length > 0 ? withEnough[0] : null;
    const strongest = withEnough.length > 0 ? withEnough[withEnough.length - 1] : null;

    // AI tips (use cache, else generate)
    let tips = [];
    if (cached[0]?.tips) {
      tips = cached[0].tips;
    } else if (totalCases >= 3) {
      try {
        tips = await generateCoachTips({ totalCases, overallAvg, streak, xp, specialties, trend });
        await query(
          `INSERT INTO insight_cache (user_id, tips, generated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (user_id) DO UPDATE SET tips=$2::jsonb, generated_at=NOW()`,
          [uid, JSON.stringify(tips)]
        );
      } catch (e) {
        console.warn("[insights] AI tips failed (non-fatal):", e.message);
      }
    }

    const _insightResult = { totalCases, overallAvg, streak, xp, specialties, trend, heatmap, weakest, strongest, tips };
    cacheSet(_ck, _insightResult, 60_000);
    res.json(_insightResult);
  } catch (e) {
    console.error("[insights] GET /", e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/insights/refresh-tips — bust the cache ────────────────────────
router.post("/refresh-tips", requireAuth(), async (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ error: "Students only" });
  try {
    await query(`DELETE FROM insight_cache WHERE user_id=$1`, [req.user.id]);
    cacheInvalidate(`insights:${req.user.id}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
