# 03 — Deploy Staging Container and Verify

## Problem

All code and config changes are in place. The staging API needs to be deployed to Cloudflare Containers and verified.

## Goal

Deploy the staging Worker + Container, set secrets, and verify the API is working.

## Requirements

### Set the DATABASE_URL secret

```bash
# DATABASE_URL should be set in your environment or .env file (not committed)
# Format: postgresql://everysong_staging:<password>@216.38.137.154:5433/graph_staging
CLOUDFLARE_API_TOKEN=... npx wrangler secret put DATABASE_URL --env staging
# paste the value of $STAGING_DATABASE_URL from your .env
```

### Deploy

```bash
CLOUDFLARE_API_TOKEN=... npx wrangler deploy --env staging
```

### Verify

```bash
curl https://everysong-api-staging.<subdomain>.workers.dev/graph/stats?user=cdxker
```

Should return valid JSON graph stats.

### Custom domain (manual)

Once verified, configure `staging-api.everysong.fm` as a custom domain on the Worker and remove the tunnel route for `staging-api.everysong.fm`.

### Non-atomic deploy caveat

CF Containers deploys are non-atomic during beta: the Worker updates immediately but the container image rolls slowly. After deploying, expect a brief window where the Worker routes to the old container image. For staging this is acceptable — for production, plan a health-check gate or blue/green strategy.

### Verify frontend integration

Check that `staging.everysong-frontend.pages.dev` loads graph data from the new staging API.

## Owner

You (manual task)

## Acceptance Criteria

- [ ] `wrangler secret put DATABASE_URL --env staging` succeeds
- [ ] `wrangler deploy --env staging` succeeds
- [ ] `curl` to the workers.dev URL returns graph stats
- [ ] `staging-api.everysong.fm` points to the Worker (custom domain configured)
- [ ] Staging frontend loads graph data correctly
- [ ] Tunnel route for `staging-api.everysong.fm` is removed

## Files

None (deployment and DNS changes only)
