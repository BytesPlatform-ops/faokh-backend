'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { CommissionTable } from '@/components/booking/InstallmentTable';
import { PageHeader } from '@/components/shell/CrmShell';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Stat,
  humanise,
  statusTone,
} from '@/components/ui';
import { formatDate, formatPkr } from '@/lib/format';
import type { CommissionSummaryRow, SessionUser } from '@/services/crm';
import { commissionsService, isSalesAgent, sessionService } from '@/services/crm';

/**
 * Broker commission: 4% of the sale, released as four 1% milestones.
 *
 * "Earned" and "Paid" are shown as separate figures because the gap between
 * them is precisely what a broker chases. A milestone reaching its date makes
 * it *eligible*, never paid — finance approves each payout deliberately.
 */
export default function CommissionsPage() {
  const [rows, setRows] = useState<CommissionSummaryRow[] | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await sessionService.current();
      setUser(session);
      setRows(await commissionsService.summary(isSalesAgent(session) ? session.salesAgent?.id : undefined));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load commissions.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = rows?.reduce(
    (sum, row) => ({
      total: sum.total + row.totalCommissionPaisa,
      earned: sum.earned + row.earnedPaisa,
      paid: sum.paid + row.paidPaisa,
      outstanding: sum.outstanding + row.outstandingPaisa,
    }),
    { total: 0, earned: 0, paid: 0, outstanding: 0 },
  );

  return (
    <>
      <PageHeader
        title="Commissions"
        subtitle={
          user?.salesAgent !== undefined
            ? `${user.salesAgent.salesAgentCode} · broker referral commission, 4% in four 1% milestones`
            : 'All brokers'
        }
      />

      {error !== null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : rows === null || totals === undefined ? (
        <LoadingBlock label="Loading commissions" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No commission yet"
          description="Commission is generated automatically when a booking is confirmed."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Total commission" value={formatPkr(totals.total)} hint="Across all bookings" />
            <Stat label="Earned" value={formatPkr(totals.earned)} hint="Milestones reached" />
            <Stat label="Paid" value={formatPkr(totals.paid)} hint="Released by finance" />
            <Stat
              label="Outstanding"
              value={formatPkr(totals.outstanding)}
              hint="Earned but unpaid"
              tone={totals.outstanding > 0 ? 'warning' : 'default'}
            />
          </div>

          <div className="flex flex-col gap-5">
            {rows.map((row) => (
              <Card key={row.bookingId}>
                <CardHeader
                  title={`${row.clientName} · Unit ${row.unitNumber}`}
                  subtitle={`Sale ${formatPkr(row.salePricePaisa)} · Commission ${formatPkr(row.totalCommissionPaisa)}`}
                  action={
                    <Link
                      href={`/bookings/${row.bookingId}`}
                      className="font-mono text-xs text-[var(--foakh-terracotta-deep)] hover:underline"
                    >
                      {row.bookingCode}
                    </Link>
                  }
                />
                <div className="flex flex-col gap-4 p-5">
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <dt className="text-[0.62rem] tracking-[0.14em] text-[var(--foakh-muted)] uppercase">Earned</dt>
                      <dd className="mt-1 text-sm font-medium tabular-nums">{formatPkr(row.earnedPaisa)}</dd>
                    </div>
                    <div>
                      <dt className="text-[0.62rem] tracking-[0.14em] text-[var(--foakh-muted)] uppercase">Paid</dt>
                      <dd className="mt-1 text-sm font-medium tabular-nums">{formatPkr(row.paidPaisa)}</dd>
                    </div>
                    <div>
                      <dt className="text-[0.62rem] tracking-[0.14em] text-[var(--foakh-muted)] uppercase">Outstanding</dt>
                      <dd className="mt-1 text-sm font-medium tabular-nums">{formatPkr(row.outstandingPaisa)}</dd>
                    </div>
                    <div>
                      <dt className="text-[0.62rem] tracking-[0.14em] text-[var(--foakh-muted)] uppercase">Next</dt>
                      <dd className="mt-1 flex items-center gap-2 text-sm">
                        {row.nextDate === null ? '—' : formatDate(row.nextDate)}
                        {row.nextStatus !== null && (
                          <Badge tone={statusTone(row.nextStatus)}>{humanise(row.nextStatus)}</Badge>
                        )}
                      </dd>
                    </div>
                  </dl>
                  <CommissionTable milestones={row.milestones} />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
