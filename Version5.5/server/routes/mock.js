import { Router } from "express";
import multer from "multer";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { caseOpenai, matchOpenai, evalOpenai } from "../openai.js";
import { uploadBuffer, destroyAsset, isConfigured } from "../cloudinary.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// ── Public listings ─────────────────────────────────────────────────────────

router.get("/specialties", requireAuth(), async (_req, res) => {
  const { rows } = await query(
    `SELECT specialty, COUNT(*)::int AS n
       FROM mock_questions
      GROUP BY specialty
      ORDER BY specialty ASC`
  );
  res.json({ specialties: rows.map((r) => r.specialty) });
});

router.get("/topics", requireAuth(), async (req, res) => {
  const specialty = (req.query.specialty || "").toString().trim();
  const params = [];
  const where = [];
  if (specialty) { params.push(specialty); where.push(`specialty = $${params.length}`); }
  where.push(`topic IS NOT NULL AND topic <> ''`);
  const { rows } = await query(
    `SELECT topic, COUNT(*)::int AS n
       FROM mock_questions
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY topic
      ORDER BY topic ASC`,
    params
  );
  res.json({ topics: rows.map((r) => r.topic) });
});

// ── AI helpers ──────────────────────────────────────────────────────────────

function getMockModel() {
  return process.env.AI_MOCK_MODEL || process.env.AI_CASE_MODEL || process.env.AI_MODEL || "gpt-4o-mini";
}

function tryParseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) { try { return JSON.parse(text.slice(start, end + 1)); } catch {} }
  return null;
}

async function generateAiQuestions({ specialty, topic, types, count, marksPerQ }) {
  if (count <= 0) return [];
  const wanted = types && types.length ? types : ["mcq"];
  const sys = "You are an expert medical educator. Generate high-quality exam questions in strict JSON.";
  const user = `Generate ${count} medical exam questions for medical students.
Specialty: ${specialty || "any"}
Topic: ${topic || "any"}
Question types allowed: ${wanted.join(", ")}
Each question's marks: ${marksPerQ}

Return a JSON object of the shape:
{ "questions": [
   {
     "type": "mcq" | "saq" | "laq",
     "specialty": "<specialty>",
     "topic": "<topic or empty>",
     "prompt": "<the question text>",
     "options": [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],
     "correct_answer": "A (mcq option id) | <concise model answer> (saq/laq)",
     "explanation": "5-10 sentence explanation of WHY the correct answer is right and common pitfalls",
     "marks": ${marksPerQ}
   }
] }
Strictly output JSON only, no prose.`;
  const model = getMockModel();
  let txt = "";
  try {
    const r = await caseOpenai.chat.completions.create({
      model,
      temperature: 0.6,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    });
    txt = r.choices?.[0]?.message?.content || "";
  } catch (e) {
    console.warn("[mock] AI generation failed:", e?.message || e);
    return [];
  }
  const parsed = tryParseJson(txt);
  const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
  return list
    .filter((q) => q && q.prompt && q.correct_answer && q.explanation && (wanted.includes(q.type)))
    .map((q) => ({
      type: q.type,
      specialty: q.specialty || specialty || "General",
      topic: q.topic || topic || null,
      prompt: String(q.prompt),
      options: q.type === "mcq" ? (Array.isArray(q.options) ? q.options : null) : null,
      correct_answer: String(q.correct_answer),
      explanation: String(q.explanation),
      marks: Number(q.marks) || marksPerQ,
      source: "ai",
    }))
    .slice(0, count);
}

