'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/components/shell/CrmShell';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Stat,
  humanise,
  statusTone,
} from '@/components/ui';
import { formatDate, formatPkr, relativeDueLabel } from '@/lib/format';
import {
  type DashboardMetrics,
  type SessionUser,
  dashboardService,
  isBroker,
  sessionService,
} from '@/services/crm';

/**
 * The broker's home screen.
 *
 * Every figure here implies an action today. Deliberately absent: all-time
 * counters that only ever go up — they crowd out the numbers someone would
 * actually act on.
 */
export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await sessionService.current();
      setUser(session);
      // Brokers see their own book; managers and finance see everything.
      const scope = isBroker(session) ? session.broker?.id : undefined;
      setMetrics(await dashboardService.metrics(scope));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the dashboard.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error !== null) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState message={error} onRetry={() => void load()} />
      </>
    );
  }

  if (metrics === null || user === null) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <LoadingBlock label="Loading dashboard" />
      </>
    );
  }

  const broker = user.broker;

  return (
    <>
      <PageHeader
        title={`Good day, ${user.name.split(' ')[0]}`}
        subtitle={
          broker !== undefined
            ? `Broker ${broker.brokerCode} · ${broker.commissionRatePct}% commission`
            : 'Foakh Wind Corridor Enclave'
        }
        actions={<ButtonLink href="/bookings/new">New Booking</ButtonLink>}
      />

      {/* ------------------------------------------------------- inventory */}
      <section aria-labelledby="inventory-heading" className="mb-8">
        <h2 id="inventory-heading" className="sr-only">Inventory</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Available units"
            value={String(metrics.availableUnits)}
            hint={`of ${metrics.totalUnits} in the project`}
            href="/inventory?status=AVAILABLE"
          />
          <Stat
            label="Booked / sold"
            value={String(metrics.bookedUnits)}
            hint="Across both buildings"
            href="/inventory?status=BOOKED"
          />
          <Stat
            label="Total sales value"
            value={formatPkr(metrics.totalSalesValuePaisa)}
            hint="My bookings"
          />
          <Stat
            label="Collected"
            value={formatPkr(metrics.collectedPaisa)}
            hint={`${formatPkr(metrics.outstandingPaisa)} outstanding`}
          />
        </div>
      </section>

      {/* -------------------------------------------------------- payments */}
      <section aria-labelledby="payments-heading" className="mb-8">
        <h2 id="payments-heading" className="sr-only">Payments and commission</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Due in 30 days"
            value={formatPkr(metrics.paymentsDueSoon.amountPaisa)}
            hint={`${metrics.paymentsDueSoon.count} instalments`}
            tone="warning"
          />
          <Stat
            label="Overdue"
            value={formatPkr(metrics.overduePayments.amountPaisa)}
            hint={`${metrics.overduePayments.count} instalments`}
            tone={metrics.overduePayments.count > 0 ? 'danger' : 'default'}
          />
          <Stat
            label="Commission earned"
            value={formatPkr(metrics.commissionEarnedPaisa)}
            hint={`${formatPkr(metrics.commissionPaidPaisa)} paid`}
            href="/commissions"
          />
          <Stat
            label="Commission outstanding"
            value={formatPkr(metrics.commissionOutstandingPaisa)}
            hint="Earned but not yet paid"
            href="/commissions"
            tone={metrics.commissionOutstandingPaisa > 0 ? 'warning' : 'default'}
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* --------------------------------------------- upcoming payments */}
        <Card>
          <CardHeader
            title="Upcoming and overdue instalments"
            subtitle="Next 30 days"
            action={
              <Link href="/bookings" className="text-xs text-[var(--foakh-terracotta-deep)] hover:underline">
                All bookings
              </Link>
            }
          />
          {metrics.upcomingInstallments.length === 0 ? (
            <div className="p-5">
              <p className="text-sm text-[var(--foakh-text)]">Nothing due in the next 30 days.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--foakh-border)]">
              {metrics.upcomingInstallments.map((entry, index) => (
                <li key={`${entry.bookingCode}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--foakh-ink)]">
                      {entry.clientName}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--foakh-muted)]">
                      <span className="font-mono">{entry.bookingCode}</span> · {entry.label}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums text-[var(--foakh-ink)]">
                      {formatPkr(entry.amountPaisa)}
                    </p>
                    <p
                      className={`mt-0.5 text-xs ${
                        entry.status === 'OVERDUE'
                          ? 'font-medium text-[#9b2c2c]'
                          : 'text-[var(--foakh-muted)]'
                      }`}
                    >
                      {relativeDueLabel(entry.dueDate)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------------------------------------- recent bookings */}
        <Card>
          <CardHeader
            title="Recent bookings"
            action={
              <Link href="/bookings" className="text-xs text-[var(--foakh-terracotta-deep)] hover:underline">
                View all
              </Link>
            }
          />
          {metrics.recentBookings.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No bookings yet"
                description="Start a booking from the inventory or the booking wizard."
                action={<ButtonLink href="/bookings/new" size="sm">New Booking</ButtonLink>}
              />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--foakh-border)]">
              {metrics.recentBookings.map((booking) => (
                <li key={booking.id}>
                  <Link
                    href={`/bookings/${booking.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-[var(--foakh-cream-soft)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--foakh-ink)]">
                        {booking.clientName}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--foakh-muted)]">
                        {booking.snapshot.unitNumber} · {booking.snapshot.unitTypeName} ·{' '}
                        {booking.snapshot.className}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums text-[var(--foakh-ink)]">
                        {formatPkr(booking.snapshot.totalPricePaisa)}
                      </span>
                      <Badge tone={statusTone(booking.status)}>{humanise(booking.status)}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ----------------------------------------------- recent clients */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent clients"
            action={
              <Link href="/clients" className="text-xs text-[var(--foakh-terracotta-deep)] hover:underline">
                View all
              </Link>
            }
          />
          {metrics.recentClients.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No clients yet"
                description="Add a client before starting a booking."
                action={<ButtonLink href="/clients/new" size="sm">Add Client</ButtonLink>}
              />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--foakh-border)]">
              {metrics.recentClients.map((client) => (
                <li key={client.id}>
                  <Link
                    href={`/clients/${client.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-[var(--foakh-cream-soft)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--foakh-ink)]">
                        {client.fullLegalName}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-[var(--foakh-muted)]">
                        {client.clientCode}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden text-xs text-[var(--foakh-muted)] sm:inline">
                        {formatDate(client.lastActivityAt)}
                      </span>
                      <Badge tone={client.bookingStatus === 'NONE' ? 'neutral' : 'booked'}>
                        {client.bookingStatus === 'NONE' ? 'No booking' : 'Booked'}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
