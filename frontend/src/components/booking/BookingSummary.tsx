'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui';
import { formatArea, formatCnic, formatPkr, formatRate } from '@/lib/format';
import type { Broker, ClassCode, Client, Unit } from '@/services/crm';
import { inventoryService } from '@/services/crm';

export interface BookingSummaryData {
  client: Client | null;
  broker: Broker | undefined;
  unit: Unit | null;
  classCode: ClassCode | null;
  totalPaisa: number | null;
  pricePerSqFt: number | null;
}

/**
 * The running booking summary.
 *
 * A ten-step wizard is exactly where a broker loses track of what they picked
 * three screens ago — usually while a client is asking "and which floor was
 * that again?". So the selections stay on screen: a sticky panel beside the
 * wizard on desktop, and a collapsed bar pinned above the action buttons on
 * mobile, where there is no room for a column.
 */
export function BookingSummary({ data }: { data: BookingSummaryData }) {
  const rows = buildRows(data);

  return (
    <aside
      aria-label="Booking summary"
      className="hidden lg:sticky lg:top-24 lg:block lg:self-start"
    >
      <div className="rounded-xl border border-[var(--foakh-border)] bg-white shadow-[var(--foakh-shadow-soft)]">
        <div className="border-b border-[var(--foakh-border)] px-5 py-3">
          <h2 className="text-[0.62rem] font-semibold tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
            This booking
          </h2>
        </div>
        <dl className="flex flex-col gap-4 px-5 py-4">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-[0.6rem] font-medium tracking-[0.14em] text-[var(--foakh-muted)] uppercase">
                {row.label}
              </dt>
              <dd className="mt-1 text-sm text-[var(--foakh-ink)]">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

/** The mobile counterpart: one collapsed line that expands on tap. */
export function BookingSummaryMobile({ data }: { data: BookingSummaryData }) {
  const [open, setOpen] = useState(false);
  const rows = buildRows(data);

  const headline =
    data.unit === null
      ? (data.client?.fullLegalName ?? 'Nothing selected yet')
      : `${data.client?.fullLegalName ?? 'No client'} · ${data.unit.unitNumber}`;

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--foakh-border-strong)] bg-white px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[0.6rem] font-semibold tracking-[0.14em] text-[var(--foakh-muted)] uppercase">
            This booking
          </span>
          <span className="mt-0.5 block truncate text-sm text-[var(--foakh-ink)]">{headline}</span>
        </span>
        <span className="flex items-center gap-2">
          {data.totalPaisa !== null && (
            <span className="text-sm font-medium tabular-nums text-[var(--foakh-ink)]">
              {formatPkr(data.totalPaisa)}
            </span>
          )}
          <span aria-hidden="true" className="text-[var(--foakh-muted)]">
            {open ? '▴' : '▾'}
          </span>
        </span>
      </button>

      {open && (
        <dl className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-[var(--foakh-border)] bg-white px-4 py-3">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-[0.58rem] font-medium tracking-[0.14em] text-[var(--foakh-muted)] uppercase">
                {row.label}
              </dt>
              <dd className="mt-0.5 text-xs text-[var(--foakh-ink)]">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function buildRows(data: BookingSummaryData): { label: string; value: React.ReactNode }[] {
  const rows: { label: string; value: React.ReactNode }[] = [];

  rows.push({
    label: 'Client',
    value:
      data.client === null ? (
        <span className="text-[var(--foakh-muted)]">Not selected</span>
      ) : (
        <>
          <span className="block font-mono text-xs text-[var(--foakh-muted)]">
            {data.client.clientCode}
          </span>
          {data.client.fullLegalName}
          <span className="mt-0.5 block font-mono text-[0.68rem] text-[var(--foakh-muted)]">
            {formatCnic(data.client.cnic)}
          </span>
        </>
      ),
  });

  rows.push({
    label: 'Broker',
    value:
      data.broker === undefined ? (
        <span className="text-[var(--foakh-muted)]">—</span>
      ) : (
        <>
          <span className="block font-mono text-xs">{data.broker.brokerCode}</span>
          <span className="text-xs text-[var(--foakh-muted)]">{data.broker.name}</span>
        </>
      ),
  });

  if (data.unit !== null) {
    const type = inventoryService.typeFor(data.unit);
    const classInfo =
      data.classCode === null
        ? null
        : inventoryService.classes().find((entry) => entry.code === data.classCode);

    rows.push({
      label: 'Property',
      value: (
        <>
          <span className="block">
            {data.unit.buildingName} · Floor {data.unit.floorLevel}
          </span>
          <span className="block font-medium">Unit {data.unit.unitNumber}</span>
          <span className="mt-0.5 block text-xs text-[var(--foakh-muted)]">
            {type.name}
            {classInfo !== null && classInfo !== undefined ? ` · ${classInfo.name}` : ''}
          </span>
        </>
      ),
    });

    rows.push({ label: 'Area', value: `${formatArea(type.areaSqFt)} sq ft` });
  }

  if (data.pricePerSqFt !== null && data.pricePerSqFt > 0) {
    rows.push({ label: 'Rate', value: `PKR ${formatRate(data.pricePerSqFt)} / sq ft` });
  }

  if (data.totalPaisa !== null && data.totalPaisa > 0) {
    rows.push({
      label: 'Total',
      value: (
        <span className="font-display text-lg font-medium text-[var(--foakh-ink)]">
          {formatPkr(data.totalPaisa)}
        </span>
      ),
    });
  }

  if (data.unit === null) {
    rows.push({
      label: 'Property',
      value: <span className="text-[var(--foakh-muted)]">Not selected</span>,
    });
  }

  return rows;
}

/** Small status pill used in the wizard header. */
export function SummaryBadge({ label }: { label: string }) {
  return <Badge tone="neutral">{label}</Badge>;
}
