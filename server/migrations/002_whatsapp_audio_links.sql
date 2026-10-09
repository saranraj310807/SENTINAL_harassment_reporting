-- Migration 002: WhatsApp Audio Links and Audio Share Copies

-- 1. Table for Expiring Single-Purpose Audio Playback Links
CREATE TABLE IF NOT EXISTS audio_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  max_plays INTEGER NOT NULL DEFAULT 5,
  plays_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 2. Table for Derived Audio Share Copies (Format conversion only; original untouched)
CREATE TABLE IF NOT EXISTS audio_share_copies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audio_complaint_id INTEGER NOT NULL,
  case_id INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  format TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (audio_complaint_id) REFERENCES audio_complaints(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

-- 3. Expand whatsapp_notifications states for honest status tracking
CREATE TABLE IF NOT EXISTS whatsapp_notifications_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  recipient_e164 TEXT NOT NULL,
  message_hash TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('minimal', 'extended')),
  state TEXT NOT NULL CHECK(state IN ('prepared', 'opened', 'awaiting_manual_send', 'audio_share_sheet_opened', 'audio_link_created', 'delivery_confirmed')),
  prepared_at TEXT NOT NULL,
  opened_at TEXT,
  created_by INTEGER NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO whatsapp_notifications_new (id, case_id, recipient_e164, message_hash, level, state, prepared_at, opened_at, created_by)
SELECT id, case_id, recipient_e164, message_hash, level, state, prepared_at, opened_at, created_by
FROM whatsapp_notifications;

DROP TABLE whatsapp_notifications;

ALTER TABLE whatsapp_notifications_new RENAME TO whatsapp_notifications;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audio_links_token ON audio_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_audio_links_case ON audio_links(case_id);
CREATE INDEX IF NOT EXISTS idx_audio_share_case ON audio_share_copies(case_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_case ON whatsapp_notifications(case_id);
