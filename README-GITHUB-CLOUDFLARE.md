# TASKVN — GitHub + Cloudflare production deployment

This repository is designed for **GitHub source control + Cloudflare Worker/Assets**. Netlify is not required.

## Architecture
- GitHub: source code and version history.
- Cloudflare Worker: frontend delivery + server API + security headers.
- Cloudflare edge: DDoS mitigation/WAF layer.
- Supabase/Firebase: existing data/auth modules retained from the source project.
- Web 2 + Admin + verify destination remain in `public/`.

## Required Cloudflare secrets
Set these as Worker secrets, never in GitHub files:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGIN` as a normal variable if desired, or configure it in the Worker dashboard.

Example:
`wrangler secret put SUPABASE_SERVICE_ROLE_KEY`

## GitHub Actions
Add repository secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Then every push to `main` deploys through `.github/workflows/deploy-cloudflare.yml`.

## Security
Cloudflare handles volumetric DDoS at the edge. The Worker also adds security headers and an application-layer API request limiter. This is defense-in-depth, not an absolute guarantee against every attack.

For production, enable Cloudflare WAF/Bot protections and keep payment/admin secrets server-side.
