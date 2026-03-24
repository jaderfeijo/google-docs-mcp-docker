#!/usr/bin/env bash
set -euo pipefail

# ── Helpers ──────────────────────────────────────────────────────────────────
info()  { printf "  > %s\n" "$*"; }
ok()    { printf "  [ok] %s\n" "$*"; }
warn()  { printf "  [warn] %s\n" "$*"; }
err()   { printf "  [error] %s\n" "$*"; }
header(){ printf "\n--- %s ---\n\n" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
TOKEN_FILE="${HOME}/.config/google-docs-mcp/token.json"

# ── Pre-flight checks ───────────────────────────────────────────────────────
header "Pre-flight checks"

if ! command -v gcloud &>/dev/null; then
  err "gcloud CLI not found. Install it from https://cloud.google.com/sdk/docs/install"
  exit 1
fi
ok "gcloud CLI found"

if ! command -v docker &>/dev/null; then
  err "docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop"
  exit 1
fi
ok "docker found"

if ! command -v npx &>/dev/null; then
  err "npx not found. Install Node.js from https://nodejs.org"
  exit 1
fi
ok "npx found"

# ── Google Cloud account ─────────────────────────────────────────────────────
header "Google Cloud account"

ACCOUNT=$(gcloud config get-value account 2>/dev/null || true)
if [[ -z "$ACCOUNT" ]]; then
  info "No active account. Logging in..."
  gcloud auth login --brief
  ACCOUNT=$(gcloud config get-value account 2>/dev/null)
fi
ok "Authenticated as ${ACCOUNT}"

# ── Project setup ────────────────────────────────────────────────────────────
header "Project setup"

DEFAULT_PROJECT="gdocs-mcp-$(whoami | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9' | head -c 8)"
read -rp "  > Project ID [${DEFAULT_PROJECT}]: " PROJECT_ID
PROJECT_ID="${PROJECT_ID:-$DEFAULT_PROJECT}"

if gcloud projects describe "$PROJECT_ID" &>/dev/null; then
  ok "Project ${PROJECT_ID} already exists"
else
  info "Creating project ${PROJECT_ID}..."
  gcloud projects create "$PROJECT_ID" --name="Google Docs MCP"
  ok "Project created"
fi

gcloud config set project "$PROJECT_ID" --quiet
ok "Active project set to ${PROJECT_ID}"

# ── Billing ──────────────────────────────────────────────────────────────────
header "Billing"

BILLING_ENABLED=$(gcloud billing projects describe "$PROJECT_ID" --format="value(billingEnabled)" 2>/dev/null || true)
if [[ "$BILLING_ENABLED" != "True" ]]; then
  ACCOUNTS=$(gcloud billing accounts list --format="value(ACCOUNT_ID, DISPLAY_NAME)" 2>/dev/null || true)
  if [[ -z "$ACCOUNTS" ]]; then
    warn "No billing accounts found. You may need to create one at:"
    warn "https://console.cloud.google.com/billing"
    warn "Then re-run this script."
    exit 1
  fi

  echo ""
  info "Available billing accounts:"
  echo "$ACCOUNTS" | while IFS=$'\t' read -r id name; do
    printf "    %-22s %s\n" "$id" "$name"
  done
  echo ""
  read -rp "  > Billing account ID: " BILLING_ACCOUNT
  gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT" --quiet
  ok "Billing linked"
else
  ok "Billing already enabled"
fi

# ── Enable APIs ──────────────────────────────────────────────────────────────
header "Enabling APIs"

for API in docs.googleapis.com sheets.googleapis.com drive.googleapis.com; do
  if gcloud services list --enabled --project="$PROJECT_ID" --format="value(config.name)" 2>/dev/null | grep -q "^${API}$"; then
    ok "${API} already enabled"
  else
    info "Enabling ${API}..."
    gcloud services enable "$API" --quiet
    ok "${API} enabled"
  fi
done

# ── OAuth credentials ────────────────────────────────────────────────────────
header "OAuth credentials"

GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Check if .env already has valid credentials
if [[ -f "$ENV_FILE" ]]; then
  EXISTING_ID=$(grep -E '^GOOGLE_CLIENT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
  EXISTING_SECRET=$(grep -E '^GOOGLE_CLIENT_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)

  if [[ -n "$EXISTING_ID" && "$EXISTING_ID" != "your-client-id.apps.googleusercontent.com" && \
        -n "$EXISTING_SECRET" && "$EXISTING_SECRET" != "your-client-secret" ]]; then
    GOOGLE_CLIENT_ID="$EXISTING_ID"
    GOOGLE_CLIENT_SECRET="$EXISTING_SECRET"
    ok "Credentials loaded from ${ENV_FILE}"
  fi
fi

if [[ -z "$GOOGLE_CLIENT_ID" || -z "$GOOGLE_CLIENT_SECRET" ]]; then
  CONSOLE_URL="https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}"

  cat <<EOF

  No credentials found locally. Your OAuth Client ID and Secret already
  exist in your GCP project -- you just need to copy them to this machine.

  1. Open: ${CONSOLE_URL}
  2. Under "OAuth 2.0 Client IDs", click on your client name
  3. Copy the Client ID and Client Secret and paste them below

EOF

  read -rp "  > Paste your Client ID: " GOOGLE_CLIENT_ID
  read -rp "  > Paste your Client Secret: " GOOGLE_CLIENT_SECRET

  if [[ -z "$GOOGLE_CLIENT_ID" || -z "$GOOGLE_CLIENT_SECRET" ]]; then
    err "Client ID and Secret are required."
    exit 1
  fi
fi

# ── Write .env ───────────────────────────────────────────────────────────────
header "Writing .env"

cat > "$ENV_FILE" <<EOF
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
PORT=8080
EOF

ok "Credentials written to ${ENV_FILE}"

# ── OAuth token ──────────────────────────────────────────────────────────────
header "Authorising with Google"

if [[ -f "$TOKEN_FILE" ]]; then
  ok "OAuth token already exists at ${TOKEN_FILE}"
else
  info "A browser window will open for the OAuth flow..."
  GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  npx -y @a-bonus/google-docs-mcp auth

  if [[ -f "$TOKEN_FILE" ]]; then
    ok "Token saved to ${TOKEN_FILE}"
  else
    err "Token file not found at ${TOKEN_FILE}. Auth may have failed."
    exit 1
  fi
fi

# ── Build & start ────────────────────────────────────────────────────────────
header "Building and starting Docker container"

cd "$SCRIPT_DIR"

# Check if container is already running
RUNNING=$(docker compose ps --status running --format '{{.Name}}' 2>/dev/null || true)
if [[ -n "$RUNNING" ]]; then
  ok "Container already running: ${RUNNING}"
else
  docker compose build
  ok "Image built"

  docker compose up -d
  ok "Container started"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
header "Setup complete"

cat <<EOF
  The MCP server is running at: http://localhost:8080/sse

  Useful commands:
    make logs      View logs (Ctrl+C to pause, Shift+F to resume, q to quit)
    make stop      Stop the server
    make start     Start the server
    make restart   Restart the server
    make status    Show container status
EOF
