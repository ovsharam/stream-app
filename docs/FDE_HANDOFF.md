# FDE handoff — Notch production onboarding

This guide is for an FDE who will run **real** Notch (not demo/sim) with their own Gmail, Monday, and MCP agents.

## What Notch is

Notch is an **FDE work OS** in Electron: calendar-aware daily portal, live call capture with mobile cluster assist, post-call task routing, and a **Clients** ledger (engagements) that tracks intake → build → maintenance across agency clients. Integrations feed a central stream; compose dispatches to connected tools.

## Quick start

1. Clone the repo and install dependencies: `npm install`
2. Copy env: `cp notch/.env.example notch/.env` (or set vars in repo root `.env`)
3. Set `ANTHROPIC_API_KEY` and Gmail OAuth client IDs/secrets
4. Run production dev:

```bash
npm run dev:notch:live
```

This sets `SIMULATION_MODE=false` and `NOTCH_PROTOTYPE=1` (live meeting pipeline). Do **not** use `npm run dev:notch:demo` for handoff.

5. Open **Central** (Electron window). Use the left nav: **Work** for portal/clients, **Apps** for integrations.

## Connect integrations

In **Apps** (Integrations):

| Integration | Purpose |
|-------------|---------|
| **Gmail** | Inbox feed + Google Calendar in the right rail |
| **Monday.com** | Board sync + `@monday:` task creation from post-call approve |
| **MCP Agents** | Register your agency MCP servers (stdio or HTTP/SSE) |

After Gmail connect, enable **Calendar rail** on at least one account and pick calendars in the Gmail detail panel.

## Register MCP agents

**Apps → MCP Agents**

- Add name, optional compose alias (e.g. `deploy` → `@deploy ask: …`)
- **stdio**: command + args (e.g. `npx` + `-y @your/mcp-server`)
- **HTTP/SSE**: hosted MCP URL

Registry file: `~/.stream-app/mcp-agents.json` (survives restarts).

> **Note:** Compose dispatch for custom MCP aliases is **not fully wired** yet — registration and persistence work; executor hook-up is a follow-up.

## Take a call

1. **Calendar** — next event appears in Work portal and right rail; click **Join in Notch** (or join from Google Meet/Zoom in browser).
2. **Start capture** — `⌘⇧L` when the call begins (menu bar: Start meeting capture).
3. During call — mobile cluster panel can assist; star moments with `⌘⇧S` if needed.
4. **End call** — `⌘⇧K` runs post-call pipeline (transcript, extraction, Google Doc if Gmail/Docs connected, feed item, engagement upsert).

## Post-call

- Work view focuses the **post-call task deck** for that meeting (approve routes to Monday, etc.).
- **Clients** widget (portal) and **Engagements** section (below portal) show the client record auto-created/updated from extraction.
- Stages: **Intake** → **Start build** → **Maintenance**; use **Escalate** for attention levels.

### Scope buckets

| Scope | Meaning |
|-------|---------|
| **Quick win** | Small, shippable scope from the call |
| **Big bet** | Larger build; needs planning |
| **Scope TBD** | Extraction could not classify |

### Escalation

- Level 0: normal  
- Level 1: needs attention  
- Level 2: escalated (card highlighted)

## Engagement flow

```
Intake (post-call auto-create)
    → Build (FDE starts delivery)
        → Maintenance (handoff / steady state)
```

Paused is available via API/patch if you add UI later.

## Data location

All local production data under **`~/.stream-app/`** (override with `STREAM_DATA_DIR`):

| Path | Contents |
|------|----------|
| `kb.sqlite` | Knowledge base + FDE engagements table |
| `mcp-agents.json` | Registered MCP agents |
| OAuth tokens / integration state | As written by server sources |

## Hotkeys (real mode)

| Shortcut | Action |
|----------|--------|
| `⌘⇧L` | Start meeting capture |
| `⌘⇧K` | End meeting & sync (post-call pipeline) |
| `⌘⇧S` | Star moment on live call |
| `⌘⇧M` | Mobile cluster assist (when panel open) |

Demo-only hotkeys (`⌘⇧D` / `⌘⇧E`) apply only in `dev:notch:demo`.

## Troubleshooting

- **No calendar** — connect Gmail in Apps; enable calendar on an account.
- **No client after call** — ensure `ANTHROPIC_API_KEY` is set; check API logs; confirm `NOTCH_PROTOTYPE=1`.
- **Monday tasks fail** — token needs `boards:write` and `updates:write` scopes.
- **Whisper/audio** — see `notch/scripts/setup-whisper.sh` for local transcription setup.

## Scripts reference

| Script | Mode |
|--------|------|
| `npm run dev:notch:live` | Production FDE handoff (recommended) |
| `npm run dev:notch` | Default dev (no explicit sim flags) |
| `npm run dev:notch:demo` | Acme simulation + canned assist |
