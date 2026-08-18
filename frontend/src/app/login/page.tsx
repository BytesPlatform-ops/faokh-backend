'use client';

import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { Button, ErrorState, Field, Input, Notice, Skeleton } from '@/components/ui';
import { signInWithPassword } from '@/lib/supabase';
import { DATA_MODE } from '@/services/crm';

/**
 * Sign-in.
 *
 * Authentication is Supabase's job; authorisation is the CRM's. This page only
 * proves who somebody is — it never reads a role, and it never decides what the
 * person may do. The access token it obtains is presented to the NestJS API,
 * which resolves the CRM user, their role and their broker scope from the
 * database. A token alone grants nothing: a Supabase account with no
 * corresponding CRM user is refused at the guard, deliberately.
 *
 * In mock mode there is nothing to sign in to, so the page says so rather than
 * presenting a form that cannot work.
 *
 * A development convenience is available on top of this — see DEV_AUTOLOGIN
 * below. It skips *typing*, not authentication: the same Supabase sign-in runs,
 * the same ES256 token is issued, and the API verifies and scopes it exactly as
 * it would for anyone else.
 */

/**
 * Dev-only automatic sign-in.
 *
 * Set all three in `frontend/.env.local` to land straight on the dashboard:
 *
 *   NEXT_PUBLIC_DEV_AUTOLOGIN=1
 *   NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL=broker1@foakh.local
 *   NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD=...
 *
 * This is NOT an authentication bypass. No guard is disabled, no route is
 * opened, and the browser still holds a real, expiring Supabase session — the
 * page simply submits credentials you already have.
 *
 * It is still a credential inlined into a browser bundle, so it is opt-in,
 * off by default, absent from `.env.example`, and announced by a banner on
 * every screen while it is active. A deployment that has not set the flag is
 * completely unaffected.
 */
const DEV_AUTOLOGIN =
  process.env.NEXT_PUBLIC_DEV_AUTOLOGIN === '1' &&
  (process.env.NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL ?? '') !== '' &&
  (process.env.NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD ?? '') !== '';

/**
 * Set when somebody signs out on purpose.
 *
 * Without it, auto sign-in makes the Sign out button do nothing visible: it
 * clears the session, lands on this page, and is immediately signed back in.
 * An explicit sign-out has to mean "let me out", so it suppresses the automatic
 * attempt for the rest of the tab's life — `sessionStorage`, not `localStorage`,
 * because a new tab should be convenient again.
 */
export const SIGNED_OUT_KEY = 'foakh.signed-out';

function signedOutDeliberately(): boolean {
  try {
    return window.sessionStorage.getItem(SIGNED_OUT_KEY) === '1';
  } catch {
    // Private browsing and some embedded webviews throw on storage access.
    // Falling back to "not signed out" keeps the convenience working there.
    return false;
  }
}
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Where the user was heading before they were bounced here.
  const next = params.get('next') ?? '/dashboard';

  // Guards against a credential loop: if the configured account is wrong, the
  // attempt must happen once and then leave the form usable, rather than
  // retrying forever behind a spinner.
  const attempted = useRef(false);
  const [autoRunning, setAutoRunning] = useState(DEV_AUTOLOGIN);

  useEffect(() => {
    if (!DEV_AUTOLOGIN || attempted.current) return;
    attempted.current = true;

    if (signedOutDeliberately()) {
      setAutoRunning(false);
      return;
    }

    void signInWithPassword(
      process.env.NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL ?? '',
      process.env.NEXT_PUBLIC_DEV_AUTOLOGIN_PASSWORD ?? '',
    )
      .then(() => router.replace(next))
      .catch((caught: unknown) => {
        setAutoRunning(false);
        setError(
          `Automatic sign-in failed: ${
            caught instanceof Error ? caught.message : 'unknown error'
          }. Check NEXT_PUBLIC_DEV_AUTOLOGIN_* in frontend/.env.local, or sign in below.`,
        );
      });
  }, [router, next]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signInWithPassword(email.trim(), password);
      try {
        window.sessionStorage.removeItem(SIGNED_OUT_KEY);
      } catch {
        // Storage unavailable — nothing to clear.
      }
      // `replace`, not `push`: the sign-in page must not sit in the history
      // behind an authenticated session, where Back would land on it again.
      router.replace(next);
    } catch (caught) {
      // Deliberately not distinguishing "no such account" from "wrong
      // password" — that difference tells an attacker which addresses exist.
      setError(
        caught instanceof Error && caught.message.includes('Invalid login')
          ? 'That email and password do not match an account.'
          : caught instanceof Error
            ? caught.message
            : 'Could not sign in.',
      );
      setSubmitting(false);
    }
  }

  if (DATA_MODE === 'mock') {
    return (
      <Notice tone="info" title="Demo mode — no sign-in required">
        The CRM is running on the in-memory demo store and is already signed in as a broker. Set{' '}
        <code className="font-mono text-xs">NEXT_PUBLIC_DATA_MODE=api</code> to authenticate against
        Supabase.
      </Notice>
    );
  }

  if (autoRunning) {
    return (
      <div className="flex flex-col gap-3 py-4 text-center">
        <p className="text-sm text-[var(--foakh-ink)]">
          Signing in as{' '}
          <span className="font-mono text-xs">
            {process.env.NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL}
          </span>
          …
        </p>
        <p className="text-xs text-[var(--foakh-muted)]">
          Development auto sign-in is enabled. Remove NEXT_PUBLIC_DEV_AUTOLOGIN from
          .env.local to use the form.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      {error !== null && <ErrorState message={error} />}

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-xs text-[var(--foakh-muted)]">
        Accounts are provisioned by an administrator. Your role and the clients you can see are
        held in the CRM, not in this form.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--foakh-cream-soft)] px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <Image
            src="/brand/foakh-mark.png"
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 object-contain"
          />
          <h1 className="font-display mt-3 text-2xl font-medium text-[var(--foakh-ink)]">
            Foakh <span className="text-[var(--foakh-muted)]">CRM</span>
          </h1>
          <p className="mt-1 text-[0.62rem] tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
            Wind Corridor Enclave
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--foakh-border)] bg-white p-6 shadow-sm">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
