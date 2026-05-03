import { Router } from "express";
import OpenAI from "openai";
import { requireAuth } from "../auth-middleware.js";
import { query } from "../db.js";

const router = Router();

// ── AI definitions ───────────────────────────────────────────────────────────
function buildDefs() {
  const shared = {
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  };

  return [
    {
      id: "assistant",
      name: "Assistant AI",
      emoji: "🤖",
      description: "Powers the in-app chat assistant (Dr. Rio) and AI Insights coaching tips",
      usedIn: ["Chat assistant (Dr. Rio)", "AI Insights coaching", "Case generation fallback"],
      baseURL: process.env.ASSISTANT_OPENAI_BASE_URL || shared.baseURL,
      apiKey:  process.env.ASSISTANT_OPENAI_API_KEY  || shared.apiKey,
      model:   null,
      envVars: ["ASSISTANT_OPENAI_BASE_URL", "ASSISTANT_OPENAI_API_KEY"],
    },
    {
      id: "eval",
      name: "Eval AI",
      emoji: "📋",
      description: "Evaluates student answers to clinical cases and generates scores & detailed feedback",
      usedIn: ["Case evaluation", "Score & feedback generation"],
      baseURL: process.env.EVAL_OPENAI_BASE_URL || shared.baseURL,
      apiKey:  process.env.EVAL_OPENAI_API_KEY  || shared.apiKey,
      model:   null,
      envVars: ["EVAL_OPENAI_BASE_URL", "EVAL_OPENAI_API_KEY"],
    },
    {
      id: "match",
      name: "Match AI",
      emoji: "🔍",
      description: "Matches student responses to clinical case patterns and evaluates mock test answers",
      usedIn: ["Response matching", "Mock test evaluation"],
      baseURL: process.env.MATCH_OPENAI_BASE_URL || shared.baseURL,
      apiKey:  process.env.MATCH_OPENAI_API_KEY  || shared.apiKey,
      model:   null,
      envVars: ["MATCH_OPENAI_BASE_URL", "MATCH_OPENAI_API_KEY"],
    },
    {
      id: "case",
      name: "Case AI",
      emoji: "🏥",
      description: "Generates new clinical cases for the case library (admin only). Uses Gemini as primary model.",
      usedIn: ["Case generation", "Mock question generation"],
      baseURL: process.env.CASE_OPENAI_BASE_URL || shared.baseURL,
      apiKey:  process.env.CASE_OPENAI_API_KEY  || shared.apiKey,
      model:   null,
      envVars: ["CASE_OPENAI_BASE_URL", "CASE_OPENAI_API_KEY"],
    },
    {
      id: "coach",
      name: "Coach AI",
      emoji: "🎯",
      description: "Generates personalised weekly performance tips and coaching advice for students",
      usedIn: ["Weekly digest tips", "Insights page coaching"],
      baseURL: process.env.AI_COACH_OPENAI_BASE_URL || process.env.CASE_OPENAI_BASE_URL || shared.baseURL,
      apiKey:  process.env.AI_COACH_OPENAI_API_KEY  || process.env.CASE_OPENAI_API_KEY  || shared.apiKey,
      model:   process.env.AI_COACH_MODEL || null,
      envVars: ["AI_COACH_OPENAI_BASE_URL", "AI_COACH_OPENAI_API_KEY", "AI_COACH_MODEL"],
    },
    {
      id: "task",
      name: "Task AI",
      emoji: "📬",
      description: "Generates content for daily push notifications: good morning, good night, festival greetings, and learning nudges",
      usedIn: ["Morning notification", "Night notification", "Festival greeting", "Weekly learning nudge"],
      baseURL: process.env.TASK_AI_BASE_URL || "https://api.groq.com/openai/v1",
      apiKey:  process.env.TASK_AI_API_KEY  || process.env.GROQ_API_KEY,
      model:   process.env.TASK_AI_MODEL    || "llama-3.1-8b-instant",
      envVars: ["TASK_AI_BASE_URL", "TASK_AI_API_KEY", "TASK_AI_MODEL"],
    },
  ];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function getAIEnabled(aiId) {
  try {
    const r = await query(
      "SELECT value FROM app_config WHERE key = $1",
      [`ai_room_${aiId}_enabled`]
    );
    if (!r.rows.length) return true;
    return r.rows[0].value !== "false";
  } catch { return true; }
}

async function setAIEnabled(aiId, enabled) {
  await query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [`ai_room_${aiId}_enabled`, String(enabled)]
  );
  return enabled;
}

async function testAI(def) {
  if (!def.apiKey || !def.baseURL) {
    return { ok: false, error: "Missing API key or base URL in environment", latencyMs: null };
  }
  const client = new OpenAI({ baseURL: def.baseURL, apiKey: def.apiKey });
  const model  = def.model || "llama-3.1-8b-instant";
  const t0 = Date.now();
  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
      max_tokens: 5,
      temperature: 0,
    });
    const latencyMs = Date.now() - t0;
    const reply = resp.choices?.[0]?.message?.content?.trim() || "";
    return { ok: true, reply, latencyMs, model: resp.model || model };
  } catch (e) {
    return { ok: false, error: e.message || String(e), latencyMs: Date.now() - t0 };
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.get("/", requireAuth(["admin"]), async (req, res) => {
  try {
    const defs = buildDefs();
    const results = await Promise.all(
      defs.map(async (d) => {
        const enabled = await getAIEnabled(d.id);
        const configured = !!(d.apiKey && d.baseURL);
        return {
          id:          d.id,
          name:        d.name,
          emoji:       d.emoji,
          description: d.description,
          usedIn:      d.usedIn,
          envVars:     d.envVars,
          configured,
          enabled,
          model:       d.model || null,
        };
      })
    );
    res.json({ ais: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/test", requireAuth(["admin"]), async (req, res) => {
  const { aiId } = req.body || {};
  if (!aiId) return res.status(400).json({ error: "aiId required" });
  const defs = buildDefs();
  const def = defs.find((d) => d.id === aiId);
  if (!def) return res.status(404).json({ error: "Unknown AI id" });
  const result = await testAI(def);
  res.json(result);
});

router.post("/toggle", requireAuth(["admin"]), async (req, res) => {
  const { aiId, enabled } = req.body || {};
  if (!aiId) return res.status(400).json({ error: "aiId required" });
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled (boolean) required" });
  const defs = buildDefs();
  if (!defs.find((d) => d.id === aiId)) return res.status(404).json({ error: "Unknown AI id" });
  await setAIEnabled(aiId, enabled);
  res.json({ aiId, enabled });
});

export default router;
