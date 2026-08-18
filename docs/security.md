# Security notes

The system holds names, phone numbers, email addresses and the buying intentions of
people spending large sums. It is treated as a production system holding personal data,
not as a brochure site with a form.

## Controls in place

### Authentication

| Control | Implementation |
|---|---|
| Staff sign-in | Google OpenID Connect with `state`, `nonce` and PKCE S256 |
| ID token validation | Signature, issuer, audience, expiry (`verifyIdToken`) plus an explicit nonce comparison |
| Unverified emails | Rejected — anyone can put any address on an unverified Google account |
| Hosted-domain restriction | Optional, checked against the verified `hd` claim, never the email suffix |
| Sessions | Opaque 32-byte tokens; only SHA-256 stored. Revocable immediately |
| Password fallback | scrypt at OWASP parameters (N=2¹⁷, r=8, p=1), bootstrap only |
| Enumeration resistance | Failed sign-in verifies against a real dummy hash, so timing does not reveal whether an account exists |
| Rate limiting | 5 login attempts/min per IP; 10 bookings/min; 120 req/min globally |

### The account-linking decision

A Google identity may claim an existing user **only** when an administrator has
explicitly invited that email and nobody has claimed it (`status = INVITED`).

Treating "the Google email matches a Foakh user's email" as proof of ownership would
let anyone who can create a Google account on a domain Foakh does not control take over
the matching staff account. An already-active account must link Google deliberately
from CRM settings, while signed in — proving control of both factors.

### Session and CSRF

```
foakh_session   HttpOnly · Secure (prod) · SameSite=Lax · Path=/
foakh_csrf      readable by JS · echoed in X-CSRF-Token on mutations
```

`SameSite=Lax` rather than `Strict`: the Google OAuth callback is a top-level
cross-site navigation back to this API, and `Strict` would withhold the cookie on
exactly that request. Lax still blocks cross-site POSTs, and the double-submit token
covers the remainder — a malicious origin can cause the session cookie to be *sent* but
cannot *read* the CSRF cookie to build the header.

### Authorisation

Enforced on the server on every request, regardless of what the UI shows. Hiding a
button has never stopped anyone from calling an endpoint.

- Global `SessionAuthGuard` — every route is protected unless marked `@Public()`
- `RolesGuard` — route-level role checks. `SUPER_ADMIN` is listed explicitly on every
  route it should reach; there is no hidden bypass
- Record-level `assertCanAccessRecord` — an agent cannot read a colleague's lead by
  guessing an id
- List-level `visibilityScope` — applied server-side, so a query parameter cannot widen it

An integration test walks every CRM route unauthenticated and asserts 401.

### Secrets and data at rest

- Google refresh tokens: AES-256-GCM, versioned ciphertext (`v1.iv.tag.ct`), decryption
  failure marks the connection `ERROR` and prompts a reconnect rather than crash-looping
- `ENCRYPTION_KEY` length is validated at boot — a wrong key otherwise fails at first
  use, far from the cause
- Placeholder secrets from `.env.example` are refused in production
- A standing `BOOTSTRAP_ADMIN_PASSWORD` is refused in production once Google is configured
- No secret is ever in a `NEXT_PUBLIC_*` variable — Next.js inlines those into the
  client bundle

### Input and output

- Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` — unknown properties
  are rejected, not silently stripped, so client bugs surface
- Body limit 256 kb
- Route params validated by shape (UUID, slug, reference, token patterns)
- Every DTO field length-bounded, including attacker-controlled UTM values
- Error bodies never carry stack traces or driver text
- `helmet`, `nosniff`, `DENY` framing, strict `Referrer-Policy`, HSTS in production
- CORS is an exact allow-list; `*` is refused at config validation because the API uses
  credentialed cookies

### PII handling

| Where | Rule |
|---|---|
| Logs | Only route pattern, method, status, code and request id. Never query strings or bodies |
| Prisma query log | Development only, and parameters are never logged |
| Audit snapshots | Names, emails, phones, tokens and notes redacted before storage |
| Analytics | Categorical data and a random session id only — no form values |
| Browser storage | An opaque draft token and a random analytics session id. No personal data |
| Booking drafts | Server-side, expiring; the sweep nulls the personal fields |
| Notification rows | Store the recipient (needed for delivery); log lines mask it |

### Abuse and integrity

- Idempotency keys prevent duplicate bookings from retries; a key reused with a
  different body is a 409 rather than a wrong confirmation
- Guest reschedule/cancel requires a 32-byte manage token, matched together with the
  reference in one query so timing does not reveal whether a reference exists
- OAuth `state` mismatches are audited
- Open-redirect defence on `returnTo` — only same-origin paths, no `//` or backslashes

## Accessibility as a security-adjacent control

WCAG 2.2 AA is a requirement, and two criteria are security-relevant:

- **Accessible authentication** — paste is never blocked on the password field, so
  password managers work. Blocking paste pushes people towards weaker, memorable passwords.
- **Target size** — 44px targets, above the 24px minimum. Mis-taps on a destructive
  control are a safety problem, not only a usability one.

## What is not done yet

Stated plainly, because an unstated gap is worse than a known one.

| Gap | Notes |
|---|---|
| **No dependency scanning in CI** | Add `pnpm audit --audit-level=high` and Dependabot |
| **No secret scanning** | Add gitleaks or GitHub secret scanning before this repo goes near real data |
| **No WAF / bot protection** | Rate limiting is per-IP and in-process; a distributed scraper of the availability endpoint would not be stopped |
| **Rate limit state is in memory** | Multiple API replicas each get their own budget. Move the throttler to Redis storage before scaling out |
| **No account lockout** | Only rate limiting protects the password endpoint. Acceptable while it is a single bootstrap account; not if staff passwords are ever enabled |
| **No 2FA on the fallback login** | Google accounts carry the organisation's own MFA; the bootstrap account does not |
| **Audit log is not tamper-evident** | Append-only by convention, not by constraint. Hash-chaining would be the next step |
| **No data-retention job** | Drafts expire, but leads, contacts and activities are kept indefinitely. A retention policy is a legal decision Foakh needs to make |
| **No backup verification** | Backups are a deployment concern and are not automated here |
| **CSP not set on the API** | Deliberate — it serves JSON only. The frontend sets its own |

## If a session is suspected compromised

```sql
-- Revoke every session for a user, immediately.
UPDATE sessions SET revoked_at = now()
WHERE user_id = '<uuid>' AND revoked_at IS NULL;
```

Opaque server-side sessions are what make this work. With self-contained JWTs the token
would remain valid until it expired.

Rotating `ENCRYPTION_KEY` invalidates every stored Google Calendar grant; connections
move to `ERROR` and agents are prompted to reconnect. Nothing else is lost.
