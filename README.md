# Foakh Booking & Sales CRM

A consultation booking journey and an internal sales CRM for **Foakh Wind Corridor
Enclave** — a 12-storey residential development in DHA City, Karachi, comprising the
Umer and Abdullah blocks, 160 apartments and 8 duplex penthouses.

```
faokh-backend/
├── backend/     NestJS 11 · PostgreSQL 17 · Prisma · Redis      → :4000
├── frontend/    Next.js 16 · React 19 · Tailwind 4              → :3000
└── docs/        architecture, ERD, deployment, security
```

The existing Foakh marketing site is a **separate application and is not touched by
this project**. It stays the brand's front door; this is the concierge wing behind it.

---

## What this is, and what it deliberately is not

**It is** a focused booking funnel and a sales tool shaped around how Foakh actually
sells: four residence categories, three ways to meet the team, one fixed pipeline.

**It is not** a generic CRM. There is no workflow builder, no custom object designer,
no mass-email campaign tool and no agency multi-tenancy. Those are large products in
their own right, and a sales team of this size is far better served by a handful of
behaviours that simply work.

Three product rules are enforced in code, not just in copy:

| Rule | Where it is enforced |
|---|---|
| Mock inventory is never shown as availability | Every seeded unit is `MOCK`/unpublished; the public catalogue has no availability field at all |
| Remaining slot capacity is never exposed | `AvailabilityService` omits it; an integration test asserts the response contains no `capacity`, `bookedCount` or `remaining` |
| No invented scarcity | The only quantity published is `publishedCollectionSize` (8 duplex penthouses) — a fact about the building, never a countdown. An E2E test greps the rendered page for "only N left", "selling fast" and friends |

---

## Running it locally

**Prerequisites:** Node 22+, pnpm 11+, Docker (for PostgreSQL and Redis).

```bash
# 1. Infrastructure
docker compose up -d postgres redis

# 2. API
cd backend
cp .env.example .env
#    Generate real secrets — the placeholders are refused in production:
#      openssl rand -base64 48   → SESSION_SECRET
#      openssl rand -base64 32   → ENCRYPTION_KEY
pnpm install
pnpm prisma:generate
pnpm prisma migrate deploy
pnpm seed
pnpm start:dev                    # http://localhost:4000
                                  # docs at /api/docs

# 3. Web
cd ../frontend
cp .env.example .env.local
pnpm install
pnpm dev                          # http://localhost:3000/book
```

Sign in to the CRM at `/sign-in` with `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`
until Google OAuth credentials are configured.

To run everything in containers instead:

```bash
docker compose --profile apps up -d --build
```

---

## The public journey

```
Residence  →  Experience  →  Schedule  →  Your details  →  Confirmation
```

No account is required at any point. Five steps, and the progress indicator maps
one-to-one onto them — research on multi-step checkouts is consistent that hiding or
merging steps costs more trust than the shorter number buys.

The details step asks for a name, a mobile number, and optionally an email and
country. CNIC, address, occupation, employer and budget are deliberately absent; the
sales team collects those later, when there is an operational reason to.

### Draft recovery

A visitor who leaves mid-journey can return and resume. The browser holds **only an
opaque draft token**; every piece of personal data lives server-side against an
expiring `booking_drafts` row. Putting a phone number in `localStorage` would leave it
on a shared device indefinitely and readable by any script on the page.

### The Duplex comparison

Shown after a visitor selects Classic, Elegant or Sonder Class. It never changes their
selection, never preselects the more expensive option and uses no urgency. The funnel
is instrumented instead — `duplex_upsell_shown` → `duplex_compare_opened` →
`duplex_selected` — so the upsell can be judged on evidence.

---

## The CRM

| Concept | Meaning here |
|---|---|
| **Contact** | A deduplicated person. Matched on normalised email **or** E.164 phone |
| **Lead** | One enquiry event. Never deduplicated — the pattern of enquiries is the sales signal |
| **Opportunity** | A purchase intention for one residence type. The same person can hold an open Classic and an open Duplex opportunity |
| **Appointment** | A site visit, video consultation or call |
| **Activity** | The append-oriented timeline an agent reads before picking up the phone |
| **Task** | Follow-ups, created by automation with a stable key so retries do not duplicate them |

