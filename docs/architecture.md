# Architecture

## Shape of the system

```
                    ┌──────────────────────────┐
  Marketing site    │  fwce.info               │   separate repo, untouched
  (unchanged)       └────────────┬─────────────┘
                                 │ "Book a Private Consultation"
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│  frontend/  ·  Next.js 16  ·  :3000                               │
│                                                                   │
│   /book/…            public booking journey (no account)          │
│   /crm/…             internal CRM (session-gated)                 │
│   /sign-in           staff authentication                         │
└──────────────────────────────┬────────────────────────────────────┘
                               │  JSON over HTTPS
                               │  session cookie + X-CSRF-Token
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│  backend/  ·  NestJS 11  ·  :4000  ·  /api/v1                     │
│                                                                   │
│   catalog · availability · booking-drafts · bookings              │
│   auth · crm · analytics · integrations · health                  │
└───────┬───────────────────────┬───────────────────────┬───────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   PostgreSQL 17           Redis / BullMQ         Google APIs
   (source of truth)       (jobs, reminders)      (OIDC, Calendar)
```

## Module map

| Module | Responsibility |
|---|---|
| `config` | Boot-time environment validation. The only place `process.env` is read |
| `database` | `PrismaService`, serializable transactions with retry, row locking |
| `auth` | Sessions, Google OIDC, password fallback, account linking |
| `catalog` | Residence categories, media, the Duplex comparison |
| `availability` | Bookable slots, grouped by local day |
| `booking-drafts` | Server-side storage for an in-progress booking |
| `bookings` | The transactional booking core; guest reschedule and cancel |
| `contacts` | Deduplication — the definition of "the same person" |
| `leads` | Enquiry events and source attribution |
| `opportunities` | Pipeline, stage transitions, stage history, the board |
| `appointments` | Internal (CRM-side) view of bookings and their outcomes |
| `activities` | The append-oriented timeline |
| `tasks` | Follow-ups, with automation keys for idempotent creation |
| `assignment` | Manual and round-robin agent assignment |
| `analytics` | Dashboard, funnel, residence and source reporting |
| `idempotency` | Replay protection for public POSTs |
| `notifications` | Channel-agnostic messaging with pluggable providers |
| `integrations/calendar` | Google Calendar connection and one-way sync |
| `workflows` | The fixed Foakh automations and scheduled housekeeping |
| `crm` | Every authenticated CRM controller, with access scoping |
| `audit` | Redacted audit trail for sensitive changes |
| `health` | Liveness and readiness probes |

## The booking transaction

The most important code path in the system.

```
POST /api/v1/bookings
  │
  ├─ ThrottlerGuard        10/min per IP — the most expensive public surface
  ├─ SessionAuthGuard      route is @Public(); resolves a staff session if present
  ├─ ValidationPipe        whitelist + forbidNonWhitelisted
  ├─ IdempotencyService    replays the stored response for a repeated key
  │
  └─ BookingsService.create ─── SERIALIZABLE transaction, retried on 40001
       │
       ├─ 1. SELECT ... FOR UPDATE on availability_slots  ← the lock comes FIRST
       ├─ 2. verify isActive and bookedCount < capacity
       ├─ 3. UPDATE bookedCount += 1                      ← CHECK constraint guards
       ├─ 4. contacts.findOrCreate                        ← dedup on email / E.164
       ├─ 5. leads.create                                 ← never deduplicated
       ├─ 6. opportunities.findOrCreate                   ← per residence type
       ├─ 7. appointments.create                          ← reference + manage token
       ├─ 8. opportunities.moveToStage(VIEWING_SCHEDULED, onlyIfEarlier)
       ├─ 9. consents.create                              ← granted or refused
       └─ 10. activities.create
       │
       COMMIT
       │
  └─ emit BookingConfirmed ──► notifications · reminders · task · calendar sync
```

**Why the lock is first.** Reading capacity without a row lock — however carefully —
lets two transactions both observe a free slot and both proceed. That is the
double-booking bug. `FOR UPDATE` makes the second transaction block until the first
commits or rolls back, so it can never act on stale capacity.

**Why side effects are outside.** Steps 1–10 are all local writes and complete in
milliseconds. Email and Google Calendar are network calls to systems Foakh does not
control; running them inside the transaction would hold row locks on the availability
table for the duration of a third party's latency, and a Google outage would become a
booking outage.