// ── AI generate & save into question bank (admin + doctor) ───────────────────
router.post("/questions/generate", requireAuth(["admin", "doctor"]), async (req, res) => {
  try {
    const b = req.body || {};
    const specialty = (b.specialty || "").toString().trim();
    const topic = (b.topic || "").toString().trim();
    const types = Array.isArray(b.types) && b.types.length
      ? b.types.filter((t) => ["mcq", "saq", "laq"].includes(t))
      : ["mcq"];
    const count = Math.max(1, Math.min(20, Number(b.count) || 5));
    const marksPerQ = Math.max(0.25, Math.min(20, Number(b.marksPerQ) || 1));

    if (!specialty) return res.status(400).json({ error: "specialty is required for AI generation" });

    const generated = await generateAiQuestions({ specialty, topic, types, count, marksPerQ });
    if (generated.length === 0) {
      return res.status(503).json({ error: "AI generation failed. Check AI provider configuration." });
    }

    const ids = [];
    for (const q of generated) {
      const { rows } = await query(
        `INSERT INTO mock_questions (type, specialty, topic, prompt, options, correct_answer, explanation, marks, source, created_by)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,'ai',$9)
         RETURNING id`,
        [q.type, q.specialty, q.topic, q.prompt,
         q.options ? JSON.stringify(q.options) : null,
         q.correct_answer, q.explanation, q.marks, req.user.id]
      );
      ids.push(rows[0].id);
    }
    res.json({ ok: true, count: ids.length, ids });
  } catch (e) {
    console.error("[mock] generate failed", e);
    res.status(500).json({ error: e.message });
  }
});

// ── Start a test ────────────────────────────────────────────────────────────
router.post("/tests", requireAuth(["student", "doctor", "admin"]), async (req, res) => {
  try {
    const specialty = (req.body?.specialty || "").toString().trim();
    const topic = (req.body?.topic || "").toString().trim();
    const types = Array.isArray(req.body?.types) && req.body.types.length
      ? req.body.types.filter((t) => ["mcq", "saq", "laq"].includes(t))
      : ["mcq"];
    const totalMarks = Math.max(1, Math.min(500, Number(req.body?.totalMarks) || 20));
    const negative = !!req.body?.negativeMarking;
    const desiredCount = Math.max(5, Math.min(50, Number(req.body?.count) || Math.round(totalMarks)));
    const marksPerQ = +(totalMarks / desiredCount).toFixed(2);

    const params = [types];
    let where = `type = ANY($1::text[])`;
    if (specialty) { params.push(specialty); where += ` AND specialty = $${params.length}`; }
    if (topic) { params.push(topic); where += ` AND topic = $${params.length}`; }
    const { rows: bank } = await query(
      `SELECT id, type, specialty, topic, prompt, options, correct_answer, explanation, marks, source, attachment_url
         FROM mock_questions
        WHERE ${where}
        ORDER BY random()
        LIMIT ${desiredCount}`,
      params
    );

    let pool = bank.map((q) => ({
      id: q.id,
      type: q.type,
      specialty: q.specialty,
      topic: q.topic,
      prompt: q.prompt,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      marks: Number(q.marks),
      source: q.source,
      attachment_url: q.attachment_url || null,
    }));

    const remaining = desiredCount - pool.length;
    if (remaining > 0) {
      const aiq = await generateAiQuestions({ specialty, topic, types, count: remaining, marksPerQ });
      pool = pool.concat(aiq);
    }

    if (pool.length === 0) {
      return res.status(503).json({
        error: "No questions could be prepared. Add questions to the bank or configure the AI provider.",
      });
    }

    const sumMarks = pool.reduce((s, q) => s + (Number(q.marks) || 1), 0);
    if (sumMarks > 0 && Math.abs(sumMarks - totalMarks) > 0.5) {
      const ratio = totalMarks / sumMarks;
      pool = pool.map((q) => ({ ...q, marks: +(Number(q.marks) * ratio).toFixed(2) }));
    }
    const realTotal = pool.reduce((s, q) => s + Number(q.marks), 0);
    pool.sort(() => Math.random() - 0.5);

    const config = { specialty, topic, types, totalMarks, negativeMarking: negative, count: pool.length };
    const { rows } = await query(
      `INSERT INTO mock_tests (user_id, config, questions, total_marks)
       VALUES ($1, $2::jsonb, $3::jsonb, $4)
       RETURNING id`,
      [req.user.id, JSON.stringify(config), JSON.stringify(pool), realTotal]
    );
    const id = rows[0].id;

    const playable = pool.map(({ correct_answer, explanation, ...rest }) => rest);
    res.json({ id, totalMarks: realTotal, count: pool.length, config, questions: playable });
  } catch (e) {
    console.error("[mock] start failed", e);
    res.status(500).json({ error: e.message || "Failed to start test" });
  }
});

