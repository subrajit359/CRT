import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sharedBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const sharedApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

if (!sharedBaseURL || !sharedApiKey) {
  console.warn(
    "[openai] AI_INTEGRATIONS_OPENAI_* env vars missing — task clients will fail unless task-specific keys are set"
  );
}

function makeClient(prefix) {
  const apiKey = process.env[`${prefix}_OPENAI_API_KEY`] || sharedApiKey;
  const baseURL = process.env[`${prefix}_OPENAI_BASE_URL`] || sharedBaseURL;
  const usingDedicated = Boolean(process.env[`${prefix}_OPENAI_API_KEY`]);
  console.log(
    `[openai] ${prefix.toLowerCase()} client → ${
      usingDedicated ? "dedicated key" : "shared key"
    }${baseURL ? ` @ ${baseURL}` : ""}`
  );
  return new OpenAI({
    baseURL,
    apiKey: apiKey || "missing",
  });
}

export const assistantOpenai = makeClient("ASSISTANT");
export const matchOpenai = makeClient("MATCH");
export const evalOpenai = makeClient("EVAL");
export const caseOpenai = makeClient("CASE");
export const coachOpenai = new OpenAI({
  baseURL: process.env.AI_COACH_OPENAI_BASE_URL || process.env.CASE_OPENAI_BASE_URL || sharedBaseURL,
  apiKey: process.env.AI_COACH_OPENAI_API_KEY || process.env.CASE_OPENAI_API_KEY || sharedApiKey || "missing",
  defaultQuery: process.env.AI_COACH_MODEL ? { model: process.env.AI_COACH_MODEL } : undefined,
});

// Groq fallback client — used when the primary case client (Gemini) is rate-limited.
// Reuses ASSISTANT credentials which already point to Groq.
export const groqFallbackOpenai = new OpenAI({
  baseURL: process.env.ASSISTANT_OPENAI_BASE_URL || sharedBaseURL,
  apiKey: process.env.ASSISTANT_OPENAI_API_KEY || sharedApiKey || "missing",
});

export const openai = new OpenAI({
  baseURL: sharedBaseURL,
  apiKey: sharedApiKey || "missing",
});

// ── Prompt cache — loaded once at startup, never re-read from disk ──────────
const _promptCache = new Map();
const promptsDir = path.join(__dirname, "prompts");

function _warmPromptCache() {
  try {
    const files = fs.readdirSync(promptsDir);
    for (const f of files) {
      if (!f.endsWith(".txt")) continue;
      try {
        const content = fs.readFileSync(path.join(promptsDir, f), "utf8");
        _promptCache.set(f, content);
        console.log(`[openai] prompt cached: ${f}`);
      } catch (e) {
        console.warn(`[openai] could not cache prompt ${f}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn(`[openai] prompts dir unreadable: ${e.message}`);
  }
}

_warmPromptCache();

export function loadPrompt(name) {
  if (_promptCache.has(name)) return _promptCache.get(name);
  // Fallback: read from disk if somehow not cached (e.g. new file added at runtime)
  const p = path.join(promptsDir, name);
  const content = fs.readFileSync(p, "utf8");
  _promptCache.set(name, content);
  return content;
}
