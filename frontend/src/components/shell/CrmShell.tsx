'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { SIGNED_OUT_KEY } from '@/app/login/page';
import { signOut } from '@/lib/supabase';
import { DATA_MODE, type SessionUser, sessionService } from '@/services/crm';

/**
 * The CRM shell.
 *
 * Desktop gets a persistent sidebar — brokers move between inventory, clients
 * and bookings constantly, and a hidden nav costs a click every time. Below
 * `lg` it collapses to a bottom bar for the five destinations that matter on a
 * phone, which is where a broker actually stands when they are on site.
 */

/**
 * True while the dev auto sign-in is configured.
 *
 * A convenience that signs you in without typing is easy to forget about, and
 * forgetting means not noticing which account you are acting as. So it is
 * announced on every screen for as long as it is on.
 */
const DEV_AUTOLOGIN = process.env.NEXT_PUBLIC_DEV_AUTOLOGIN === '1';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', short: 'Home', icon: '◈' },
  { href: '/inventory', label: 'Inventory', short: 'Units', icon: '▤' },
  { href: '/clients', label: 'Clients', short: 'Clients', icon: '◉' },
  { href: '/bookings', label: 'Bookings', short: 'Bookings', icon: '❑' },
  { href: '/commissions', label: 'Commissions', short: 'Earnings', icon: '％' },
] as const;

export function CrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    void sessionService
      .current()
      .then((value) => {
        if (!cancelled) setUser(value);
      })
      .catch(() => {
        if (cancelled) return;
        // No usable session. Send the user to sign in, remembering where they
        // were headed so they land there rather than on a generic dashboard.
        // Mock mode never reaches here — it has no network call to fail.
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      });

    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  async function endSession() {
    // Recorded before the session is cleared: the sign-in page reads it and
    // stands down, so signing out is not undone by the dev auto sign-in a
    // moment later.
    try {
      window.sessionStorage.setItem(SIGNED_OUT_KEY, '1');
    } catch {
      // Storage unavailable; the worst case is being signed straight back in.
    }

    await signOut();
    router.replace('/login');
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh bg-[var(--foakh-cream-soft)]">
      {/* ---------------------------------------------------------- sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-[var(--foakh-border)] bg-white lg:flex">
        <div className="border-b border-[var(--foakh-border)] px-5 py-5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/brand/foakh-mark.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
            />
            <span className="font-display text-base font-medium text-[var(--foakh-ink)]">
              Foakh <span className="text-[var(--foakh-muted)]">CRM</span>
            </span>
          </Link>
          <p className="mt-1 text-[0.6rem] tracking-[0.14em] text-[var(--foakh-muted)] uppercase">
            Wind Corridor Enclave
          </p>
        </div>

        <nav aria-label="Main" className="flex-1 px-3 py-4">
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive(item.href)
                      ? 'bg-[var(--foakh-terracotta)]/10 font-medium text-[var(--foakh-terracotta-dark)]'
                      : 'text-[var(--foakh-text)] hover:bg-[var(--foakh-cream)] hover:text-[var(--foakh-ink)]'
                  }`}
                >
                  <span aria-hidden="true" className="w-4 text-center text-xs opacity-70">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-6 px-3">
            <Link
              href="/bookings/new"
              className="flex w-full items-center justify-center rounded-lg bg-[var(--foakh-terracotta)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--foakh-terracotta-deep)]"
            >
              New Booking
            </Link>
          </div>
        </nav>

        <div className="border-t border-[var(--foakh-border)] px-5 py-4">
          {user === null ? (
            <div className="h-9 animate-pulse rounded bg-[var(--foakh-cream-warm)]" />
          ) : (
            <>
              <p className="text-sm font-medium text-[var(--foakh-ink)]">{user.name}</p>
              <p className="mt-0.5 font-mono text-[0.65rem] text-[var(--foakh-muted)]">
                {user.broker?.brokerCode ?? user.roles[0]}
              </p>
            </>
          )}
          {DATA_MODE === 'mock' ? (
            <p className="mt-3 rounded-md bg-[#fdf1e3] px-2 py-1 text-[0.6rem] font-semibold tracking-wide text-[#8a5a1f] uppercase">
              Demo data
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void endSession()}
              className="mt-3 text-[0.68rem] text-[var(--foakh-muted)] underline-offset-2 hover:text-[var(--foakh-ink)] hover:underline"
            >
              Sign out
            </button>
          )}
        </div>
      </aside>

      {/* --------------------------------------------------------- top bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--foakh-border)] bg-[var(--foakh-cream-soft)]/95 backdrop-blur-sm lg:pl-60">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
            <Image src="/brand/foakh-mark.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
            <span className="font-display text-sm font-medium text-[var(--foakh-ink)]">Foakh CRM</span>
          </Link>

          <div className="hidden lg:block">
            <p className="text-[0.62rem] tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
              Foakh Wind Corridor Enclave · 2FQ3+W4X, DHA City, Karachi
            </p>
          </div>

          <div className="flex items-center gap-2">
            {DATA_MODE === 'mock' && (
              <span className="hidden rounded-md bg-[#fdf1e3] px-2 py-1 text-[0.6rem] font-semibold tracking-wide text-[#8a5a1f] uppercase sm:inline">
                Demo data
              </span>
            )}
            <Link
              href="/bookings/new"
              className="rounded-lg bg-[var(--foakh-terracotta)] px-3 py-2 text-xs font-medium text-white lg:hidden"
            >
              New Booking
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="px-4 pt-5 pb-24 sm:px-6 lg:ml-60 lg:pb-10">
        {DEV_AUTOLOGIN && (
          <p className="mb-4 rounded-lg border border-[#e4c48a] bg-[#fdf1e3] px-3 py-2 text-[0.68rem] text-[#8a5a1f]">
            <span className="font-semibold tracking-wide uppercase">Dev auto sign-in</span> — this
            browser was signed in automatically as{' '}
            <span className="font-mono">{process.env.NEXT_PUBLIC_DEV_AUTOLOGIN_EMAIL}</span>. The
            session is real and scoped normally. Remove NEXT_PUBLIC_DEV_AUTOLOGIN from
            frontend/.env.local to disable.
          </p>
        )}
        {children}
      </main>

      {/* --------------------------------------------------- mobile bottom nav */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--foakh-border)] bg-white/95 backdrop-blur-sm lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.62rem] ${
                  isActive(item.href)
                    ? 'font-semibold text-[var(--foakh-terracotta-dark)]'
                    : 'text-[var(--foakh-muted)]'
                }`}
              >
                <span aria-hidden="true" className="text-sm">
                  {item.icon}
                </span>
                {item.short}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Page heading used by every screen, so titles and actions align everywhere. */
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumb?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {breadcrumb !== undefined && (
          <Link
            href={breadcrumb.href}
            className="mb-2 inline-flex items-center text-xs text-[var(--foakh-text)] hover:text-[var(--foakh-terracotta-deep)]"
          >
            <span aria-hidden="true" className="mr-1.5">←</span>
            {breadcrumb.label}
          </Link>
        )}
        <h1 className="font-display text-2xl leading-tight font-medium text-[var(--foakh-ink)] sm:text-[1.75rem]">
          {title}
        </h1>
        {subtitle !== undefined && (
          <p className="mt-1 text-sm text-[var(--foakh-text)]">{subtitle}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