// ── Submit a test ───────────────────────────────────────────────────────────
// AI semantic grader for a single SAQ/LAQ answer — mirrors aiSemanticMatch in eval.js
// Returns { score: 0.0-1.0, verdict: "CORRECT"|"PARTIAL"|"INCORRECT", reason: string }
async function aiMatchAnswer(prompt, correctAnswer, studentAnswer) {
  if (!studentAnswer || !correctAnswer) return { score: 0, verdict: "INCORRECT", reason: "No answer" };
  const sys =
    "You are a clinical examiner grading a student's short or long answer. " +
    "Compare the student's answer to the model answer. Match on medical CONTENT, not wording. " +
    "Synonyms, abbreviations, and different phrasings are acceptable. " +
    "Reply ONLY in this format on three lines:\n" +
    "Verdict: CORRECT | PARTIAL | INCORRECT\nConfidence: <0.0-1.0>\nReason: <one short sentence>";
  const user =
    `Question: ${prompt}\n` +
    `Model answer: ${correctAnswer}\n` +
    `Student answer: ${studentAnswer}`;
  try {
    const resp = await matchOpenai.chat.completions.create({
      model: process.env.AI_MATCH_MODEL || process.env.AI_MODEL || "gpt-4o-mini",
      temperature: 0,
      max_tokens: 120,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    });
    const text = resp.choices?.[0]?.message?.content || "";
    const verdictM = text.match(/Verdict:\s*(CORRECT|PARTIAL|INCORRECT)/i);
    const confM = text.match(/Confidence:\s*(0?\.\d+|1(?:\.0+)?|0|1)/i);
    const reasonM = text.match(/Reason:\s*(.+)/i);
    const verdict = verdictM ? verdictM[1].toUpperCase() : "INCORRECT";
    const confidence = confM ? Math.max(0, Math.min(1, parseFloat(confM[1]))) : 0;
    const reason = reasonM ? reasonM[1].trim() : null;
    let score = 0;
    if (verdict === "CORRECT") score = 1.0;
    else if (verdict === "PARTIAL") score = confidence >= 0.7 ? 0.75 : 0.5;
    return { score, verdict, reason };
  } catch (e) {
    console.warn("[mock] AI answer match failed:", e?.message || e);
    return { score: 0, verdict: "INCORRECT", reason: null };
  }
}

// evalOpenai feedback — what the student missed in their SAQ/LAQ answer
async function aiEvaluateAnswer(prompt, correctAnswer, studentAnswer, verdict) {
  if (!studentAnswer) return null;
  const sys =
    "You are a medical exam tutor reviewing a student's answer to a clinical question. " +
    "Be terse, specific, and clinically accurate. No markdown, no asterisks, no emojis. " +
    "Output EXACTLY this format on separate lines:\n" +
    "What You Got Right:\n- <point> (or: Nothing valid)\n\n" +
    "What Was Missing:\n- <specific point from model answer not covered by student>\n- (2-4 bullets)\n\n" +
    "One-Line Rule:\n- <one concrete, behaviourally specific improvement tip for next time>";
  const user =
    `Question: ${prompt}\n` +
    `Model answer: ${correctAnswer}\n` +
    `Student answer: ${studentAnswer}\n` +
    `Semantic verdict: ${verdict || "UNKNOWN"}`;
  try {
    const resp = await evalOpenai.chat.completions.create({
      model: process.env.AI_EVAL_MODEL || process.env.AI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });
    return resp.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.warn("[mock] eval feedback failed:", e?.message || e);
    return null;
  }
}