**Why `onlyIfEarlier`.** A buyer already at Documentation who books a second viewing
must not be dragged backwards through the funnel.

## Guard order

Registered globally in `app.module.ts`, and the order matters:

1. `ThrottlerGuard` — cheapest rejection first, before any database work
2. `SessionAuthGuard` — establishes `request.user`, or rejects
3. `CsrfGuard` — needs `request.user` to know whether to apply
4. `RolesGuard` — needs `request.user` to know its roles

Authentication is **opt-out** (`@Public()`), not opt-in. A CRM endpoint added in a
hurry is protected by omission rather than exposed by it. An integration test walks
every CRM route unauthenticated and asserts 401.

## Authorisation, in two halves

Guards can only answer *"may this role reach this endpoint"*. They cannot know that
lead `123` belongs to a different agent — only the service, after loading the record,
knows about ownership.

- **Route level** — `@Roles(...)` on the controller
- **Record level** — `assertCanAccessRecord(user, record)` in `crm-access.ts`, called
  after the record is loaded
- **List level** — `visibilityScope(user)` returns the agent's own id, applied
  server-side so an `assignedUserId` query parameter cannot widen it

## The two Google consents

```
Staff sign-in                        Calendar connection
─────────────                        ───────────────────
GET /auth/google/start               GET /integrations/google/calendar/start
scopes: openid email profile         scopes: calendar.events
access_type: online                  access_type: offline, prompt: consent
                                     ↓
                                     refresh token, AES-256-GCM encrypted at rest,
                                     never returned to the browser
```

Bundling calendar access into the login consent screen would show a new agent an
alarming permission request before they had seen the product, and would grant calendar
access to staff who never book viewings.

Both flows carry `state`, `nonce` and a PKCE S256 challenge. The verifier travels in an
HMAC-sealed, HttpOnly cookie rather than server-side storage, which keeps Redis off the
sign-in path — one less dependency that can take authentication down.

The calendar callback additionally requires a **live session** matching the user who
started the flow. Trusting the sealed cookie alone would let a stale flow attach a
calendar to an account whose session had since been revoked.

## Calendar sync direction

The Foakh database is written first and is authoritative; the calendar event is a
projection pushed outward.

The reverse — create the Google event, then hope the local write succeeds — leaves an
event on a real person's calendar with no record behind it and no way to reconcile.

Event ids are derived from the appointment id (`foakh<uuid-hex>`, valid base32hex), so
retrying after a partial failure updates the same event instead of creating a second
one.

## Queues, and the deliberate escape hatch

`QueueService` uses BullMQ when `QUEUES_ENABLED=true`, and runs handlers inline and
detached when it is false.

That fallback keeps Redis out of the critical path of `pnpm test` and lets a developer
run the entire booking journey with nothing but Postgres. Inline execution loses
retries, which is exactly why it is not the production configuration. If Redis is
configured but unreachable, `enqueue` falls back to inline rather than dropping the
work.

## Error envelope

Every error, from every path:

```json
{
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "That appointment time is no longer available.",
    "requestId": "req_a1b2c3d4e5f6",
    "details": { "…": "optional, non-PII" }
  }
}
```

Clients branch on `code`; messages are copy and will change. Unrecognised failures
return a fixed generic message — stack traces and driver text are logged, never
serialised, because an error body is a surface an attacker can read. The `requestId`
matches the `x-request-id` response header and the server log line.

## Analytics

`frontend/src/lib/analytics.ts` is a vendor seam. UI code calls `track()` and knows
nothing about a provider; Phase One logs in development and no-ops in production.

The rule that matters: **no form values pass through it.** Names, emails and phone
numbers belong in the CRM behind authentication, not in a third-party pipeline with a
different retention policy. Events carry categorical data and a random session id.

## Known gaps

Honest list of what Phase One does not do:

- **Contact merge UI.** When an email matches one contact and a phone matches another,
  both records are kept and a `SYSTEM` activity flags it. There is no merge screen yet;
  auto-merging would be irreversible and could expose one buyer's history to another.
- **Notification providers.** Only the `log` adapter ships. Adding SendGrid or the
  WhatsApp Business API is one class against `MessageProvider`.
- **Calendar inbound sync.** One-way only. `calendar_connections.syncToken` exists for
  the incremental-sync work when it is needed.
- **Client portal.** Modelled and flagged off.
