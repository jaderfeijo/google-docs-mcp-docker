#!/usr/bin/env bash
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { printf "${CYAN}▸ %s${NC}\n" "$*"; }
ok()    { printf "${GREEN}✔ %s${NC}\n" "$*"; }
warn()  { printf "${YELLOW}⚠ %s${NC}\n" "$*"; }
err()   { printf "${RED}✖ %s${NC}\n" "$*"; }
header(){ printf "\n${BOLD}── %s ──${NC}\n\n" "$*"; }

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
read -rp "$(printf "${CYAN}▸${NC} Project ID [${DEFAULT_PROJECT}]: ")" PROJECT_ID
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
  read -rp "$(printf "${CYAN}▸${NC} Billing account ID: ")" BILLING_ACCOUNT
  gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT" --quiet
  ok "Billing linked"
else
  ok "Billing already enabled"
fi

# ── Enable APIs ──────────────────────────────────────────────────────────────
header "Enabling APIs"

for API in docs.googleapis.com sheets.googleapis.com drive.googleapis.com; do
  info "Enabling ${API}..."
  gcloud services enable "$API" --quiet
  ok "${API} enabled"
done

# ── Manual step: OAuth consent screen + client credentials ───────────────────
header "Manual step required"

CONSOLE_URL="https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}"

cat <<EOF
${YELLOW}Google does not support creating Desktop OAuth client IDs via the CLI.${NC}
${YELLOW}You need to complete two steps in the Cloud Console:${NC}

${BOLD}Step 1: Configure the OAuth consent screen${NC}
  1. Open: ${CYAN}https://console.cloud.google.com/apis/credentials/consent?project=${PROJECT_ID}${NC}
  2. Select ${BOLD}External${NC} user type, click Create
  3. Fill in app name (e.g. "Google Docs MCP") and your email
  4. Click ${BOLD}Save and Continue${NC} through the remaining steps

${BOLD}Step 2: Create OAuth client credentials${NC}
  1. Open: ${CYAN}${CONSOLE_URL}${NC}
  2. Click ${BOLD}Create Credentials → OAuth client ID${NC}
  3. Application type: ${BOLD}Desktop app${NC}
  4. Name: anything you like (e.g. "google-docs-mcp")
  5. Click ${BOLD}Create${NC}
  6. Copy the ${BOLD}Client ID${NC} and ${BOLD}Client Secret${NC}

EOF

read -rp "$(printf "${CYAN}▸${NC} Paste your Client ID: ")" GOOGLE_CLIENT_ID
read -rp "$(printf "${CYAN}▸${NC} Paste your Client Secret: ")" GOOGLE_CLIENT_SECRET

if [[ -z "$GOOGLE_CLIENT_ID" || -z "$GOOGLE_CLIENT_SECRET" ]]; then
  err "Client ID and Secret are required."
  exit 1
fi

# ── Write .env ───────────────────────────────────────────────────────────────
header "Writing .env"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

cat > "$ENV_FILE" <<EOF
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
PORT=8080
EOF

ok "Credentials written to ${ENV_FILE}"

# ── OAuth token ──────────────────────────────────────────────────────────────
header "Authorising with Google (one-time)"

info "A browser window will open for the OAuth flow..."
GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
npx -y @a-bonus/google-docs-mcp auth

TOKEN_FILE="${HOME}/.config/google-docs-mcp/token.json"
if [[ -f "$TOKEN_FILE" ]]; then
  ok "Token saved to ${TOKEN_FILE}"
else
  err "Token file not found at ${TOKEN_FILE}. Auth may have failed."
  exit 1
fi

# ── Build & start ────────────────────────────────────────────────────────────
header "Building and starting Docker container"

cd "$SCRIPT_DIR"
docker compose build
ok "Image built"

docker compose up -d
ok "Container started"

# ── Done ─────────────────────────────────────────────────────────────────────
header "Setup complete"

cat <<EOF
${GREEN}The MCP server is running at: ${BOLD}http://localhost:8080/sse${NC}

${CYAN}Useful commands:${NC}
  make logs      View logs (Ctrl+C to pause, Shift+F to resume, q to quit)
  make stop      Stop the server
  make start     Start the server
  make restart   Restart the server
  make status    Show container status
EOF
