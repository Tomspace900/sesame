#!/usr/bin/env bash
# monitor.sh — État de la queue et des dossiers.
#
# Usage:
#   ./scripts/monitor.sh [intervalle]       Boucle live (défaut: 3s)
#   ./scripts/monitor.sh --errors           Détail des erreurs (one-shot)
#   ./scripts/monitor.sh --stuck            Items bloqués en 'processing' (one-shot)
#   ./scripts/monitor.sh --item <id>        Inspecte un item + email associé (one-shot)
set -euo pipefail

DB="postgresql://postgres:postgres@localhost:54322/postgres"
BOLD='\033[1m'; RESET='\033[0m'

# --- Modes one-shot ---
case "${1:-}" in
  --errors)
    echo -e "${BOLD}=== Items en erreur ===${RESET}"
    psql "$DB" -q <<'SQL'
SELECT
  pq.id,
  ma.email_address AS compte,
  pq.attempts,
  pq.created_at::timestamp(0) AS created,
  pq.last_error
FROM processing_queue pq
JOIN mail_accounts ma ON ma.id = pq.mail_account_id
WHERE pq.status = 'error'
ORDER BY pq.created_at DESC
LIMIT 20;
SQL
    echo ""
    echo "Pour re-enqueue : ./scripts/clean-queue.sh --errors-only"
    exit 0 ;;

  --stuck)
    echo -e "${BOLD}=== Items bloqués (locked_until dépassé) ===${RESET}"
    psql "$DB" -q <<'SQL'
SELECT
  pq.id,
  ma.email_address AS compte,
  pq.attempts,
  pq.locked_until::timestamp(0),
  pq.created_at::timestamp(0) AS created
FROM processing_queue pq
JOIN mail_accounts ma ON ma.id = pq.mail_account_id
WHERE pq.status = 'processing'
  AND pq.locked_until < now()
ORDER BY pq.locked_until ASC;
SQL
    exit 0 ;;

  --item)
    ITEM_ID="${2:-}"
    if [[ -z "$ITEM_ID" ]]; then echo "Usage : --item <queue_item_id>"; exit 1; fi
    echo -e "${BOLD}=== Item : $ITEM_ID ===${RESET}"
    psql "$DB" -q <<SQL
\echo '--- Queue item ---'
SELECT pq.id, pq.status, pq.attempts, pq.priority,
       pq.created_at::timestamp(0), pq.processed_at::timestamp(0),
       pq.locked_until::timestamp(0), pq.last_error
FROM processing_queue pq WHERE pq.id = '${ITEM_ID}';

\echo ''
\echo '--- Email associé ---'
SELECT e.subject, e.sender_address, e.received_at::timestamp(0),
       e.classification, e.classification_confidence, e.processing_error,
       left(e.text_plain, 500) AS body_preview
FROM processing_queue pq
JOIN emails e ON e.user_id = pq.user_id
  AND e.mail_account_id = pq.mail_account_id
  AND e.provider_message_id = pq.provider_message_id
WHERE pq.id = '${ITEM_ID}';
SQL
    exit 0 ;;
esac

# --- Boucle live ---
INTERVAL=${1:-3}
echo "Monitoring Sésame — rafraîchi toutes les ${INTERVAL}s (Ctrl+C pour quitter)"

while true; do
  clear
  echo "=== $(date '+%H:%M:%S') ==="
  echo ""
  psql "$DB" -q <<'SQL'
\echo '--- Queue ---'
SELECT status, count(*) FROM processing_queue GROUP BY status ORDER BY status;

\echo ''
\echo '--- Mail accounts ---'
SELECT
  ma.email_address,
  ma.backfill_status,
  (ma.backfill_progress->>'total')::int   AS backfill_total,
  (ma.backfill_progress->>'processed')::int AS backfill_done
FROM mail_accounts ma ORDER BY ma.email_address;

\echo ''
\echo '--- Derniers dossiers créés ---'
SELECT d.dossier_type, d.title, d.status, d.created_at::time(0) AS created
FROM dossiers d ORDER BY d.created_at DESC LIMIT 5;

\echo ''
\echo '--- Dernières erreurs ---'
SELECT pq.id, pq.attempts, left(pq.last_error, 80) AS error, pq.created_at::time(0) AS created
FROM processing_queue pq
WHERE pq.status = 'error'
ORDER BY pq.created_at DESC LIMIT 3;
SQL
  sleep "$INTERVAL"
done
