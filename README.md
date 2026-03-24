# google-docs-mcp Docker Server

Runs the [`@a-bonus/google-docs-mcp`](https://github.com/a-bonus/google-docs-mcp)
MCP server inside Docker and exposes it as an SSE endpoint so Claude.ai (or any
MCP-compatible client) can connect to it.

**Stack:** `node:20-slim` + `@a-bonus/google-docs-mcp` + `supergateway` (stdio → SSE bridge)

---

## Prerequisites

- Docker Desktop running
- A Google Cloud project with **Google Docs API**, **Google Sheets API**, and
  **Google Drive API** enabled, plus an OAuth 2.0 Desktop client ID + secret.
  See the [upstream README](https://github.com/a-bonus/google-docs-mcp#google-cloud-setup-details)
  for step-by-step instructions.
- `node` / `npx` available on your host (for the one-time auth step only).

---

## Setup

### 1. Configure credentials

```bash
cp .env.example .env
# Edit .env and fill in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
```

### 2. Authorise (one-time, runs on the host)

Auth opens your browser for the Google OAuth flow and saves a refresh token to
`~/.config/google-docs-mcp/token.json`. This directory is mounted into the
container so you only need to do this once.

```bash
source .env

GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
npx -y @a-bonus/google-docs-mcp auth
```

Verify the token was written:

```bash
cat ~/.config/google-docs-mcp/token.json
```

### 3. Build the image

```bash
docker compose build
```

### 4. Start the server

```bash
docker compose up -d
```

The SSE endpoint is now available at:

```
http://localhost:8080/sse
```

### 5. Connect in Claude.ai

Claude.ai requires HTTPS for remote MCP servers. Use [ngrok](https://ngrok.com/)
to get a public HTTPS tunnel:

```bash
ngrok http 8080
# Use the https://xxxx.ngrok-free.app/sse URL in Claude.ai Settings → Integrations
```

---

## Useful commands

```bash
# View logs
docker compose logs -f

# Stop the server
docker compose down

# Rebuild after a version bump
docker compose build --no-cache && docker compose up -d

# Re-authorise (delete old token first if needed)
rm ~/.config/google-docs-mcp/token.json
GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." npx -y @a-bonus/google-docs-mcp auth
```

---

## How it works

```
Claude.ai  ──SSE──►  supergateway (port 8080)  ──stdio──►  google-docs-mcp
                      (inside Docker container)
```

`supergateway` bridges the stdio-based MCP server to an HTTP/SSE endpoint.
The OAuth token is stored on your host at `~/.config/google-docs-mcp/token.json`
and mounted read-write so the server can refresh it automatically.
