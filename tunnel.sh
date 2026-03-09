#!/usr/bin/env bash
set -euo pipefail

# ── Load .env ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

if [[ -z "${CLOUDFLARE_API_KEY:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_KEY not set. Add it to .env" >&2
  exit 1
fi
if [[ -z "${CLOUDFLARE_EMAIL:-}" ]]; then
  echo "ERROR: CLOUDFLARE_EMAIL not set. Add it to .env" >&2
  exit 1
fi

API="https://api.cloudflare.com/client/v4"
CT="Content-Type: application/json"
TUNNEL_NAME="everysong"
DOMAIN="everysong.fm"
CREDS_FILE="$SCRIPT_DIR/.tunnel-credentials"

# ── Helper ───────────────────────────────────────────────────────────────────
cf() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-s -H "X-Auth-Key: $CLOUDFLARE_API_KEY" -H "X-Auth-Email: $CLOUDFLARE_EMAIL" -H "$CT" -X "$method")
  [[ -n "$body" ]] && args+=(-d "$body")
  curl "${args[@]}" "$API$path"
}

jq_or_die() {
  local result
  result=$(echo "$1" | jq -r "$2" 2>/dev/null)
  if [[ -z "$result" || "$result" == "null" ]]; then
    echo "ERROR: failed to extract $2 from API response:" >&2
    echo "$1" | jq . 2>/dev/null || echo "$1" >&2
    exit 1
  fi
  echo "$result"
}

# ── 1. Look up Account ID ───────────────────────────────────────────────────
echo "→ Looking up Cloudflare account..."
ACCOUNTS_RESP=$(cf GET "/accounts?page=1&per_page=1")
ACCOUNT_ID=$(jq_or_die "$ACCOUNTS_RESP" '.result[0].id')
echo "  Account ID: $ACCOUNT_ID"

# ── 2. Look up Zone ID for $DOMAIN ──────────────────────────────────────────
echo "→ Looking up zone for $DOMAIN..."
ZONE_RESP=$(cf GET "/zones?name=$DOMAIN")
ZONE_ID=$(jq_or_die "$ZONE_RESP" '.result[0].id')
echo "  Zone ID: $ZONE_ID"

# ── 3. Create or find the tunnel ─────────────────────────────────────────────
echo "→ Finding or creating tunnel '$TUNNEL_NAME'..."

# Check if tunnel already exists (only non-deleted tunnels)
TUNNELS_RESP=$(cf GET "/accounts/$ACCOUNT_ID/cfd_tunnel?name=$TUNNEL_NAME&is_deleted=false")
EXISTING_ID=$(echo "$TUNNELS_RESP" | jq -r '.result[0].id // empty')

if [[ -n "$EXISTING_ID" ]]; then
  TUNNEL_ID="$EXISTING_ID"
  echo "  Found existing tunnel: $TUNNEL_ID"

  # Retrieve the token for the existing tunnel
  TOKEN_RESP=$(cf GET "/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token")
  TUNNEL_TOKEN=$(jq_or_die "$TOKEN_RESP" '.result')
else
  # Generate a random tunnel secret (32 bytes, base64)
  TUNNEL_SECRET=$(openssl rand -base64 32)

  CREATE_RESP=$(cf POST "/accounts/$ACCOUNT_ID/cfd_tunnel" \
    "$(jq -n --arg name "$TUNNEL_NAME" --arg secret "$TUNNEL_SECRET" \
      '{name: $name, tunnel_secret: $secret, config_src: "cloudflare"}')")

  TUNNEL_ID=$(jq_or_die "$CREATE_RESP" '.result.id')
  echo "  Created tunnel: $TUNNEL_ID"

  # Get the token for the new tunnel
  TOKEN_RESP=$(cf GET "/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token")
  TUNNEL_TOKEN=$(jq_or_die "$TOKEN_RESP" '.result')
fi

# Save credentials locally
echo "{\"tunnel_id\": \"$TUNNEL_ID\", \"token\": \"$TUNNEL_TOKEN\"}" > "$CREDS_FILE"
echo "  Saved credentials to .tunnel-credentials"

# ── 4. Configure ingress rules ──────────────────────────────────────────────
echo "→ Configuring ingress rules..."
CONFIG_BODY=$(jq -n '{
  config: {
    ingress: [
      { hostname: "everysong.fm", service: "http://localhost:3000", originRequest: { httpHostHeader: "localhost:3000" } },
      { hostname: "api.everysong.fm", service: "http://localhost:3001", originRequest: { httpHostHeader: "localhost:3001" } },
      { service: "http_status:404" }
    ]
  }
}')
CONFIG_RESP=$(cf PUT "/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" "$CONFIG_BODY")
CONFIG_OK=$(echo "$CONFIG_RESP" | jq -r '.success')
if [[ "$CONFIG_OK" != "true" ]]; then
  echo "ERROR: Failed to configure ingress:" >&2
  echo "$CONFIG_RESP" | jq . >&2
  exit 1
fi
echo "  Ingress rules set."

# ── 5. Create DNS CNAME records ─────────────────────────────────────────────
TUNNEL_CNAME="$TUNNEL_ID.cfargotunnel.com"

create_dns_if_missing() {
  local name="$1"
  echo "→ Checking DNS for $name..."

  EXISTING=$(cf GET "/zones/$ZONE_ID/dns_records?type=CNAME&name=$name")
  EXISTING_ID=$(echo "$EXISTING" | jq -r '.result[0].id // empty')

  if [[ -n "$EXISTING_ID" ]]; then
    echo "  Updating existing CNAME record..."
    cf PUT "/zones/$ZONE_ID/dns_records/$EXISTING_ID" \
      "$(jq -n --arg name "$name" --arg content "$TUNNEL_CNAME" \
        '{type: "CNAME", name: $name, content: $content, proxied: true}')" > /dev/null
  else
    echo "  Creating CNAME record..."
    cf POST "/zones/$ZONE_ID/dns_records" \
      "$(jq -n --arg name "$name" --arg content "$TUNNEL_CNAME" \
        '{type: "CNAME", name: $name, content: $content, proxied: true}')" > /dev/null
  fi
  echo "  $name → $TUNNEL_CNAME ✓"
}

create_dns_if_missing "$DOMAIN"
create_dns_if_missing "api.$DOMAIN"

# ── 6. Run the tunnel ───────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Tunnel ready!"
echo "  https://everysong.fm       → localhost:3000"
echo "  https://api.everysong.fm   → localhost:3001"
echo "═══════════════════════════════════════════════════════"
echo ""

exec cloudflared tunnel run --protocol http2 --token "$TUNNEL_TOKEN"
