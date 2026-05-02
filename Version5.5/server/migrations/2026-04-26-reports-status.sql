-- Migration: add lifecycle status to reports table.
-- Statuses:
--   open       - new, awaiting admin review (default)
--   actioned   - admin took some action (deleted case, edited it, contacted user, etc.)
--   dismissed  - admin reviewed and decided no action is needed
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'actioned', 'dismissed'));

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS actioned_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMPTZ;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS action_note TEXT;

CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at DESC);
