#!/usr/bin/env bash
# monitor.sh — Affiche l'état de la queue et des dossiers en temps réel.
# Usage: ./scripts/monitor.sh [intervalle_secondes]
set -euo pipefail

INTERVAL=${1:-3}
DB="postgresql://postgres:postgres@localhost:54322/postgres"

echo "Monitoring Sésame — rafraîchi toutes les ${INTERVAL}s (Ctrl+C pour quitter)"

while true; do
  clear
  echo "=== $(date '+%H:%M:%S') ==="
  echo ""
  psql "$DB" -q <<'SQL'
\echo '--- Queue ---'
SELECT status, count(*) FROM processing_queue GROUP BY status ORDER BY status;

\echo ''
\echo '--- Derniers dossiers créés ---'
SELECT
  d.dossier_type,
  d.title,
  d.status,
  d.created_at::time(0) AS created
FROM dossiers d
ORDER BY d.created_at DESC
LIMIT 5;

\echo ''
\echo '--- Dernières erreurs ---'
SELECT
  pq.id,
  pq.attempts,
  left(pq.last_error, 80) AS error,
  pq.created_at::time(0) AS created
FROM processing_queue pq
WHERE pq.status = 'error'
ORDER BY pq.created_at DESC
LIMIT 3;
SQL
  sleep "$INTERVAL"
done
