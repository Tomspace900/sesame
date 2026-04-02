#!/usr/bin/env bash
# reset-data.sh — Vide les données de traitement sans toucher aux comptes Gmail.
set -euo pipefail

DB="postgresql://postgres:postgres@localhost:54322/postgres"

echo "==> Nettoyage des données de traitement..."
psql "$DB" -q <<'SQL'
TRUNCATE TABLE dossier_events CASCADE;
TRUNCATE TABLE dossiers CASCADE;
TRUNCATE TABLE emails CASCADE;
TRUNCATE TABLE processing_queue CASCADE;
UPDATE mail_accounts SET
  backfill_status = 'idle',
  backfill_progress = NULL,
  backfill_started_at = NULL;
SQL

echo "==> OK. Queue, emails, dossiers et events vidés. Comptes Gmail conservés."
