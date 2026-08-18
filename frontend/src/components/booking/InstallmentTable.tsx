'use client';

import { Badge, DataTable, humanise, statusTone } from '@/components/ui';
import { formatDate, formatPkr } from '@/lib/format';
import type { CommissionMilestone, Installment } from '@/services/crm';

/**
 * The client payment schedule.
 *
 * 47 rows: down payment, two milestones, 44 monthly instalments and completion.
 * The monthly block is collapsed by default — a broker reviewing a plan with a
 * client wants the shape first, and forty-four rows of the same number buries
 * the three that differ.
 */
export function InstallmentTable({
  installments,
  approximateMonthlyPct,
  collapsible = true,
}: {
  installments: Installment[];
  approximateMonthlyPct?: number;
  collapsible?: boolean;
}) {
  const monthly = installments.filter((entry) => entry.kind === 'MONTHLY');
  const shown = collapsible
    ? installments.filter(
        (entry) =>
          entry.kind !== 'MONTHLY' ||
          entry.sequence === monthly[0]?.sequence ||
          entry.sequence === monthly.at(-1)?.sequence,
      )
    : installments;

  return (
    <div className="flex flex-col gap-3">
      {collapsible && monthly.length > 2 && approximateMonthlyPct !== undefined && (
        <p className="text-xs text-[var(--foakh-muted)]">
          Showing the first and last of {monthly.length} monthly instalments — each
          approximately {approximateMonthlyPct}% of the sale price. The exact amounts are
          the 60% pool divided by {monthly.length}, not a fixed percentage.
        </p>
      )}

      <DataTable
        columns={[
          { key: 'seq', header: '#', render: (row) => <span className="tabular-nums">{row.sequence}</span> },
          { key: 'label', header: 'Milestone', render: (row) => row.label },
          {
            key: 'due',
            header: 'Due date',
            render: (row) =>
              row.dueDate === null ? (
                <span className="text-[var(--foakh-muted)]">To be confirmed</span>
              ) : (
                formatDate(row.dueDate)
              ),
          },
          {
            key: 'pct',
            header: '%',
            align: 'right',
            render: (row) => `${row.percentageOfTotal.toFixed(2)}%`,
          },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            render: (row) => formatPkr(row.amountPaisa),
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => <Badge tone={statusTone(row.status)}>{humanise(row.status)}</Badge>,
          },
        ]}
        rows={shown}
        getKey={(row) => String(row.sequence)}
        renderCard={(row) => (
          <div className="rounded-lg border border-[var(--foakh-border)] bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-[var(--foakh-ink)]">{row.label}</p>
                <p className="mt-0.5 text-xs text-[var(--foakh-muted)]">
                  {row.dueDate === null ? 'To be confirmed' : formatDate(row.dueDate)} ·{' '}
                  {row.percentageOfTotal.toFixed(2)}%
                </p>
              </div>
              <Badge tone={statusTone(row.status)}>{humanise(row.status)}</Badge>
            </div>
            <p className="mt-2 text-sm font-medium tabular-nums text-[var(--foakh-ink)]">
              {formatPkr(row.amountPaisa)}
            </p>
          </div>
        )}
      />
    </div>
  );
}

/** The broker's four 1% milestones. Never rendered on a client-facing copy. */
export function CommissionTable({ milestones }: { milestones: CommissionMilestone[] }) {
  return (
    <DataTable
      columns={[
        { key: 'label', header: 'Milestone', render: (row) => row.label },
        { key: 'date', header: 'Expected', render: (row) => formatDate(row.expectedDate) },
        {
          key: 'pct',
          header: '% of sale',
          align: 'right',
          render: (row) => `${row.percentageOfSale.toFixed(2)}%`,
        },
        {
          key: 'amount',
          header: 'Amount',
          align: 'right',
          render: (row) => formatPkr(row.amountPaisa),
        },
        {
          key: 'status',
          header: 'Status',
          render: (row) => <Badge tone={statusTone(row.status)}>{humanise(row.status)}</Badge>,
        },
      ]}
      rows={milestones}
      getKey={(row) => String(row.sequence)}
      renderCard={(row) => (
        <div className="rounded-lg border border-[var(--foakh-border)] bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-[var(--foakh-ink)]">{row.label}</p>
              <p className="mt-0.5 text-xs text-[var(--foakh-muted)]">
                {formatDate(row.expectedDate)} · {row.percentageOfSale.toFixed(2)}% of sale
              </p>
            </div>
            <Badge tone={statusTone(row.status)}>{humanise(row.status)}</Badge>
          </div>
          <p className="mt-2 text-sm font-medium tabular-nums text-[var(--foakh-ink)]">
            {formatPkr(row.amountPaisa)}
          </p>
        </div>
      )}
    />
  );
}

/** The plan's shape, shown before the 47-row table so the structure lands
 *  before the detail. */
export function PlanShapeSummary({
  totalPaisa,
  monthlyCount,
  monthlyBasePaisa,
  approximateMonthlyPct,
}: {
  totalPaisa: number;
  monthlyCount: number;
  monthlyBasePaisa: number;
  approximateMonthlyPct: number;
}) {
  const tranches = [
    { pct: '10%', label: 'Down payment', when: 'On booking' },
    { pct: '10%', label: 'Second payment', when: '60 days' },
    { pct: '10%', label: 'Third payment', when: '120 days' },
    {
      pct: '60%',
      label: `${monthlyCount} monthly instalments`,
      when: `≈${approximateMonthlyPct}% each · ${formatPkr(monthlyBasePaisa)}`,
    },
    { pct: '10%', label: 'Completion / handover', when: 'To be confirmed' },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-5">
      {tranches.map((tranche) => (
        <div
          key={tranche.label}
          className="rounded-lg border border-[var(--foakh-border)] bg-white px-3 py-2.5"
        >
          <p className="font-display text-lg font-medium text-[var(--foakh-terracotta-dark)]">
            {tranche.pct}
          </p>
          <p className="mt-0.5 text-xs font-medium text-[var(--foakh-ink)]">{tranche.label}</p>
          <p className="mt-0.5 text-[0.68rem] text-[var(--foakh-muted)]">{tranche.when}</p>
        </div>
      ))}
      <p className="sm:col-span-5 text-xs text-[var(--foakh-muted)]">
        Total {formatPkr(totalPaisa)} · the schedule sums to exactly 100% of the sale price.
      </p>
    </div>
  );
}
