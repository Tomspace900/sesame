#!/usr/bin/env bash
# reset-db.sh — Reset la DB locale et rejoue toutes les migrations
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Reset de la base de données locale..."
supabase db reset

echo "==> DB réinitialisée avec toutes les migrations et seeds."
