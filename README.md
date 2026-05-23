# Notch

Ambient AI copilot for Account Executives — **two connected clusters**:

- **Central cluster** — streaming feed of notifications from Notch, Meet, Gmail, Slack, Gong (`/dashboard`)
- **Mobile cluster** — droplet below the Mac notch for ultra-fast in-call assist (`⌘⇧Space`)

```bash
npm install
npm run dev:notch
```

| Surface | URL / access |
|---------|----------------|
| Central dashboard | http://localhost:3000/dashboard |
| Mobile droplet | Green dot below notch · `⌘⇧Space` |

Try in the droplet: *"Wtf do I say to their GDPR question?"*

No work integrations required — shared simulation context powers both clusters.

See [notch/README.md](notch/README.md) and [NOTCH_SPEC.md](NOTCH_SPEC.md).
