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
TUNNEL_NAME="everysong-radio"
DOMAIN="everysong.fm"
HOSTNAME="radio.$DOMAIN"
LOCAL_SERVICE="http://localhost:3010"
CREDS_FILE="$SCRIPT_DIR/.tunnel-radio-credentials"

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

TUNNELS_RESP=$(cf GET "/accounts/$ACCOUNT_ID/cfd_tunnel?name=$TUNNEL_NAME&is_deleted=false")
EXISTING_ID=$(echo "$TUNNELS_RESP" | jq -r '.result[0].id // empty')

if [[ -n "$EXISTING_ID" ]]; then
  TUNNEL_ID="$EXISTING_ID"
  echo "  Found existing tunnel: $TUNNEL_ID"

  TOKEN_RESP=$(cf GET "/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token")
  TUNNEL_TOKEN=$(jq_or_die "$TOKEN_RESP" '.result')
else
  TUNNEL_SECRET=$(openssl rand -base64 32)

  CREATE_RESP=$(cf POST "/accounts/$ACCOUNT_ID/cfd_tunnel" \
    "$(jq -n --arg name "$TUNNEL_NAME" --arg secret "$TUNNEL_SECRET" \
      '{name: $name, tunnel_secret: $secret, config_src: "cloudflare"}')")

  TUNNEL_ID=$(jq_or_die "$CREATE_RESP" '.result.id')
  echo "  Created tunnel: $TUNNEL_ID"

  TOKEN_RESP=$(cf GET "/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token")
  TUNNEL_TOKEN=$(jq_or_die "$TOKEN_RESP" '.result')
fi

echo "{\"tunnel_id\": \"$TUNNEL_ID\", \"token\": \"$TUNNEL_TOKEN\"}" > "$CREDS_FILE"
echo "  Saved credentials to .tunnel-radio-credentials"

# ── 4. Configure ingress rules ──────────────────────────────────────────────
echo "→ Configuring ingress rules..."
CONFIG_BODY=$(jq -n \
  --arg hostname "$HOSTNAME" \
  --arg service "$LOCAL_SERVICE" \
  '{
    config: {
      ingress: [
        { hostname: $hostname, service: $service, originRequest: { httpHostHeader: "localhost:3010" } },
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

# ── 5. Create DNS CNAME record ──────────────────────────────────────────────
TUNNEL_CNAME="$TUNNEL_ID.cfargotunnel.com"

echo "→ Checking DNS for $HOSTNAME..."
EXISTING=$(cf GET "/zones/$ZONE_ID/dns_records?type=CNAME&name=$HOSTNAME")
EXISTING_ID=$(echo "$EXISTING" | jq -r '.result[0].id // empty')

if [[ -n "$EXISTING_ID" ]]; then
  echo "  Updating existing CNAME record..."
  cf PUT "/zones/$ZONE_ID/dns_records/$EXISTING_ID" \
    "$(jq -n --arg name "$HOSTNAME" --arg content "$TUNNEL_CNAME" \
      '{type: "CNAME", name: $name, content: $content, proxied: true}')" > /dev/null
else
  echo "  Creating CNAME record..."
  cf POST "/zones/$ZONE_ID/dns_records" \
    "$(jq -n --arg name "$HOSTNAME" --arg content "$TUNNEL_CNAME" \
      '{type: "CNAME", name: $name, content: $content, proxied: true}')" > /dev/null
fi
echo "  $HOSTNAME → $TUNNEL_CNAME ✓"

# ── 6. Run the tunnel ───────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Radio tunnel ready!"
echo "  https://radio.everysong.fm → localhost:3010"
echo "═══════════════════════════════════════════════════════"
echo ""

exec cloudflared tunnel run --protocol http2 --token "$TUNNEL_TOKEN"
