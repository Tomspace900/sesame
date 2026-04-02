-- =============================================================
-- MIGRATION 010 : CONTRAINTES ET INDEX MANQUANTS
-- =============================================================

-- ============================================================
-- 1. mail_accounts — unicité cross-user de l'adresse email
--
-- La contrainte existante UNIQUE(user_id, provider, email_address)
-- ne bloque pas deux utilisateurs différents sur le même email.
-- On ajoute UNIQUE(email_address) : une adresse ne peut appartenir
-- qu'à un seul compte Sésame, quel que soit le provider.
-- ============================================================

ALTER TABLE mail_accounts
  ADD CONSTRAINT mail_accounts_email_address_unique UNIQUE (email_address);

-- ============================================================
-- 2. processing_queue — ON DELETE CASCADE sur les FK
--
-- Sans CASCADE, supprimer un mail_account (déconnexion Gmail)
-- ou un profil échoue si des items sont en queue.
-- ============================================================

ALTER TABLE processing_queue
  DROP CONSTRAINT processing_queue_user_id_fkey,
  ADD CONSTRAINT processing_queue_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE processing_queue
  DROP CONSTRAINT processing_queue_mail_account_id_fkey,
  ADD CONSTRAINT processing_queue_mail_account_id_fkey
    FOREIGN KEY (mail_account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE;

-- ============================================================
-- 3. dossiers — index sur (user_id, created_at DESC)
--
-- Requête dashboard "dossiers récents" : ORDER BY created_at DESC
-- avec filtre user_id. Pas couvert par les index existants.
-- ============================================================

CREATE INDEX idx_dossiers_user_created
  ON dossiers(user_id, created_at DESC);

-- ============================================================
-- 4. dossier_events — index partiel sur les events non liés
--
-- Requête "événements orphelins" dans le détail dossier :
-- WHERE dossier_id IS NULL AND user_id = ?
-- ============================================================

CREATE INDEX idx_events_unlinked
  ON dossier_events(user_id, created_at DESC)
  WHERE dossier_id IS NULL;

-- ============================================================
-- 5. emails — remplacer l'index global sender par un index user-scoped
--
-- Toutes les requêtes sur les emails filtrent par user_id (RLS).
-- L'index global (sender_address) n'est pas utilisé efficacement.
-- ============================================================

DROP INDEX IF EXISTS idx_emails_sender;

CREATE INDEX idx_emails_user_sender
  ON emails(user_id, sender_address);

-- ============================================================
-- NOTE : dossier_events UNIQUE(email_id)
--
-- Non ajouté ici car process-queue utilise INSERT sans ON CONFLICT.
-- Ajouter cette contrainte maintenant casserait les retries en cas
-- d'erreur partielle. À implémenter dans le Bloc 6 (refacto Gemini)
-- en même temps que la migration de process-queue vers upsert.
-- ============================================================
