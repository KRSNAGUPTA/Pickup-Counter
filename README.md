# Pickup Counter

Self-service snack counter: pick items, pay via a mock UPI modal (which triggers the real payment webhook), collect from a locker. Each order holds stock for 120 seconds.

Stack: TypeScript · Express 5 · Prisma 7 (`@prisma/adapter-pg`) · PostgreSQL 16 · React 19 (Vite) · Zustand · Zod · Vitest.

## Run

```bash
docker compose up --build
```

- UI: http://localhost:5173
- API: http://localhost:3000
- One command. Docker starts Postgres, runs migrations + seed, starts the API and the Vite dev server. Nothing else to install.

To reset the DB: `docker compose down -v && docker compose up --build`.

## Test

```bash
docker compose up -d db
cd backend && npm test
```

Runs against real Postgres. Proves the three graded behaviours:

1. **10 concurrent buyers vs. last 2 units** → exactly 2 held, 8 × 409 `INSUFFICIENT_STOCK`.
2. **Same webhook event sent twice** → processed once (`duplicate: true`, one `ProcessedWebhook` row).
3. **Two simultaneous pickup claims** → one `200`, one `409`, stock decremented exactly once.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness |
| `GET` | `/api/products` | Products with `availableUnits` (stock − active holds) |
| `POST` | `/api/orders` | Create order; hold stock 120 s |
| `GET` | `/api/orders/:id` | Status + `expiresInSeconds` |
| `POST` | `/api/orders/:id/pickup-claim` | Locker claims a paid order |
| `POST` | `/api/payments/webhook` | HMAC-signed payment webhook |
| `POST` | `/api/payments/simulate` | Dev-only trigger for the mock Pay button |

Full OpenAPI 3.1 spec: [`openapi.yaml`](./openapi.yaml). Money is integer paise everywhere.

Webhook CLI:

```bash
cd backend
npm run send-webhook -- <orderId> <amountPaise> [eventId]
```

## Decisions

**Stock = holds, not decrements.** `Product.stockUnits` is physical stock; it decrements only on pickup. `StockHold` rows are 120 s reservations. `available = stockUnits − SUM(active holds)`. Expiry needs no background job — expired holds simply stop counting.

**Two raw `SELECT … FOR UPDATE` queries.** Order creation and the late-payment branch of the webhook need a row lock before checking availability. Prisma has no API for `FOR UPDATE`; `SERIALIZABLE` would trade determinism for retries on the exact race being graded. Products are locked in id-sorted order to avoid deadlocks. Pickup uses `updateMany({ where: { id, status: 'paid' } })` — the conditional write is its own lock.

**Webhook idempotency.** `ProcessedWebhook.eventId` is the PK; insert-first, duplicate throws `P2002` and returns `{duplicate: true}` with no side effects. All handled cases return 200 (paid, duplicate, mismatch, no-order, already-paid) so the provider stops retrying. Only bad signature → 401.

**Amount mismatch → `needs_review`, hold kept.** Ops reconciles; releasing the hold would let someone else buy during the investigation.

**Late payment.** Valid capture after the hold expired: re-acquire stock under lock, excluding this order's own hold. If units are still available → `paid`; if not → `needs_review` (`OUT_OF_STOCK_LATE_PAYMENT`), ops refunds. Preserves "never oversell, never go negative" while honouring payment when possible. Reject+auto-refund would need a real payment provider; accept+oversell violates the invariant.

**Pickup.** Single transaction: conditional `UPDATE … WHERE status='paid'`, then decrement stock, delete holds. Two concurrent callers → exactly one succeeds.

**Clock skew.** Server returns relative `expiresInSeconds`; client anchors to `performance.now()` (monotonic). Polling status is authoritative — status wins over the countdown. On the pay screen, `Date.now = () => Date.now() + 3600000` in DevTools must not affect the timer.

**Customer payment UX.** Catalog → order summary → Mock UPI modal (Pay / Reject). Pay calls `/api/payments/simulate`, which signs a body with `WEBHOOK_SECRET` and delivers it to `/api/payments/webhook`. The webhook is the only thing that marks an order paid; `/simulate` is a dev-only trigger. Reject doesn't touch the backend — the order expires.

## Assumptions

- **Deployment:** shop's own counter screen on a trusted LAN. Not a public web app.
- **Auth:** none specified by the brief. Webhook HMAC is the only security boundary — it's the only endpoint that changes money-relevant state from outside the shop. Lockers are trusted internal callers.
- **Money:** integer paise. Never floats.
- **Webhook status:** only `captured`. Other event types would need a schema extension.

## What I'd do next

- Real payment provider + auto-refund on `needs_review`.
- mTLS / signed requests between counter and backend if the network crosses a trust boundary.
- Rate limiting on webhook and pickup; per-locker identity and audit trail.
- Playwright e2e for the clock-skew countdown; k6 load test on `/api/orders`.
- Automated test for the `OUT_OF_STOCK_LATE_PAYMENT` branch (currently manually exercised).

## AI usage

See [`AI_NOTES.md`](./AI_NOTES.md).
