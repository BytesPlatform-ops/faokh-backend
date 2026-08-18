# Foakh Broker CRM — deployment checklist

Everything in this file is work done **outside the repository**. The code needs
no changes to deploy; it needs the values below.

Two independently deployable applications:

| | Stack | Needs |
|---|---|---|
| `frontend/` | Next.js 16, React 19 | Node 22+, the API's public URL |
| `backend/` | NestJS 11, Prisma 6 | Node 22+, Supabase Cloud project |

No Docker. No local PostgreSQL.

---

## 1. Create the production Supabase project

Create `foakh-crm-prod` as a **separate project** from `foakh-crm-dev`. Not a
separate schema, and not a branch — a separate project, so a mistaken
`migrate reset` or a demo seed can never touch live client data.

Record from **Project Settings**:

- Project URL — `https://<ref>.supabase.co`
- Publishable (anon) key — public by design, protected by RLS
- Secret (service-role) key — **server-only**, bypasses RLS entirely
- Database password — set it when creating the project; it is not recoverable

Then, in **Database → Connection string**, copy both:

- **Transaction pooler, port 6543** → `DATABASE_URL`
- **Session pooler or direct, port 5432** → `DIRECT_URL`

> The pooler hostname varies by project age (`aws-0-…` vs `aws-1-…`). Copy the
> strings verbatim rather than editing the dev ones.

Append to `DATABASE_URL`:

```
?pgbouncer=true&connection_limit=10&pool_timeout=20
```

**`connection_limit=1` is wrong here.** That is the serverless recipe, where
each invocation is its own process. In a long-running server it serialises every
request through one connection, and simultaneous bookings then time out *starting*
a transaction instead of being resolved by the row lock — the losing broker gets
a 500 rather than a clean 409.

---

## 2. Backend environment

Set these on your host (Railway, Render, Fly, ECS — anything that runs Node and
injects `PORT`):

```env
NODE_ENV=production
PORT=                                  # injected by the platform; the app binds 0.0.0.0

DATABASE_URL=                          # pooler :6543, with the params above
DIRECT_URL=                            # direct/session :5432, migrations only

SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SECRET_KEY=                   # service-role key — server only
SUPABASE_STORAGE_BUCKET=foakh-documents

CORS_ALLOWED_ORIGINS=https://<your-frontend-domain>
API_PUBLIC_URL=https://<your-api-domain>
WEB_PUBLIC_URL=https://<your-frontend-domain>

SESSION_SECRET=                        # openssl rand -base64 48
ENCRYPTION_KEY=                        # openssl rand -base64 32
DEFAULT_TIMEZONE=Asia/Karachi
DEFAULT_CURRENCY=PKR
QUEUES_ENABLED=false
```

`SUPABASE_JWT_SECRET` is **not needed**. The project publishes an ES256 public
key at `/auth/v1/.well-known/jwks.json`, and tokens are verified against it —
there is no shared secret. Leave it unset.

Never place any of these in a `NEXT_PUBLIC_*` variable.

**Build and start:**

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:deploy          # prisma migrate deploy — uses DIRECT_URL
pnpm build
pnpm start:prod         # node dist/main.js
```

Health check path for the platform: `/api/v1/health/live`.

---

## 3. Frontend environment

```env
NEXT_PUBLIC_API_URL=https://<your-api-domain>
NEXT_PUBLIC_DATA_MODE=api
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # anon key
```

These are inlined into the browser bundle at **build** time, so they must be
present in the build environment, not only at runtime.

`NEXT_PUBLIC_DATA_MODE` must be `api`. A production build with anything else
fails at build time rather than shipping — mock mode serves fabricated inventory
and would let a broker "book" a unit that does not exist, which looks like a
working application and is worse than a build that refuses to start.

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
pnpm build
pnpm start
```

---

## 4. Supabase Auth

**Authentication → Providers:** enable Email. Disable public sign-up — accounts
are provisioned by an administrator, and self-service registration would let
anyone create a Supabase identity (they would still be rejected at the API,
which requires a matching CRM user, but there is no reason to allow it).

**Authentication → URL Configuration:** set the Site URL to the frontend domain.

Create each staff account in **Authentication → Users → Add user**, with *Auto
Confirm User* enabled, then link it to the CRM user:

```sql
update users
   set supabase_user_id = '<uuid from Authentication → Users>'
 where email = 'name@yourdomain';
```

The link is what the API resolves on every request: Supabase `sub` → CRM user →
role and broker scope. A Supabase account with no matching CRM user is refused,
deliberately. Roles and Broker IDs live in the CRM database and are never read
from the token or from a request body.

`prisma/provision-auth.ts` automates this, but it is a **development** tool and
creates `@foakh.local` accounts. Do not point it at production.

---

## 5. Storage

Nothing to do by hand. The API creates the private `foakh-documents` bucket at
boot and **refuses to start** if a bucket by that name already exists and is
public — it holds CNIC scans and invoices, and "the URL is hard to guess" is not
access control.

If you create it yourself, create it **private**. Documents are read through
short-lived signed URLs (10 minutes), never public ones.

---

## 6. Do not run against production

```bash
pnpm db:seed:dev            # demo brokers, clients, inventory
pnpm db:provision-auth:dev  # @foakh.local auth accounts
pnpm db:reset               # drops everything
```

They are named `:dev` for this reason. Production needs only `db:deploy`, which
applies migrations and inserts no demo data.

Production **does** need the product master data — buildings, floors, unit types,
classes, the price matrix. Extract that portion of `prisma/seed.ts` into a
one-off initialisation, or insert it through the Supabase SQL editor, once.

---

## 7. Before going live

- [ ] `CORS_ALLOWED_ORIGINS` lists the real frontend origin and nothing else
- [ ] Service-role key is set **only** on the backend host
- [ ] `NEXT_PUBLIC_DATA_MODE=api` in the frontend build environment
- [ ] `GET /api/v1/health` returns `database: up` and `supabase: up`
- [ ] Signing in as a broker shows only their own clients and bookings
- [ ] `foakh-documents` bucket exists and is **private**
- [ ] Demo seed has **not** been run

---

## 8. Two things Foakh must confirm before selling

Both are blocked in software rather than guessed, and both need a decision from
Foakh, not from a developer:

1. **Type D Elegant and Sonder pricing.** Foakh supplied PKR 88,160,000 and
   PKR 92,800,000, which price a 464 sq ft one-bedroom at PKR 190,000 and
   PKR 200,000 per square foot — an order of magnitude above every other unit.
   Divided by ten they become exactly PKR 19,000 and PKR 20,000 per square foot,
   and 20,000/sq ft is precisely the Sonder rate for Types B, C and the
   penthouse. The corrected reading is almost certainly right, but it is stored
   as provisional and **the booking API refuses to price a sale from it**.

2. **Expected handover date.** None has been published. Every schedule prints
   the completion instalment as *"To be confirmed"* rather than carrying an
   invented date onto a document a client signs. Set it in the `projects` table
   when Foakh confirms.

Also unconfirmed: the duplex penthouse bathroom count (omitted rather than
printed as zero), the per-building unit mix (currently a demo allocation, marked
as such on every unit), and the price of separately-purchased parking for Types
C and D (never quoted).
