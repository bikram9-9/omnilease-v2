#!/usr/bin/env bash
# End-to-end smoke of main routes using the Codex playwright_cli wrapper.
# Requires: npx, ~/.codex/skills/playwright/scripts/playwright_cli.sh
#
# Usage:
#   BASE_URL=http://localhost:3000 E2E_EMAIL=you@domain.com E2E_PASSWORD='secret' ./scripts/e2e-playwright-flows.sh
#
# Or for production:
#   BASE_URL=https://omnilease-web.vercel.app E2E_EMAIL=... E2E_PASSWORD='...' ./scripts/e2e-playwright-flows.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
E2E_EMAIL="${E2E_EMAIL:-}"
E2E_PASSWORD="${E2E_PASSWORD:-}"

if [[ -z "$E2E_EMAIL" || -z "$E2E_PASSWORD" ]]; then
  echo "Set E2E_EMAIL and E2E_PASSWORD to run the authenticated portion (dashboard, properties)." >&2
  echo "Without them, only public + auth-guard redirects are checked (edit script to add)." >&2
  exit 1
fi

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
if [[ ! -x "$PWCLI" ]]; then
  echo "Missing playwright wrapper at $PWCLI" >&2
  exit 1
fi

echo "== Sign in =="
"$PWCLI" open "${BASE_URL}/sign-in"
"$PWCLI" snapshot
"$PWCLI" fill e6 "$E2E_EMAIL"
"$PWCLI" fill e7 "$E2E_PASSWORD"
"$PWCLI" click e8
"$PWCLI" snapshot

echo "== Dashboard =="
"$PWCLI" open "${BASE_URL}/dashboard"
"$PWCLI" snapshot

echo "== Properties list =="
"$PWCLI" open "${BASE_URL}/properties"
"$PWCLI" snapshot

echo "== New property =="
"$PWCLI" open "${BASE_URL}/properties/new"
"$PWCLI" snapshot

echo "Done. Review the last snapshot for URL and headings (expect dashboard/properties, not sign-in)."