// Batch-grade all SAQ/LAQ items — match + eval run in parallel per question
async function aiGradeOpenAnswers(items) {
  // items: [{ index, prompt, correct_answer, given }]
  if (!items.length) return {};
  const results = await Promise.all(
    items.map(async (it) => {
      const match = await aiMatchAnswer(it.prompt, it.correct_answer, it.given);
      const feedback = await aiEvaluateAnswer(it.prompt, it.correct_answer, it.given, match.verdict);
      return { ...match, feedback };
    })
  );
  const map = {};
  items.forEach((it, i) => { map[it.index] = results[i]; });
  return map;
}

router.post("/tests/:id/submit", requireAuth(), async (req, res) => {
  try {
    const id = req.params.id;
    const { rows } = await query(
      `SELECT id, user_id, config, questions, status, total_marks FROM mock_tests WHERE id=$1`,
      [id]
    );
    const t = rows[0];
    if (!t) return res.status(404).json({ error: "Test not found" });
    if (t.user_id !== req.user.id) return res.status(403).json({ error: "Forbidden" });
    if (t.status === "submitted") return res.status(400).json({ error: "Test already submitted" });

    const answers = (req.body?.answers && typeof req.body.answers === "object") ? req.body.answers : {};
    const negative = !!t.config?.negativeMarking;

    // First pass: build review rows; MCQ graded immediately, SAQ/LAQ pending AI
    const review = t.questions.map((q, idx) => {
      const given = answers[String(idx)] != null ? String(answers[String(idx)]).trim() : "";
      const correct = String(q.correct_answer || "").trim();
      let isCorrect = false;
      if (q.type === "mcq") {
        isCorrect = !!(given && correct && given.toUpperCase() === correct.toUpperCase());
      }
      return {
        index: idx,
        type: q.type,
        specialty: q.specialty,
        topic: q.topic,
        prompt: q.prompt,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        marks: Number(q.marks) || 0,
        given_answer: given,
        is_correct: isCorrect,
        ai_score: null,
        attachment_url: q.attachment_url || null,
      };
    });

    // AI-grade all SAQ/LAQ items in parallel using the same matchOpenai used in case practice
    const openItems = review.filter((r) => (r.type === "saq" || r.type === "laq") && r.given_answer);
    if (openItems.length > 0) {
      const aiResults = await aiGradeOpenAnswers(
        openItems.map((r) => ({
          index: r.index,
          prompt: r.prompt,
          correct_answer: r.correct_answer,
          given: r.given_answer,
        }))
      );
      for (const r of review) {
        const res = aiResults[r.index];
        if (res) {
          r.ai_score = res.score;
          r.ai_verdict = res.verdict;
          r.ai_reason = res.reason;
          r.ai_feedback = res.feedback || null;
          r.is_correct = res.score >= 0.5;
          r.is_partial = res.score > 0 && res.score < 0.5;
        }
      }
    }

    // Compute scores
    let obtained = 0;
    for (const r of review) {
      let score = 0;
      if (r.type === "saq" || r.type === "laq") {
        if (r.given_answer) {
          score = +(( r.ai_score ?? (r.is_correct ? 1 : 0)) * r.marks).toFixed(2);
        }
      } else {
        if (r.is_correct) score = r.marks;
        else if (negative && r.given_answer) score = +(-(r.marks * 0.25)).toFixed(2);
      }
      r.score = +score.toFixed(2);
      obtained += score;
    }
    obtained = +obtained.toFixed(2);

    // Persist scoring data back into questions for history view
    const scoredPool = t.questions.map((q, idx) => {
      const r = review.find((rv) => rv.index === idx);
      if (!r) return q;
      return {
        ...q,
        _score: r.score,
        _is_correct: r.is_correct,
        _is_partial: r.is_partial ?? false,
        _ai_score: r.ai_score ?? null,
        _ai_verdict: r.ai_verdict ?? null,
        _ai_reason: r.ai_reason ?? null,
        _ai_feedback: r.ai_feedback ?? null,
      };
    });

    await query(
      `UPDATE mock_tests SET answers=$1::jsonb, questions=$2::jsonb, obtained_marks=$3, status='submitted', submitted_at=NOW() WHERE id=$4`,
      [JSON.stringify(answers), JSON.stringify(scoredPool), obtained, id]
    );

    res.json({ id, obtained, total_marks: Number(t.total_marks), config: t.config, review });
  } catch (e) {
    console.error("[mock] submit failed", e);
    res.status(500).json({ error: e.message || "Failed to submit" });
  }
});

