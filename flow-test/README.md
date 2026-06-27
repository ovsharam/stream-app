# Notch FDE flow test

Prove the chain works **before** building more product UI.

```
intake → EXTRACT → SCORE → BUILD PROMPT → EXECUTE → EMAIL
```

## Setup

```bash
cd flow-test
npm install
```

Add to repo root `.env` (or `flow-test/.env`):

```
ANTHROPIC_API_KEY=sk-ant-...
# optional: FLOW_MODEL=claude-sonnet-4-20250514
```

## Run

```bash
npm run flow:sample
# or
npm run flow -- /path/to/your-real-transcript.txt
```

Outputs:

- `./build-output/` — generated code/config from EXECUTE step
- `./run-log.json` — full structured log for accuracy review

## Pass criteria

After running on `sample-intake.txt`, then a **real** transcript:

- EXTRACT got client/requirements without inventing
- SCORE caught vague latency + unconfirmed OAuth (not a rubber-stamp 90)
- BUILD PROMPT has real gotchas
- EXECUTE files are relevant
- EMAIL is sendable with light edits

**3+ solid → chain is real → ship useplumb.ai + FDE calls.**

## Wire to Notch (later)

This harness mirrors what Notch already does in production:

| Step | Notch today |
|------|-------------|
| EXTRACT | `server/cluster/meetingPipeline.ts` |
| SCORE | `shared/fde-context.ts` |
| BUILD | Case → Build Dojo → `runBuildAgent` |
| EMAIL | (add after chain proves out) |

TODO in `flow.ts` EXECUTE: shell to Claude Code CLI against a real repo.
