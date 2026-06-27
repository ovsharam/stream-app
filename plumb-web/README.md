# Notch Web — Zendesk for FDEs

Production-bound deployment workspace for Forward-Deployed Engineers. Lives alongside the existing Electron Notch app and local STREAM API — nothing here replaces `notch/` or `server/`.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind v4 + shadcn-style components
- Supabase (Auth, Realtime, Postgres + RLS)
- Drizzle ORM (`src/lib/db`)
- Vercel AI SDK model router (`src/lib/ai`)

## Setup

1. Copy env:

```bash
cp .env.local.example .env.local
```

2. Create a Supabase project. Add redirect URL: `http://localhost:3002/auth/callback`

3. Apply schema + RLS (Supabase SQL editor or psql):

```bash
# paste supabase/migrations/001_initial.sql
```

4. Push Drizzle schema (optional if using SQL migration):

```bash
npm run db:push
```

5. Seed demo data:

```bash
npm run db:seed
```

6. Run:

```bash
npm run dev
```

Open http://localhost:3002 — sign in with magic link, land on `/app` board.

## Build sequence (spec prompts)

| Prompt | Status |
|--------|--------|
| 0 — Project rules | `.cursor/rules/plumb-web.mdc` |
| 1 — Scaffold + auth | Done |
| 2 — Schema + RLS + seed | Done (run migration + seed) |
| 3 — Pipeline board + sensor rail | Done |
| 4 — Context scoring (AI) | Done |
| 5 — Build kickoff + SLA | Done |
| 6 — Intake + events moat | Done (Gmail OAuth stubbed) |

## TODO

- Wire real Gmail OAuth (stub interface in `src/lib/integrations/inbox.ts`)
- Map seeded demo org to first-login users (or admin UI to invite)
- Deploy to Vercel + Supabase Cloud
