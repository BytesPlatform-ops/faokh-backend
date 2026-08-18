'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/components/shell/CrmShell';
import {
  Badge,
  ButtonLink,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingBlock,
  humanise,
  statusTone,
} from '@/components/ui';
import { formatDate, formatPkr } from '@/lib/format';
import type { Booking, SessionUser } from '@/services/crm';
import { bookingsService, isBroker, sessionService } from '@/services/crm';

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await sessionService.current();
      setUser(session);
      const result = await bookingsService.list({
        // Row-level scoping: a broker's list is their own book.
        ...(isBroker(session) ? { brokerId: session.broker?.id } : {}),
      });
      setBookings(result.data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load bookings.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle={
          user?.broker !== undefined ? `Attributed to ${user.broker.brokerCode}` : undefined
        }
        actions={<ButtonLink href="/bookings/new">New Booking</ButtonLink>}
      />

      {error !== null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : bookings === null ? (
        <LoadingBlock label="Loading bookings" />
      ) : (
        <DataTable
          columns={[
            {
              key: 'code',
              header: 'Booking',
              render: (row) => (
                <Link href={`/bookings/${row.id}`} className="font-mono text-xs text-[var(--foakh-terracotta-deep)] hover:underline">
                  {row.bookingCode}
                </Link>
              ),
            },
            { key: 'client', header: 'Client', render: (row) => row.clientName },
            {
              key: 'unit',
              header: 'Unit',
              render: (row) => (
                <span>
                  {row.snapshot.unitNumber}
                  <span className="ml-1 text-xs text-[var(--foakh-muted)]">
                    {row.snapshot.unitTypeName} · {row.snapshot.className}
                  </span>
                </span>
              ),
            },
            { key: 'date', header: 'Booked', render: (row) => formatDate(row.bookingDate) },
            {
              key: 'total',
              header: 'Sale price',
              align: 'right',
              render: (row) => formatPkr(row.snapshot.totalPricePaisa),
            },
            {
              key: 'outstanding',
              header: 'Outstanding',
              align: 'right',
              render: (row) => formatPkr(row.outstandingPaisa),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <Badge tone={statusTone(row.status)}>{humanise(row.status)}</Badge>,
            },
          ]}
          rows={bookings}
          getKey={(row) => row.id}
          renderCard={(row) => (
            <Link
              href={`/bookings/${row.id}`}
              className="block rounded-lg border border-[var(--foakh-border)] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--foakh-ink)]">{row.clientName}</p>
                  <p className="mt-0.5 font-mono text-xs text-[var(--foakh-muted)]">
                    {row.bookingCode}
                  </p>
                </div>
                <Badge tone={statusTone(row.status)}>{humanise(row.status)}</Badge>
              </div>
              <p className="mt-2 text-xs text-[var(--foakh-text)]">
                {row.snapshot.unitNumber} · {row.snapshot.unitTypeName} · {row.snapshot.className}
              </p>
              <div className="mt-3 flex justify-between border-t border-[var(--foakh-border)] pt-2 text-sm">
                <span className="text-[var(--foakh-muted)]">Sale price</span>
                <span className="font-medium tabular-nums">
                  {formatPkr(row.snapshot.totalPricePaisa)}
                </span>
              </div>
            </Link>
          )}
          emptyState={
            <EmptyState
              title="No bookings yet"
              description="Create a booking from the inventory or start the wizard."
              action={<ButtonLink href="/bookings/new">New Booking</ButtonLink>}
            />
          }
        />
      )}
    </>
  );
}
