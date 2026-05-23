# Notch — ambient AI copilot for AEs

See full build spec in project docs. Summary:

- **macOS Electron overlay** — right-edge panel, three phases (pre-call → live → post-call)
- **SimulationEngine** — fixture replay with realistic timing; same interface as real integrations
- **Demo hotkeys:** `⌘⇧D` start call · `⌘⇧E` end call · `⌘⇧Space` search
- **Only real dependency for full demo:** `ANTHROPIC_API_KEY` (fixture responses work without it)

Run: `SIMULATION_MODE=true npm run dev:notch`
