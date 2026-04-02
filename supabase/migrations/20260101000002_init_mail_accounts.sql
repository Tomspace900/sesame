-- =============================================================
-- MIGRATION 002 : MAIL ACCOUNTS
-- =============================================================

CREATE TABLE mail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'yahoo', 'outlook')),
  email_address TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  watch_expiration TIMESTAMPTZ,
  history_id TEXT,
  last_uid_fetched TEXT,
  backfill_status TEXT DEFAULT 'idle' CHECK (
    backfill_status IN ('idle', 'running', 'paused', 'done', 'error')
  ),
  backfill_progress JSONB DEFAULT '{"processed": 0, "total": null}'::jsonb,
  backfill_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider, email_address)
);

ALTER TABLE mail_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own mail accounts"
  ON mail_accounts FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_mail_accounts_user ON mail_accounts(user_id);

CREATE TRIGGER mail_accounts_updated_at
  BEFORE UPDATE ON mail_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
