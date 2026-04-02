#!/usr/bin/env bash
# setup-local.sh — Configure l'environnement de développement Sésame
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Vérification des prérequis..."
command -v pnpm >/dev/null 2>&1 || { echo "pnpm requis : https://pnpm.io"; exit 1; }
command -v supabase >/dev/null 2>&1 || { echo "Supabase CLI requis : https://supabase.com/docs/guides/cli"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker requis"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker doit être démarré"; exit 1; }

echo "==> Installation des dépendances..."
pnpm install

echo "==> Démarrage de Supabase local..."
cd "$ROOT"
supabase start

echo ""
echo "==> Copie des fichiers .env (si absents)..."

# .env frontend
ENV_WEB="$ROOT/packages/web/.env.local"
if [ ! -f "$ENV_WEB" ]; then
  cp "$ROOT/packages/web/.env.example" "$ENV_WEB"
  echo "    Créé : packages/web/.env.local"
  echo "    Renseigne VITE_SUPABASE_ANON_KEY et VITE_GOOGLE_CLIENT_ID"
else
  echo "    packages/web/.env.local existe déjà, skip."
fi

# .env Edge Functions
ENV_FUNCTIONS="$ROOT/supabase/functions/.env"
if [ ! -f "$ENV_FUNCTIONS" ]; then
  cp "$ROOT/supabase/functions/.env.example" "$ENV_FUNCTIONS"
  echo "    Créé : supabase/functions/.env"
  echo "    Renseigne les clés Google, Gemini et génère ENCRYPTION_KEY"
else
  echo "    supabase/functions/.env existe déjà, skip."
fi

echo ""
echo "==> Tout est prêt."
echo ""
echo "    Lance le frontend      : pnpm dev"
echo "    Lance les functions    : supabase functions serve"
echo "    Supabase Studio        : http://localhost:54323"
echo "    Frontend               : http://localhost:5173"
echo ""
echo "    Test manuel des crons :"
echo "    curl http://127.0.0.1:54321/functions/v1/process-queue"
echo "    curl http://127.0.0.1:54321/functions/v1/renew-watches"
echo ""
echo "    Debug — backfill + processing :"
echo '    TOKEN="<jwt>"  # App → DevTools → Local Storage → sb-*-auth-token → access_token'
echo '    curl -s -X POST http://127.0.0.1:54321/functions/v1/start-backfill \'
echo '      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \'
echo '      -d '"'"'{"mail_account_id":"<id>","limit_messages":10}'"'"' | jq'
echo '    for i in $(seq 1 10); do curl -s http://127.0.0.1:54321/functions/v1/process-queue | jq; sleep 5; done'
echo ""
echo "    Scripts utilitaires :"
echo "    ./scripts/monitor.sh              # live (Ctrl+C pour quitter)"
echo "    ./scripts/monitor.sh --errors     # erreurs détaillées"
echo "    ./scripts/monitor.sh --item <id>  # inspecte un item"
echo "    ./scripts/clean-queue.sh          # vide queue + remet idle"
echo "    ./scripts/clean-data.sh           # efface emails, dossiers, événements, queue"
echo ""
echo "    Génère ENCRYPTION_KEY  : openssl rand -hex 32"
echo "    Logs des cron jobs     : SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;"
