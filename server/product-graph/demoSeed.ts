/**
 * Synthetic demo dataset for a fictional B2B SaaS company "Helix"
 * — a developer-focused payments & billing API platform.
 *
 * Structured to look exactly like real connector output (Linear issues,
 * Slack threads, GitHub releases, internal docs) so it runs through the
 * same extraction pipeline as live connectors.
 */

import type { ConnectorChunk } from '../connectors/types'

export interface DemoScenario {
  label: string
  companyName: string
  chunks: ConnectorChunk[]
}

const now = Date.now()
const daysAgo = (d: number) => now - d * 86_400_000

// ─── HELIX ────────────────────────────────────────────────────────────────────
// B2B payments & billing API platform (Stripe / Braintree territory)

const HELIX_CHUNKS: ConnectorChunk[] = [

  // ── Linear: shipped features ──────────────────────────────────────────────
  {
    contentType: 'issue', sourceId: 'linear-HX-481', title: 'Instant Payouts — GA release',
    sourceUrl: 'https://linear.app/helix/issue/HX-481',
    timestamp: daysAgo(8),
    content: `[Linear HX-481] Instant Payouts — GA release
Team: Payments | Status: Done | Labels: feature, shipped

Instant Payouts are now generally available for eligible US merchants. Supports Visa and Mastercard debit cards only. Funds arrive within 30 minutes, 24/7 including weekends and holidays.

Eligibility: merchant must have completed identity verification, have no outstanding disputes, and maintain an average payout volume above $1,000/month for 90 days. Accounts flagged by risk review are ineligible.

Fee: 1.5% per instant payout, minimum $0.50. No cap.

Limitations confirmed:
- Not available for American Express or Discover cards
- Not available for bank account payouts (ACH) — ACH standard settlement only
- Single payout limit: $10,000. Accounts above this limit must split payouts.
- Available in US only. International support not on roadmap for Q3.
- Cannot be combined with scheduled payout batching — instant payouts are always on-demand.

Comments:
  [Ryan Chen, PM]: Reminder that cards must be verified debit cards. Prepaid cards are rejected at the card network level, not by us.
  [Sarah Okafor, Eng]: We added a pre-flight check endpoint: POST /v1/payouts/instant/eligibility — returns eligible: true/false with reason codes before merchants call the actual payout.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-HX-502', title: 'Multi-currency settlement — Phase 1',
    sourceUrl: 'https://linear.app/helix/issue/HX-502',
    timestamp: daysAgo(14),
    content: `[Linear HX-502] Multi-currency settlement — Phase 1
Team: Payments | Status: Done | Labels: feature, shipped

Phase 1: merchants can now accept payments in EUR, GBP, CAD, AUD, and JPY in addition to USD. Settlement is always in the merchant's home currency (USD for US accounts). FX conversion happens at point of charge using Helix mid-market rate + 1.5% spread.

Constraints:
- Currency presentment only — merchant always settles in USD. True multi-currency settlement (settle in EUR, GBP) is Phase 2, not yet scoped.
- FX rate locked at time of charge authorization, not at settlement.
- Refunds issued in original charge currency at original FX rate. Merchant absorbs any rate fluctuation.
- Balance object does not show per-currency breakdown — merchants must use the charge object to track source currency.

Comments:
  [Maya Torres, PM]: Phase 2 (settle in local currency) is blocked pending banking partner agreements. No ETA.
  [Dev Support]: Customers asking about settling in EUR should be told this is not available and not yet on roadmap.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-HX-477', title: 'Revenue Recovery: smart retry logic',
    sourceUrl: 'https://linear.app/helix/issue/HX-477',
    timestamp: daysAgo(22),
    content: `[Linear HX-477] Revenue Recovery: smart retry logic for failed subscription payments
Team: Billing | Status: Done | Labels: feature, shipped

Revenue Recovery is live. When a subscription payment fails, Helix now automatically retries using ML-optimized timing (based on card network patterns, day of week, time of day) instead of fixed intervals.

Default retry schedule: 3 retries over 7 days. Configurable per-subscription via billing_settings.retry_schedule.

Configuration options:
- retry_count: 1-8 retries (default: 3)
- retry_interval: exponential (default), linear, or custom day offsets
- on_failure: cancel_subscription, pause_subscription, or leave_incomplete (default)
- smart_retry: true/false — enables ML timing optimization (default: true)

Constraints:
- Smart retry requires smart_retry: true on the subscription. Opt-out sets fixed 24h intervals.
- Maximum retry window: 21 days from initial failure. After 21 days, subscription moves to unpaid regardless of retry_count setting.
- Revenue Recovery dashboard (showing saved revenue %) requires Business plan or above.

Comments:
  [Alex Kim, Eng]: The ML model improves retry success by ~23% over fixed-interval retries in our test cohort. Based on card network data patterns, not customer-specific history.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-HX-388', title: 'Webhook retry infrastructure overhaul',
    sourceUrl: 'https://linear.app/helix/issue/HX-388',
    timestamp: daysAgo(45),
    content: `[Linear HX-388] Webhook retry infrastructure overhaul
Team: Platform | Status: Done | Labels: feature, shipped

New webhook delivery system:
- Exponential backoff: 5s → 30s → 2m → 10m → 30m → 2h → 8h → 24h (8 retries total, 3-day window)
- Endpoint health monitoring: if >50% of deliveries to an endpoint fail over 72h, endpoint is automatically disabled and webhook.endpoint.disabled event is fired
- Delivery logs: full request/response headers + body stored for 30 days
- Manual replay: any event in the last 30 days can be replayed via dashboard or API (POST /v1/webhook_endpoints/{id}/replay)

Constraints:
- Webhook events are not guaranteed exactly-once. Use idempotency keys on your side.
- Event ordering is not guaranteed within a single object (e.g., payment_intent.created may arrive after payment_intent.succeeded in rare cases).
- Webhook payload size limit: 1MB. Events exceeding this are truncated and flagged with payload_truncated: true.
- Thin events mode: set thin_events: true to receive only event ID and type, then fetch full object via API — reduces payload size for high-volume accounts.

Comments:
  [Sam Rivera, Eng]: The 3-day retry window cannot be extended. This is a hard platform constraint.`,
  },

  // ── Linear: active / in-progress features ─────────────────────────────────
  {
    contentType: 'issue', sourceId: 'linear-HX-541', title: 'Real-time balance API',
    sourceUrl: 'https://linear.app/helix/issue/HX-541',
    timestamp: daysAgo(3),
    content: `[Linear HX-541] Real-time balance API
Team: Platform | Status: In Progress | Labels: feature, enhancement

Current state: balance object is updated on a delay (typically 5–15 min lag post-settlement). Multiple enterprise customers have requested real-time balance visibility for treasury management use cases.

Approach: Streaming balance updates via SSE endpoint. Merchants subscribe to /v1/balance/stream and receive incremental updates as transactions settle.

Status: Backend streaming infra is built and in staging. Dashboard integration in progress. ETA for beta: 3 weeks.

Limitations that will remain post-launch:
- Balance stream shows settled funds only. Pending authorizations are not included.
- Balance object still won't show per-currency breakdown (that's Phase 2 of HX-502).

Comments:
  [Ryan Chen, PM]: Several enterprise customers are paying for this via a manual dashboard workaround today. We need to ship this.
  [Maya Torres]: This is ONLY for real-time visibility — it does not change settlement timing. Customers asking if they can access funds faster via this API should be redirected to Instant Payouts.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-HX-558', title: 'Account-level spend controls for connected accounts',
    sourceUrl: 'https://linear.app/helix/issue/HX-558',
    timestamp: daysAgo(5),
    content: `[Linear HX-558] Account-level spend controls for connected accounts
Team: Connect | Status: In Progress | Labels: feature

Platforms using Helix Connect want to set spending limits on their connected merchant accounts — e.g., "this connected account cannot process more than $50k/month."

Planned implementation: POST /v1/connected_accounts/{id}/controls with velocity limits per time window.

NOT in scope for this ticket:
- Card-level spend controls (separate roadmap item HX-571)
- Real-time balance monitoring for spend control enforcement (async, best-effort)
- Retroactive limit enforcement on in-flight authorizations

ETA: 6 weeks for beta.

Comments:
  [Chris Park, Eng]: Important note — limits are soft limits with a configurable overage tolerance (default 5%). Hard zero-tolerance limits require a different enforcement architecture and are not planned for this phase.`,
  },

  // ── Linear: bugs / limitations ────────────────────────────────────────────
  {
    contentType: 'issue', sourceId: 'linear-HX-533', title: 'ACH debit: late return window causes negative balance',
    sourceUrl: 'https://linear.app/helix/issue/HX-533',
    timestamp: daysAgo(12),
    content: `[Linear HX-533] ACH debit: late return window causes negative balance — no automatic recovery
Team: Payments | Status: In Progress | Labels: bug, limitation

Problem: ACH debits have a 60-day return window per NACHA rules (R10 unauthorized return). When a return arrives on day 58, the merchant's balance goes negative. We currently do not have automatic recovery logic — we rely on the merchant having sufficient balance.

Current behavior: negative balance is allowed up to -$5,000 before account is flagged. Merchants are not notified in real time.

Proposed fix (in progress):
1. Webhook event payment.late_return_received fires immediately when return is received
2. Merchant has 48h to top up balance or dispute return
3. If not resolved, payout schedule is paused (not cancelled)

Not fixable: The 60-day NACHA return window is a network rule. We cannot prevent returns from arriving after settlement.

Comments:
  [Support Lead]: This has hit 3 enterprise accounts in the last 60 days. We need the webhook event ASAP.
  [Ryan Chen, PM]: Workaround for now: merchants can enable ACH authorization holds (POST /v1/payment_intents with payment_method_options.us_bank_account.verification_method=instant) to reduce return risk for consumer accounts. Does not eliminate risk from business accounts.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-HX-499', title: 'Subscription billing does not support prorated upgrades in legacy mode',
    sourceUrl: 'https://linear.app/helix/issue/HX-499',
    timestamp: daysAgo(30),
    content: `[Linear HX-499] Subscription billing: prorated upgrades broken in legacy billing mode
Team: Billing | Status: Won't Fix | Labels: bug, limitation

Description: When a subscription is in legacy billing mode (billing_cycle_anchor set at creation, no flexible billing), upgrading to a higher-priced plan mid-cycle generates an incorrect proration amount — it calculates from subscription start date instead of the current period start date.

Root cause: Legacy billing mode uses a different proration calculation path that has a date anchor bug.

Decision: Won't fix in legacy mode. The fix requires migrating to flexible billing mode. Merchants on legacy mode who need accurate proration upgrades must migrate.

Migration path documented in help center: migrate_billing_mode endpoint available (POST /v1/subscriptions/{id}/migrate_billing_mode). Non-reversible.

Comments:
  [Alex Kim, Eng]: This is a known limitation of the legacy billing architecture. We've been telling customers to migrate for 8 months. We're deprecating legacy mode in Q4.
  [Support]: Any merchant asking about proration issues on upgrades — first check their billing_mode. If legacy, send them to the migration guide.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-HX-521', title: 'Dispute evidence submission: PDF size limit too low',
    sourceUrl: 'https://linear.app/helix/issue/HX-521',
    timestamp: daysAgo(18),
    content: `[Linear HX-521] Dispute evidence: 4MB PDF size limit causing merchant frustration
Team: Disputes | Status: Backlog | Labels: limitation, enhancement

Current limit: 4MB per file, 16MB total per dispute. Enterprise merchants (especially those with shipping-heavy businesses) frequently have evidence packages exceeding this.

Impact: Merchants are forced to compress PDFs, losing legibility. Some disputes are being lost because evidence is unclear.

Proposed: Raise limit to 20MB per file, 50MB total. Requires infra changes to dispute evidence storage.

Not yet scheduled. Blocked on infra team bandwidth.

Comments:
  [CS Lead]: This is in our top 5 most-complained-about limitations. The workaround is to split evidence across multiple uploads which works but is painful.
  [Ryan Chen]: Workaround: use file_links instead of inline file uploads — external hosted files don't count against the size limit. Documented but not well-known.`,
  },

  // ── Linear: roadmap / not planned ─────────────────────────────────────────
  {
    contentType: 'issue', sourceId: 'linear-HX-412', title: 'Real-time ACH settlement (same-day ACH) — decision: not pursuing',
    sourceUrl: 'https://linear.app/helix/issue/HX-412',
    timestamp: daysAgo(90),
    content: `[Linear HX-412] Same-day ACH settlement — not pursuing
Team: Payments | Status: Cancelled | Labels: feature

Investigation: We evaluated adding Same Day ACH (SDA) support. NACHA charges $0.052 per SDA transaction vs $0.003 for standard ACH — a 17x cost increase that we would need to pass on to merchants.

Decision: Not pursuing same-day ACH. Our FI partners are not offering competitive SDA pricing. Revisit in H2 2027 when SDA rails mature.

Current timeline for standard ACH remains: T+1 for returns acknowledgement, T+2 for settlement on new accounts, T+1 on accounts with 6+ months of processing history.

Alternatives offered: Instant Payouts (card) as substitute for same-day settlement need.

Comments:
  [CFO]: The unit economics don't work. We'd need to charge at least 0.5% extra to cover SDA costs.
  [Maya Torres, PM]: Closing this. If a prospect specifically needs same-day ACH, this is a hard no until our FI partnership situation changes.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-HX-385', title: 'Crypto payment acceptance — not on roadmap',
    sourceUrl: 'https://linear.app/helix/issue/HX-385',
    timestamp: daysAgo(120),
    content: `[Linear HX-385] Crypto payment acceptance
Team: Payments | Status: Cancelled | Labels: feature

Multiple enterprise prospects have asked about accepting USDC, ETH, and BTC. We evaluated this in Q1.

Decision: Not on roadmap for 2026. Regulatory complexity (BSA/AML requirements for crypto acceptance) requires a Money Services Business license in most US states. We do not have MSB licensing and pursuing it would take 18–24 months.

If merchants need crypto acceptance: recommend third-party providers (Coinbase Commerce, BitPay). We do not have integration partnerships with these.

Comments:
  [Legal]: Do not commit to any crypto roadmap. Our current license does not cover this.`,
  },

  // ── Linear: Connect / platform features ───────────────────────────────────
  {
    contentType: 'issue', sourceId: 'linear-HX-463', title: 'Connect: custom payout schedules per connected account',
    sourceUrl: 'https://linear.app/helix/issue/HX-463',
    timestamp: daysAgo(35),
    content: `[Linear HX-463] Connect: per-connected-account custom payout schedules
Team: Connect | Status: Done | Labels: feature, shipped

Platforms can now set custom payout schedules per connected account. Previously the platform's default payout schedule applied to all connected accounts.

Supported intervals: daily, weekly (by day), monthly (by day-of-month, 1-28 only — day 29/30/31 not supported due to month length variation), manual (platform-initiated only).

Set via: POST /v1/accounts/{id}/payout_settings { schedule: { interval: 'weekly', weekly_anchor: 'friday' } }

Constraints:
- Manual payout mode: funds do not auto-sweep. Platform must call POST /v1/payouts to move funds. If not called, funds accumulate in connected account balance indefinitely.
- Monthly anchor: only supports day 1–28. Merchants wanting end-of-month payouts must use the manual interval with a webhook trigger.
- T+2 faster settlement must be enabled at the platform level — connected accounts inherit the platform's settlement timing. Per-account settlement timing not supported.

Comments:
  [Sam Rivera]: The monthly anchor limitation (no 29-31) is a hard constraint from our banking partner. Not fixable.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-HX-489', title: 'Connect: mandatory KYC for connected accounts above $10k/month',
    sourceUrl: 'https://linear.app/helix/issue/HX-489',
    timestamp: daysAgo(28),
    content: `[Linear HX-489] Connect: mandatory identity verification above $10k/month processing volume
Team: Risk & Compliance | Status: Done | Labels: compliance, shipped

Effective immediately for new connected accounts: accounts that process more than $10,000 in a rolling 30-day period must complete enhanced identity verification (EIN + SSN for US businesses, passport + proof of business for international).

Previously: identity verification was triggered at $25k/month.

Why: regulatory requirement update from our banking partner (Evolve Bank & Trust).

Developer impact:
- If verification is required, account enters restricted status. Payments continue to process but payouts are blocked.
- Webhook: account.verification_required fires when account crosses threshold.
- Deadline: 14 days from webhook to complete verification. After 14 days, payment processing is also blocked.

No workaround available. This is a compliance requirement.

Comments:
  [Compliance]: Do not advise customers to structure transactions to avoid the threshold. This is potential money laundering and would violate our terms.`,
  },

  // ── Slack: #product-eng channel ───────────────────────────────────────────
  {
    contentType: 'message', sourceId: 'slack-prod-eng-001', title: '#product-eng',
    timestamp: daysAgo(6),
    content: `[#product-eng] Thread: ACH return window and enterprise treasury use case

Maya Torres: Had a call with Northgate Financial today. They want to use Helix ACH debit for B2B invoicing but their treasury team is asking: "what happens if a payment is returned after we've already released the goods?" — basically the 60-day NACHA return window problem.

  ↳ Ryan Chen: Yeah this is the classic ACH B2B risk issue. The honest answer is: ACH is not safe for high-value B2B transactions where you're releasing goods before the return window closes. The 60-day return window is a NACHA rule we can't change.
  ↳ Sarah Okafor: Workaround is to use ACH with instant bank verification (Plaid link or micro-deposit) to reduce risk on consumer-side, but for B2B enterprise accounts, instant verification isn't available — you can do micro-deposits but that adds 2-3 business days.
  ↳ Maya Torres: So what should we tell them? Wire transfer?
  ↳ Ryan Chen: For >$50k B2B transactions where delivery-before-settlement is the model — yes, recommend push ACH (where the payer initiates) over pull ACH, or use wire/RTP if same-day settlement is truly needed. We don't have RTP yet either (HX-412 is closed).
  ↳ Alex Kim: Actually the safest pattern for this use case is: charge on net-30 invoice terms, they get 30 days to pay, ACH debit runs at day 28, goods are already delivered. Return window risk is low because the transaction is 30 days after delivery, not simultaneous.`,
  },

  {
    contentType: 'message', sourceId: 'slack-prod-eng-002', title: '#product-eng',
    timestamp: daysAgo(11),
    content: `[#product-eng] Thread: subscription pause vs cancel semantics — customer confusion

Chris Park: Getting a lot of support tickets from merchants confused about the difference between subscription pause and cancel, specifically: "if I pause a subscription, will the customer be charged when it resumes?"

  ↳ Alex Kim: Pause: billing halts for the pause duration. When resumed, the billing cycle restarts from the resume date. The customer is NOT charged for the paused period — it's not prorated backwards.
  ↳ Chris Park: And what about if the merchant sets trial_end during the pause?
  ↳ Alex Kim: If a subscription is paused and trial_end is set, the trial_end date passes without any action — trial doesn't auto-convert during pause. Merchant must resume first, then conversion happens.
  ↳ Sarah Okafor: Also worth noting: pause is not available in all billing modes. Legacy billing mode doesn't support pause — merchants must cancel and re-create. Another reason to push migration to flexible billing.
  ↳ Maya Torres: I'll add this to the onboarding docs. The pause vs cancel distinction is genuinely confusing and we should have a comparison table in the help center.
  ↳ Ryan Chen: For FDE context: if a prospect says "we want to let users pause instead of cancel to reduce churn" — this is fully supported in flexible billing mode. Just be explicit about the restart billing behavior.`,
  },

  {
    contentType: 'message', sourceId: 'slack-prod-eng-003', title: '#product-eng',
    timestamp: daysAgo(19),
    content: `[#product-eng] Thread: Idempotency key best practices — clarification for docs

Sam Rivera: We keep getting questions about idempotency keys from devs. Common misunderstanding: they think idempotency keys are globally unique per merchant, but they're actually unique per endpoint.

  ↳ Sam Rivera: Meaning: the same key value can be used on POST /v1/payment_intents AND POST /v1/charges without conflict — they're scoped to the endpoint.
  ↳ Alex Kim: Also important: idempotency keys are case-sensitive and expire after 24 hours. After expiry, the same key can be reused and will create a new resource.
  ↳ Sarah Okafor: And the most dangerous misconception: they think idempotency prevents duplicates indefinitely. If you use the same key 25 hours later, you get a new charge.
  ↳ Chris Park: What's the recommended key format?
  ↳ Alex Kim: UUID v4 per-request. Some merchants use {customerId}-{orderId}-{timestamp} which works but timestamp gives you the false impression of indefinite uniqueness. Stick with UUID per-attempt.
  ↳ Sam Rivera: Adding to docs: idempotency keys scope to endpoint, expire in 24h, are case-sensitive.`,
  },

  {
    contentType: 'message', sourceId: 'slack-releases-001', title: '#releases',
    timestamp: daysAgo(8),
    content: `[#releases] Helix API v2.14.0 — Instant Payouts GA

Shipping today: Instant Payouts GA (see HX-481 for full spec).

What changed:
- POST /v1/payouts with method: instant now available to eligible accounts
- New eligibility pre-flight: POST /v1/payouts/instant/eligibility
- Dashboard: "Send Instant Payout" button now visible to eligible accounts
- New webhook events: payout.instant.initiated, payout.instant.paid, payout.instant.failed

What did NOT change:
- Standard payout schedule is unaffected
- ACH payouts cannot be instant (ACH is always T+1 or T+2)
- Eligibility is evaluated at payout time, not at account creation

Known issue: eligibility endpoint may return a 503 under very high load. Retry with exponential backoff. Fix shipping in v2.14.1 next week.

  ↳ Ryan Chen: Reminder to CS: eligibility is evaluated fresh each time. An account that was eligible yesterday may not be eligible today if they've had a dispute opened. Don't promise merchants permanent eligibility.`,
  },

  {
    contentType: 'message', sourceId: 'slack-eng-arch-001', title: '#eng-architecture',
    timestamp: daysAgo(25),
    content: `[#eng-architecture] Thread: Connect payout flow — platform vs connected account as settlement merchant

Alex Kim: Getting a common architecture question from large platform customers: should the platform be the settlement merchant or should each connected account be the settlement merchant? This is a Helix Connect design choice with major compliance implications.

  ↳ Sarah Okafor: Short answer:
    - Platform as merchant: platform collects all funds, then pays out to connected accounts. Platform holds the MSB liability. Simpler integration, more compliance burden on platform.
    - Connected account as merchant: each connected account has its own Helix account, collects funds directly, and owns their own compliance. More complex integration (platform must onboard each account), less compliance risk for the platform.
  ↳ Chris Park: Which is right for a marketplace?
  ↳ Sarah Okafor: For a true marketplace where the platform is not the seller — connected account as merchant is the right model. Platform as merchant creates regulatory risk because you're technically in the money flow.
  ↳ Alex Kim: The practical trigger: if the platform ever holds funds on behalf of a connected account for more than 2 business days, you're likely in money transmission territory and need proper licensing. Connected-account model avoids this.
  ↳ Ryan Chen: FDE rule of thumb: if the customer says "we take a cut before paying out the seller" — that's a marketplace, use connected-account model. If they say "we process payments and the money is ours, we pay vendors later" — that might be platform-as-merchant but check with legal.`,
  },

  {
    contentType: 'message', sourceId: 'slack-cs-feedback-001', title: '#customer-success',
    timestamp: daysAgo(16),
    content: `[#customer-success] Enterprise customer feedback synthesis — Q2 2026

From CS team notes on Q2 enterprise calls (summarizing top recurring themes):

1. PAYOUT TIMING: #1 most asked question. "When exactly do my funds arrive?" — merchants don't understand T+1/T+2 and how it differs from instant. Need clearer dashboard labeling.

2. DISPUTE WIN RATE: Multiple enterprise customers frustrated that dispute win rate is low for digital goods merchants. Root cause: card networks favor cardholders for digital goods disputes. Our evidence templates help but can't overcome network bias. This is a network constraint, not a Helix limitation.

3. ACH LIMITS: Several customers asking to increase ACH debit per-transaction limit beyond $25,000. Current limit exists due to Evolve Bank & Trust agreement. Increase requires banking partner approval — timeline unknown.

4. WEBHOOKS IN ORDER: Customers building event-sourced systems are frustrated that webhooks can arrive out-of-order. Workaround is to fetch the object state from API on each webhook receipt and not trust event ordering. We should make this pattern more prominent in docs.

5. MISSING: Revenue analytics drill-down. Merchants want per-product/SKU revenue reporting. Current analytics are at the charge level only. This is HX-547 (backlog, not yet scheduled).

  ↳ Maya Torres: Adding items 1, 4, and 5 to the Q3 product improvements list.`,
  },

  // ── GitHub releases ────────────────────────────────────────────────────────
  {
    contentType: 'release', sourceId: 'github-release-helix-api-2.14.0', title: 'Helix API v2.14.0',
    sourceUrl: 'https://github.com/helix-payments/api/releases/tag/v2.14.0',
    timestamp: daysAgo(8),
    content: `Release: Helix API v2.14.0

## Instant Payouts — General Availability

Instant Payouts are now GA for eligible US merchants. Funds arrive within 30 minutes on supported Visa/Mastercard debit cards.

### New endpoints
- POST /v1/payouts (method: "instant") — initiate instant payout
- POST /v1/payouts/instant/eligibility — pre-flight check before initiating

### New webhook events
- payout.instant.initiated
- payout.instant.paid
- payout.instant.failed

### Eligibility requirements
- Identity verification completed
- No open disputes in last 90 days
- Minimum $1,000/month processing for 90 days
- Visa or Mastercard debit card linked to account

### Limitations
- Not available for ACH bank payouts
- Not available for American Express or Discover cards
- Single payout cap: $10,000
- US only

## Revenue Recovery improvements
- smart_retry now defaults to true for all new subscriptions
- Added retry_exhausted webhook event when all retries fail
- Fixed: retry schedule was not honoring custom interval settings when billing_settings.retry_schedule was set (bug introduced in v2.12.0)

## Bug fixes
- Fixed incorrect proration calculation when upgrading from trial to paid in flexible billing mode
- Fixed webhook delivery_attempt count not incrementing correctly after endpoint auto-disable
- Fixed: account balance object showing stale data after payout in rare timing conditions`,
  },

  {
    contentType: 'release', sourceId: 'github-release-helix-api-2.13.0', title: 'Helix API v2.13.0',
    sourceUrl: 'https://github.com/helix-payments/api/releases/tag/v2.13.0',
    timestamp: daysAgo(35),
    content: `Release: Helix API v2.13.0

## Connect: Custom payout schedules per connected account

Platforms can now configure payout schedules independently per connected account.

### New API
- POST /v1/accounts/{id}/payout_settings
- GET /v1/accounts/{id}/payout_settings

### Supported intervals
- daily
- weekly (weekly_anchor: monday|tuesday|wednesday|thursday|friday)
- monthly (monthly_anchor: 1–28 only)
- manual

### Known constraints
- Monthly anchor is limited to day 1–28. Days 29-31 are not supported.
- T+2 faster settlement is inherited from platform settings. Per-account settlement timing is not supported.
- Manual mode requires explicit payout initiation. Funds are not auto-swept.

## Webhook delivery improvements (HX-388)
- New exponential backoff: 5s → 30s → 2m → 10m → 30m → 2h → 8h → 24h
- Endpoint health auto-disable after 72h of >50% failure rate
- Event replay: POST /v1/webhook_endpoints/{id}/replay
- Delivery logs retained 30 days

## Breaking changes
- Removed deprecated: POST /v1/payouts/schedule (use payout_settings endpoint)
- Idempotency key expiry reduced from 48h to 24h (alignment with card network standards)`,
  },

  // ── Internal docs / PRDs ──────────────────────────────────────────────────
  {
    contentType: 'doc', sourceId: 'notion-prd-billing-modes', title: 'Billing Modes — Architecture Decision Record',
    timestamp: daysAgo(60),
    content: `Billing Modes — Architecture Decision Record
Helix Billing Team | Last updated: 60 days ago

# Overview
Helix supports two billing modes for subscriptions. Understanding which mode a merchant is on is critical for support and feature compatibility.

## Legacy Billing Mode
The original billing architecture. All subscriptions created before June 2025 default to this mode.

Characteristics:
- Billing cycle anchor is fixed at subscription creation date
- Proration on plan changes uses subscription start date as anchor (known bug — see HX-499)
- Does not support subscription pause
- Does not support flexible trial configuration (Trial Offer API)
- Prorations are always immediate (cannot defer)

## Flexible Billing Mode
New architecture. All new subscriptions created after June 2025 default to flexible mode.

Characteristics:
- Billing cycle anchor can be reconfigured after creation
- Supports subscription pause (billing halts, restarts from resume date)
- Supports Trial Offer API (30-day, 60-day, or custom trial with configurable end behaviors)
- Accurate proration on plan upgrades/downgrades
- Supports deferred proration (apply at next billing cycle instead of immediately)
- Supports flexible billing date (charge on any day regardless of subscription start)

## Migration
One-way migration from legacy to flexible: POST /v1/subscriptions/{id}/migrate_billing_mode
Cannot be reversed. Migration does not interrupt existing billing cycles.

## Compatibility matrix
| Feature | Legacy | Flexible |
|---|---|---|
| Subscription pause | ✗ | ✓ |
| Trial Offer API | ✗ | ✓ |
| Accurate proration on upgrades | ✗ (bug) | ✓ |
| Deferred proration | ✗ | ✓ |
| Custom billing anchor | ✗ | ✓ |

FDE guidance: any deal involving pause, trials, or complex proration requirements should confirm the merchant is on flexible billing mode or plan migration before build starts.`,
  },

  {
    contentType: 'doc', sourceId: 'notion-prd-connect-architecture', title: 'Connect Platform Architecture Guide',
    timestamp: daysAgo(45),
    content: `Connect Platform Architecture Guide
Helix Connect Team | For internal and FDE use

# Settlement Models

## Model A: Platform as Merchant
Platform has the single Helix account. All payments flow to the platform. Platform distributes to sellers/vendors via payouts.

When to use:
- Platform sells directly to end customers (not a marketplace)
- Platform takes 100% of payment and later pays vendors

Risk:
- Platform is in the money flow — may require money transmitter license in some states
- Platform bears all dispute and fraud risk

## Model B: Connected Account as Merchant (Recommended for Marketplaces)
Each seller/vendor has their own Helix connected account. Payments go directly to connected account. Platform takes application_fee_amount at charge time.

When to use:
- True marketplace (platform connects buyer and seller)
- Sellers are independently operating businesses
- Platform wants to minimize regulatory liability

Constraint: Each connected account must complete KYC. Accounts processing >$10k/month must complete enhanced verification (HX-489).

## Payout control
Platform can control connected account payouts:
- Set custom schedule (HX-463)
- Trigger manual payouts
- Pause payouts (POST /v1/accounts/{id}/payout_settings { schedule: { interval: 'manual' } })
- Cannot disable payouts permanently without closing the account

# On-Demand Payouts vs Scheduled Payouts

On-demand: Platform calls POST /v1/payouts manually. Connected account must be in manual payout mode.
Scheduled: Automatic. Platform sets schedule once, Helix handles execution.

Platform cannot mix: an account in scheduled mode cannot receive on-demand payouts. Must switch to manual mode first.`,
  },

  {
    contentType: 'doc', sourceId: 'notion-prd-dispute-playbook', title: 'Dispute Handling Playbook',
    timestamp: daysAgo(30),
    content: `Dispute Handling Playbook — Helix FDE Reference
Risk & Compliance Team

# Dispute Basics
- Card network dispute window: 120 days from transaction date (Visa/Mastercard). 180 days for fraud disputes.
- Our response window: 7 days from dispute creation to submit evidence.
- Auto-close: Disputes not responded to within 7 days are auto-closed in favor of the cardholder.

# What We Can Do
- Submit evidence via API or dashboard
- Provide evidence templates for common dispute reasons (unauthorized, product not received, credit not processed)
- Manual replay of webhook events to trigger evidence submission flows

# What We Cannot Do
- Extend the 7-day evidence submission window — this is set by the card network
- Guarantee dispute outcomes — card networks are independent arbiters
- Submit evidence after the 7-day window, even with good reason
- Override a dispute that has been adjudicated by the network

# Constraints by dispute type
- Digital goods disputes: win rate is typically 15-25%. Card networks systematically favor cardholders for digital goods. Not a Helix limitation.
- Physical goods: higher win rate (~45%) with shipping/delivery proof.
- Friendly fraud (unauthorized but cardholder-initiated): 3DS authentication reduces liability — if 3DS passed, liability shifts to card network.

# Evidence size limits
- 4MB per file, 16MB total
- Workaround: use file_link with externally hosted files (no size limit via file_link approach)
- Limit increase (HX-521) is on backlog, not yet scheduled

# 3DS and liability shift
- 3DS v2 is supported and recommended for high-value transactions
- When 3DS authentication succeeds (eci: 05 or 02), liability for fraud disputes shifts from merchant to card network
- 3DS does not shift liability for "product not received" or "credit not processed" disputes`,
  },

  {
    contentType: 'doc', sourceId: 'notion-glossary-settlement', title: 'Settlement Timing Reference',
    timestamp: daysAgo(20),
    content: `Settlement Timing Reference — Helix Internal

This is the authoritative reference for settlement timing. FDEs and CS should link to this when customers ask about "when do I get my money."

# Card payments

Standard settlement: T+2 (2 business days after the transaction date)
Faster settlement (eligible accounts): T+1

Faster settlement eligibility:
- US accounts only
- Must be enabled by Helix risk team (not self-service)
- Eligibility based on: 90-day processing history, dispute rate <0.5%, chargeback rate <0.1%
- Not guaranteed — eligibility can be revoked if risk metrics deteriorate

# ACH payments

Standard ACH debit: T+4 (4 business days)
For accounts with 6+ months history: T+2
Instant ACH: NOT AVAILABLE (see HX-412 — not on roadmap)

ACH return window: 60 days from transaction date (NACHA rule)

# Wire transfers

Domestic wire: same-day if initiated before 5pm ET
International wire: T+1 to T+3 depending on destination country. Not guaranteed.

# Important: "settlement" vs "payout"
These are different:
- Settlement: when funds are credited to your Helix balance (from the card network or bank)
- Payout: when funds leave your Helix balance and arrive in your bank account

Customers often say "I need same-day settlement" when they actually mean "I need same-day payout."
- Same-day payout: Instant Payouts (debit card, 30 min, 1.5% fee) — available
- Same-day settlement of ACH: not available
- Same-day settlement of card: not available (T+1 minimum even for faster settlement)`,
  },
]

export const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  'b2b-payments': {
    label: 'Helix Payments (B2B payments API platform)',
    companyName: 'Helix',
    chunks: HELIX_CHUNKS,
  },
}

export function getDemoScenario(key: string): DemoScenario | null {
  return DEMO_SCENARIOS[key] ?? null
}

export function listDemoScenarios(): Array<{ key: string; label: string; chunkCount: number }> {
  return Object.entries(DEMO_SCENARIOS).map(([key, s]) => ({
    key,
    label: s.label,
    chunkCount: s.chunks.length,
  }))
}
