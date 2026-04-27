import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Shared / default credentials (used as a fallback for any task-specific
// client that doesn't have its own key configured).
const sharedBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const sharedApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

if (!sharedBaseURL || !sharedApiKey) {
  console.warn(
    "[openai] AI_INTEGRATIONS_OPENAI_* env vars missing — task clients will fail unless task-specific keys are set"
  );
}

// Build a task-scoped OpenAI client.
//   prefix = "ASSISTANT" | "MATCH" | "EVAL" | "CASE"
// Looks for {PREFIX}_OPENAI_API_KEY and {PREFIX}_OPENAI_BASE_URL,
// falling back to the shared AI_INTEGRATIONS_OPENAI_* values so the app
// keeps working until you provide dedicated keys.
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

// Four task-scoped clients — each can run on its own provider/key.
export const assistantOpenai = makeClient("ASSISTANT"); // Dr. Rio chat
export const matchOpenai = makeClient("MATCH"); // semantic diagnosis matching
export const evalOpenai = makeClient("EVAL"); // answer evaluation / grading
export const caseOpenai = makeClient("CASE"); // case generation

// Backward-compatible default export — points at the shared credentials.
// Existing imports of `openai` keep working; new code should pick the
// task-specific client above.
export const openai = new OpenAI({
  baseURL: sharedBaseURL,
  apiKey: sharedApiKey || "missing",
});

export function loadPrompt(name) {
  const p = path.join(__dirname, "prompts", name);
  return fs.readFileSync(p, "utf8");
}
