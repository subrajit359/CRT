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
                 WHERE case_id IN (SELECT id FROM cases WHERE source = 'CrLearn Library')`);
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

  // ── Mock Tests ────────────────────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS mock_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT NOT NULL CHECK (type IN ('mcq','saq','laq')),
    specialty       TEXT NOT NULL,
    topic           TEXT,
    prompt          TEXT NOT NULL,
    options         JSONB,
    correct_answer  TEXT NOT NULL,
    explanation     TEXT NOT NULL,
    marks           NUMERIC NOT NULL DEFAULT 1,
    difficulty      TEXT,
    source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai')),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS mock_questions_specialty_idx ON mock_questions (specialty)`);
  await query(`CREATE INDEX IF NOT EXISTS mock_questions_topic_idx ON mock_questions (topic)`);

  await query(`CREATE TABLE IF NOT EXISTS mock_tests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    config          JSONB NOT NULL,
    questions       JSONB NOT NULL,
    answers         JSONB NOT NULL DEFAULT '{}'::jsonb,
    obtained_marks  NUMERIC,
    total_marks     NUMERIC NOT NULL,
    status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted')),
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    submitted_at    TIMESTAMPTZ
  )`);
  await query(`CREATE INDEX IF NOT EXISTS mock_tests_user_idx ON mock_tests (user_id, started_at DESC)`);

  // ── Mock question attachments (added 2026) ───────────────────────────────
  await query(`ALTER TABLE mock_questions ADD COLUMN IF NOT EXISTS attachment_url TEXT`);
  await query(`ALTER TABLE mock_questions ADD COLUMN IF NOT EXISTS attachment_key TEXT`);

  // ── Mock question seen history (repeat-prevention) ───────────────────────
  await query(`CREATE TABLE IF NOT EXISTS user_seen_questions (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES mock_questions(id) ON DELETE CASCADE,
    specialty   TEXT NOT NULL DEFAULT '',
    topic       TEXT NOT NULL DEFAULT '',
    seen_at     TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, question_id)
  )`);
  await query(`CREATE INDEX IF NOT EXISTS usq_user_specialty_idx ON user_seen_questions (user_id, specialty, topic)`);

  // ── Study Resources ──────────────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS study_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    parent_id   UUID REFERENCES study_categories(id) ON DELETE CASCADE,
    position    INT NOT NULL DEFAULT 0,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS study_categories_parent_idx ON study_categories (parent_id, position)`);

  // Blog/vlog-style study posts: thumbnail + description on categories
  await query(`ALTER TABLE study_categories ADD COLUMN IF NOT EXISTS description TEXT`);
  await query(`ALTER TABLE study_categories ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`);
  await query(`ALTER TABLE study_categories ADD COLUMN IF NOT EXISTS thumbnail_key TEXT`);

  await query(`CREATE TABLE IF NOT EXISTS study_resources (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id  UUID NOT NULL REFERENCES study_categories(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    filename     TEXT,
    mime_type    TEXT,
    size_bytes   BIGINT,
    storage_url  TEXT,
    storage_key  TEXT,
    kind         TEXT,
    uploader_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS study_resources_cat_idx ON study_resources (category_id, created_at DESC)`);

  // ── Diagnostic Frameworks ────────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS dx_specialties (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    icon        TEXT,
    description TEXT,
    position    INT NOT NULL DEFAULT 0,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS dx_topics (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specialty_id  UUID NOT NULL REFERENCES dx_specialties(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    explanation   TEXT,
    position      INT NOT NULL DEFAULT 0,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS dx_topics_specialty_idx ON dx_topics (specialty_id, position)`);

  await query(`CREATE TABLE IF NOT EXISTS dx_attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id     UUID NOT NULL REFERENCES dx_topics(id) ON DELETE CASCADE,
    filename     TEXT NOT NULL,
    mime_type    TEXT NOT NULL,
    size_bytes   BIGINT,
    storage_url  TEXT NOT NULL,
    storage_key  TEXT,
    kind         TEXT,
    uploader_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS dx_attachments_topic_idx ON dx_attachments (topic_id, created_at)`);

  await query(`ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0`);

  // ── Neet Blog (imported from Blog.zip) ───────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS neet_posts (
    id             SERIAL PRIMARY KEY,
    title          TEXT NOT NULL,
    description    TEXT,
    thumbnail_url  TEXT DEFAULT '',
    date           TEXT,
    badge          TEXT DEFAULT 'General',
    keywords       TEXT DEFAULT '',
    views          INT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS neet_posts_created_idx ON neet_posts (created_at DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS neet_sections (
    id          SERIAL PRIMARY KEY,
    post_id     INT NOT NULL REFERENCES neet_posts(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT 'New Section',
    image_url   TEXT DEFAULT '',
    order_index INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS neet_sections_post_idx ON neet_sections (post_id, order_index)`);

  await query(`CREATE TABLE IF NOT EXISTS neet_resources (
    id          SERIAL PRIMARY KEY,
    section_id  INT NOT NULL REFERENCES neet_sections(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    drive_link  TEXT DEFAULT '',
    order_index INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS neet_resources_sec_idx ON neet_resources (section_id, order_index)`);

  // ── Blog Posts ────────────────────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS blog_posts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title          TEXT NOT NULL,
    excerpt        TEXT,
    thumbnail_url  TEXT,
    thumbnail_key  TEXT,
    read_time      TEXT NOT NULL DEFAULT '1 min read',
    views          INT NOT NULL DEFAULT 0,
    tags           TEXT[] NOT NULL DEFAULT '{}',
    published      BOOLEAN NOT NULL DEFAULT false,
    created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS blog_posts_published_idx ON blog_posts (published, created_at DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS blog_post_sections (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    image_url  TEXT,
    position   INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS blog_post_sections_post_idx ON blog_post_sections (post_id, position)`);

  await query(`CREATE TABLE IF NOT EXISTS blog_section_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES blog_post_sections(id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    drive_url  TEXT,
    position   INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS blog_section_items_sec_idx ON blog_section_items (section_id, position)`);

  await query(`CREATE TABLE IF NOT EXISTS contact_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    subject    TEXT,
    message    TEXT NOT NULL,
    emailed    BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── v2.0: Semantic match cache ────────────────────────────────────────────
  // Caches AI diagnosis match results so identical answer+diagnosis pairs
  // don't trigger a new LLM call. Reduces latency and cuts AI costs.
  await query(`CREATE TABLE IF NOT EXISTS semantic_match_cache (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key    TEXT UNIQUE NOT NULL,
    verdict      TEXT NOT NULL,
    confidence   FLOAT,
    reason       TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    hit_count    INT DEFAULT 1
  )`);
  await query(`CREATE INDEX IF NOT EXISTS semantic_match_cache_key_idx ON semantic_match_cache(cache_key)`);

  // Spaced-repetition review scheduler — SM-2 inspired per-user, per-case schedule.
  await query(`CREATE TABLE IF NOT EXISTS case_reviews (
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id       UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    PRIMARY KEY   (user_id, case_id),
    ease_factor   FLOAT NOT NULL DEFAULT 2.5,
    interval_days INT NOT NULL DEFAULT 1,
    repetitions   INT NOT NULL DEFAULT 0,
    next_due      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_score    INT,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS case_reviews_due_idx ON case_reviews (user_id, next_due)`);

  // Background AI job queue — persists job state and progress across SSE streams.
  await query(`CREATE TABLE IF NOT EXISTS ai_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind          TEXT NOT NULL DEFAULT 'case_generate',
    status        TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','done','failed')),
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ,
    payload       JSONB NOT NULL DEFAULT '{}',
    total         INT DEFAULT 0,
    done_count    INT DEFAULT 0,
    failed_count  INT DEFAULT 0,
    result        JSONB,
    error         TEXT
  )`);
  await query(`CREATE INDEX IF NOT EXISTS ai_jobs_created_at_idx ON ai_jobs(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS ai_jobs_created_by_idx ON ai_jobs(created_by)`);

  // ── v10: AI insight tip cache ─────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS insight_cache (
    user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tips         JSONB NOT NULL DEFAULT '[]',
    generated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── v6: Achievements ──────────────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS achievements (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key          TEXT NOT NULL,
    unlocked_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, key)
  )`);
  await query(`CREATE INDEX IF NOT EXISTS achievements_user_idx ON achievements (user_id, unlocked_at DESC)`);

  // ── Weekly digest scheduler tables ───────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS digest_runs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_by   TEXT NOT NULL DEFAULT 'scheduler',
    started_at     TIMESTAMPTZ DEFAULT NOW(),
    finished_at    TIMESTAMPTZ,
    total_students INT DEFAULT 0,
    emails_sent    INT DEFAULT 0,
    pushes_sent    INT DEFAULT 0,
    errors         INT DEFAULT 0
  )`);
  await query(`CREATE INDEX IF NOT EXISTS digest_runs_started_at_idx ON digest_runs(started_at DESC)`);
  await query(`CREATE TABLE IF NOT EXISTS digest_log (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id    UUID NOT NULL REFERENCES digest_runs(id) ON DELETE CASCADE,
    user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    sent_at   TIMESTAMPTZ DEFAULT NOW(),
    email_ok  BOOLEAN DEFAULT FALSE,
    push_ok   BOOLEAN DEFAULT FALSE,
    error     TEXT
  )`);
  await query(`CREATE INDEX IF NOT EXISTS digest_log_run_idx  ON digest_log(run_id, sent_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS digest_log_user_idx ON digest_log(user_id, sent_at DESC)`);

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
