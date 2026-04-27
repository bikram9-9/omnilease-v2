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
E2E_TOUR_NOTIFICATION_PROOF="${E2E_TOUR_NOTIFICATION_PROOF:-1}"
E2E_ESCALATION_PROOF="${E2E_ESCALATION_PROOF:-1}"
E2E_ANSWER_QUALITY_PROOF="${E2E_ANSWER_QUALITY_PROOF:-1}"
E2E_SEED_OUTPUT="${E2E_SEED_OUTPUT:-.playwright-cli/e2e-smoke-seed.json}"

if [[ "$E2E_AUTO_SEED" == "1" || ( "$E2E_AUTO_SEED" == "auto" && "$BASE_URL" =~ ^https?://(localhost|127\.0\.0\.1)(:|/) ) ]]; then
  echo "== Seed E2E smoke data =="
  E2E_EMAIL="$E2E_EMAIL" \
    E2E_PASSWORD="$E2E_PASSWORD" \
    E2E_WIDGET_ID="$E2E_WIDGET_ID" \
    E2E_ORG_NAME="$E2E_ORG_NAME" \
    E2E_SEED_OUTPUT="$PWD/$E2E_SEED_OUTPUT" \
    pnpm --dir apps/web exec node scripts/seed-e2e-smoke.mjs
fi

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
if [[ ! -x "$PWCLI" ]]; then
  echo "Missing playwright wrapper at $PWCLI" >&2
  exit 1
fi
PW_SESSION="${PW_SESSION:-ol-e2e}"
pw() {
  "$PWCLI" -s="$PW_SESSION" "$@"
}
path_name() {
  pw --raw eval "() => window.location.pathname" 2>/dev/null | tr -d '"' || true
}
pw close >/dev/null 2>&1 || true
pw delete-data >/dev/null 2>&1 || true

echo "== Public home =="
pw open "${BASE_URL}/"
pw snapshot

echo "== Sign in page =="
pw goto "${BASE_URL}/sign-in"
pw snapshot

echo "== Sign up page =="
pw goto "${BASE_URL}/sign-up"
pw snapshot

echo "== Dashboard auth guard =="
pw goto "${BASE_URL}/dashboard"
pw snapshot

echo "== Widget smoke host =="
pw goto "${BASE_URL}/widget-smoke.html?widgetId=${E2E_WIDGET_ID}"
pw snapshot
pw --raw eval "() => document.getElementById('omnilease-bubble')?.click() || true" >/dev/null
sleep 1
pw snapshot
widget_text="$(pw --raw eval "() => document.body.innerText" 2>/dev/null || true)"
for expected in \
  "I am the AI leasing assistant for E2E Smoke Apartments" \
  "Privacy" \
  "Terms" \
  "Contact leasing office" \
  "Contact the leasing office at e2e-smoke@omnilease.local"; do
  if [[ "$widget_text" != *"$expected"* ]]; then
    echo "Widget disclosure proof failed; missing ${expected}." >&2
    exit 1
  fi
done

echo "== Authenticated sign in =="
pw goto "${BASE_URL}/sign-in"
pw snapshot
pw fill e6 "$E2E_EMAIL"
pw fill e7 "$E2E_PASSWORD"
pw click e8
pw snapshot

current_path="$(path_name)"
if [[ "$current_path" == "/sign-in" ]]; then
  echo "== Sign-up fallback =="
  pw goto "${BASE_URL}/sign-up"
  pw snapshot
  pw fill e6 "$E2E_EMAIL"
  pw fill e7 "$E2E_PASSWORD"
  pw click e8
  pw snapshot
  current_path="$(path_name)"
fi

if [[ "$current_path" == "/onboarding" ]]; then
  echo "== Onboarding fallback =="
  pw fill e6 "$E2E_ORG_NAME"
  pw click e7
  pw snapshot
  current_path="$(path_name)"
fi

if [[ "$current_path" == "/sign-in" || "$current_path" == "/sign-up" ]]; then
  echo "Authenticated sign-in failed; still on ${current_path}." >&2
  exit 1
fi

echo "== Dashboard =="
pw goto "${BASE_URL}/dashboard"
pw snapshot
current_path="$(path_name)"
if [[ "$current_path" != "/dashboard" ]]; then
  echo "Dashboard E2E failed; expected /dashboard after auth, got ${current_path:-<empty>}." >&2
  exit 1
fi

echo "== Properties list =="
pw goto "${BASE_URL}/properties"
pw snapshot

echo "== New property =="
pw goto "${BASE_URL}/properties/new"
pw snapshot

if [[ "$E2E_TOUR_NOTIFICATION_PROOF" == "1" ]]; then
  echo "== Process due tour notifications =="
  cron_secret="${TOUR_NOTIFICATION_CRON_SECRET:-${CRON_SECRET:-}}"
  if [[ -n "$cron_secret" ]]; then
    curl -fsS -H "authorization: Bearer ${cron_secret}" "${BASE_URL}/api/cron/tour-notifications?limit=20"
  else
    curl -fsS "${BASE_URL}/api/cron/tour-notifications?limit=20"
  fi
  echo

  echo "== Guest-card tour notification proof =="
  pw goto "${BASE_URL}/guest-cards"
  pw snapshot
  guest_card_href="$(pw --raw eval "() => Array.from(document.querySelectorAll('a')).find((a) => a.textContent.includes('E2E Tour Prospect'))?.href || ''" 2>/dev/null | tr -d '"' || true)"
  if [[ -z "$guest_card_href" ]]; then
    echo "Could not find seeded E2E Tour Prospect guest card." >&2
    exit 1
  fi
  pw goto "$guest_card_href"
  pw snapshot
  detail_text="$(pw --raw eval "() => document.body.innerText" 2>/dev/null || true)"
  for expected in \
    "Tour confirmation sent to prospect" \
    "Tour confirmation sent to leasing team" \
    "Tour reminder sent to prospect" \
    "Post-tour follow-up due"
  do
    if ! grep -Fq "$expected" <<<"$detail_text"; then
      echo "Missing tour notification proof text: ${expected}" >&2
      exit 1
    fi
  done
fi

if [[ "$E2E_ESCALATION_PROOF" == "1" ]]; then
  echo "== Emergency escalation takeover proof =="
  escalation_session="e2e-escalation-$(date +%s)"
  escalation_text="E2E emergency takeover proof ${escalation_session}: Emergency maintenance, water is flooding my apartment right now."
  escalation_payload="$(
    WIDGET_ID="$E2E_WIDGET_ID" SESSION_ID="$escalation_session" MESSAGE_TEXT="$escalation_text" node -e "process.stdout.write(JSON.stringify({ widgetId: process.env.WIDGET_ID, sessionId: process.env.SESSION_ID, text: process.env.MESSAGE_TEXT, pageUrl: 'https://e2e.example.com/contact', referrer: 'https://e2e.example.com/' }))"
  )"
  curl -fsS \
    -H "content-type: application/json" \
    -X POST \
    --data "$escalation_payload" \
    "${BASE_URL}/api/widget/chat"
  echo

  pw goto "${BASE_URL}/conversations"
  pw snapshot
  escalation_href="$(pw --raw eval "() => Array.from(document.querySelectorAll('a')).find((a) => a.textContent.includes('If this is an emergency') && a.textContent.includes('urgent priority'))?.href || ''" 2>/dev/null | tr -d '"' || true)"
  if [[ -z "$escalation_href" ]]; then
    echo "Could not find seeded E2E emergency escalation conversation." >&2
    exit 1
  fi

  pw goto "$escalation_href"
  pw snapshot
  escalation_detail_text="$(pw --raw eval "() => document.body.innerText" 2>/dev/null || true)"
  for expected in \
    "Human takeover" \
    "urgent priority" \
    "Unresolved" \
    "SLA" \
    "Emergency or urgent maintenance request"
  do
    if ! grep -Fq "$expected" <<<"$escalation_detail_text"; then
      echo "Missing emergency escalation proof text: ${expected}" >&2
      exit 1
    fi
  done

  pw --raw eval "() => { const textarea = document.querySelector('textarea[name=\"content\"]'); if (!textarea) return false; textarea.value = 'E2E human takeover response sent.'; textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.closest('form')?.requestSubmit(); return true; }"
  sleep 1
  pw goto "$escalation_href"
  pw snapshot
  takeover_text="$(pw --raw eval "() => document.body.innerText" 2>/dev/null || true)"
  if ! grep -Fq "E2E human takeover response sent." <<<"$takeover_text"; then
    echo "Missing operator takeover response proof text." >&2
    exit 1
  fi
  if ! grep -Fq "Agent" <<<"$takeover_text"; then
    echo "Missing operator takeover author label." >&2
    exit 1
  fi
fi

if [[ "$E2E_ANSWER_QUALITY_PROOF" == "1" ]]; then
  echo "== Answer-quality unsupported workflow proof =="
  quality_session="e2e-quality-$(date +%s)"
  quality_text="E2E answer quality proof ${quality_session}: Can you give me a written quote with the total move-in cost and all fees?"
  quality_payload="$(
    WIDGET_ID="$E2E_WIDGET_ID" SESSION_ID="$quality_session" MESSAGE_TEXT="$quality_text" node -e "process.stdout.write(JSON.stringify({ widgetId: process.env.WIDGET_ID, sessionId: process.env.SESSION_ID, text: process.env.MESSAGE_TEXT, pageUrl: 'https://e2e.example.com/apply', referrer: 'https://e2e.example.com/' }))"
  )"
  quality_response="$(
    curl -fsS \
      -H "content-type: application/json" \
      -X POST \
      --data "$quality_payload" \
      "${BASE_URL}/api/widget/chat"
  )"
  echo "$quality_response"
  if ! grep -Eiq "incomplete|not fully verified|fully verified written quote|application link|disclaimer" <<<"$quality_response"; then
    echo "Answer-quality proof failed; quote workflow did not acknowledge incomplete quote data." >&2
    exit 1
  fi
  if ! grep -Eiq "leasing team|leasing specialist|team member" <<<"$quality_response"; then
    echo "Answer-quality proof failed; quote workflow did not hand off to a human." >&2
    exit 1
  fi

  pw goto "${BASE_URL}/conversations"
  pw snapshot
  quality_candidates="$(pw --raw eval "() => Array.from(document.querySelectorAll('a')).filter((a) => a.href.includes('/conversations/') && a.textContent.includes('Human takeover') && a.textContent.includes('normal priority')).map((a) => a.href).join('|')" 2>/dev/null | tr -d '"' || true)"
  quality_href=""
  quality_detail_text=""
  IFS='|' read -r -a quality_candidate_urls <<<"$quality_candidates"
  for candidate_href in "${quality_candidate_urls[@]}"; do
    if [[ -z "$candidate_href" ]]; then
      continue
    fi

    pw goto "$candidate_href" >/dev/null
    candidate_detail_text="$(pw --raw eval "() => document.body.innerText" 2>/dev/null || true)"
    if grep -Fq "$quality_session" <<<"$candidate_detail_text"; then
      quality_href="$candidate_href"
      quality_detail_text="$candidate_detail_text"
      break
    fi
  done
  if [[ -z "$quality_href" ]]; then
    echo "Could not find answer-quality escalation conversation for ${quality_session}." >&2
    exit 1
  fi

  pw snapshot
  if ! grep -Eq "written quote with total move-in costs? and all fees" <<<"$quality_detail_text"; then
    echo "Missing answer-quality quote escalation reason." >&2
    exit 1
  fi
  if ! grep -Eiq "(quote|get_quote|estimate).{0,160}incomplete|incomplete.{0,160}(quote|get_quote|estimate)" <<<"$quality_detail_text"; then
    echo "Missing incomplete quote evidence." >&2
    exit 1
  fi
  for expected in "normal priority" "Unresolved" "Human takeover"; do
    if ! grep -Fq "$expected" <<<"$quality_detail_text"; then
      echo "Missing answer-quality proof text: ${expected}" >&2
      exit 1
    fi
  done
fi

echo "Done. Review snapshots for dashboard/properties, widget host, and authenticated routes."
