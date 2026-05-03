import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import { installLogCapture } from "./log-buffer.js";
installLogCapture();
import { initDb, startDisappearingSweeper } from "./db.js";
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
import mockRoutes from "./routes/mock.js";
import studyRoutes from "./routes/study.js";
import dxRoutes from "./routes/dx.js";
import blogRoutes from "./routes/blog.js";
import neetRoutes from "./routes/neet.js";
import achievementsRoutes from "./routes/achievements.js";
import insightsRoutes from "./routes/insights.js";
import aiRoomRoutes from "./routes/aiRoom.js";
import { isMailerConfigured, sendMail } from "./mailer.js";
import { query as dbQuery } from "./db.js";
import { startDigestScheduler } from "./digestScheduler.js";
import { startNotificationScheduler } from "./notificationScheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const FRONTEND_ROOT = path.resolve(PROJECT_ROOT, "frontend");

const app = express();
const port = Number(process.env.PORT || 5000);
const API_ONLY = process.env.API_ONLY === "1" || process.env.API_ONLY === "true";

app.set("trust proxy", 1);

app.use(compression({ level: 6, threshold: 1024 }));

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
app.use("/api/mock", mockRoutes);
app.use("/api/study", studyRoutes);
app.use("/api/dx", dxRoutes);
app.use("/api/blog", blogRoutes);
app.use("/neet-api", neetRoutes);
app.use("/api/achievements", achievementsRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/admin/ai-room", aiRoomRoutes);
// In-memory rate limiter for contact form: max 3 submissions per IP per hour
const contactRateMap = new Map();
function contactRateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const WINDOW = 60 * 60 * 1000; // 1 hour
  const MAX    = 3;
  const entry  = contactRateMap.get(ip) || { count: 0, resetAt: now + WINDOW };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + WINDOW; }
  if (entry.count >= MAX) {
    const retryMins = Math.ceil((entry.resetAt - now) / 60000);
    return res.status(429).json({
      error: `Too many submissions. Please wait ${retryMins} minute${retryMins !== 1 ? "s" : ""} before trying again.`,
    });
  }
  entry.count += 1;
  contactRateMap.set(ip, entry);
  // Clean up old entries every ~100 requests to avoid memory leaks
  if (contactRateMap.size > 500) {
    for (const [k, v] of contactRateMap) { if (now > v.resetAt) contactRateMap.delete(k); }
  }
  next();
}

app.post("/api/contact", contactRateLimit, async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  let emailed = false;

  // 1. Save to database (always)
  try {
    await dbQuery(
      `INSERT INTO contact_messages (name, email, subject, message, emailed)
       VALUES ($1, $2, $3, $4, $5)`,
      [name.trim(), email.trim(), (subject || "").trim(), message.trim(), false]
    );
  } catch (e) {
    console.error("[contact] db save failed:", e.message);
  }

  // 2. Send email if mailer is configured
  const toAddr = "clinicalreasoningofficial@gmail.com";

  if (isMailerConfigured() && toAddr) {
    try {
      const subjectLine = subject
        ? `[CrLearn Contact] ${subject}`
        : `[CrLearn Contact] Message from ${name}`;
      const text = [
        `Name:    ${name}`,
        `Email:   ${email}`,
        subject ? `Subject: ${subject}` : null,
        ``,
        message,
      ].filter((l) => l !== null).join("\n");

      const html = `
        <div style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#11141A;max-width:560px;">
          <h2 style="margin:0 0 18px;font-size:20px;">New contact form message</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
            <tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600;width:90px;border-radius:6px 0 0 0;">Name</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${name}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600;">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee;"><a href="mailto:${email}">${email}</a></td></tr>
            ${subject ? `<tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:600;">Subject</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${subject}</td></tr>` : ""}
          </table>
          <div style="background:#f9f9f9;border-left:3px solid #4f46e5;border-radius:4px;padding:16px 18px;font-size:14px;line-height:1.7;white-space:pre-wrap;">${message.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
          <p style="margin-top:20px;font-size:12px;color:#888;">Sent via CrLearn contact form</p>
        </div>`;

      await sendMail({ to: toAddr, subject: subjectLine, text, html });
      emailed = true;

      // Update emailed flag
      await dbQuery(
        `UPDATE contact_messages SET emailed=true
         WHERE email=$1 AND message=$2
         ORDER BY created_at DESC LIMIT 1`,
        [email.trim(), message.trim()]
      ).catch(() => {});
    } catch (e) {
      console.error("[contact] email send failed:", e.message);
    }
  } else {
    console.log(`[contact] no mailer — saved to DB only. from=${email} subject=${subject}`);
  }

  res.json({ ok: true, emailed });
});
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "clinical-reasoning-trainer", time: new Date().toISOString() });
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found", path: req.path });
});

async function start() {
  await initDb();
  startAdminLogPushBridge();
  startDisappearingSweeper();
  startDigestScheduler();
  startNotificationScheduler();

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
    app.use(express.static(distPath, {
      maxAge: "1y",
      immutable: true,
      etag: false,
      setHeaders(res, filePath) {
        if (
          filePath.endsWith(".html") ||
          filePath.endsWith(".css") ||
          filePath.endsWith(".webmanifest") ||
          filePath.endsWith("logo.png") ||
          filePath.endsWith("brand-name.png") ||
          filePath.endsWith("notification-icon.png") ||
          filePath.endsWith("icon-192.png") ||
          filePath.endsWith("icon-512.png") ||
          filePath.endsWith("icon-maskable-192.png") ||
          filePath.endsWith("icon-maskable-512.png") ||
          filePath.includes("splash-")
        ) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`[server] CrLearn running on http://0.0.0.0:${port}`);
  });
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

start().catch((err) => {
  console.error("[server] fatal", err);
  process.exit(1);
});
