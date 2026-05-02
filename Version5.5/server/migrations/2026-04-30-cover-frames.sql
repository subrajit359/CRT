-- Decorative avatar cover frames + their inner-ring / shield geometry.
-- The frame PNG is stored on Cloudinary; geometry numbers are fractions of
-- the natural image dimensions so they work at any rendered size.

CREATE TABLE IF NOT EXISTS cover_frames (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  image_url         TEXT NOT NULL,
  storage_key       TEXT,
  image_width       INTEGER NOT NULL,
  image_height      INTEGER NOT NULL,
  avatar_cx         DOUBLE PRECISION NOT NULL,
  avatar_cy         DOUBLE PRECISION NOT NULL,
  avatar_r          DOUBLE PRECISION NOT NULL,
  shield_cx         DOUBLE PRECISION NOT NULL,
  shield_cy         DOUBLE PRECISION NOT NULL,
  shield_r          DOUBLE PRECISION NOT NULL,
  shield_text_color TEXT NOT NULL DEFAULT '#ffffff',
  is_active         BOOLEAN NOT NULL DEFAULT FALSE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one frame may be marked active at a time.
CREATE UNIQUE INDEX IF NOT EXISTS cover_frames_one_active
  ON cover_frames (is_active) WHERE is_active = TRUE;
