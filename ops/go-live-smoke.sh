#!/usr/bin/env bash
set -euo pipefail
API_URL="${API_URL:-}"
FRONTEND_URL="${FRONTEND_URL:-}"
if [[ -z "$API_URL" ]]; then echo "Set API_URL=https://api.example.com" >&2; exit 2; fi
API_URL="${API_URL%/}"
pass=0; fail=0
check(){ local name="$1" url="$2"; local code; code="$(curl -sS -o /tmp/urgent-medicine-smoke.out -w '%{http_code}' "$url")"; if [[ "$code" == "200" ]]; then echo "PASS $name [$code]"; ((pass+=1)); else echo "FAIL $name [$code]"; cat /tmp/urgent-medicine-smoke.out; ((fail+=1)); fi; }
check "API health" "$API_URL/health"
check "API readiness" "$API_URL/ready"
check "API version" "$API_URL/version"
if [[ -n "$FRONTEND_URL" ]]; then check "Frontend" "${FRONTEND_URL%/}/"; fi
rm -f /tmp/urgent-medicine-smoke.out
printf 'Smoke tests: %s passed, %s failed\n' "$pass" "$fail"
(( fail == 0 ))
