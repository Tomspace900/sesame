#!/usr/bin/env bash
# clean-data.sh — Efface toutes les données de traitement sans toucher aux comptes Gmail.
set -euo pipefail

DB="postgresql://postgres:postgres@localhost:54322/postgres"
GREEN='\033[32m'; RESET='\033[0m'

echo "==> Nettoyage des données..."
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

echo -e "${GREEN}==> Effacé : emails, dossiers, événements, queue. Comptes Gmail conservés.${RESET}"