Ahmed Khan submitting four forms is **one contact, four leads** — not four contacts.

### The pipeline

```
New Enquiry → Contact Attempted → Contacted → Qualified → Viewing Scheduled
  → Viewing Completed → Unit Preference → Reservation → Documentation → Won
                                                        (Nurture · Lost)
```

Fixed and Foakh-specific. Every stage change writes history: previous stage, actor,
reason and time spent in the old stage. Moving into a LOST stage requires a reason —
loss analysis without one is worthless.

The Kanban board moves cards with a `<select>`, not drag-and-drop. WCAG 2.2 requires a
non-drag path for anything draggable, and making the accessible control *the* control
is more honest than a hidden fallback nobody tests.

---

## Architecture decisions worth knowing

**Double-booking is prevented in the database, not in application code.**
`BookingsService` takes a `SELECT ... FOR UPDATE` row lock on the availability slot
*before* reading its capacity, inside a `SERIALIZABLE` transaction with retry. A
`CHECK (booked_count <= capacity)` constraint is the backstop if service code is ever
refactored into a bug. An integration test races real concurrent requests to prove it.

**One transaction produces the whole CRM record set.** A booking writes the
appointment, contact, lead, opportunity, stage history, consent and timeline entry
together, or writes none of them.

**External effects happen after commit.** Email, WhatsApp and Google Calendar are
emitted as events once the transaction is durable. Holding a database transaction open
across a call to Google turns a third party's latency into lock contention, and their
outage into yours.

**Sessions are opaque and server-side.** The browser holds a random token; only its
SHA-256 is stored. A manager disabling a departing agent's account takes effect
immediately — a self-contained JWT stays valid until it expires.

**"Sign in with Google" and "Connect Google Calendar" are two different consents.**
Login requests `openid email profile` only. Calendar access is requested from CRM
settings, at the moment it is used.

**Google account linking is deliberate, never silent.** A Google identity may claim an
existing user only when an administrator has invited that address and nobody has
claimed it. Treating a matching email as proof of ownership would be an account
takeover for any domain Foakh does not control.

Full detail in [docs/architecture.md](docs/architecture.md).

---

## Testing

```bash
cd backend
pnpm test                                     # 58 unit tests, no infrastructure
docker compose up -d postgres && pnpm test:int # integration + API tests
```

```bash
cd frontend
pnpm test:e2e                                  # Playwright — needs the full stack
```

Unit tests run with nothing but Node, so they are fast enough to run constantly.
Integration tests need real PostgreSQL, because the behaviours they cover — row
locking, unique constraints, transaction isolation — exist *in the database* and
cannot be verified against a mock.

---

## The API contract

The backend's OpenAPI document is the single source of truth:

```bash
cd backend  && pnpm openapi:generate   # → backend/openapi.json (38 paths)
cd frontend && pnpm api:types          # → src/lib/api/generated/schema.d.ts
```

Generation needs no database — Prisma is stubbed, since the Swagger explorer only
reads route metadata. Two repositories describing the same endpoints by hand drift
within a sprint, and the drift is only discovered at runtime.

---

## Feature flags

The database and domain model are built for these; the surfaces stay closed until
Foakh has authoritative inventory, pricing and a legal reservation process.

```
FEATURE_CLIENT_SIGNUP=false          # client portal accounts
FEATURE_REAL_UNIT_RESERVATION=false  # reserving a specific apartment
FEATURE_RESERVATION_PAYMENT=false    # taking payment (requires the above)
```

---

## Documentation

- [docs/architecture.md](docs/architecture.md) — modules, request flow, design decisions
- [docs/database.md](docs/database.md) — ERD and the schema's reasoning
- [docs/deployment.md](docs/deployment.md) — environments, migrations, rollback
- [docs/security.md](docs/security.md) — controls, threat notes, what is not yet done
