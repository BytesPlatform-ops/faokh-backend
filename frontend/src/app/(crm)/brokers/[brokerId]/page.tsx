'use client';

import { use, useEffect, useState } from 'react';

import { PageHeader } from '@/components/shell/CrmShell';
import { Badge, Card, CardHeader, Detail, ErrorState, LoadingBlock, Stat } from '@/components/ui';
import { formatDate, formatPhone, formatPkr } from '@/lib/format';
import type { Broker } from '@/services/crm';
import { brokersService } from '@/services/crm';

/**
 * One external broker.
 *
 * Shows what Foakh owes them and what has been released. "Earned" deliberately
 * excludes milestones whose date has merely arrived — a date passing does not
 * make money payable, Finance approving it does.
 */
export default function BrokerDetailPage({
  params,
}: {
  params: Promise<{ brokerId: string }>;
}) {
  const { brokerId } = use(params);
  const [broker, setBroker] = useState<Broker | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void brokersService
      .getById(brokerId)
      .then((found) => {
        if (!cancelled) setBroker(found);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load the broker.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brokerId]);

  if (error !== null) return <ErrorState message={error} />;
  if (broker === null) return <LoadingBlock label="Loading broker" />;

  return (
    <>
      <PageHeader
        title={broker.agencyName ?? broker.fullName}
        subtitle={`${broker.brokerCode} · external referral partner`}
        breadcrumb={{ href: '/brokers', label: 'Brokers' }}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Referred clients" value={String(broker.referredClientCount)} />
        <Stat label="Referred bookings" value={String(broker.referredBookingCount)} />
        <Stat label="Sales value" value={formatPkr(broker.salesValuePaisa)} />
        <Stat label="Commission outstanding" value={formatPkr(broker.commissionOutstandingPaisa)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <dl className="grid grid-cols-2 gap-4 p-5">
            <Detail label="Broker ID" value={<span className="font-mono">{broker.brokerCode}</span>} />
            <Detail
              label="Status"
              value={<Badge tone={broker.isActive ? 'available' : 'neutral'}>{broker.status}</Badge>}
            />
            <Detail label="Contact name" value={broker.fullName} />
            <Detail label="Agency" value={broker.agencyName ?? '—'} />
            <Detail label="Mobile" value={formatPhone(broker.mobile)} />
            <Detail label="WhatsApp" value={broker.whatsapp ? formatPhone(broker.whatsapp) : '—'} />
            <Detail label="Email" value={broker.email ?? '—'} />
            <Detail label="City" value={broker.city ?? '—'} />
            <Detail label="NTN" value={broker.ntn ?? '—'} />
            <Detail label="Commission rate" value={`${broker.commissionRatePct}% of sale`} />
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="Commission"
            subtitle="Four 1% milestones per booking. A date arriving does not release money."
          />
          <dl className="grid grid-cols-2 gap-4 p-5">
            <Detail label="Total earned" value={formatPkr(broker.commissionTotalPaisa)} />
            <Detail label="Paid" value={formatPkr(broker.commissionPaidPaisa)} />
            <Detail label="Outstanding" value={formatPkr(broker.commissionOutstandingPaisa)} />
            <Detail label="Sales value" value={formatPkr(broker.salesValuePaisa)} />
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Record" />
          <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <Detail label="Added by" value={broker.createdBySalesAgentName ?? '—'} />
            <Detail
              label="Sales Agent"
              value={
                <span className="font-mono">{broker.createdBySalesAgentCode ?? '—'}</span>
              }
            />
            <Detail label="Added" value={formatDate(broker.createdAt)} />
            <Detail label="Last updated" value={formatDate(broker.updatedAt)} />
          </dl>
          {broker.notes !== undefined && (
            <div className="border-t border-[var(--foakh-border)] px-5 py-4">
              <p className="text-[0.62rem] font-semibold tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
                Notes
              </p>
              <p className="mt-1 text-sm text-[var(--foakh-text)]">{broker.notes}</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
