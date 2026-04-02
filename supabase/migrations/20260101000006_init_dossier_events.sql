-- =============================================================
-- MIGRATION 006 : DOSSIER EVENTS
-- =============================================================

CREATE TABLE dossier_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID REFERENCES dossiers(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'order_confirmation', 'payment_confirmation', 'shipping_notification',
    'delivery_notification', 'invoice', 'return_confirmation', 'cancellation',
    'booking_confirmation', 'booking_update', 'check_in_open', 'boarding_pass',
    'accommodation_confirmation', 'host_message', 'accommodation_update',
    'subscription_confirmation', 'subscription_renewal', 'subscription_cancellation',
    'other'
  )),
  extracted_data JSONB NOT NULL,
  extraction_confidence REAL,
  human_summary TEXT,
  linked_by TEXT CHECK (linked_by IN ('reference', 'fuzzy_match', 'manual', 'llm')),
  linking_confidence REAL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE dossier_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own events"
  ON dossier_events FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_events_dossier ON dossier_events(dossier_id);
CREATE INDEX idx_events_email   ON dossier_events(email_id);
CREATE INDEX idx_events_user_created ON dossier_events(user_id, created_at DESC);
