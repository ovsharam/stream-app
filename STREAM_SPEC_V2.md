# Stream — Cursor build spec v2

Full system: **Stream Central** + **Mobile Cluster**. Two surfaces, one brain.

See the canonical spec in the project chat / handoff. Implementation lives under `notch/` (Electron + React) with `server/` API and `notch/simulation/` fixtures.

## Quick reference

| Surface | Access | Role |
|---------|--------|------|
| **Stream Central** | Electron desktop window | X-style feed, integrations, meeting room, settings |
| **Mobile Cluster** | `⌘⇧M` (hidden until invoked) | Ambient assist, live answers, guide questions |

| Mode | Env |
|------|-----|
| Simulation | `SIMULATION_MODE=true` |
| Live integrations | OAuth credentials in `.env` |

## Build order (current repo)

1. ✅ Electron dual windows + shortcuts (`notch/electron/main.ts`)
2. ✅ SimulationEngine + fixtures (`notch/simulation/`)
3. 🔄 Feed + mobile panel (in progress — align to v2 components)
4. ⏳ FDEExtractor + Claude prompts
5. ⏳ Meeting Room mode
6. ⏳ AudioTap + Whisper

Run: `npm run dev:notch`
