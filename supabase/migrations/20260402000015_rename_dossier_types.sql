-- Migration 015 : renommer dossier_type 'trip' → 'travel' et 'reservation' → 'booking'
-- Ces types reflètent mieux la réalité :
--   travel = déplacement avec billet (vol, train longue distance) — riche en infos
--   booking = service ponctuel avec réservation (restaurant, VTC, activité, cours) — simple

-- 1. Supprimer la contrainte CHECK existante
ALTER TABLE dossiers DROP CONSTRAINT IF EXISTS dossiers_dossier_type_check;

-- 2. Migrer les valeurs existantes
UPDATE dossiers SET dossier_type = 'travel'  WHERE dossier_type = 'trip';
UPDATE dossiers SET dossier_type = 'booking' WHERE dossier_type = 'reservation';

-- 3. Recréer la contrainte CHECK avec les nouveaux types
ALTER TABLE dossiers ADD CONSTRAINT dossiers_dossier_type_check
  CHECK (dossier_type IN ('purchase', 'travel', 'accommodation', 'subscription', 'booking', 'other'));

-- 4. Mettre à jour le DEFAULT (était 'purchase', inchangé — on vérifie juste)
-- ALTER TABLE dossiers ALTER COLUMN dossier_type SET DEFAULT 'purchase'; -- déjà ok
