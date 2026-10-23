# AI Usage Notes

**Tools:** Claude Code / Cursor for scaffolding, Prisma schema, test skeletons, and docs.

**Prompt that worked:** "Generate a Postgres transaction that atomically reserves N units across multiple products, fails if any line is short, and locks products in deterministic order to avoid deadlocks." — produced the `SELECT … FOR UPDATE … ORDER BY id` pattern and flagged the deadlock concern.

**Two things the AI got wrong:**
1. **Raw-body HMAC.** Suggested verifying `X-Signature` against `JSON.stringify(parsedBody)`. Re-serialised JSON can differ in key order and whitespace from the original bytes, so a correctly signed request fails. Caught when `send-webhook` (which signs raw bytes) was rejected with 401. Fixed by mounting `express.raw({ type: 'application/json' })` on `/api/payments/webhook` **before** `express.json()` and hashing the raw `Buffer`.
2. **Prisma 7 removed `datasourceUrl`.** Generated code used `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })` — that API was removed in v7. Caught when the seed crashed with `PrismaClientConstructorValidationError: Unknown property datasourceUrl`. Fixed by using `@prisma/adapter-pg` (`new PrismaPg({ connectionString })`).