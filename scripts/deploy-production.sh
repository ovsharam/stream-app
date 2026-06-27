#!/bin/bash
set -e

echo "Deploying Plumb to production..."
echo ""

# ─── 1. Deploy API to Railway ────────────────────────────────────────────────

echo "[1/2] Deploying API server to Railway..."

if ! command -v railway &> /dev/null; then
  echo "Error: railway CLI not installed."
  echo "Install it: npm install -g @railway/cli"
  echo "Then login: railway login"
  exit 1
fi

railway up

echo "API deployed."
echo ""

# ─── 2. Deploy plumb-web to Vercel ────────────────────────────────────────────

echo "[2/2] Deploying plumb-web to Vercel..."

if ! command -v vercel &> /dev/null; then
  echo "Error: vercel CLI not installed."
  echo "Install it: npm install -g vercel"
  echo "Then login: vercel login"
  exit 1
fi

cd "$(dirname "$0")/../plumb-web"
vercel --prod

echo ""
echo "Deployment complete."
echo ""
echo "Production URLs:"
echo "  Web:  https://useplumb.ai"
echo "  API:  https://api.useplumb.ai"
echo ""
echo "Required Railway env vars (set in Railway dashboard if not already):"
echo "  SUPABASE_URL"
echo "  SUPABASE_SERVICE_ROLE_KEY"
echo "  ANTHROPIC_API_KEY"
echo "  PORT=3131"
echo "  NODE_ENV=production"
echo "  CORS_ORIGINS=https://useplumb.ai,https://www.useplumb.ai"
