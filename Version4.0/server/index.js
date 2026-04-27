import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { installLogCapture } from "./log-buffer.js";
installLogCapture();
import { initDb } from "./db.js";
import { startAdminLogPushBridge } from "./admin-push-bridge.js";
import authRoutes from "./routes/auth.js";
import caseRoutes from "./routes/cases.js";
import evalRoutes from "./routes/eval.js";
import verifyRoutes from "./routes/verify.js";
import discussionRoutes from "./routes/discussions.js";
import profileRoutes from "./routes/profiles.js";
import searchRoutes from "./routes/search.js";
import adminRoutes from "./routes/admin.js";
import notificationRoutes from "./routes/notifications.js";
import pushRoutes from "./routes/push.js";
import loungeRoutes from "./routes/lounge.js";
import messagesRoutes from "./routes/messages.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import assistantRoutes from "./routes/assistant.js";
import supportRoutes from "./routes/support.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const FRONTEND_ROOT = path.resolve(PROJECT_ROOT, "frontend");

const app = express();
const port = Number(process.env.PORT || 5000);
const API_ONLY = process.env.API_ONLY === "1" || process.env.API_ONLY === "true";

const corsOriginEnv = (process.env.CORS_ORIGIN || "").trim();
if (corsOriginEnv) {
  const allowList = corsOriginEnv.split(",").map((s) => s.trim()).filter(Boolean);
  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowList.includes("*")) return cb(null, true);
      if (allowList.includes(origin)) return cb(null, origin);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }));
  app.set("trust proxy", 1);
}

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/eval", evalRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/discussions", discussionRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/lounge", loungeRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/support", supportRoutes);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "clinical-reasoning-trainer", time: new Date().toISOString() });
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found", path: req.path });
});

async function start() {
  await initDb();
  startAdminLogPushBridge();

  if (API_ONLY) {
    app.get("/", (_req, res) => {
      res.json({ ok: true, service: "clinical-reasoning-trainer", mode: "api-only" });
    });
  } else if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: FRONTEND_ROOT,
      server: { middlewareMode: true, host: "0.0.0.0", allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(FRONTEND_ROOT, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.resolve(distPath, "index.html")));
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`[server] Reasonal running on http://0.0.0.0:${port}`);
  });
}

start().catch((err) => {
  console.error("[server] fatal", err);
  process.exit(1);
});
