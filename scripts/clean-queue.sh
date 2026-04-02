#!/usr/bin/env bash
# clean-queue.sh — Vide la processing_queue et remet les comptes en idle.
#
# Usage:
#   ./scripts/clean-queue.sh                  Vide toute la queue
#   ./scripts/clean-queue.sh --errors-only    Supprime uniquement les items en erreur
set -euo pipefail

DB="postgresql://postgres:postgres@localhost:54322/postgres"
GREEN='\033[32m'; RESET='\033[0m'

case "${1:-}" in
  --errors-only)
    echo "==> Suppression des items en erreur..."
    psql "$DB" -q <<'SQL'
DELETE FROM processing_queue WHERE status = 'error';
SQL
    echo -e "${GREEN}==> Items en erreur supprimés.${RESET}"
    ;;
  "")
    echo "==> Reset de la queue et des statuts backfill..."
    psql "$DB" -q <<'SQL'
TRUNCATE TABLE processing_queue;
UPDATE mail_accounts SET
  backfill_status     = 'idle',
  backfill_progress   = NULL,
  backfill_started_at = NULL;
SQL
    echo -e "${GREEN}==> Queue vidée. Comptes remis en idle.${RESET}"
    ;;
  *)
    echo "Usage : ./scripts/clean-queue.sh [--errors-only]"; exit 1 ;;
esac

psql "$DB" -q <<'SQL'
SELECT status, count(*) FROM processing_queue GROUP BY status ORDER BY status;
SQL
