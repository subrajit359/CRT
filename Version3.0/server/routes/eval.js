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

// Normalize a string for diagnosis matching: lowercase, strip punctuation, collapse whitespace.
function normalizeDx(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Deterministic diagnosis match: returns { correct: bool, matched: string|null }.
// Looks for any of [primary diagnosis, ...accepted aliases] as a whole-token substring of the student's normalized answer.
function matchDiagnosis(studentAnswer, primary, aliases) {
  const candidates = [primary, ...(Array.isArray(aliases) ? aliases : [])]
    .map(normalizeDx)
    .filter(Boolean);
  if (!candidates.length) return { correct: null, matched: null };
  const normAnswer = ` ${normalizeDx(studentAnswer)} `;
  for (const cand of candidates) {
    if (normAnswer.includes(` ${cand} `)) return { correct: true, matched: cand };
  }
  return { correct: false, matched: null };
}

// AI semantic diagnosis match — used when the deterministic matcher fails.
// Returns { correct: bool|null, confidence: 0-1|null, reason: string|null }.
// The student may phrase the answer differently (e.g. "heart attack" vs "MI",
// "kidney inflammation" vs "glomerulonephritis"). We ask the AI to judge whether
// the medical *content* matches, not the wording.
async function aiSemanticMatch(studentAnswer, primary, aliases, explanation) {
  const accepted = [primary, ...(Array.isArray(aliases) ? aliases : [])].filter(Boolean);
  if (!studentAnswer || !accepted.length) return { correct: null, confidence: null, reason: null };
  const sys = "You are a clinical examiner. Compare a student's diagnosis to the correct one. " +
    "The student may use synonyms, abbreviations, or different phrasings. " +
    "Match on medical CONTENT, not wording. " +
    "If the student names a different disease, mark INCORRECT. " +
    "If the student names a near-miss (e.g. parent category instead of specific subtype), mark PARTIAL. " +
    "Reply ONLY in this format on three lines:\n" +
    "Verdict: CORRECT | PARTIAL | INCORRECT\nConfidence: <0.0-1.0>\nReason: <one short sentence>";
  const user = `Correct diagnosis: ${primary}\n` +
    (accepted.length > 1 ? `Also accepted: ${accepted.slice(1).join(", ")}\n` : "") +
    (explanation ? `Explanation: ${explanation}\n` : "") +
    `\nStudent answer: ${studentAnswer}`;
  try {
    const resp = await openai.chat.completions.create({
      model: process.env.AI_MATCH_MODEL || process.env.AI_MODEL || "gpt-4o-mini",
      temperature: 0,
      max_tokens: 120,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });
    const text = resp.choices[0]?.message?.content || "";
    const verdictM = text.match(/Verdict:\s*(CORRECT|PARTIAL|INCORRECT)/i);
    const confM = text.match(/Confidence:\s*(0?\.\d+|1(?:\.0+)?|0|1)/i);
    const reasonM = text.match(/Reason:\s*(.+)/i);
    const verdict = verdictM ? verdictM[1].toUpperCase() : null;
    const confidence = confM ? Math.max(0, Math.min(1, parseFloat(confM[1]))) : null;
    const reason = reasonM ? reasonM[1].trim() : null;
    let correct = null;
    if (verdict === "CORRECT") correct = true;
    else if (verdict === "INCORRECT") correct = false;
    else if (verdict === "PARTIAL") correct = (confidence ?? 0) >= 0.7;
    return { correct, confidence, reason, verdict };
  } catch (e) {
    console.error("[eval] semantic match failed (non-fatal)", e.message);
    return { correct: null, confidence: null, reason: null };
  }
}

router.post("/", requireAuth(), async (req, res) => {
  try {
    const caseId = req.body.caseId;
    const userAnswer = String(req.body.userAnswer || "").trim();
    const questionIdx = parseInt(req.body.questionIdx, 10) || 0;
    if (!caseId || !userAnswer) return res.status(400).json({ error: "caseId and userAnswer required" });

    const { rows } = await query(
      `SELECT c.id, c.body, c.questions, c.diagnosis, c.accepted_diagnoses, c.diagnosis_explanation,
              (SELECT COUNT(*)::int FROM case_verifications v
                 WHERE v.case_id=c.id AND v.action='verify') AS verify_count
         FROM cases c WHERE c.id=$1 AND c.deleted_at IS NULL`,
      [caseId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Case not found" });
    const c = rows[0];
    const q = (c.questions || [])[questionIdx];
    // Only surface the case-row diagnosis explanation when at least one doctor has verified the case.
    // For unverified (e.g. AI-generated, awaiting review) cases, we hide it so students aren't shown
    // unvetted clinical text as if it were authoritative.
    const verifiedExplanation = (c.verify_count > 0) ? (c.diagnosis_explanation || null) : null;

    // 1) Diagnosis verdict.
    //    First try a fast deterministic match (substring of accepted aliases).
    //    If that fails, fall back to an AI semantic check that compares MEANING,
    //    not exact words — so "heart attack" matches "myocardial infarction" even
    //    when the author didn't list every alias. The AI never overrides a
    //    deterministic CORRECT verdict.
    let dx = matchDiagnosis(userAnswer, c.diagnosis, c.accepted_diagnoses);
    let dxSemantic = null;
    if (dx.correct === false) {
      dxSemantic = await aiSemanticMatch(
        userAnswer, c.diagnosis, c.accepted_diagnoses, c.diagnosis_explanation
      );
      if (dxSemantic && dxSemantic.correct === true) {
        dx = { correct: true, matched: `ai:${dxSemantic.verdict?.toLowerCase() || "semantic"}` };
      }
    }

    // Practice mode: if the user has already submitted a graded answer for this case,
    // we don't store a new response and we don't update their rating. We also reuse
    // the AI's prior explanation of the correct diagnosis (saves tokens and keeps
    // teaching consistent), so they still see the answer + explanation again.
    const { rows: priorRows } = await query(
      `SELECT eval_json, score FROM responses
         WHERE user_id=$1 AND case_id=$2
         ORDER BY created_at ASC LIMIT 1`,
      [req.user.id, caseId]
    );
    const isPractice = priorRows.length > 0;
    const cachedEvalText = isPractice && priorRows[0].eval_json && priorRows[0].eval_json.raw
      ? String(priorRows[0].eval_json.raw)
      : "";

    // 2) AI feedback for reasoning quality + explanation of the correct diagnosis (educational only — never grades).
    let evalText = "";
    if (isPractice && cachedEvalText) {
      // Reuse the cached AI explanation from the student's first attempt — no new AI call.
      evalText = cachedEvalText;
    } else {
      const caseText = `${c.body}\n\nQuestion: ${q ? q.prompt : "Provide your reasoning."}`;
      const promptTemplate = loadPrompt("evaluationPrompt.txt");
      let prompt = promptTemplate
        .replace("{CASE_TEXT}", caseText)
        .replace("{STUDENT_ANSWER}", userAnswer);
      if (c.diagnosis) {
        prompt += `\n\n---\nGround-truth diagnosis (provided by the case author, NOT for you to second-guess): ${c.diagnosis}` +
          (c.diagnosis_explanation ? `\nAuthor's note: ${c.diagnosis_explanation}` : "") +
          `\n\nIn your "Expected Answer" section, briefly explain WHY this diagnosis fits the case (key features, distinguishing findings, what the student may have missed). Do not change the verdict — that has already been decided externally.`;
      }
      try {
        const resp = await openai.chat.completions.create({
          model: process.env.AI_EVAL_MODEL || process.env.AI_MODEL || "gpt-4o-mini",
          temperature: 0.2, // graders should be consistent, not creative
          top_p: 0.9,
          max_tokens: 1500,
          messages: [
            { role: "system", content: "You are a strict, board-certified clinical reasoning examiner. You give terse, structured feedback strictly per the user's instructions. Never invent findings not in the case. Never contradict a ground-truth diagnosis if one is provided. Output only the requested structured format — no markdown, no preamble." },
            { role: "user", content: prompt },
          ],
        });
        evalText = resp.choices[0]?.message?.content || "";
      } catch (e) {
        console.error("[eval] openai error (non-fatal — verdict still returned)", e);
        // Non-fatal: deterministic verdict stands even if AI is down.
        evalText = "";
      }
    }
    const score = parseEvalScore(evalText);

    if (!isPractice) {
      await query(
        `INSERT INTO responses (user_id, case_id, question_idx, user_answer, eval_json, score)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
        [req.user.id, caseId, questionIdx, userAnswer,
         JSON.stringify({ raw: evalText, diagnosisCorrect: dx.correct, matchedAlias: dx.matched }), score]
      );
    }

    if (!isPractice && req.user.role === "student" && score !== null) {
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

    res.json({
      ok: true,
      score,
      evalText,
      diagnosisCorrect: dx.correct,
      matchedAlias: dx.matched,
      semanticMatch: dxSemantic ? {
        verdict: dxSemantic.verdict || null,
        confidence: dxSemantic.confidence,
        reason: dxSemantic.reason,
      } : null,
      correctDiagnosis: c.diagnosis || null,
      diagnosisExplanation: verifiedExplanation,
      caseVerified: c.verify_count > 0,
      practice: isPractice,
    });
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

  // Weekly count (rolling 7 days). Daily target 5 ⇒ weekly target 35.
  const { rows: wk } = await query(
    `SELECT COUNT(*)::int AS n FROM responses
       WHERE user_id=$1 AND created_at > NOW() - INTERVAL '7 days'`,
    [userId]
  );
  const weeklyCount = wk[0].n;
  const weeklyTarget = 35;

  // Best-ever streak (longest consecutive-day run across all attempts)
  const { rows: allDays } = await query(
    `SELECT DISTINCT date_trunc('day', created_at)::date AS d
       FROM responses WHERE user_id=$1 ORDER BY d ASC`,
    [userId]
  );
  let maxStreak = 0;
  let run = 0;
  let prev = null;
  for (const r of allDays) {
    const d = new Date(r.d); d.setHours(0, 0, 0, 0);
    if (prev && d.getTime() === prev.getTime() + 86400000) run++;
    else run = 1;
    if (run > maxStreak) maxStreak = run;
    prev = d;
  }
  if (streak > maxStreak) maxStreak = streak;

  // Days since last attempt (used to decay strength while a streak is broken)
  let daysSinceLast = null;
  if (streakRows.length > 0) {
    const last = new Date(streakRows[0].d); last.setHours(0, 0, 0, 0);
    daysSinceLast = Math.max(0, Math.round((today.getTime() - last.getTime()) / 86400000));
  }

  // Streak strength — stateful day-by-day replay (Live ↔ Decay).
  //   Live formula: s = (best + current) / (2*best + 5) * 100
  //   On break (first miss after Live): s = max(s*0.7, floor); state=Decay; current=0
  //   In Decay: miss day → s = max(s-2, floor); practice day → s += 1 (cap 100)
  //   When current ≥ 5 in Decay: state=Live; s = max(s, liveFormula)
  //   Floor (permanent earned reputation) = best / (best + 5) * 100
  let strength = 0;
  let strengthState = "live";
  let strengthFloor = 0;
  if (allDays.length > 0) {
    const firstDay = new Date(allDays[0].d); firstDay.setHours(0, 0, 0, 0);
    const practiceSet = new Set(
      allDays.map((r) => { const d = new Date(r.d); d.setHours(0, 0, 0, 0); return d.getTime(); })
    );
    let s = 0;
    let state = "live";
    let curr = 0;
    let bestSoFar = 0;
    let floor = 0;
    const totalDays = Math.floor((today.getTime() - firstDay.getTime()) / 86400000) + 1;
    for (let i = 0; i < totalDays; i++) {
      const dayTs = firstDay.getTime() + i * 86400000;
      const practiced = practiceSet.has(dayTs);
      if (practiced) {
        curr++;
        if (curr > bestSoFar) bestSoFar = curr;
        floor = (bestSoFar / (bestSoFar + 5)) * 100;
        if (state === "live") {
          s = ((bestSoFar + curr) / (2 * bestSoFar + 5)) * 100;
        } else {
          s = Math.min(100, s + 1);
          if (curr >= 5) {
            state = "live";
            const live = ((bestSoFar + curr) / (2 * bestSoFar + 5)) * 100;
            if (live > s) s = live;
          }
        }
      } else {
        if (state === "live") {
          state = "decay";
          s = Math.max(s * 0.7, floor);
        } else {
          s = Math.max(s - 2, floor);
        }
        curr = 0;
      }
    }
    strength = Math.round(s * 10) / 10;
    strengthState = state;
    strengthFloor = Math.round(floor * 10) / 10;
  }

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
    maxStreak,
    daysSinceLast,
    strength,
    strengthState,
    strengthFloor,
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
