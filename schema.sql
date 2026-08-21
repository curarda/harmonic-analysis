-- D1 schema for Harmonic Analysis collection.
-- Apply with:  npx wrangler d1 execute harmonic-analysis-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS analyses (
  id           TEXT PRIMARY KEY,   -- random UUID
  created_at   INTEGER NOT NULL,   -- ms since epoch
  mel_name     TEXT,               -- melody filename (may be null)
  chd_name     TEXT,               -- chords filename (may be null)
  key_name     TEXT,               -- e.g. "C major"
  mode_name    TEXT,               -- e.g. "Mixolydian"
  bars         INTEGER,
  bpm          INTEGER,
  chord_count  INTEGER,
  consonance   INTEGER,            -- % of melody notes on chord tones
  payload      TEXT NOT NULL       -- full JSON (analysis + raw note data)
);

CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at);
CREATE INDEX IF NOT EXISTS idx_analyses_key     ON analyses(key_name);
