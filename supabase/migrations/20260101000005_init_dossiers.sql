-- =============================================================
-- MIGRATION 005 : DOSSIERS (entité centrale)
-- =============================================================

CREATE TABLE dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  merchant_id UUID REFERENCES merchants(id),

  dossier_type TEXT NOT NULL DEFAULT 'purchase' CHECK (dossier_type IN (
    'purchase', 'trip', 'accommodation', 'subscription', 'reservation', 'other'
  )),

  -- Communs
  title TEXT,
  description TEXT,
  reference TEXT,
  amount NUMERIC(10,2),
  currency TEXT DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN (
    'detected', 'confirmed', 'in_progress', 'completed', 'cancelled', 'returned'
  )),
  image_url TEXT,
  source_url TEXT,
  payment_method TEXT,

  -- Dates clés universelles
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  return_deadline TIMESTAMPTZ,
  warranty_deadline TIMESTAMPTZ,
  next_renewal_at TIMESTAMPTZ,

  -- Livraison / Tracking (achats)
  tracking_number TEXT,
  carrier TEXT,
  tracking_url TEXT,
  pickup_point_name TEXT,
  pickup_point_address TEXT,
  pickup_code TEXT,

  -- Transport (voyages)
  departure_location TEXT,
  arrival_location TEXT,
  departure_time TIMESTAMPTZ,
  arrival_time TIMESTAMPTZ,
  flight_or_train_number TEXT,
  seat_info TEXT,
  booking_reference TEXT,

  -- Hébergement
  accommodation_address TEXT,
  check_in_time TEXT,
  check_out_time TEXT,
  host_name TEXT,
  host_phone TEXT,
  number_of_guests INT,

  -- Abonnement
  subscription_name TEXT,
  subscription_amount NUMERIC(10,2),
  subscription_period TEXT CHECK (
    subscription_period IN ('monthly', 'yearly', 'weekly', 'other')
    OR subscription_period IS NULL
  ),

  -- Multi-personnes
  participants TEXT[] DEFAULT '{}',

  -- Liens d'action utiles
  action_links JSONB DEFAULT '[]'::jsonb,

  -- Rappels
  return_reminder_sent BOOLEAN DEFAULT false,
  warranty_reminder_sent BOOLEAN DEFAULT false,
  renewal_reminder_sent BOOLEAN DEFAULT false,
  calendar_event_created BOOLEAN DEFAULT false,

  -- Enrichissement manuel
  notes TEXT,
  tags TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own dossiers"
  ON dossiers FOR ALL
  USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_dossiers_user_type    ON dossiers(user_id, dossier_type);
CREATE INDEX idx_dossiers_user_status  ON dossiers(user_id, status);
CREATE INDEX idx_dossiers_reference    ON dossiers(user_id, reference)
  WHERE reference IS NOT NULL;
CREATE INDEX idx_dossiers_booking_ref  ON dossiers(user_id, booking_reference)
  WHERE booking_reference IS NOT NULL;
CREATE INDEX idx_dossiers_merchant_date ON dossiers(user_id, merchant_id, started_at DESC);
CREATE INDEX idx_dossiers_return       ON dossiers(return_deadline)
  WHERE return_reminder_sent = false;
CREATE INDEX idx_dossiers_warranty     ON dossiers(warranty_deadline)
  WHERE warranty_reminder_sent = false;
CREATE INDEX idx_dossiers_renewal      ON dossiers(next_renewal_at)
  WHERE renewal_reminder_sent = false;
CREATE INDEX idx_dossiers_departure    ON dossiers(departure_time)
  WHERE departure_time IS NOT NULL;

-- Full-text search (tsvector généré)
ALTER TABLE dossiers ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(notes, '')), 'C') ||
    setweight(to_tsvector('french', coalesce(reference, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(booking_reference, '')), 'A')
  ) STORED;

CREATE INDEX idx_dossiers_fts ON dossiers USING gin(fts);

-- Trigger updated_at
CREATE TRIGGER dossiers_updated_at
  BEFORE UPDATE ON dossiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
