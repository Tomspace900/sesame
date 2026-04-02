-- =============================================================
-- MIGRATION 014 : UNIQUE(email_id) sur dossier_events
-- =============================================================
-- Garantit l'idempotence du process-queue : si le même email
-- est traité deux fois (overlap cron, retry), le second insert
-- est ignoré et ne crée pas de doublon.
-- =============================================================

ALTER TABLE dossier_events
  ADD CONSTRAINT dossier_events_email_id_unique UNIQUE (email_id);
