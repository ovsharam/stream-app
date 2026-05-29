# NOTCH — Meeting Intelligence Layer

Read `STREAM_SPEC_V2.md` and the existing codebase before changing Central Cluster UI.

**Central Cluster is complete — do not change feed/layout.** All work targets Mobile Cluster + meeting pipeline underneath.

## Goal

Real-time meeting intelligence for the agency experiment:

1. System audio → whisper.cpp (M1, `ggml-medium.en`) → transcript chunks
2. FDE extraction on each chunk → signal detection → speculative Claude answer (cached before invoke)
3. Mobile cluster (⌘⇧M) = command palette, not chat — predicted answer renders instantly
4. Star moments → KB (`kb.sqlite`) with intention velocity telemetry
5. Post-call assembly → meeting thread in Central (build prompt, starred moments, flags, transcript)

## Build order

| Step | Scope |
|------|--------|
| 1 | `AudioTap` + `setup-whisper.sh` + IPC + tray setup |
| 2 | `FDEExtractor` (rules + speculative Claude) in Electron main |
| 3 | Mobile cluster redesign (pill → invoke palette) |
| 4 | `MomentCapture` → KB pipeline |
| 5 | `PostCallAssembler` → Central feed thread |
| 6 | `PreCallPrep` (T-15 calendar) |
| 7 | IPC + preload surface |
| 8 | Simulation parity (⌘⇧D / ⌘⇧M / ⌘⇧E) |

## Definition of done

- whisper.cpp runs on M1 with Metal; BlackHole or mic fallback
- Chunks emit within ~5s of speech; FDE fires in <100ms
- ⌘⇧M shows cached prediction when signal fired
- Star writes KB trace; post-call thread in Central within 5s
- `setContentProtection(true)` on mobile window
- Sim demo end-to-end without live call

## Do not

- Change Central Cluster UI
- Add scroll/history to mobile cluster
- Auto-send post-call actions (queue for review)
- Use whisper-node npm — shell out to binary
- Store raw audio — transcript text only
