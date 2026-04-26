import { api } from "./api.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

export async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}

export async function getCurrentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return await reg.pushManager.getSubscription();
}

function deniedError() {
  const err = new Error("Notifications are blocked for this site. Reset the permission from your browser's site settings, then try again.");
  err.code = "denied";
  return err;
}

export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error("Push notifications aren't supported in this browser.");
  }
  if (typeof Notification !== "undefined" && Notification.permission === "denied") {
    throw deniedError();
  }
  const reg = await ensureServiceWorker();
  if (!reg) throw new Error("Service worker registration failed.");

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await api.get("/api/push/vapid-key");
    if (!key) throw new Error("Server did not return a VAPID key.");
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    } catch (e) {
      const msg = String(e?.message || "");
      if (e?.name === "NotAllowedError" || /permission denied/i.test(msg)) {
        throw deniedError();
      }
      throw e;
    }
  }
  await api.post("/api/push/subscribe", { subscription: sub.toJSON() });
  return sub;
}

export async function unsubscribeFromPush() {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  try {
    await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint });
  } catch {}
  try {
    await sub.unsubscribe();
  } catch {}
}

export async function sendTestPush() {
  return await api.post("/api/push/test", {});
}

export function getPermission() {
  if (typeof Notification === "undefined") return "default";
  return Notification.permission;
}

export const getSubscription = getCurrentSubscription;
export const subscribePush = subscribeToPush;
export const unsubscribePush = unsubscribeFromPush;
