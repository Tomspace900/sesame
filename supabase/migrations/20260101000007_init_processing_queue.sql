-- =============================================================
-- MIGRATION 007 : PROCESSING QUEUE
-- =============================================================

CREATE TABLE processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  mail_account_id UUID NOT NULL REFERENCES mail_accounts(id),
  provider_message_id TEXT NOT NULL,
  priority INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'done', 'error', 'skipped')
  ),
  attempts INT DEFAULT 0,
  last_error TEXT,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE(user_id, mail_account_id, provider_message_id)
);

-- Pas de RLS user sur cette table : accès service_role uniquement depuis les Edge Functions
-- Les utilisateurs n'ont pas besoin de la lire directement
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON processing_queue FOR ALL
  USING (false);

CREATE INDEX idx_queue_pending ON processing_queue(status, priority DESC, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX idx_queue_user ON processing_queue(user_id);
CREATE INDEX idx_queue_locked ON processing_queue(locked_until)
  WHERE status = 'processing';
