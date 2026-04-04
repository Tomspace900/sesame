-- =============================================================
-- MIGRATION 003 : EMAILS
-- =============================================================

CREATE TABLE emails (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mail_account_id             UUID        NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  provider_message_id         TEXT        NOT NULL,
  subject                     TEXT,
  sender_address              TEXT        NOT NULL,
  sender_name                 TEXT,
  received_at                 TIMESTAMPTZ NOT NULL,
  text_plain                  TEXT,
  text_html_storage_path      TEXT,
  has_attachments             BOOLEAN     DEFAULT false,
  attachment_metadata         JSONB       DEFAULT '[]'::jsonb,
  classification              TEXT        CHECK (
    classification IN ('transactional', 'not_transactional', 'unprocessed')
  ),
  classification_confidence   REAL,
  raw_classification_response JSONB,       -- réponse brute Gemini classification (observabilité)
  processed_at                TIMESTAMPTZ,
  processing_error            TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, mail_account_id, provider_message_id)
);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own emails"
  ON emails FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_emails_user_received ON emails(user_id, received_at DESC);
CREATE INDEX idx_emails_user_sender   ON emails(user_id, sender_address);
CREATE INDEX idx_emails_classification ON emails(user_id, classification)
  WHERE classification = 'transactional';
