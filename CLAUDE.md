@AGENTS.md

## Monorepo Structure

This is a **pnpm + Turborepo** monorepo with the following workspaces:

- `apps/web` — Next.js 16 frontend (`@vendorstream/web`)
- `apps/worker` — Node.js pg-boss background worker (`@vendorstream/worker`)
- `packages/database` — Prisma client + schema, shared across apps (`@vendorstream/database`)
- `packages/contracts` — Zod schemas and job-name constants shared between web and worker (`@vendorstream/contracts`)

## Development Commands

Run from the repo root unless otherwise noted.

```bash
# Start all apps in parallel
pnpm dev

# Start only the web app
pnpm dev:web

# Start only the worker
pnpm dev:worker

# Build everything
pnpm build

# Lint everything
pnpm lint
```

**Database (run from `packages/database`):**

```bash
pnpm --filter @vendorstream/database db:push      # Push schema changes
pnpm --filter @vendorstream/database db:generate  # Regenerate Prisma client
pnpm --filter @vendorstream/database db:studio    # Open Prisma Studio
pnpm --filter @vendorstream/database db:seed      # Seed the database
```

## Environment Variables

A single `.env` file at the repo root is used by all apps. Required variables:

- `DATABASE_URL` — PostgreSQL connection string (pooled, used by Prisma + pg-boss)
- `DIRECT_URL` — Direct PostgreSQL URL (required by Prisma CLI for migrations)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (used by the worker's storage adapter)
- `PG_BOSS_DATABASE_URL` — Optional override for pg-boss queue DB (defaults to `DATABASE_URL`)
- `PG_BOSS_SCHEMA` — Optional pg-boss schema name (defaults to `pgboss`)

## Architecture Overview

### Web App (`apps/web`)

- **Framework:** Next.js 16 App Router with React 19
- **Auth:** NextAuth v4 with credentials + email-verification flow; session enriched with `systemRole` and `isEmailVerified`
- **Route groups:**
  - `(auth)` — login/signup/verify pages, no sidebar
  - `(home)` — landing/root redirects
  - `(withSidebar)` — all authenticated app pages; the layout calls `getAccessSnapshot()` to gate access and provide `DashboardShell`
- **Authorization:** `apps/web/src/lib/authz.ts` exposes `requireAuthenticatedUser()`, `getAccessSnapshot()`, and role-check helpers. All server components/routes should use these — never read session directly.
- **Three-role system:** `ADMIN`, `FINANCE_VIEWER`, `USER`. Users also belong to LPs (via `LpMembership`) or StoreOrganizations (via `StoreOrgMembership`).
- **UI:** shadcn/ui + Radix, Tailwind CSS v4, `sonner` for toasts
- **File uploads:** Supabase Storage via a direct-upload client (`lib/direct-upload-client.ts`) that pre-signs URLs server-side then uploads from the browser
- **Job dispatch:** `lib/queue/producer.ts` enqueues pg-boss jobs that the worker consumes

### Worker (`apps/worker`)

- **Runtime:** Node.js ESM, no framework
- **Queue:** pg-boss (backed by the same PostgreSQL database). Three job types, processed serially one at a time:
  1. `PROCESS_IMPORT_BATCH` → validates, normalizes, and stages uploaded CSV rows
  2. `RECONCILE_CYCLE` → matches LP and store rows, applies category/product scale rules, marks mismatches
  3. `GENERATE_STATEMENT` → aggregates reconciliation results into a `Statement` with line items
- **Pattern:** each job handler calls a service function with injected repository and storage adapter dependencies

### Shared Packages

- **`@vendorstream/contracts`:** Zod schemas for job payloads; `JOBS` constant with all queue names; domain types (mismatch, products, statuses). Import from here when both web and worker need the same shape.
- **`@vendorstream/database`:** Re-exports `prisma` singleton (using `PrismaPg` adapter over a `pg.Pool`), `PrismaClient`, `Prisma`, and `$Enums`. Import the shared client — don't instantiate a new `PrismaClient` in app code.

### Domain Model

The core business flow: LP (licenced producer) and StoreOrganization both upload monthly CSV files → an `ImportBatch` is created per upload → the worker processes batches into `NormalizedLpRow` / `NormalizedStoreRow` → a `ReconciliationCycle` (keyed on LP × StoreLocation × month) is reconciled → `ReconciliationResult` rows are created with a `ReconciliationStatus` → mismatches surface as `Mismatch` records → once resolved, a `Statement` is generated.

Key models: `LP`, `StoreOrganization`, `StoreLocation`, `StoreLocationLpAssignment`, `ReconciliationCycle`, `ImportBatch`, `CategoryRule`, `ProductScaleRule`, `Mismatch`, `Statement`.

## Applied Learning

When something fails repeatedly, when Sumedh has to re-explain, or when a workaround is found for a platform/tool limitation, add a one-line bullet here. Keep each bullet under 15 words. No explanations. Only add things that will save time in future sessions.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
