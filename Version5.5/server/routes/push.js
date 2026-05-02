import express from "express";
import { requireAuth } from "../auth-middleware.js";
import {
  ensurePushConfigured,
  getPublicKey,
  saveSubscription,
  removeSubscription,
  listSubscriptionsForUser,
  getPrefs,
  setPrefs,
  sendPushToUser,
} from "../push.js";

const router = express.Router();

router.get("/vapid-key", async (_req, res) => {
  try {
    const key = await getPublicKey();
    res.json({ key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/me", requireAuth(), async (req, res) => {
  await ensurePushConfigured();
  const subs = await listSubscriptionsForUser(req.user.id);
  const prefs = await getPrefs(req.user.id);
  res.json({
    prefs,
    subscriptions: subs.map((s) => ({
      id: s.id,
      endpoint: s.endpoint,
      device: s.user_agent || "Unknown device",
      created_at: s.created_at,
      last_used_at: s.last_used_at,
    })),
    publicKey: await getPublicKey(),
  });
});

router.post("/subscribe", requireAuth(), async (req, res) => {
  try {
    const { subscription } = req.body || {};
    const ua = req.headers["user-agent"] || null;
    await saveSubscription(req.user.id, subscription, ua);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/unsubscribe", requireAuth(), async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  await removeSubscription(endpoint);
  res.json({ ok: true });
});

router.patch("/prefs", requireAuth(), async (req, res) => {
  const { push_on, kinds } = req.body || {};
  const next = await setPrefs(req.user.id, { push_on, kinds });
  res.json({ prefs: next });
});

router.post("/test", requireAuth(), async (req, res) => {
  const r = await sendPushToUser(req.user.id, {
    title: "CrLearn — test notification",
    body: "If you can read this, push is working.",
    link: "/dashboard",
    kind: "test",
    tag: "reasonal-test",
  });
  res.json(r);
});

export default router;