// ── Retrieve a test ─────────────────────────────────────────────────────────
router.get("/tests/:id", requireAuth(), async (req, res) => {
  const id = req.params.id;
  const { rows } = await query(
    `SELECT id, user_id, config, questions, answers, obtained_marks, total_marks, status, started_at, submitted_at
       FROM mock_tests WHERE id=$1`,
    [id]
  );
  const t = rows[0];
  if (!t) return res.status(404).json({ error: "Test not found" });
  if (t.user_id !== req.user.id && req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  if (t.status === "submitted") {
    const review = t.questions.map((q, idx) => {
      const given = t.answers[String(idx)] != null ? String(t.answers[String(idx)]) : "";
      // Rehydrate scoring (stored at submit time with _ prefix)
      const isCorrect = q._is_correct != null
        ? q._is_correct
        : (q.type === "mcq"
            ? String(q.correct_answer || "").toUpperCase() === String(given || "").toUpperCase()
            : false);
      const isPartial = q._is_partial ?? false;
      const score = q._score != null ? q._score : (isCorrect ? Number(q.marks) : 0);
      return {
        index: idx,
        ...q,
        given_answer: given,
        is_correct: isCorrect,
        is_partial: isPartial,
        score,
        ai_score: q._ai_score ?? null,
        ai_verdict: q._ai_verdict ?? null,
        ai_reason: q._ai_reason ?? null,
        ai_feedback: q._ai_feedback ?? null,
      };
    });
    return res.json({
      id: t.id, status: t.status, config: t.config,
      total_marks: Number(t.total_marks),
      obtained: Number(t.obtained_marks),
      started_at: t.started_at, submitted_at: t.submitted_at,
      review,
    });
  }

  const playable = t.questions.map(({ correct_answer, explanation, ...rest }, idx) => ({ index: idx, ...rest }));
  res.json({
    id: t.id, status: t.status, config: t.config,
    total_marks: Number(t.total_marks),
    started_at: t.started_at,
    questions: playable,
    answers: t.answers,
  });
});

// ── History ─────────────────────────────────────────────────────────────────
router.get("/history", requireAuth(), async (req, res) => {
  const { rows } = await query(
    `SELECT id, config, total_marks, obtained_marks, status, started_at, submitted_at
       FROM mock_tests WHERE user_id=$1 ORDER BY started_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ tests: rows });
});

// ── Mock Test Leaderboard ───────────────────────────────────────────────────
router.get("/leaderboard", requireAuth(), async (req, res) => {
  try {
    const period = (req.query.period || "all").toString();
    const specialty = (req.query.specialty || "").toString().trim();
    const topic = (req.query.topic || "").toString().trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = 25;

    let intervalClause = "";
    if (period === "today") intervalClause = "AND mt.submitted_at >= CURRENT_DATE";
    else if (period === "week") intervalClause = "AND mt.submitted_at > NOW() - INTERVAL '7 days'";

    const filterParams = [];
    let filterClause = "";
    if (specialty) { filterParams.push(specialty); filterClause += ` AND mt.config->>'specialty' = $${filterParams.length}`; }
    if (topic) { filterParams.push(topic); filterClause += ` AND mt.config->>'topic' = $${filterParams.length}`; }

    const baseWhere = `mt.status='submitted' ${intervalClause} ${filterClause}`;

    const { rows: countRows } = await query(
      `SELECT COUNT(DISTINCT mt.user_id)::int AS total FROM mock_tests mt WHERE ${baseWhere}`,
      filterParams
    );
    const totalUsers = countRows[0]?.total || 0;

    const limitParam = [...filterParams, pageSize, (page - 1) * pageSize];
    const { rows } = await query(
      `SELECT
          u.id AS user_id,
          u.username,
          u.full_name,
          u.avatar_url,
          COUNT(mt.id)::int AS attempts,
          ROUND(AVG(mt.obtained_marks::numeric / NULLIF(mt.total_marks::numeric,0) * 100), 1) AS avg_pct,
          MAX(mt.obtained_marks::numeric / NULLIF(mt.total_marks::numeric,0) * 100) AS best_pct
       FROM mock_tests mt
       JOIN users u ON u.id = mt.user_id
      WHERE ${baseWhere}
      GROUP BY u.id, u.username, u.full_name, u.avatar_url
      ORDER BY avg_pct DESC NULLS LAST, attempts DESC
      LIMIT $${limitParam.length - 1} OFFSET $${limitParam.length}`,
      limitParam
    );

    const ranked = rows.map((r, i) => ({
      rank: (page - 1) * pageSize + i + 1,
      userId: r.user_id,
      username: r.username,
      name: r.full_name,
      avatarUrl: r.avatar_url || null,
      attempts: r.attempts,
      avgPct: r.avg_pct != null ? Number(r.avg_pct) : null,
      bestPct: r.best_pct != null ? Number(r.best_pct) : null,
    }));

    const topThree = ranked.slice(0, 3);
    const tableRows = ranked.slice(3);

    let currentUser = null;
    const myIdx = ranked.findIndex((r) => r.userId === req.user.id);
    if (myIdx >= 0) {
      currentUser = { row: ranked[myIdx], rank: ranked[myIdx].rank };
    }

    res.json({
      totalUsers,
      totalPages: Math.max(1, Math.ceil(totalUsers / pageSize)),
      topThree,
      rows: tableRows,
      currentUser,
    });
  } catch (e) {
    console.error("[mock] leaderboard failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/leaderboard/specialties", requireAuth(), async (_req, res) => {
  const { rows } = await query(
    `SELECT DISTINCT config->>'specialty' AS specialty
       FROM mock_tests WHERE status='submitted' AND config->>'specialty' IS NOT NULL AND config->>'specialty' <> ''
      ORDER BY specialty ASC`
  );
  res.json({ specialties: rows.map((r) => r.specialty).filter(Boolean) });
});

router.get("/leaderboard/topics", requireAuth(), async (req, res) => {
  const specialty = (req.query.specialty || "").toString().trim();
  const params = [];
  let extra = "";
  if (specialty) { params.push(specialty); extra = ` AND config->>'specialty' = $1`; }
  const { rows } = await query(
    `SELECT DISTINCT config->>'topic' AS topic
       FROM mock_tests
      WHERE status='submitted' AND config->>'topic' IS NOT NULL AND config->>'topic' <> '' ${extra}
      ORDER BY topic ASC`,
    params
  );
  res.json({ topics: rows.map((r) => r.topic).filter(Boolean) });
});

// ── Bulk question upload ─────────────────────────────────────────────────────

function parseBulkQuestions(text) {
  const blocks = String(text || "")
    .split(/^\s*={2,}\s*question\s*={2,}\s*$/gim)
    .map((b) => b.trim())
    .filter(Boolean);

  const results = [];
  const errors = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const n = i + 1;

    function field(key) {
      const m = new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, "im").exec(block);
      return m ? m[1].trim() : "";
    }
    function multilineField(key) {
      const m = new RegExp(`^\\s*${key}\\s*:\\s*([\\s\\S]*?)(?=^\\s*[A-Za-z_]+\\s*:|$)`, "im").exec(block);
      return m ? m[1].trim() : "";
    }

    const rawType = field("type").toLowerCase();
    const type = ["mcq", "saq", "laq"].includes(rawType) ? rawType : "mcq";
    const specialty = field("specialty");
    const topic = field("topic") || null;
    const marks = Math.max(0.25, Math.min(20, parseFloat(field("marks")) || 1));
    const prompt = field("question") || multilineField("question");
    const explanation = field("explanation") || multilineField("explanation");
    const correctAnswer = field("answer");

    if (!specialty) { errors.push({ index: n, error: "Missing Specialty" }); continue; }
    if (!prompt) { errors.push({ index: n, error: "Missing Question" }); continue; }
    if (!correctAnswer) { errors.push({ index: n, error: "Missing Answer" }); continue; }
    if (!explanation) { errors.push({ index: n, error: "Missing Explanation" }); continue; }

    let options = null;
    if (type === "mcq") {
      const optLines = [];
      const optRegex = /^[ \t]*([A-Z])\s*[:.)\-]\s*(.+)$/gm;
      let m;
      while ((m = optRegex.exec(block)) !== null) {
        optLines.push({ id: m[1].trim(), text: m[2].trim() });
      }
      if (optLines.length >= 2) {
        options = optLines;
      } else {
        errors.push({ index: n, error: "MCQ needs at least 2 options (A: ..., B: ..., etc.)" });
        continue;
      }
    }

    results.push({ type, specialty, topic, marks, prompt, explanation, correct_answer: correctAnswer, options, source: "manual" });
  }

  return { questions: results, errors };
}

router.post("/questions/bulk", requireAuth(["admin", "doctor"]), upload.any(), async (req, res) => {
  try {
    const text = (req.body?.text || "").toString().trim();
    if (!text) return res.status(400).json({ error: "No text provided" });

    // Build a map from field name → multer file object
    const fileMap = {};
    if (Array.isArray(req.files)) {
      for (const f of req.files) fileMap[f.fieldname] = f;
    }

    const { questions, errors } = parseBulkQuestions(text);
    if (questions.length === 0 && errors.length === 0) {
      return res.status(400).json({ error: "No question blocks found. Separate each question with === QUESTION ===" });
    }

    const created = [];
    const insertErrors = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      try {
        const { rows } = await query(
          `INSERT INTO mock_questions (type, specialty, topic, prompt, options, correct_answer, explanation, marks, source, created_by)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,'manual',$9)
           RETURNING id`,
          [q.type, q.specialty, q.topic, q.prompt,
           q.options ? JSON.stringify(q.options) : null,
           q.correct_answer, q.explanation, q.marks, req.user.id]
        );
        const qid = rows[0].id;

        // Upload per-question image if provided (field name: question_1, question_2, …)
        const fileEntry = fileMap[`question_${i + 1}`];
        let attachUrl = null;
        if (fileEntry && isConfigured()) {
          try {
            const result = await uploadBuffer(fileEntry.buffer, { folder: "mock_questions" });
            await query(
              `UPDATE mock_questions SET attachment_url=$1, attachment_key=$2, updated_at=NOW() WHERE id=$3`,
              [result.secure_url, result.public_id, qid]
            );
            attachUrl = result.secure_url;
          } catch (uploadErr) {
            console.warn(`[mock] attachment upload failed for block ${i + 1}:`, uploadErr?.message || uploadErr);
          }
        }

        created.push({ id: qid, specialty: q.specialty, type: q.type, attachment_url: attachUrl });
      } catch (e) {
        insertErrors.push({ index: i + 1, specialty: q.specialty, error: e.message });
      }
    }

    res.json({
      ok: true,
      createdCount: created.length,
      errorCount: errors.length + insertErrors.length,
      created,
      errors: [...errors, ...insertErrors],
    });
  } catch (e) {
    console.error("[mock] bulk upload failed", e);
    res.status(500).json({ error: e.message });
  }
});

// ── Question bank CRUD ───────────────────────────────────────────────────────
router.get("/questions", requireAuth(["admin", "doctor"]), async (req, res) => {
  const specialty = (req.query.specialty || "").toString().trim();
  const params = [];
  let where = "";
  if (specialty) { params.push(specialty); where = ` WHERE specialty = $1`; }
  const { rows } = await query(
    `SELECT q.id, q.type, q.specialty, q.topic, q.prompt, q.options, q.correct_answer,
            q.explanation, q.marks, q.difficulty, q.source, q.attachment_url, q.created_at,
            u.username AS author
       FROM mock_questions q LEFT JOIN users u ON u.id = q.created_by
       ${where}
      ORDER BY q.created_at DESC LIMIT 500`,
    params
  );
  res.json({ questions: rows });
});

router.post("/questions", requireAuth(["admin", "doctor"]), async (req, res) => {
  try {
    const b = req.body || {};
    const type = ["mcq", "saq", "laq"].includes(b.type) ? b.type : null;
    if (!type) return res.status(400).json({ error: "type must be mcq | saq | laq" });
    if (!b.specialty || !b.prompt || !b.correct_answer || !b.explanation) {
      return res.status(400).json({ error: "specialty, prompt, correct_answer, explanation are required" });
    }
    const options = type === "mcq" ? (Array.isArray(b.options) ? b.options : null) : null;
    if (type === "mcq" && (!options || options.length < 2)) {
      return res.status(400).json({ error: "MCQ requires at least 2 options" });
    }
    const marks = Math.max(0.25, Math.min(20, Number(b.marks) || 1));
    const { rows } = await query(
      `INSERT INTO mock_questions (type, specialty, topic, prompt, options, correct_answer, explanation, marks, difficulty, source, created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'manual',$10)
       RETURNING id`,
      [type, b.specialty, b.topic || null, b.prompt, options ? JSON.stringify(options) : null,
       String(b.correct_answer), String(b.explanation), marks, b.difficulty || null, req.user.id]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error("[mock] create question failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/questions/:id/attachment", requireAuth(["admin", "doctor"]), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!isConfigured()) return res.status(503).json({ error: "Cloudinary not configured — ask admin to set CLOUDINARY credentials" });
    const result = await uploadBuffer(req.file.buffer, { folder: "mock_questions" });
    await query(
      `UPDATE mock_questions SET attachment_url=$1, attachment_key=$2, updated_at=NOW() WHERE id=$3`,
      [result.secure_url, result.public_id, req.params.id]
    );
    res.json({ ok: true, url: result.secure_url });
  } catch (e) {
    console.error("[mock] attachment upload failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/questions/:id/attachment", requireAuth(["admin"]), async (req, res) => {
  try {
    const { rows } = await query(`SELECT attachment_key FROM mock_questions WHERE id=$1`, [req.params.id]);
    if (rows[0]?.attachment_key) await destroyAsset(rows[0].attachment_key).catch(() => {});
    await query(`UPDATE mock_questions SET attachment_url=NULL, attachment_key=NULL, updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/questions/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const b = req.body || {};
    const fields = [];
    const params = [];
    function add(col, val) { params.push(val); fields.push(`${col}=$${params.length}`); }
    if (b.type) { if (!["mcq","saq","laq"].includes(b.type)) return res.status(400).json({ error: "bad type" }); add("type", b.type); }
    if (b.specialty != null) add("specialty", b.specialty);
    if (b.topic !== undefined) add("topic", b.topic || null);
    if (b.prompt != null) add("prompt", b.prompt);
    if (b.options !== undefined) { params.push(b.options && b.options.length ? JSON.stringify(b.options) : null); fields.push(`options=$${params.length}::jsonb`); }
    if (b.correct_answer != null) add("correct_answer", String(b.correct_answer));
    if (b.explanation != null) add("explanation", String(b.explanation));
    if (b.marks != null) add("marks", Math.max(0.25, Math.min(20, Number(b.marks))));
    if (b.difficulty !== undefined) add("difficulty", b.difficulty || null);
    if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
    fields.push(`updated_at=NOW()`);
    params.push(req.params.id);
    await query(`UPDATE mock_questions SET ${fields.join(", ")} WHERE id=$${params.length}`, params);
    res.json({ ok: true });
  } catch (e) {
    console.error("[mock] update question failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/questions/:id", requireAuth(["admin"]), async (req, res) => {
  try {
    const { rows } = await query(`SELECT attachment_key FROM mock_questions WHERE id=$1`, [req.params.id]);
    if (rows[0]?.attachment_key) await destroyAsset(rows[0].attachment_key).catch(() => {});
    await query(`DELETE FROM mock_questions WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
