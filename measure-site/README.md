# Scope Measure — appliedscope.com

Standalone Next.js site. Deploy root directory: `measure-site`.

```bash
npm install
npm run dev   # http://localhost:3001
```

## Google login (production)

The dashboard is protected by Google OAuth. Create a **separate** OAuth client in Google Cloud Console (not the Gmail integration client used by Notch).

**Authorized redirect URIs:**

- `https://appliedscope.com/api/auth/callback/google`
- `http://localhost:3001/api/auth/callback/google` (local dev)

## Live data pipeline

Scope Measure on Vercel does **not** call your Mac directly. It reaches your local Notch API through a tunnel.

```
Notch (local :3131)  →  Cloudflare Tunnel  →  api.appliedscope.com  →  Vercel BFF  →  appliedscope.com
```

### 1. Run the STREAM API locally

```bash
npm run dev:notch:live
```

Confirm `http://localhost:3131/api/dashboard/data` returns JSON.

### 2. Expose :3131 with Cloudflare Tunnel

**Quick test** (random URL, not for production):

```bash
cloudflared tunnel --url http://localhost:3131
```

**Production** (`api.appliedscope.com`):

```bash
cloudflared tunnel login
cloudflared tunnel create stream-api
cloudflared tunnel route dns stream-api api.appliedscope.com
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /Users/<you>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: api.appliedscope.com
    service: http://localhost:3131
  - service: http_status:404
```

Run the tunnel:

```bash
cloudflared tunnel run stream-api
```

Verify: `curl https://api.appliedscope.com/api/dashboard/data` (returns 401 if `MEASURE_API_SECRET` is set — that's OK).

### 3. Vercel env (`appliedscope` project)

Set in **Project → Settings → Environment Variables** (Production):

```env
# Auth
AUTH_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_URL=https://appliedscope.com
MEASURE_ALLOWED_EMAILS=you@company.com

# STREAM API (server-side only — dashboard BFF uses this, not NEXT_PUBLIC_*)
STREAM_API_URL=https://api.appliedscope.com
STREAM_SOCKET_URL=https://api.appliedscope.com
MEASURE_API_SECRET=<shared secret>
```

Redeploy after changing env vars.

> **Do not use `NEXT_PUBLIC_STREAM_API_URL`** — the browser talks to `/api/dashboard/*` on appliedscope.com; Vercel proxies to your API using `STREAM_API_URL`.

### 4. Local API env (`.env.local` in stream-app root)

```env
MEASURE_API_SECRET=<same as Vercel>
MEASURE_SITE_URL=https://appliedscope.com
CORS_ORIGINS=https://appliedscope.com
```

Restart `npm run dev:notch:live` after setting these.

### 5. Troubleshooting the banner

The dashboard calls `/api/dashboard/status` to probe connectivity. The amber banner shows only when the probe fails:

| Banner reason | Fix |
|---------------|-----|
| `missing_env` | Set `STREAM_API_URL` on Vercel, redeploy |
| `unreachable` | Start Notch + Cloudflare tunnel |
| `auth` | Match `MEASURE_API_SECRET` on Vercel and local API |

Check status directly (after signing in):

```bash
curl -b cookies.txt https://appliedscope.com/api/dashboard/status
```

## Local dev without tunnel

Create `measure-site/.env.local`:

```env
STREAM_API_URL=http://localhost:3131
```

Run `npm run dev:api` or `npm run dev:notch:live` alongside `npm run dev` in `measure-site/`.

Without auth env vars, login is skipped (local dev only).
