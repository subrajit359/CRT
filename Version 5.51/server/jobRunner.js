/**
 * jobRunner.js — in-process background job queue for AI case generation.
 *
 * No Redis / BullMQ needed. Jobs are persisted in the `ai_jobs` DB table
 * and progress events are pushed to SSE subscribers via an in-memory
 * EventEmitter per job.
 */

import EventEmitter from "node:events";
import { query } from "./db.js";

// jobId -> EventEmitter  (created lazily, cleaned up after job finishes)
const emitters = new Map();

// Set of jobIds that have been cancelled — checked between each case iteration
const cancelledJobs = new Set();

export function isJobCancelled(jobId) {
  return cancelledJobs.has(jobId);
}

export async function cancelJob(jobId) {
  cancelledJobs.add(jobId);
  await query(
    `UPDATE ai_jobs SET status='failed', finished_at=NOW(), error='Cancelled by admin' WHERE id=$1 AND status='running'`,
    [jobId]
  );
  push(jobId, "error", { jobId, error: "Cancelled by admin" });
  scheduleCleanup(jobId);
}

function getEmitter(jobId) {
  if (!emitters.has(jobId)) {
    const ee = new EventEmitter();
    ee.setMaxListeners(200);
    emitters.set(jobId, ee);
  }
  return emitters.get(jobId);
}

function push(jobId, type, data) {
  const ee = emitters.get(jobId);
  if (ee) ee.emit("evt", { type, data });
}

function scheduleCleanup(jobId) {
  setTimeout(() => {
    const ee = emitters.get(jobId);
    if (ee) {
      ee.removeAllListeners();
      emitters.delete(jobId);
    }
  }, 8000);
}

// ---------------------------------------------------------------------------
// Public API — job lifecycle
// ---------------------------------------------------------------------------

export async function createJob({ kind = "case_generate", payload = {}, userId }) {
  const { rows } = await query(
    `INSERT INTO ai_jobs (kind, status, payload, created_by, total)
     VALUES ($1, 'pending', $2::jsonb, $3, $4)
     RETURNING id`,
    [kind, JSON.stringify(payload), userId || null, payload.count || 0]
  );
  return rows[0].id;
}

export async function startJob(jobId) {
  await query(`UPDATE ai_jobs SET status='running', started_at=NOW() WHERE id=$1`, [jobId]);
  push(jobId, "start", { jobId });
}

export async function recordCaseDone(jobId, caseInfo) {
  const { rows } = await query(
    `UPDATE ai_jobs SET done_count = done_count + 1 WHERE id=$1
     RETURNING done_count, failed_count, total`,
    [jobId]
  );
  const r = rows[0] || {};
  push(jobId, "case_done", {
    jobId,
    doneCount: r.done_count,
    failedCount: r.failed_count,
    total: r.total,
    case: caseInfo,
  });
}

export async function recordCaseFailed(jobId, errMsg) {
  const { rows } = await query(
    `UPDATE ai_jobs SET failed_count = failed_count + 1 WHERE id=$1
     RETURNING done_count, failed_count, total`,
    [jobId]
  );
  const r = rows[0] || {};
  push(jobId, "case_failed", {
    jobId,
    doneCount: r.done_count,
    failedCount: r.failed_count,
    total: r.total,
    error: errMsg,
  });
}

export async function finishJob(jobId, { inserted, failedCount }) {
  await query(
    `UPDATE ai_jobs SET status='done', finished_at=NOW(), result=$2::jsonb WHERE id=$1`,
    [jobId, JSON.stringify({ inserted, failedCount })]
  );
  push(jobId, "done", { jobId, inserted, failedCount });
  scheduleCleanup(jobId);
}

export async function failJob(jobId, error) {
  await query(
    `UPDATE ai_jobs SET status='failed', finished_at=NOW(), error=$2 WHERE id=$1`,
    [jobId, String(error)]
  );
  push(jobId, "error", { jobId, error: String(error) });
  scheduleCleanup(jobId);
}

// ---------------------------------------------------------------------------
// SSE subscription
// ---------------------------------------------------------------------------

export function subscribeJob(jobId, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function send(type, data) {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // Immediately send current DB state so a late subscriber doesn't miss status
  query(`SELECT * FROM ai_jobs WHERE id=$1`, [jobId]).then(({ rows }) => {
    if (rows[0]) send("status", rows[0]);
  }).catch(() => {});

  const ee = getEmitter(jobId);
  function onEvt({ type, data }) { send(type, data); }
  ee.on("evt", onEvt);

  function cleanup() { ee.off("evt", onEvt); }
  res.on("close", cleanup);
  return cleanup;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getJob(jobId) {
  const { rows } = await query(`SELECT * FROM ai_jobs WHERE id=$1`, [jobId]);
  return rows[0] || null;
}

export async function listJobs({ limit = 30, userId } = {}) {
  if (userId) {
    const { rows } = await query(
      `SELECT id, kind, status, created_at, started_at, finished_at,
              payload, total, done_count, failed_count, error, result
       FROM ai_jobs WHERE created_by=$1
       ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return rows;
  }
  const { rows } = await query(
    `SELECT j.id, j.kind, j.status, j.created_at, j.started_at, j.finished_at,
            j.payload, j.total, j.done_count, j.failed_count, j.error, j.result,
            u.full_name AS creator_name, u.username AS creator_username
     FROM ai_jobs j
     LEFT JOIN users u ON u.id = j.created_by
     ORDER BY j.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}
