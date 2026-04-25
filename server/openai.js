import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

if (!baseURL || !apiKey) {
  console.warn("[openai] AI_INTEGRATIONS_OPENAI_* env vars missing — AI evaluation will fail");
}

export const openai = new OpenAI({
  baseURL,
  apiKey: apiKey || "missing",
});

export function loadPrompt(name) {
  const p = path.join(__dirname, "prompts", name);
  return fs.readFileSync(p, "utf8");
}
