import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { matchOpenai, evalOpenai, loadPrompt } from "../openai.js";
import { checkAndUnlockAchievements, awardXp } from "./achievements.js";
import { cacheGet, cacheSet, cacheInvalidate } from "../cache.js";

function evalXp(score) {
  if (score == null) return 5;
  if (score >= 10) return 75;
  if (score >= 9)  return 50;
  if (score >= 7)  return 35;
  if (score >= 5)  return 20;
  return 10;
}

const router = express.Router();

function parseEvalScore(text) {
  const m = text.match(/Score:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  if (!m) return null;
  return Math.max(0, Math.min(10, Math.round(parseFloat(m[1]))));
}

function normalizeDx(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Detect if student copied the case body or diagnosis explanation verbatim.
// Checks for ≥6 consecutive shared words — much stricter than the old word-bag approach.
function isCopiedFromSource(studentAnswer, ...sources) {
  const a = normalizeDx(studentAnswer);
  if (!a || a.split(" ").filter(Boolean).length < 6) return false;
  const aWords = a.split(" ").filter(Boolean);
  for (const src of sources) {
    if (!src) continue;
    const sWords = normalizeDx(src).split(" ").filter(Boolean);
    // Sliding window: look for 6+ consecutive words from student answer in source
    for (let i = 0; i <= aWords.length - 6; i++) {
      const run = aWords.slice(i, i + 6).join(" ");
      if (normalizeDx(src).includes(run)) return true;
    }
  }
  return false;
}

// Fast exact-match heuristic — only used to SHORT-CIRCUIT to CORRECT.
// Never used to reject — that is the AI's job.
function exactMatchDiagnosis(studentAnswer, primary, aliases) {
  const candidates = [primary, ...(Array.isArray(aliases) ? aliases : [])]
    .map(normalizeDx)
    .filter(Boolean);
  if (!candidates.length) return { hit: false, matched: null };
  const norm = normalizeDx(studentAnswer);
  if (!norm) return { hit: false, matched: null };
  for (const cand of candidates) {
    // Full match, or candidate appears as a standalone phrase inside the answer
    if (norm === cand || norm.startsWith(cand + " ") || norm.endsWith(" " + cand) || norm.includes(" " + cand + " ")) {
      return { hit: true, matched: cand };
    }
  }
  return { hit: false, matched: null };
}

// Legacy wrapper kept for call-sites that use matchDiagnosis directly
function matchDiagnosis(studentAnswer, primary, aliases) {
  const { hit, matched } = exactMatchDiagnosis(studentAnswer, primary, aliases);
  return { correct: hit ? true : false, matched: hit ? matched : null };
}

// ── v3: Semantic match — proper prompt, case-body copy detection ──────────────
// caseBody is passed so we can detect if the student copied the case text.
// Returns { correct, verdict, confidence, reason, fromCache? }
//   correct:  true (CORRECT) | false (PARTIAL or INCORRECT) | null (AI failed)
//   verdict:  "CORRECT" | "PARTIAL" | "INCORRECT" | null
async function aiSemanticMatch(studentAnswer, primary, aliases, explanation, caseBody) {
  const accepted = [primary, ...(Array.isArray(aliases) ? aliases : [])].filter(Boolean);
  if (!studentAnswer || !accepted.length) return { correct: null, confidence: null, reason: null, verdict: null };

  // 1. Fast-path: exact string match → CORRECT immediately, skip AI
  const exact = exactMatchDiagnosis(studentAnswer, primary, aliases);
  if (exact.hit) {
    return { correct: true, verdict: "CORRECT", confidence: 1.0, reason: `Exact match to accepted answer: "${exact.matched}".` };
  }

  // 2. Copy detection against case body AND diagnosis explanation
  if (isCopiedFromSource(studentAnswer, caseBody, explanation)) {
    return {
      correct: false, verdict: "INCORRECT", confidence: 0.97,
      reason: "Answer appears copied from the case text or explanation rather than an original diagnosis.",
    };
  }

  // 3. Build cache key (student answer + stored answer set)
  const cacheKey = [
    normalizeDx(studentAnswer),
    normalizeDx(primary),
    ...(Array.isArray(aliases) ? aliases : []).map(normalizeDx).sort(),
  ].join("|");

  // 4. Check DB cache
  try {
    const { rows: cached } = await query(
      `SELECT verdict, confidence, reason FROM semantic_match_cache WHERE cache_key=$1`,
      [cacheKey]
    );
    if (cached[0]) {
      query(`UPDATE semantic_match_cache SET hit_count = hit_count + 1 WHERE cache_key=$1`, [cacheKey]).catch(() => {});
      const { verdict, confidence, reason } = cached[0];
      const correct = verdict === "CORRECT" ? true : false;
      return { correct, verdict, confidence, reason, fromCache: true };
    }
  } catch (e) {
    console.warn("[eval] cache lookup failed (non-fatal):", e.message);
  }

  // 5. Call Match AI with the dedicated prompt
  const sys = loadPrompt("matchPrompt.txt");
  const user = [
    `Correct diagnosis: ${primary}`,
    accepted.length > 1 ? `Also accepted: ${accepted.slice(1).join(", ")}` : null,
    caseBody ? `\nCase body (for copy-detection only — do NOT use for matching):\n${caseBody.slice(0, 800)}` : null,
    `\nStudent answer: ${studentAnswer}`,
  ].filter(Boolean).join("\n");

  let verdict = null, confidence = null, reason = null, correct = null;
  try {
    const resp = await matchOpenai.chat.completions.create({
      model: process.env.AI_MATCH_MODEL || process.env.AI_MODEL || "gpt-4o-mini",
      temperature: 0,
      max_tokens: 150,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });
    const text = resp.choices[0]?.message?.content || "";
    const verdictM = text.match(/Verdict:\s*(CORRECT|PARTIAL|INCORRECT)/i);
    const confM = text.match(/Confidence:\s*(0?\.\d+|1(?:\.0+)?|0|1)/i);
    const reasonM = text.match(/Reason:\s*(.+)/i);
    verdict = verdictM ? verdictM[1].toUpperCase() : "INCORRECT";
    confidence = confM ? Math.max(0, Math.min(1, parseFloat(confM[1]))) : 0.5;
    reason = reasonM ? reasonM[1].trim() : null;
    correct = verdict === "CORRECT" ? true : false;
  } catch (e) {
    console.error("[eval] semantic match failed (non-fatal)", e.message);
    return { correct: null, confidence: null, reason: null, verdict: null };
  }

  // 6. Persist to cache (fire-and-forget)
  if (verdict) {
    query(
      `INSERT INTO semantic_match_cache (cache_key, verdict, confidence, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cache_key) DO UPDATE SET hit_count = semantic_match_cache.hit_count + 1`,
      [cacheKey, verdict, confidence, reason]
    ).catch((e) => console.warn("[eval] cache save failed (non-fatal):", e.message));
  }

  return { correct, verdict, confidence, reason };
}

// ── Shared level-up logic ─────────────────────────────────────────────────────
async function checkLevelUp(userId, score) {
  if (score === null) return { leveledUp: false, newLevel: null };
  const { rows: profileRows } = await query(
    `SELECT sp.global_level,
            (SELECT COUNT(*)::int FROM responses WHERE user_id=$1) AS total
     FROM student_profiles sp WHERE sp.user_id=$1`,
    [userId]
  );
  const L = profileRows[0]?.global_level ?? 1;
  const totalAttempts = profileRows[0]?.total ?? 0;
  const minAttempts = Math.floor(6 * L * (L + 1) / 5);
  const window = 5 * L;
  const requiredAvg = parseFloat((4.0 + (L - 1) * 0.1).toFixed(1));

  if (totalAttempts < minAttempts) return { leveledUp: false, newLevel: null };

  const { rows: recentRows } = await query(
    `SELECT COALESCE(AVG(score), 0)::float AS avg FROM (
       SELECT score FROM responses
       WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2
     ) recent`,
    [userId, window]
  );
  const recentAvg = recentRows[0]?.avg ?? 0;
  if (recentAvg < requiredAvg) return { leveledUp: false, newLevel: null };

  await query(
    `UPDATE student_profiles SET global_level = global_level + 1 WHERE user_id=$1`,
    [userId]
  );
  return { leveledUp: true, newLevel: L + 1 };
}

// ── Regular (non-streaming) eval ──────────────────────────────────────────────
router.post("/", requireAuth(), async (req, res) => {
  try {
    const caseId = req.body.caseId;
    const userAnswer = String(req.body.userAnswer || "").trim();
    const questionIdx = parseInt(req.body.questionIdx, 10) || 0;
    if (!caseId || !userAnswer) return res.status(400).json({ error: "caseId and userAnswer required" });

    const [caseResult, priorResult] = await Promise.all([
      query(
        `SELECT c.id, c.body, c.questions, c.diagnosis, c.accepted_diagnoses, c.diagnosis_explanation,
                (SELECT COUNT(*)::int FROM case_verifications v
                   WHERE v.case_id=c.id AND v.action='verify') AS verify_count
           FROM cases c WHERE c.id=$1 AND c.deleted_at IS NULL`,
        [caseId]
      ),
      query(
        `SELECT eval_json, score FROM responses
           WHERE user_id=$1 AND case_id=$2
           ORDER BY created_at ASC LIMIT 1`,
        [req.user.id, caseId]
      ),
    ]);

    if (!caseResult.rows[0]) return res.status(404).json({ error: "Case not found" });
    const c = caseResult.rows[0];
    const q = (c.questions || [])[questionIdx];
    const verifiedExplanation = (c.verify_count > 0) ? (c.diagnosis_explanation || null) : null;

    const priorRows = priorResult.rows;
    const isPractice = priorRows.length > 0;
    const cachedEvalText = isPractice && priorRows[0].eval_json && priorRows[0].eval_json.raw
      ? String(priorRows[0].eval_json.raw) : "";

    let dx = matchDiagnosis(userAnswer, c.diagnosis, c.accepted_diagnoses);
    let dxSemantic = null;
    if (dx.correct === false) {
      dxSemantic = await aiSemanticMatch(userAnswer, c.diagnosis, c.accepted_diagnoses, c.diagnosis_explanation, c.body);
      if (dxSemantic?.correct === true) {
        dx = { correct: true, matched: `ai:${dxSemantic.verdict?.toLowerCase() || "semantic"}` };
      } else if (dxSemantic?.verdict === "PARTIAL") {
        dx = { correct: false, matched: "partial", verdict: "PARTIAL" };
      }
    }

    let evalText = "";
    if (isPractice && cachedEvalText) {
      evalText = cachedEvalText;
    } else {
      const caseText = `${c.body}\n\nQuestion: ${q ? q.prompt : "Provide your reasoning."}`;
      const diagnosisVerdict = dx.correct === true ? "CORRECT"
        : (dx.verdict === "PARTIAL" || dxSemantic?.verdict === "PARTIAL") ? "PARTIAL"
        : dx.correct === false ? "INCORRECT"
        : "UNKNOWN";
      const matchReason = dxSemantic?.reason
        || (dx.correct === true && dx.matched && !dx.matched.startsWith("ai:") ? `Exact string match to accepted alias: "${dx.matched}".` : null)
        || (diagnosisVerdict === "UNKNOWN" ? "No stored diagnosis to check against — use your own clinical judgment." : "No specific reason provided.");

      const promptTemplate = loadPrompt("evaluationPrompt.txt");
      let prompt = promptTemplate
        .replace("{CASE_TEXT}", caseText)
        .replace("{STUDENT_ANSWER}", userAnswer)
        .replace("{DIAGNOSIS_VERDICT}", diagnosisVerdict)
        .replace("{MATCH_REASON}", matchReason);
      if (c.diagnosis) {
        prompt += `\n\n---\nGround-truth diagnosis: ${c.diagnosis}` +
          (c.diagnosis_explanation ? `\nAuthor's note: ${c.diagnosis_explanation}` : "") +
          `\n\nIn your "Expected Answer" section, explain WHY this diagnosis fits the case using specific features from the case body.`;
      }
      try {
        const resp = await evalOpenai.chat.completions.create({
          model: process.env.AI_EVAL_MODEL || process.env.AI_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 1500,
          messages: [
            { role: "system", content: "You are a strict, board-certified clinical reasoning examiner. Follow the scoring rules in the prompt exactly — especially the score ceiling imposed by DIAGNOSIS_VERDICT. Never exceed the allowed range. Output only the requested structured format — no markdown, no preamble." },
            { role: "user", content: prompt },
          ],
        });
        evalText = resp.choices[0]?.message?.content || "";
      } catch (e) {
        console.error("[eval] openai error (non-fatal)", e);
        evalText = "";
      }
    }

    const score = parseEvalScore(evalText);

    let newAchievements = [];
    if (!isPractice) {
      await query(
        `INSERT INTO responses (user_id, case_id, question_idx, user_answer, eval_json, score)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
        [req.user.id, caseId, questionIdx, userAnswer,
         JSON.stringify({ raw: evalText, diagnosisCorrect: dx.correct, matchedAlias: dx.matched }), score]
      );
      // v6: award XP + unlock achievements
      if (req.user.role === "student") {
        awardXp(req.user.id, evalXp(score)).catch(() => {});
        newAchievements = await checkAndUnlockAchievements(req.user.id, { score, isPractice: false });
      }
      cacheInvalidate(`eval:stats:${req.user.id}`);
      cacheInvalidate(`eval:next:${req.user.id}`);
      cacheInvalidate(`eval:changes:${req.user.id}`);
      cacheInvalidate(`ach:${req.user.id}`);
      cacheInvalidate(`cases:groups:${req.user.id}:`);
      cacheInvalidate("cases:count");
    }

    let leveledUp = false;
    let newLevel = null;
    if (!isPractice && req.user.role === "student") {
      const lu = await checkLevelUp(req.user.id, score);
      leveledUp = lu.leveledUp;
      newLevel = lu.newLevel;
    }

    res.json({
      ok: true, score, evalText,
      diagnosisCorrect: dx.correct, matchedAlias: dx.matched,
      semanticMatch: dxSemantic ? { verdict: dxSemantic.verdict || null, confidence: dxSemantic.confidence, reason: dxSemantic.reason } : null,
      correctDiagnosis: c.diagnosis || null, diagnosisExplanation: verifiedExplanation,
      caseVerified: c.verify_count > 0, practice: isPractice, leveledUp, newLevel, newAchievements,
    });
  } catch (e) {
    console.error("[eval] error", e);
    res.status(500).json({ error: e.message });
  }
});

// ── v3: Streaming eval ────────────────────────────────────────────────────────
// Sends: meta (diagnosis verdict) → token* (eval text chunks) → done (score/level)
// The student sees whether they got the diagnosis right IMMEDIATELY,
// then watches the AI feedback appear word by word.
router.post("/stream", requireAuth(), async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function send(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    const caseId = req.body.caseId;
    const userAnswer = String(req.body.userAnswer || "").trim();
    const questionIdx = parseInt(req.body.questionIdx, 10) || 0;
    if (!caseId || !userAnswer) {
      send("error", { message: "caseId and userAnswer required" });
      return res.end();
    }

    const [caseResult, priorResult] = await Promise.all([
      query(
        `SELECT c.id, c.body, c.questions, c.diagnosis, c.accepted_diagnoses, c.diagnosis_explanation,
                (SELECT COUNT(*)::int FROM case_verifications v
                   WHERE v.case_id=c.id AND v.action='verify') AS verify_count
           FROM cases c WHERE c.id=$1 AND c.deleted_at IS NULL`,
        [caseId]
      ),
      query(
        `SELECT eval_json, score FROM responses
           WHERE user_id=$1 AND case_id=$2
           ORDER BY created_at ASC LIMIT 1`,
        [req.user.id, caseId]
      ),
    ]);

    if (!caseResult.rows[0]) {
      send("error", { message: "Case not found" });
      return res.end();
    }

    const c = caseResult.rows[0];
    const q = (c.questions || [])[questionIdx];
    const verifiedExplanation = (c.verify_count > 0) ? (c.diagnosis_explanation || null) : null;
    const priorRows = priorResult.rows;
    const isPractice = priorRows.length > 0;
    const cachedEvalText = isPractice && priorRows[0].eval_json?.raw
      ? String(priorRows[0].eval_json.raw) : "";

    let dx = matchDiagnosis(userAnswer, c.diagnosis, c.accepted_diagnoses);
    let dxSemantic = null;
    if (dx.correct === false) {
      dxSemantic = await aiSemanticMatch(userAnswer, c.diagnosis, c.accepted_diagnoses, c.diagnosis_explanation, c.body);
      if (dxSemantic?.correct === true) {
        dx = { correct: true, matched: `ai:${dxSemantic.verdict?.toLowerCase() || "semantic"}` };
      } else if (dxSemantic?.verdict === "PARTIAL") {
        dx = { correct: false, matched: "partial", verdict: "PARTIAL" };
      }
    }

    // ── Send diagnosis verdict immediately — student doesn't wait for AI ──────
    send("meta", {
      diagnosisCorrect: dx.correct,
      matchedAlias: dx.matched,
      semanticMatch: dxSemantic
        ? { verdict: dxSemantic.verdict || null, confidence: dxSemantic.confidence, reason: dxSemantic.reason }
        : null,
      correctDiagnosis: c.diagnosis || null,
      diagnosisExplanation: verifiedExplanation,
      caseVerified: c.verify_count > 0,
      practice: isPractice,
    });

    // ── Stream AI eval feedback token by token ────────────────────────────────
    let evalText = "";

    if (isPractice && cachedEvalText) {
      evalText = cachedEvalText;
      send("token", { text: cachedEvalText });
    } else {
      const caseText = `${c.body}\n\nQuestion: ${q ? q.prompt : "Provide your reasoning."}`;
      const diagnosisVerdict = dx.correct === true ? "CORRECT"
        : (dx.verdict === "PARTIAL" || dxSemantic?.verdict === "PARTIAL") ? "PARTIAL"
        : dx.correct === false ? "INCORRECT"
        : "UNKNOWN";
      const matchReason = dxSemantic?.reason
        || (dx.correct === true && dx.matched && !dx.matched.startsWith("ai:") ? `Exact string match to accepted alias: "${dx.matched}".` : null)
        || (diagnosisVerdict === "UNKNOWN" ? "No stored diagnosis to check against — use your own clinical judgment." : "No specific reason provided.");

      const promptTemplate = loadPrompt("evaluationPrompt.txt");
      let prompt = promptTemplate
        .replace("{CASE_TEXT}", caseText)
        .replace("{STUDENT_ANSWER}", userAnswer)
        .replace("{DIAGNOSIS_VERDICT}", diagnosisVerdict)
        .replace("{MATCH_REASON}", matchReason);
      if (c.diagnosis) {
        prompt += `\n\n---\nGround-truth diagnosis: ${c.diagnosis}` +
          (c.diagnosis_explanation ? `\nAuthor's note: ${c.diagnosis_explanation}` : "") +
          `\n\nIn your "Expected Answer" section, explain WHY this diagnosis fits the case using specific features from the case body.`;
      }

      try {
        const stream = await evalOpenai.chat.completions.create({
          model: process.env.AI_EVAL_MODEL || process.env.AI_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 1500,
          stream: true,
          messages: [
            { role: "system", content: "You are a strict, board-certified clinical reasoning examiner. Follow the scoring rules in the prompt exactly — especially the score ceiling imposed by DIAGNOSIS_VERDICT. Never exceed the allowed range. Output only the requested structured format — no markdown, no preamble." },
            { role: "user", content: prompt },
          ],
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            evalText += delta;
            send("token", { text: delta });
          }
        }
      } catch (e) {
        console.error("[eval/stream] ai error (non-fatal)", e.message);
      }
    }

    const score = parseEvalScore(evalText);

    let newAchievements = [];
    if (!isPractice) {
      await query(
        `INSERT INTO responses (user_id, case_id, question_idx, user_answer, eval_json, score)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
        [req.user.id, caseId, questionIdx, userAnswer,
         JSON.stringify({ raw: evalText, diagnosisCorrect: dx.correct, matchedAlias: dx.matched }), score]
      );
      // v6: award XP + unlock achievements
      if (req.user.role === "student") {
        awardXp(req.user.id, evalXp(score)).catch(() => {});
        newAchievements = await checkAndUnlockAchievements(req.user.id, { score, isPractice: false });
      }
      cacheInvalidate(`eval:stats:${req.user.id}`);
      cacheInvalidate(`eval:next:${req.user.id}`);
      cacheInvalidate(`eval:changes:${req.user.id}`);
      cacheInvalidate(`ach:${req.user.id}`);
      cacheInvalidate(`cases:groups:${req.user.id}:`);
    }

    let leveledUp = false, newLevel = null;
    if (!isPractice && req.user.role === "student") {
      const lu = await checkLevelUp(req.user.id, score);
      leveledUp = lu.leveledUp;
      newLevel = lu.newLevel;
    }

    send("done", { score, leveledUp, newLevel, ok: true, newAchievements });
    res.end();
  } catch (e) {
    console.error("[eval/stream] error", e);
    try { send("error", { message: e.message }); res.end(); } catch {}
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
  const _sk = `eval:stats:${userId}`;
  const _sc = cacheGet(_sk);
  if (_sc !== undefined) return res.json(_sc);

  const [
    { rows: agg },
    { rows: bySpec },
    { rows: weak },
    { rows: daily },
    { rows: streakRows },
    { rows: wk },
    { rows: allDays },
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int AS attempts, AVG(score)::float AS avg_score FROM responses WHERE user_id=$1`, [userId]),
    query(`SELECT c.specialty, COUNT(*)::int AS attempts, AVG(r.score)::float AS avg_score FROM responses r JOIN cases c ON c.id=r.case_id WHERE r.user_id=$1 GROUP BY c.specialty ORDER BY attempts DESC`, [userId]),
    query(`SELECT c.specialty, AVG(r.score)::float AS avg_score, COUNT(*)::int AS attempts FROM responses r JOIN cases c ON c.id=r.case_id WHERE r.user_id=$1 GROUP BY c.specialty HAVING COUNT(*) >= 2 AND AVG(r.score) < 6 ORDER BY AVG(r.score) ASC LIMIT 5`, [userId]),
    query(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, AVG(score)::float AS avg_score, COUNT(*)::int AS n FROM responses WHERE user_id=$1 AND created_at > NOW() - INTERVAL '14 days' GROUP BY 1 ORDER BY 1 ASC`, [userId]),
    query(`SELECT DISTINCT date_trunc('day', created_at)::date AS d FROM responses WHERE user_id=$1 ORDER BY d DESC LIMIT 60`, [userId]),
    query(`SELECT COUNT(*)::int AS n FROM responses WHERE user_id=$1 AND created_at > NOW() - INTERVAL '7 days'`, [userId]),
    query(`SELECT DISTINCT date_trunc('day', created_at)::date AS d FROM responses WHERE user_id=$1 ORDER BY d ASC`, [userId]),
  ]);

  const dailyMap = new Map(daily.map((d) => [d.day, d]));
  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = dailyMap.get(key);
    trend.push({ day: key, avg_score: row ? row.avg_score : null, n: row ? row.n : 0 });
  }

  const recent = trend.slice(-7).filter((t) => t.avg_score != null);
  const prior = trend.slice(0, 7).filter((t) => t.avg_score != null);
  const recentAvg = recent.length ? recent.reduce((s, t) => s + t.avg_score, 0) / recent.length : null;
  const priorAvg = prior.length ? prior.reduce((s, t) => s + t.avg_score, 0) / prior.length : null;
  const delta = recentAvg != null && priorAvg != null ? recentAvg - priorAvg : null;

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

  const weeklyCount = wk[0].n;
  const weeklyTarget = 35;

  let maxStreak = 0, run = 0, prev = null;
  for (const r of allDays) {
    const d = new Date(r.d); d.setHours(0, 0, 0, 0);
    if (prev && d.getTime() === prev.getTime() + 86400000) run++;
    else run = 1;
    if (run > maxStreak) maxStreak = run;
    prev = d;
  }
  if (streak > maxStreak) maxStreak = streak;

  let daysSinceLast = null;
  if (streakRows.length > 0) {
    const last = new Date(streakRows[0].d); last.setHours(0, 0, 0, 0);
    daysSinceLast = Math.max(0, Math.round((today.getTime() - last.getTime()) / 86400000));
  }

  let strength = 0, strengthState = "live", strengthFloor = 0;
  if (allDays.length > 0) {
    const firstDay = new Date(allDays[0].d); firstDay.setHours(0, 0, 0, 0);
    const practiceSet = new Set(allDays.map((r) => { const d = new Date(r.d); d.setHours(0, 0, 0, 0); return d.getTime(); }));
    let s = 0, state = "live", curr = 0, bestSoFar = 0, floor = 0;
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
          if (curr >= 5) { state = "live"; const live = ((bestSoFar + curr) / (2 * bestSoFar + 5)) * 100; if (live > s) s = live; }
        }
      } else {
        if (state === "live") { state = "decay"; s = Math.max(s * 0.7, floor); }
        else { s = Math.max(s - 2, floor); }
        curr = 0;
      }
    }
    strength = Math.round(s * 10) / 10;
    strengthState = state;
    strengthFloor = Math.round(floor * 10) / 10;
  }

  const mastery = bySpec.map((s) => ({
    specialty: s.specialty, attempts: s.attempts, avg_score: s.avg_score,
    mastery: s.avg_score != null ? Math.max(0, Math.min(1, s.avg_score / 10)) : null,
  }));

  const _statsResult = { attempts: agg[0].attempts, averageScore: agg[0].avg_score, bySpecialty: bySpec, weakAreas: weak, trend, delta, streak, maxStreak, daysSinceLast, strength, strengthState, strengthFloor, weeklyCount, weeklyTarget, mastery };
  cacheSet(_sk, _statsResult, 60_000);
  res.json(_statsResult);
});

router.get("/next", requireAuth(), async (req, res) => {
  const userId = req.user.id;
  const _nk = `eval:next:${userId}`;
  const _nc = cacheGet(_nk);
  if (_nc !== undefined) return res.json(_nc);
  const [{ rows: weak }, { rows: profile }] = await Promise.all([
    query(`SELECT c.specialty, AVG(r.score)::float AS avg_score, COUNT(*)::int AS n FROM responses r JOIN cases c ON c.id=r.case_id WHERE r.user_id=$1 GROUP BY c.specialty HAVING COUNT(*) >= 2 AND AVG(r.score) < 7 ORDER BY AVG(r.score) ASC LIMIT 1`, [userId]),
    query(`SELECT global_level FROM student_profiles WHERE user_id=$1`, [userId]),
  ]);

  let targetSpecialty = weak[0]?.specialty || null;
  let why = null;
  if (targetSpecialty) why = `Your average in ${targetSpecialty} is ${weak[0].avg_score.toFixed(1)}/10 — sharpening this lifts your overall score the fastest.`;

  const level = profile[0]?.global_level || 1;
  const params = [userId];
  let where = `c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM responses rr WHERE rr.user_id=$1 AND rr.case_id=c.id)`;
  if (targetSpecialty) { params.push(targetSpecialty); where += ` AND c.specialty=$${params.length}`; }
  params.push(level + 1); params.push(Math.max(1, level - 1));
  where += ` AND c.level <= $${params.length - 1} AND c.level >= $${params.length}`;

  let { rows } = await query(
    `SELECT c.id, c.title, c.specialty, c.level, c.body, (SELECT COUNT(*)::int FROM case_verifications WHERE case_id=c.id AND action='verify') AS verify_count FROM cases c WHERE ${where} ORDER BY (SELECT COUNT(*)::int FROM case_verifications WHERE case_id=c.id AND action='verify') DESC, RANDOM() LIMIT 1`,
    params
  );

  if (!rows[0]) {
    const fb = await query(`SELECT c.id, c.title, c.specialty, c.level, c.body, (SELECT COUNT(*)::int FROM case_verifications WHERE case_id=c.id AND action='verify') AS verify_count FROM cases c WHERE c.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM responses rr WHERE rr.user_id=$1 AND rr.case_id=c.id) ORDER BY RANDOM() LIMIT 1`, [userId]);
    rows = fb.rows;
    why = why || "A fresh case to keep your reasoning warm.";
  }

  if (!rows[0]) return res.json({ case: null, why: "You've practiced every case in the library. New ones land weekly." });

  const c = rows[0];
  const preview = (c.body || "").replace(/\s+/g, " ").trim().slice(0, 220);
  const _nextResult = { case: { id: c.id, title: c.title, specialty: c.specialty, level: c.level, verify_count: c.verify_count, preview }, why, targetSpecialty, targetLevel: level };
  cacheSet(_nk, _nextResult, 120_000);
  res.json(_nextResult);
});

router.get("/changes", requireAuth(), async (req, res) => {
  const userId = req.user.id;
  const _ck = `eval:changes:${userId}`;
  const _cc = cacheGet(_ck);
  if (_cc !== undefined) return res.json(_cc);
  const events = [];

  const [{ rows: notifs }, { rows: attempts }] = await Promise.all([
    query(`SELECT id, kind, title, body, link, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`, [userId]),
    query(`SELECT r.id, r.case_id, r.score, r.created_at, c.title, c.specialty FROM responses r JOIN cases c ON c.id=r.case_id WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 6`, [userId]),
  ]);

  for (const n of notifs) events.push({ id: `n-${n.id}`, kind: n.kind, title: n.title, body: n.body, link: n.link, created_at: n.created_at });

  for (const a of attempts) {
    const score = a.score;
    let title, kind;
    if (score == null) { title = `Practiced ${a.specialty}`; kind = "attempt"; }
    else if (score >= 8) { title = `Strong attempt — ${a.specialty}`; kind = "attempt-high"; }
    else if (score < 5) { title = `Tough case — ${a.specialty}`; kind = "attempt-low"; }
    else { title = `Practiced ${a.specialty}`; kind = "attempt"; }
    events.push({ id: `a-${a.id}`, kind, title, body: `${a.title} · ${score != null ? `${score}/10` : "evaluated"}`, link: `/case/${a.case_id || a.id}`, created_at: a.created_at });
  }

  events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const _changesResult = { events: events.slice(0, 10) };
  cacheSet(_ck, _changesResult, 30_000);
  res.json(_changesResult);
});

export default router;
