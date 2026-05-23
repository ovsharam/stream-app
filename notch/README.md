# Notch — Central + Mobile Clusters

Two connected surfaces sharing one knowledge graph:

| Cluster | What it is | Where |
|---------|-----------|--------|
| **Central** | Locked-in dashboard — integrations, deals, meetings, actions, activity | Main window → `/dashboard` |
| **Mobile** | Ambient droplet below the Mac notch — ultra-fast in-call assist | Top-center dot → `⌘⇧Space` |

## Run both clusters

```bash
npm run dev:notch
```

Opens:
- **Central cluster** — http://localhost:3000/dashboard
- **Mobile droplet** — green dot below notch (click or `⌘⇧Space` to expand)

## Mobile cluster demo

1. Click the droplet or press `⌘⇧Space`
2. Type: `Wtf do I say to their GDPR question?`
3. Hit **Get guidance** — shared context returns a **Say this** script + agenda next step + trust note

Context is grepped from the same graph the central cluster shows (Acme Corp, EU residency pattern, Redwood reference, SCC template).

## Central cluster

- **Overview** — active deal, signals, action queue
- **Integrations** — Gmail, Slack, Salesforce, Gong, Calendar
- **Meetings** — live call strip + stream placeholder
- **Actions** — email drafts, SF updates, build briefs
- **Activity** — cross-source event log

## Architecture

```
Central (Next.js /dashboard)  ──┐
                                  ├── /api/cluster/*  ← shared context
Mobile (Electron droplet)     ──┘
```

Simulation mode — no work accounts required.
