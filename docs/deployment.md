# Deployment

> **Status.** The GitHub Actions pipeline described below is not currently wired
> up. Both applications deploy through Vercel's git integration — `faokh-crm`
> (frontend) and `faokh-crm-backend` (API) build on every push to `main`. The
> workflow that used to build GHCR images was removed: its deploy steps were
> placeholders that shipped nothing, and it failed on every push. This document
> stays as the design for a container-hosted pipeline, which is what the
> `Dockerfile`s and the expand/contract migration discipline below assume.

## Environments

| | Staging | Production |
|---|---|---|
| Purpose | Verify the exact image before it reaches customers | Live |
| Data | Seeded, disposable | Real personal data |
| Google OAuth | Separate client, staging redirect URIs | Production client |
| Notifications | `log` provider | Real vendors when configured |
| Approval | Automatic on merge to `main` | Manual, via a GitHub environment reviewer |

## Pipeline

```
push to main
   │
   ├─ CI ──── lint · typecheck · unit · migrate · integration · E2E · build
   │
   ├─ build ─ one image per app, tagged with the commit SHA (never `latest`)
   │
   ├─ staging ─ migrate → deploy → smoke test
   │
   └─ ⏸ manual approval
        │
        └─ production ─ migrate → deploy → health check
```

Images are tagged with the 12-character commit SHA. `latest` is never used, because
every environment must be able to say exactly which build it is running and roll back
to a specific one.

## Required configuration

Secrets (GitHub environment secrets — never repository variables):

```
STAGING_DATABASE_URL
PRODUCTION_DATABASE_URL
```

Variables:

```
STAGING_URL · STAGING_API_URL
PRODUCTION_URL · PRODUCTION_API_URL
NEXT_PUBLIC_API_BASE_URL      # inlined into the client bundle at build time
```

Runtime environment for each deployed API instance is the full set in
[`backend/.env.example`](../backend/.env.example). Generate per-environment:

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
```

Never reuse these between environments. A staging leak must not be a production
incident.

### Cloud credentials

Prefer OIDC federation over long-lived access keys stored as secrets. A leaked static
key is valid until someone notices; a federated token is scoped to a single workflow
run. A deploy job needs `id-token: write` for the exchange, and the target
platform's federation wiring in place of a static key.

## Migrations

`prisma migrate deploy` — and only that command — in any non-development environment.
It applies pending migrations, never generates, never resets and never prompts.

Migrations run **before** the new image is deployed, which is why the expand/contract
discipline in [database.md](database.md) is not optional: during a rolling deploy there
is a window where the old application code is running against the new schema.

```bash
# From the exact image being deployed — migrations ship inside it.
docker run --rm -e DATABASE_URL="$DATABASE_URL" \
  ghcr.io/<owner>/<repo>/api:<sha> \
  npx prisma migrate deploy
```

## Rollback

**Application** — redeploy the previous image tag. Safe whenever the schema is
backwards-compatible, which expand/contract guarantees.

**Database** — do not roll a migration back automatically. Prisma has no down
migrations by design. Write a new forward migration that reverses the change, and test
it on a restored snapshot first. A destructive rollback under incident pressure is how
data is lost.

**Fastest safe path during an incident:** redeploy the previous application image and
leave the schema alone. Expand/contract means the old code still works against the new
schema.

## Health checks

```
GET /api/v1/health/live    liveness  — process is up, checks nothing external
GET /api/v1/health/ready   readiness — PostgreSQL required, Redis reported
```

Point the orchestrator's **liveness** probe at `/live` and its **readiness** probe at
`/ready`. A liveness probe that checks the database restarts every replica during a
database blip, turning a recoverable incident into an outage.

Redis is reported as degraded rather than down: queues fall back to inline execution,
which is worse than having Redis but far better than refusing bookings.

## Scaling notes

- The API is stateless apart from Redis; run several replicas behind a load balancer
- `trust proxy` is enabled — the balancer must set `X-Forwarded-For`, or rate limiting
  and audit logging will record the balancer's IP for everyone
- **Before scaling past one replica**, move the throttler to Redis storage. It is
  currently in-process, so each replica gets its own budget
- Scheduled jobs (`@Cron` in `MaintenanceService`) run on **every** replica. Before
  scaling out, gate them behind a leader election or a distributed lock, or reminders
  will be attempted N times. Notification dedupe keys prevent duplicate *sends*, but
  the work is still duplicated

## Google Cloud console setup

Register these redirect URIs exactly — they are compared byte for byte, and
`API_PUBLIC_URL` has its trailing slash stripped at config validation for this reason:

```
https://api.<env>.fwce.info/api/v1/auth/google/callback
https://api.<env>.fwce.info/api/v1/integrations/google/calendar/callback
```

Scopes to configure: `openid`, `email`, `profile` for sign-in;
`https://www.googleapis.com/auth/calendar.events` for the calendar integration.

## First deployment checklist

- [ ] `SESSION_SECRET` and `ENCRYPTION_KEY` generated per environment, stored as secrets
- [ ] `CORS_ALLOWED_ORIGINS` lists the exact web origin (no wildcard — it is refused)
- [ ] `API_PUBLIC_URL` / `WEB_PUBLIC_URL` set to real HTTPS origins
- [ ] Google OAuth client created; both redirect URIs registered
- [ ] `BOOTSTRAP_ADMIN_PASSWORD` set for the very first sign-in, then **removed** once
      a Google-authenticated `SUPER_ADMIN` exists
- [ ] `pnpm seed` run once (idempotent, safe to repeat)
- [ ] Staff users invited (`status = INVITED`) so they can claim their Google identity
- [ ] Database backups configured and a restore tested
- [ ] `/health/ready` wired to the orchestrator
- [ ] Production environment protection rules enabled with required reviewers
