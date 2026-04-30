import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSqlMigration(filename) {
  return readFileSync(join(__dirname, "migrations", filename), "utf8");
}

if (!process.env.DATABASE_URL) {
  console.warn("[db] DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const ms = Date.now() - start;
  if (ms > 250) console.log(`[db] slow query ${ms}ms ${text.slice(0, 80)}`);
  return res;
}

async function applyOnce(id, fn) {
  const { rows } = await query(`SELECT 1 FROM migrations WHERE id=$1`, [id]);
  if (rows[0]) return;
  await fn();
  await query(`INSERT INTO migrations (id) VALUES ($1)`, [id]);
  console.log(`[db] migration applied: ${id}`);
}

export async function initDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing — provision a database first");
  }
  // Skip the ~1.4s CREATE EXTENSION call if pgcrypto is already installed.
  const ext = await query(`SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'`);
  if (!ext.rows[0]) {
    await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  }

  await query(`CREATE TABLE IF NOT EXISTS migrations (
    id          TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT UNIQUE NOT NULL,
    username     TEXT UNIQUE NOT NULL,
    full_name    TEXT NOT NULL,
    role         TEXT NOT NULL CHECK (role IN ('student','doctor','admin')),
    country      TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    last_login   TIMESTAMPTZ
  )`);

  await query(`CREATE TABLE IF NOT EXISTS student_profiles (
    user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    year_of_study TEXT,
    show_scores  BOOLEAN DEFAULT FALSE,
    global_level INT DEFAULT 1,
    specialty_levels JSONB DEFAULT '{}'
  )`);

  await query(`CREATE TABLE IF NOT EXISTS doctor_profiles (
    user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    degree         TEXT,
    specialty      TEXT NOT NULL,
    years_exp      INT,
    license_number TEXT,
    hospital       TEXT,
    proof_text     TEXT,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    reviewed_at    TIMESTAMPTZ,
    reviewer_note  TEXT
  )`);

  await query(`CREATE TABLE IF NOT EXISTS otp_codes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT NOT NULL,
    code_hash  TEXT NOT NULL,
    purpose    TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed   BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`ALTER TABLE otp_codes DROP CONSTRAINT IF EXISTS otp_codes_purpose_check`);
  await query(`ALTER TABLE otp_codes ADD CONSTRAINT otp_codes_purpose_check CHECK (purpose IN ('login','register','reset'))`);

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_key TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS typing_to_user_id UUID`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS typing_at TIMESTAMPTZ`);

  await query(`CREATE INDEX IF NOT EXISTS otp_codes_email_idx ON otp_codes (email, created_at DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )`);

  await query(`CREATE TABLE IF NOT EXISTS cases (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT NOT NULL,
    specialty    TEXT NOT NULL,
    level        INT NOT NULL DEFAULT 1,
    body         TEXT NOT NULL,
    questions    JSONB NOT NULL DEFAULT '[]',
    source       TEXT NOT NULL DEFAULT 'original',
    source_kind  TEXT NOT NULL CHECK (source_kind IN ('ai','admin','doctor')),
    uploader_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ
  )`);

  await query(`CREATE INDEX IF NOT EXISTS cases_specialty_idx ON cases (specialty)`);
  await query(`CREATE INDEX IF NOT EXISTS cases_level_idx ON cases (level)`);

  // Multi-specialty support: a case can be tagged with one or more specialties.
  // The legacy `specialty` column is kept in sync with specialties[0] so any old
  // queries still work.
  await query(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS specialties TEXT[] NOT NULL DEFAULT '{}'`);
  await query(`UPDATE cases SET specialties = ARRAY[specialty]
                 WHERE (array_length(specialties, 1) IS NULL OR array_length(specialties, 1) = 0)
                   AND specialty IS NOT NULL AND specialty <> ''`);
  await query(`CREATE INDEX IF NOT EXISTS cases_specialties_gin_idx ON cases USING GIN (specialties)`);

  // Diagnosis fields (added April 2026) — visible only to doctor/admin; used for deterministic answer matching.
  await query(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS diagnosis TEXT`);
  await query(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS accepted_diagnoses JSONB NOT NULL DEFAULT '[]'`);
  await query(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS diagnosis_explanation TEXT`);

  await query(`CREATE TABLE IF NOT EXISTS case_verifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    doctor_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action       TEXT NOT NULL CHECK (action IN ('verify','unverify')),
    reason       TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE INDEX IF NOT EXISTS case_verifications_case_idx ON case_verifications (case_id, created_at DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS responses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id      UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    question_idx INT NOT NULL DEFAULT 0,
    user_answer  TEXT NOT NULL,
    eval_json    JSONB,
    score        INT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE INDEX IF NOT EXISTS responses_user_idx ON responses (user_id, created_at DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS thumbs_up (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, case_id)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS reports (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id    UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    reason     TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS discussions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id    UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL DEFAULT 'doctor' CHECK (kind IN ('doctor','delete-request')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (case_id, kind)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS discussion_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body          TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS delete_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id       UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    requested_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason        TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected','edit_instead')),
    decided_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT,
    link       TEXT,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS case_attachments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id       UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    uploader_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    filename      TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    size_bytes    INT NOT NULL,
    storage_url   TEXT NOT NULL,
    storage_key   TEXT,
    kind          TEXT NOT NULL CHECK (kind IN ('image','pdf','other')),
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS case_attachments_case_idx ON case_attachments (case_id, created_at)`);

  await query(`CREATE TABLE IF NOT EXISTS lounge_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS lounge_messages_idx ON lounge_messages (created_at DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS dm_threads (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    last_at     TIMESTAMPTZ DEFAULT NOW(),
    CHECK (user_a < user_b),
    UNIQUE (user_a, user_b)
  )`);
  await query(`CREATE INDEX IF NOT EXISTS dm_threads_a_idx ON dm_threads (user_a, last_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS dm_threads_b_idx ON dm_threads (user_b, last_at DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS dm_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id   UUID NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS dm_messages_thread_idx ON dm_messages (thread_id, created_at)`);

  await applyOnce("2026-04-25-clear-library-autoverify", async () => {
    await query(`DELETE FROM case_verifications
                 WHERE case_id IN (SELECT id FROM cases WHERE source = 'Reasonal Library')`);
  });

  // Add lifecycle status to reports (open / actioned / dismissed) so admins can
  // triage and hide handled items without losing history.
  await applyOnce("2026-04-26-reports-status", async () => {
    await query(loadSqlMigration("2026-04-26-reports-status.sql"));
  });

  // Generic key/value config (used for VAPID keys etc.)
  await query(`CREATE TABLE IF NOT EXISTS app_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Web push subscriptions
  await query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint       TEXT NOT NULL UNIQUE,
    p256dh         TEXT NOT NULL,
    auth           TEXT NOT NULL,
    user_agent     TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    last_used_at   TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id)`);

  // Per-user notification preferences (web push on/off + per-kind, JSON)
  await query(`CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    push_on    BOOLEAN NOT NULL DEFAULT TRUE,
    kinds      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Doctor support chat: a single group conversation per pending/rejected
  // doctor where every admin can read and reply. Persists after approval.
  await query(`CREATE TABLE IF NOT EXISTS support_threads (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    last_at        TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS support_threads_last_idx ON support_threads (last_at DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS support_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id   UUID NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS support_messages_thread_idx ON support_messages (thread_id, created_at)`);

  // Message kind: 'text' (regular chat), 'reapply_invite' (admin button that
  // lets a rejected doctor open a prefilled re-application form), or
  // 'reapply_submitted' (system marker after the doctor resubmits).
  await query(`ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text'`);
  await query(`ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS meta JSONB`);

  // Per-user last-read marker so each admin (and the doctor) can see
  // their own unread count for the shared support thread.
  await query(`CREATE TABLE IF NOT EXISTS support_reads (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_id  UUID NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
    read_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, thread_id)
  )`);

  // User banning support
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_until TIMESTAMPTZ`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT`);

  // DM message edit + soft-delete
  await query(`ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);
  await query(`ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);

  // Account delete requests (users requesting their account to be deleted by admin)
  await query(`CREATE TABLE IF NOT EXISTS account_delete_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason       TEXT,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    decided_by   UUID REFERENCES users(id),
    decided_at   TIMESTAMPTZ,
    admin_note   TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS acct_del_req_user_idx ON account_delete_requests (user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS acct_del_req_status_idx ON account_delete_requests (status, created_at DESC)`);

  // Cases: support body/metadata editing
  await query(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);

  // ── Disappearing messages ────────────────────────────────────────────────
  // Per-thread timer (NULL = OFF, otherwise a positive integer of seconds).
  // New threads default to 24h on. Each message stores its own expires_at,
  // computed at send time from the thread's then-current timer (so changing
  // the timer later only affects messages sent after the change).
  await query(`ALTER TABLE dm_threads ADD COLUMN IF NOT EXISTS disappear_seconds INTEGER DEFAULT 86400`);
  await query(`ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
  await query(`CREATE INDEX IF NOT EXISTS dm_messages_expires_idx ON dm_messages (expires_at) WHERE expires_at IS NOT NULL`);

  await query(`ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS disappear_seconds INTEGER DEFAULT 86400`);
  await query(`ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
  await query(`CREATE INDEX IF NOT EXISTS support_messages_expires_idx ON support_messages (expires_at) WHERE expires_at IS NOT NULL`);

  // One-time backfill: set all existing threads to the 24h default. Old
  // messages already in the table have NULL expires_at and won't be deleted —
  // only newly sent messages start carrying an expiry.
  await applyOnce("2026-04-28-disappear-default-24h", async () => {
    await query(`UPDATE dm_threads SET disappear_seconds = 86400 WHERE disappear_seconds IS NULL`);
    await query(`UPDATE support_threads SET disappear_seconds = 86400 WHERE disappear_seconds IS NULL`);
  });

  console.log("[db] schema ready");
}

// Periodically hard-delete messages that have passed their expires_at. Runs
// every 60 seconds in-process. Idempotent and safe to call repeatedly.
let _sweeperStarted = false;
export function startDisappearingSweeper() {
  if (_sweeperStarted) return;
  _sweeperStarted = true;
  async function sweep() {
    try {
      const r1 = await query(`DELETE FROM dm_messages WHERE expires_at IS NOT NULL AND expires_at <= NOW()`);
      const r2 = await query(`DELETE FROM support_messages WHERE expires_at IS NOT NULL AND expires_at <= NOW()`);
      const total = (r1.rowCount || 0) + (r2.rowCount || 0);
      if (total > 0) console.log(`[sweeper] disappearing-messages: deleted ${r1.rowCount || 0} dm + ${r2.rowCount || 0} support`);
    } catch (e) {
      console.warn("[sweeper] disappearing-messages failed:", e?.message || e);
    }
    try {
      // Read notifications are auto-deleted 2 hours after the user reads them.
      const r = await query(
        `DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at <= NOW() - INTERVAL '2 hours'`
      );
      if (r.rowCount > 0) console.log(`[sweeper] read-notifications: deleted ${r.rowCount}`);
    } catch (e) {
      console.warn("[sweeper] read-notifications failed:", e?.message || e);
    }
  }
  // First sweep shortly after boot, then every 60s.
  setTimeout(sweep, 5000);
  setInterval(sweep, 60_000);
}
