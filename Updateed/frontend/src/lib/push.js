import { api } from "./api.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export function getPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers not supported");
  const reg = await navigator.serviceWorker.getRegistration("/sw.js")
    || await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

export async function getSubscription() {
  if (!isPushSupported()) return null;
  const reg = await ensureServiceWorker();
  return await reg.pushManager.getSubscription();
}

export async function subscribePush() {
  if (!isPushSupported()) throw new Error("Push not supported in this browser");

  let perm = Notification.permission;
  if (perm === "default") {
    perm = await Notification.requestPermission();
  }
  if (perm !== "granted") {
    const err = new Error("Notification permission denied");
    err.code = "denied";
    throw err;
  }

  const reg = await ensureServiceWorker();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await api.get("/api/push/vapid-key");
    if (!key) throw new Error("Server is missing VAPID public key");
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }
  await api.post("/api/push/subscribe", { subscription: sub.toJSON() });
  return sub;
}

export async function unsubscribePush() {
  if (!isPushSupported()) return;
  const reg = await ensureServiceWorker();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch (_) {}
    try { await api.post("/api/push/unsubscribe", { endpoint }); } catch (_) {}
  }
}

export async function sendTestPush() {
  return await api.post("/api/push/test", {});
}
