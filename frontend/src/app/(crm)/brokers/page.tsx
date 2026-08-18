'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/components/shell/CrmShell';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  Stat,
} from '@/components/ui';
import { formatPhone, formatPkr } from '@/lib/format';
import type { Broker } from '@/services/crm';
import { brokersService } from '@/services/crm';

/**
 * External referral brokers.
 *
 * These are channel partners, not staff and not users — they do not log in. The
 * list is shared across Sales Agents rather than scoped per-agent, because one
 * firm frequently introduces clients to more than one colleague and hiding them
 * would produce duplicate records for the same partner.
 */
export default function BrokersPage() {
  const [search, setSearch] = useState('');
  const [brokers, setBrokers] = useState<Broker[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    try {
      setBrokers(await brokersService.list(term));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load brokers.');
    }
  }, []);

  useEffect(() => {
    void load(search);
  }, [search, load]);

  const totals = (brokers ?? []).reduce(
    (acc, broker) => ({
      bookings: acc.bookings + broker.referredBookingCount,
      sales: acc.sales + broker.salesValuePaisa,
      outstanding: acc.outstanding + broker.commissionOutstandingPaisa,
    }),
    { bookings: 0, sales: 0, outstanding: 0 },
  );

  return (
    <>
      <PageHeader
        title="Brokers"
        subtitle="External referral partners. Added by a Sales Agent during a booking."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Brokers" value={String(brokers?.length ?? 0)} />
        <Stat label="Referred bookings" value={String(totals.bookings)} />
        <Stat label="Referred sales" value={formatPkr(totals.sales)} />
        <Stat label="Commission outstanding" value={formatPkr(totals.outstanding)} />
      </div>

      <div className="mb-4 max-w-sm">
        <Input
          aria-label="Search brokers"
          placeholder="Name, agency, BRK code or mobile"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error !== null ? (
        <ErrorState message={error} onRetry={() => void load(search)} />
      ) : brokers === null ? (
        <LoadingBlock label="Loading brokers" />
      ) : brokers.length === 0 ? (
        <EmptyState
          title={search === '' ? 'No brokers yet' : `No broker matches “${search}”`}
          description={
            search === ''
              ? 'A broker is recorded during a booking, on the step that asks how the client reached Foakh.'
              : 'Try a different name, agency or BRK code.'
          }
        />
      ) : (
        <DataTable
          rows={brokers}
          getKey={(broker) => broker.id}
          columns={[
            {
              key: 'broker',
              header: 'Broker',
              render: (broker) => (
                <>
                  <span className="block font-medium text-[var(--foakh-ink)]">
                    {broker.agencyName ?? broker.fullName}
                  </span>
                  <span className="block font-mono text-[0.68rem] text-[var(--foakh-muted)]">
                    {broker.brokerCode}
                  </span>
                </>
              ),
            },
            { key: 'contact', header: 'Contact', render: (b) => formatPhone(b.mobile) },
            { key: 'clients', header: 'Clients', align: 'right', render: (b) => String(b.referredClientCount) },
            { key: 'bookings', header: 'Bookings', align: 'right', render: (b) => String(b.referredBookingCount) },
            { key: 'sales', header: 'Sales value', align: 'right', render: (b) => formatPkr(b.salesValuePaisa) },
            { key: 'commission', header: 'Commission', align: 'right', render: (b) => formatPkr(b.commissionTotalPaisa) },
            { key: 'outstanding', header: 'Outstanding', align: 'right', render: (b) => formatPkr(b.commissionOutstandingPaisa) },
            {
              key: 'status',
              header: 'Status',
              render: (b) => <Badge tone={b.isActive ? 'available' : 'neutral'}>{b.status}</Badge>,
            },
          ]}
          renderCard={(broker) => (
            <Link
              href={`/brokers/${broker.id}`}
              className="block rounded-xl border border-[var(--foakh-border-strong)] bg-white px-4 py-3"
            >
              <p className="font-medium text-[var(--foakh-ink)]">
                {broker.agencyName ?? broker.fullName}
              </p>
              <p className="mt-0.5 font-mono text-[0.68rem] text-[var(--foakh-muted)]">
                {broker.brokerCode} · {formatPhone(broker.mobile)}
              </p>
              <p className="mt-1 text-xs text-[var(--foakh-text)]">
                {broker.referredBookingCount} booking
                {broker.referredBookingCount === 1 ? '' : 's'} ·{' '}
                {formatPkr(broker.salesValuePaisa)}
              </p>
            </Link>
          )}
        />
      )}
    </>
  );
}
