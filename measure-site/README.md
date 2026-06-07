# Scope Measure — appliedscope.com

Standalone Next.js site. Deploy root directory: `measure-site`.

```bash
npm install
npm run dev   # http://localhost:3001
```

## Vercel env (Production)

Point at your STREAM API (Cloudflare Tunnel from local Notch, or future hosted API):

```env
APP_URL=https://appliedscope.com
NEXT_PUBLIC_STREAM_API_URL=https://api.appliedscope.com
NEXT_PUBLIC_SOCKET_URL=https://api.appliedscope.com
```

Without `NEXT_PUBLIC_STREAM_API_URL`, the dashboard cannot load data on Vercel.
