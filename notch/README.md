# Notch Desktop

**Two native Electron apps** — not browser tabs.

```bash
npm run dev:notch
```

| App | What |
|-----|------|
| **Central cluster** | X-style live stream desktop window |
| **Mobile cluster** | Green droplet below Mac notch · `⌘⇧Space` |

Requires API on `:3131` (started automatically).

## Central stream

- Light X desktop layout — nav, feed, trending rail
- **Join Meet** buttons open call in system browser from desktop app
- **Notch AI** live transcript panel (Otter-style) during calls
- Events stream in from Gmail, Slack, Meet, Gong, build agents

## Mobile cluster

Separate always-on-top Electron window. Ambient assist mid-call.

## Dev URLs (Electron loads these — don't use browser for product)

- Central: `http://localhost:5174/central.html`
- Mobile: `http://localhost:5174/`
