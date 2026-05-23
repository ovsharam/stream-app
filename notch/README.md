# Notch

Ambient AI copilot for Account Executives — macOS overlay with pre-call, live call, and post-call phases. Fully demoable via simulation fixtures; no work integrations required.

## Quick start

```bash
npm install
npm run dev:notch
```

Panel appears on the right edge of your screen. Menu bar tray icon for controls.

## Demo flow

1. **Pre-call** — calendar banner, attendees, talking points, cross-case patterns (Acme Corp)
2. **Start call** — button or `⌘⇧D` — transcript replays at 8× speed (~7s to GDPR moment)
3. **Live** — Jen's GDPR question triggers live assist; signals + load-bearing gaps update
4. **End call** — button or `⌘⇧E` — summary, captured signals, queued actions
5. **Search** — `⌘⇧Space` — graph-scoped search overlay (Esc to close)

## Environment

```bash
cp notch/.env.example .env
SIMULATION_MODE=true   # default — fixtures only
ANTHROPIC_API_KEY=     # optional, for future LLM wiring
```

## Architecture

```
SimulationEngine  ←→  Electron main (IPC)  ←→  React phases
       ↓
  GraphStore (SQLite ~/.notch/graph.sqlite)
```

Real integrations swap in via `SIMULATION_MODE=false` — same interface, one env var.

See [NOTCH_SPEC.md](../NOTCH_SPEC.md) for full build spec.
