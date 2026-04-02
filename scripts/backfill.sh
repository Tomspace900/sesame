#!/usr/bin/env bash
# backfill.sh — Récupère N emails depuis Gmail et les traite.
#
# Usage:
#   ./scripts/backfill.sh <N> --account <mail_account_id> --jwt <token>
#   SESAME_JWT=<token> ./scripts/backfill.sh <N> --account <mail_account_id>
#
#   N          Nombre d'emails à fetcher (défaut: 10)
#   JWT        App → DevTools → Local Storage → sb-*-auth-token → access_token
set -euo pipefail

DB="postgresql://postgres:postgres@localhost:54322/postgres"
BASE_URL="http://127.0.0.1:54321/functions/v1"
BOLD='\033[1m'; GREEN='\033[32m'; RESET='\033[0m'

N=10
ACCOUNT=""
JWT="${SESAME_JWT:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    [0-9]*)    N="$1"; shift ;;
    --account) ACCOUNT="$2"; shift 2 ;;
    --jwt)     JWT="$2"; shift 2 ;;
    *) echo "Option inconnue : $1"; exit 1 ;;
  esac
done

if [[ -z "$ACCOUNT" || -z "$JWT" ]]; then
  echo "Usage: ./scripts/backfill.sh [N] --account <id> --jwt <token>"
  echo "       SESAME_JWT=<token> ./scripts/backfill.sh [N] --account <id>"
  echo ""
  echo "Comptes disponibles :"
  psql "$DB" -q <<'SQL'
SELECT ma.id, ma.email_address, ma.backfill_status, p.display_name AS user
FROM mail_accounts ma JOIN profiles p ON p.id = ma.user_id
ORDER BY p.display_name, ma.email_address;
SQL
  exit 0
fi

echo -e "${BOLD}[1/2] Backfill — $N emails → queue...${RESET}"
curl -s -X POST "$BASE_URL/start-backfill" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"mail_account_id\":\"$ACCOUNT\",\"limit_messages\":$N}" | jq

echo ""
echo -e "${BOLD}[2/2] Traitement de $N item(s)...${RESET}"
for i in $(seq 1 "$N"); do
  echo -n "  [$i/$N] "
  curl -s "$BASE_URL/process-queue" | jq -c .
  sleep 3
done

echo ""
echo -e "${GREEN}==> Terminé.${RESET}"
