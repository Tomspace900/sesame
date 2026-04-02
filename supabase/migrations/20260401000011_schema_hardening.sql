-- =============================================================
-- MIGRATION 011 : DURCISSEMENT SCHÉMA
-- =============================================================

-- ============================================================
-- 1. TRIGGERS — reset des flags reminder_sent quand une
--    deadline change
--
-- Scénario : renouvellement mensuel d'abonnement. Le 1er rappel
-- met renewal_reminder_sent = true. Le 2ème mois, process-queue
-- met à jour next_renewal_at mais ne touche pas au flag → plus
-- aucun rappel envoyé pour les renouvellements suivants.
-- Même problème pour return_deadline et warranty_deadline.
-- ============================================================

CREATE OR REPLACE FUNCTION reset_reminder_flags_on_deadline_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Abonnement : prochain renouvellement mis à jour → re-arm le rappel
  IF NEW.next_renewal_at IS DISTINCT FROM OLD.next_renewal_at THEN
    NEW.renewal_reminder_sent = false;
  END IF;

  -- Achat : deadline de rétractation mise à jour → re-arm
  IF NEW.return_deadline IS DISTINCT FROM OLD.return_deadline THEN
    NEW.return_reminder_sent = false;
  END IF;

  -- Achat/équipement : garantie mise à jour → re-arm
  IF NEW.warranty_deadline IS DISTINCT FROM OLD.warranty_deadline THEN
    NEW.warranty_reminder_sent = false;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dossiers_reset_reminders
  BEFORE UPDATE ON dossiers
  FOR EACH ROW EXECUTE FUNCTION reset_reminder_flags_on_deadline_change();

-- ============================================================
-- 2. FULL-TEXT SEARCH — ajout des champs manquants
--
-- Champs absents du tsvector initial qui bloquent des recherches
-- légitimes : tags, subscription_name, tracking_number,
-- departure_location, arrival_location, accommodation_address,
-- carrier.
-- ============================================================

-- array_to_string n'est pas IMMUTABLE dans cette version de Postgres.
-- On crée un wrapper explicitement IMMUTABLE pour l'utiliser dans
-- une colonne GENERATED ALWAYS AS STORED.
CREATE OR REPLACE FUNCTION immutable_array_to_text(text[])
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT
AS $$ SELECT array_to_string($1, ' ') $$;

-- Supprime l'index GIN avant de toucher à la colonne générée
DROP INDEX IF EXISTS idx_dossiers_fts;

-- Supprime la colonne générée (on la recrée avec plus de champs)
ALTER TABLE dossiers DROP COLUMN fts;

-- Recrée avec tous les champs pertinents
ALTER TABLE dossiers ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    -- Poids A : identifiants et noms principaux
    setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(reference, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(booking_reference, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(tracking_number, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(subscription_name, '')), 'A') ||
    -- Poids B : lieux et infos secondaires importantes
    setweight(to_tsvector('french', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(departure_location, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(arrival_location, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(accommodation_address, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(carrier, '')), 'B') ||
    -- Poids C : enrichissement manuel
    setweight(to_tsvector('french', coalesce(notes, '')), 'C') ||
    setweight(to_tsvector('french', coalesce(immutable_array_to_text(tags), '')), 'C')
  ) STORED;

-- Recrée l'index GIN
CREATE INDEX idx_dossiers_fts ON dossiers USING gin(fts);

-- ============================================================
-- 3. INDEX — dossiers actifs triés par date
--
-- Requête critique dans process-queue : 10 derniers dossiers
-- actifs pour le contexte Gemini, exécutée à chaque email traité.
-- WHERE user_id = ? AND status NOT IN ('cancelled','returned')
-- ORDER BY started_at DESC LIMIT 10
-- ============================================================

CREATE INDEX idx_dossiers_user_active_started
  ON dossiers(user_id, started_at DESC NULLS LAST)
  WHERE status NOT IN ('cancelled', 'returned');

-- ============================================================
-- 4. CONTRAINTE — format ISO 4217 sur currency
--
-- Gemini peut retourner "euros", "USD  " ou "€".
-- On accepte uniquement 3 lettres majuscules (format ISO 4217)
-- ou NULL.
-- ============================================================

ALTER TABLE dossiers
  ADD CONSTRAINT dossiers_currency_iso_format
  CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');

-- ============================================================
-- NOTE : UNIQUE(email_id) sur dossier_events
--
-- Toujours différé (voir migration 010). process-queue utilise
-- INSERT sans ON CONFLICT. À ajouter dans Bloc 6 quand la
-- fonction migre vers upsert.
-- ============================================================

-- ============================================================
-- NOTE : voyage multi-segments
--
-- departure_location/time et arrival_location/time sont
-- monovalue dans le schéma V1. Un vol avec escale voit ses
-- données du 1er segment écrasées par le 2ème email.
-- Solution V1.1 : table dossier_segments(dossier_id, order,
-- departure, arrival, vehicle_id, seat).
-- Pour l'instant acceptable, limitation documentée.
-- ============================================================
