#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")"

PASS=0
FAIL=0

check() {
  if eval "$2" >/dev/null 2>&1; then
    echo "  ✓ $1"
    ((PASS++))
  else
    echo "  ✗ $1"
    ((FAIL++))
  fi
}

echo "Preflight checks for make dev"
echo "=============================="

# .env file
echo ""
echo "Environment:"
check ".env exists" "[ -f .env ]"
check ".env has no placeholder values" "! grep -q 'your-client' .env 2>/dev/null"

if [ -f .env ]; then
  source .env
  check "GOOGLE_CLIENT_ID is set" "[ -n \"\${GOOGLE_CLIENT_ID:-}\" ]"
  check "GOOGLE_CLIENT_SECRET is set" "[ -n \"\${GOOGLE_CLIENT_SECRET:-}\" ]"
else
  echo "  ✗ GOOGLE_CLIENT_ID is set (skipped — no .env)"
  echo "  ✗ GOOGLE_CLIENT_SECRET is set (skipped — no .env)"
  ((FAIL+=2))
fi

# Token file
echo ""
echo "OAuth token:"
check "token.json exists" "[ -f \"\${HOME}/.config/google-docs-mcp/token.json\" ]"

# Summary
echo ""
echo "------------------------------"
echo "Passed: $PASS  Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Fix failures before running make dev."
  echo "If token.json is missing, run:"
  echo "  source .env"
  echo "  GOOGLE_CLIENT_ID=\"\$GOOGLE_CLIENT_ID\" GOOGLE_CLIENT_SECRET=\"\$GOOGLE_CLIENT_SECRET\" npx -y @a-bonus/google-docs-mcp auth"
  exit 1
fi
