#!/usr/bin/env bash
# End-to-end smoke of main routes using the Codex playwright_cli wrapper.
# Requires: npx, ~/.codex/skills/playwright/scripts/playwright_cli.sh
#
# Usage:
#   BASE_URL=http://localhost:3000 ./scripts/e2e-playwright-flows.sh
#
# Or for production:
#   BASE_URL=https://omnilease-web.vercel.app E2E_EMAIL=... E2E_PASSWORD='...' ./scripts/e2e-playwright-flows.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
E2E_EMAIL="${E2E_EMAIL:-e2e-smoke@omnilease.local}"
E2E_PASSWORD="${E2E_PASSWORD:-OmniLeaseE2E!2026}"
E2E_WIDGET_ID="${E2E_WIDGET_ID:-wdg_e2e_smoke}"
E2E_ORG_NAME="${E2E_ORG_NAME:-OmniLease E2E Smoke}"
E2E_AUTO_SEED="${E2E_AUTO_SEED:-auto}"

if [[ "$E2E_AUTO_SEED" == "1" || ( "$E2E_AUTO_SEED" == "auto" && "$BASE_URL" =~ ^https?://(localhost|127\.0\.0\.1)(:|/) ) ]]; then
  echo "== Seed E2E smoke data =="
  E2E_EMAIL="$E2E_EMAIL" \
    E2E_PASSWORD="$E2E_PASSWORD" \
    E2E_WIDGET_ID="$E2E_WIDGET_ID" \
    E2E_ORG_NAME="$E2E_ORG_NAME" \
    pnpm --dir apps/web exec node scripts/seed-e2e-smoke.mjs
fi

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
if [[ ! -x "$PWCLI" ]]; then
  echo "Missing playwright wrapper at $PWCLI" >&2
  exit 1
fi

echo "== Public home =="
"$PWCLI" open "${BASE_URL}/"
"$PWCLI" snapshot

echo "== Sign in page =="
"$PWCLI" open "${BASE_URL}/sign-in"
"$PWCLI" snapshot

echo "== Sign up page =="
"$PWCLI" open "${BASE_URL}/sign-up"
"$PWCLI" snapshot

echo "== Dashboard auth guard =="
"$PWCLI" open "${BASE_URL}/dashboard"
"$PWCLI" snapshot

echo "== Widget smoke host =="
"$PWCLI" open "${BASE_URL}/widget-smoke.html?widgetId=${E2E_WIDGET_ID}"
"$PWCLI" snapshot

echo "== Authenticated sign in =="
"$PWCLI" open "${BASE_URL}/sign-in"
"$PWCLI" snapshot
"$PWCLI" fill e6 "$E2E_EMAIL"
"$PWCLI" fill e7 "$E2E_PASSWORD"
"$PWCLI" click e8
"$PWCLI" snapshot

current_path="$("$PWCLI" --raw eval "() => window.location.pathname" 2>/dev/null || true)"
if [[ "$current_path" == "/sign-in" ]]; then
  echo "== Sign-up fallback =="
  "$PWCLI" open "${BASE_URL}/sign-up"
  "$PWCLI" snapshot
  "$PWCLI" fill e6 "$E2E_EMAIL"
  "$PWCLI" fill e7 "$E2E_PASSWORD"
  "$PWCLI" click e8
  "$PWCLI" snapshot
  current_path="$("$PWCLI" --raw eval "() => window.location.pathname" 2>/dev/null || true)"
fi

if [[ "$current_path" == "/onboarding" ]]; then
  echo "== Onboarding fallback =="
  "$PWCLI" fill e6 "$E2E_ORG_NAME"
  "$PWCLI" click e7
  "$PWCLI" snapshot
fi

echo "== Dashboard =="
"$PWCLI" open "${BASE_URL}/dashboard"
"$PWCLI" snapshot

echo "== Properties list =="
"$PWCLI" open "${BASE_URL}/properties"
"$PWCLI" snapshot

echo "== New property =="
"$PWCLI" open "${BASE_URL}/properties/new"
"$PWCLI" snapshot

echo "Done. Review snapshots for dashboard/properties, widget host, and authenticated routes."
