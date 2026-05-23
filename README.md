# Notch

Ambient AI copilot for Account Executives — a macOS overlay that surfaces pre-call prep, live assist during calls, and post-call actions from a knowledge graph.

**No work integrations needed to demo.** The `SimulationEngine` replays realistic fixture data with the same interface as real Salesforce/Gong/Gmail connectors.

## Run the demo (macOS)

```bash
npm install
npm run dev:notch
```

| Hotkey | Action |
|--------|--------|
| `⌘⇧D` | Start simulated call |
| `⌘⇧E` | End call |
| `⌘⇧Space` | Graph search |

Or use the **Start call / End call** buttons at the bottom of the panel.

## What's in the repo

| Path | Purpose |
|------|---------|
| `notch/` | **Primary product** — Electron app, simulation, graph |
| `app/`, `server/` | Legacy STREAM PWA + API (optional) |

## Requirements

- **macOS** for the Electron overlay
- **Optional:** `ANTHROPIC_API_KEY` for future Claude integration (fixtures include pre-built live assist responses)

## Docs

- [notch/README.md](notch/README.md) — demo details
- [NOTCH_SPEC.md](NOTCH_SPEC.md) — full build spec

## Legacy PWA

The Next.js signal feed PWA still runs separately:

```bash
npm run dev          # http://localhost:3000
```

Deploy to Vercel with `DEMO_MODE=1` for the interactive web demo.
