# Notch / Plumb Design Language

Design decisions for the Notch Electron app and Plumb web app. This is the source of truth — resolve ambiguity by reading this, not by inventing.

---

## Principles

1. **Execution, not presentation.** Every element earns its place by showing the user what is happening or what needs to happen next. No decorative chrome.
2. **Information density without noise.** Cards, lists, and panels show all data the user needs at a glance. Remove redundant labels (breadcrumb AND title = one too many).
3. **Clarity through restraint.** One accent color per surface. No gradients on functional elements. No hover animations that don't reveal information.
4. **Enterprise without sterility.** Clean, capable, direct. Warm enough to feel human. Not a dashboard — a workspace.

---

## Color Tokens

All tokens live in `central.css` under `:root, [data-theme='light']`.

### Core palette (light theme defaults)

| Token | Value | Use |
|---|---|---|
| `--x-bg` | `#faf9f5` | Page / main background |
| `--x-nav-bg` | `#ffffff` | Sidebar, toolbar, card backgrounds |
| `--x-surface` | `#f5f4f0` | Hover states, inline code, secondary surfaces |
| `--x-border` | `rgba(0,0,0,0.08)` | Dividers, card borders |
| `--x-border-strong` | `rgba(0,0,0,0.14)` | Sidebar border, modal borders |
| `--x-fg` | `#1a1a18` | Primary text |
| `--x-body` | `#3d3c38` | Body copy, secondary text |
| `--x-muted` | `#888` | Labels, timestamps, hints |
| `--x-accent` | `#cc785c` | Primary interactive (terracotta) |
| `--x-accent-hover` | `#b8664a` | Hover on accent elements |
| `--x-accent-warm` | `#d97706` | Warnings, gaps, amber signals |

### Semantic usage rules

- **Accent** (`--x-accent`): buttons, active nav highlight, active state indicators, links
- **Amber / warn** (`--x-accent-warm`): context gaps, escalation level 1, missing data
- **Red** (`#dc2626`): escalation level 2, error states, destructive actions
- **Green** (`#16a34a`): done states, quick-win scope badge, success indicators
- **No blue** in Notch core UI — the `--x-enterprise-accent: #174ea6` in `enterprise.css` is legacy and should be removed in a future cleanup

### Dark theme

All themes invert `--x-bg` / `--x-nav-bg` to near-black and adjust borders. The accent color stays consistent across all themes — it is the brand signal.

---

## Typography

| Token | Value | Use |
|---|---|---|
| `--x-font-sans` | `'Inter', system-ui, sans-serif` | All UI chrome, labels, body |
| `--x-font-serif` | `'Lora', Georgia, serif` | **Only** `x-home-greeting` and `x-cal-head h2` |
| `--x-font-mono` | `'JetBrains Mono', monospace` | Code, transcripts, IDs |

### Type scale

| Class context | Size | Weight | Notes |
|---|---|---|---|
| Page title (`x-pipeline-title`, `x-work-title`) | 18–20px | 700 | Letter-spacing -0.02em |
| Section heading (`h3` in col heads) | 12px | 700 | All-caps, 0.04em tracking |
| Card title (`strong` in cards) | 13px | 600 | |
| Nav label (`x-side-nav-label`) | 13px | 600 | Letter-spacing -0.01em |
| Body / card summary | 11px | 400 | Line-height 1.35 |
| Badges / chips | 9–11px | 600–700 | All-caps or sentence case |
| Timestamps / IDs | 10px | 400–600 | Tabular nums |

**Rule:** Never use serif (`Lora`) for functional UI. Serif is reserved for the personal greeting on the Home screen only.

---

## Spacing

Base unit: `4px`. Everything multiples of 4.

| Context | Value |
|---|---|
| Card internal padding | `10–12px` |
| Toolbar height | `~44px` (12px top/bottom padding) |
| Sidebar width | `216px` (var `--x-nav-w`) |
| Nav item padding | `7px 10px` |
| Board column gap | `10px` |
| Section gutter (`--x-gutter`) | `20px` |

---

## Elevation / Depth

**No drop shadows on cards.** Cards use a `1px solid var(--x-border)` border with `box-shadow: 0 1px 2px rgba(0,0,0,0.04)` — barely visible.

- **Active / hover state**: border-color shifts toward accent, never box-shadow change
- **Modals / overlays**: `box-shadow: 0 8px 32px rgba(0,0,0,0.14)` — only for floating UI
- **Sidebar**: `border-right: 1px solid var(--x-border-strong)` — stronger than card borders

---

## Component Patterns

### Cards (`.x-pipeline-card`)
- White (`--x-nav-bg`) background on `--x-bg` page
- 8px border-radius
- 1px border
- Left edge stripe for escalation: 3px solid amber (level 1) or red (level 2)
- Footer: timestamp left, tags right
- Never more than 110 chars of summary body

### Badges / Tags
- Scope: colored bg + border (green=quick win, accent=big bet, muted=unknown)
- Gaps: amber pill (`--x-accent-warm`)
- Signals (Gmail, Slack, etc.): muted `9px` uppercase pill
- Build status: accent-colored (Running, Building)

### Buttons
- Primary: `--x-accent` fill, white text
- Secondary: `1px var(--x-border)` border, `--x-surface` bg
- Muted: no background, just text + hover bg
- Sizing: `7px 12px` padding, `8px` border-radius, `12px 600` font

### Navigation
- Active state: `inset 3px 0 0 var(--x-accent)` left border + 10% accent tint bg
- System nav (Apps, Settings): pinned to bottom via `margin-top: auto`
- No hover box on icon area — hover is on the full row item

### Pipeline steps (`.x-live-flow-step`)
- Vertical list with timeline (2px border left-rail connecting steps)
- Dot indicator: pending=empty circle, running=pulsing accent dot, done=filled green dot
- Label weight: 500 muted when pending, 600 fg when active/done

---

## What NOT to do

- No `font-family: Lora` on anything functional
- No `border: 1px dashed` on nav items or interactive elements
- No competing accent colors — only `--x-accent` (terracotta). The `--x-enterprise-accent` blue in `enterprise.css` is a legacy color that should converge to `--x-accent`
- No breadcrumb + h1 title on the same view (pick one)
- No `display: block` uppercase labels with 0.06em tracking on section headers inside content areas — use weight to create hierarchy, not text-transform
- No `box-shadow` changes on hover — use border-color instead
- No decorative gradients on home or hero areas (`.x-home-bg { display: none }`)

---

## Plumb Web (useplumb.ai)

The web app is a download gateway, not the product. Design principle: marketing clarity over feature exposition.

Stack: Next.js, Tailwind CSS, `plumb-web/src/`

The web app should feel consistent with Notch — same warmth, same restraint. When in doubt: what would a potential customer see in 5 seconds that makes them want to download?
