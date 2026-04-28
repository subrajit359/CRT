// Bridges the in-memory log buffer to web push notifications for admin users.
// Listens for warn/error entries, groups them in a short window to avoid
// flooding, and fans out a single push per admin per batch.

import { onLog } from "./log-buffer.js";
import { query } from "./db.js";
import { sendPushToUser } from "./push.js";

const FLUSH_MS = 5000;          // group every 5 seconds
const ADMIN_TTL_MS = 60_000;    // refresh admin id list at most every minute
const MAX_BATCH = 100;          // sanity cap

let pending = [];
let timer = null;
let adminIds = [];
let adminIdsLoadedAt = 0;
let started = false;

async function getAdminIds() {
  const now = Date.now();
  if (adminIds.length && now - adminIdsLoadedAt < ADMIN_TTL_MS) return adminIds;
  try {
    const { rows } = await query(`SELECT id FROM users WHERE role='admin'`);
    adminIds = rows.map((r) => r.id);
    adminIdsLoadedAt = now;
  } catch {
    // keep stale list on failure
  }
  return adminIds;
}

function shouldIgnore(entry) {
  if (!entry || !entry.text) return true;
  // Avoid feedback loops: web-push internal failures log via console.warn
  // with the "[push]" prefix and would otherwise re-trigger this bridge.
  if (entry.text.startsWith("[push]")) return true;
  if (entry.text.startsWith("[admin-push]")) return true;
  return false;
}

async function flush() {
  const batch = pending;
  pending = [];
  timer = null;
  if (!batch.length) return;

  const errors = batch.filter((e) => e.level === "error");
  const warns = batch.filter((e) => e.level === "warn");

  let title;
  let body;
  if (batch.length === 1) {
    const e = batch[0];
    title = e.level === "error" ? "Server error" : "Server warning";
    body = (e.text || "").slice(0, 220);
  } else {
    title = `${batch.length} new server log${batch.length === 1 ? "" : "s"}`;
    const parts = [];
    if (errors.length) parts.push(`${errors.length} error${errors.length === 1 ? "" : "s"}`);
    if (warns.length) parts.push(`${warns.length} warning${warns.length === 1 ? "" : "s"}`);
    body = parts.join(", ");
    const last = batch[batch.length - 1];
    if (last?.text) body += " — Latest: " + last.text.slice(0, 140);
  }

  const ids = await getAdminIds();
  if (!ids.length) return;

  await Promise.allSettled(
    ids.map((id) =>
      sendPushToUser(id, {
        title,
        body,
        link: "/admin/logs",
        kind: "admin_log",
        tag: "admin-server-log",
      })
    )
  );
}

export function startAdminLogPushBridge() {
  if (started) return;
  started = true;

  onLog((entry) => {
    if (entry.level !== "error" && entry.level !== "warn") return;
    if (shouldIgnore(entry)) return;
    if (pending.length >= MAX_BATCH) return;
    pending.push(entry);
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  });

  console.log("[admin-push] bridge started — admins receive push on server warn/error");
}
