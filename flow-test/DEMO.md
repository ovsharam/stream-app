# Live demo playbook

Three ways to show the intake → deploy chain. Pick based on time and audience.

---

## Option A — Terminal live (best for FDE calls, ~12 min)

**Setup (before the call):**
1. Run once fully so `build-output/` exists as backup:
   ```bash
   cd flow-test && npm run flow:sample
   ```
2. Open two windows side by side:
   - **Left:** terminal (large font, 18pt+)
   - **Right:** VS Code on `flow-test/build-output/packages/rep-ui-stub/src/components/ScreenPopCard.tsx`

**During the call:**
```bash
cd flow-test
npm run flow:demo
```

`--demo` pauses between stages — you narrate, press Enter, next stage runs.

**Your script:**

| Pause | Say |
|-------|-----|
| Start | "This is a messy discovery transcript. Notch turns it into a classified case." |
| After EXTRACT | "Eight requirements — ambiguous ones tagged, not invented." |
| After SCORE | "Score 32 — we would NOT let eng full-build. Contour generates docs; we gate execution." |
| After BUILD | "This is the agent brief — real gotchas, OAuth, EU, Avaya." |
| After EXECUTE | "Switch to the IDE — 35 files, real scaffold." |
| After EMAIL | "This is what you'd send the client tonight." |

**If EXECUTE is too slow live:** use fast mode (pre-run build output):
```bash
npm run flow:demo:fast
```
Skips code gen (~3 min), tour the existing `build-output/` folder when you hit stage 4.

---

## Option B — Two-act demo (Notch + flow, ~15 min)

Best when you want the **product shell** plus **proof the brain works**.

1. **Act 1 — Notch (2 min):** Open Notch → Pipeline → open a case → Requirements tab → context score. "This is the system of record."
2. **Act 2 — Flow (10 min):** Run `npm run flow:demo` on a transcript similar to their work.
3. **Act 3 — Connect (1 min):** "Same chain runs inside Notch today on post-call — this script is how we tune it."

Notch already does EXTRACT/SCORE/BUILD in production (`meetingPipeline`, case workspace, Build Dojo). The script is the **portable proof** you can run in any room.

---

## Option C — Record once, send async

```bash
cd flow-test && npm run flow:sample
```

Record with Loom:
1. Terminal scrolling through stages
2. Quick flip through `build-output/`
3. Email in SUMMARY

Send FDEs the Loom + `run-log.json` before the call. Live call becomes Q&A, not a risky demo.

---

## What NOT to do

- Don't build UI before the chain works on **their** transcript.
- Don't compare feature checklists to Contour — show **score → gated build → files → email** in one sitting.
- Don't run full EXECUTE cold on a slow network — pre-run once, use `--fast` as backup.

---

## Commands cheat sheet

```bash
npm run flow:sample              # full run, dump JSON
npm run flow:demo                # live presentation, pauses
npm run flow:demo:fast           # skip EXECUTE (~3 min)
npm run flow -- my-call.txt --demo
open flow-test/build-output    # macOS — show generated code
```
