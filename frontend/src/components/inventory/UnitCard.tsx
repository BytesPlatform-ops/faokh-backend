'use client';

import Image from 'next/image';

import { Badge, ButtonLink, humanise, statusTone } from '@/components/ui';
import { findClass, findType } from '@/data/master-data';
import { formatArea, formatPkrFromRupees, formatRate } from '@/lib/format';
import { layoutSpecs } from '@/lib/specs';
import type { Unit } from '@/services/crm';

/**
 * A unit presented the way an agent would present it — photograph first,
 * specification second, price last — rather than as a database row.
 *
 * The price block is the part that has to be unambiguous: rate and total are
 * shown together so a client can see how the figure is arrived at, and a
 * provisional price is labelled rather than quietly rendered as final.
 */
export function UnitCard({ unit, compact = false }: { unit: Unit; compact?: boolean }) {
  const type = findType(unit.unitTypeCode);
  const classInfo = findClass(unit.classCode);
  const image = type.images[0];
  const isBookable = unit.status === 'AVAILABLE' && !unit.needsPriceConfirmation;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-[var(--foakh-border)] bg-white shadow-[var(--foakh-shadow-soft)] transition-shadow hover:shadow-[var(--foakh-shadow-medium)]">
      {!compact && image !== undefined && (
        <div className="relative aspect-[16/10] w-full bg-[var(--foakh-cream-warm)]">
          <Image
            src={image}
            alt={`${type.name} residence`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover"
          />
          <div className="absolute top-3 right-3">
            <Badge tone={statusTone(unit.status)}>{humanise(unit.status)}</Badge>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg leading-tight font-medium text-[var(--foakh-ink)]">
              Unit {unit.unitNumber}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--foakh-muted)]">
              {unit.buildingName} Block · {type.floorSpanLabel ?? `Floor ${unit.floorLevel}`}
            </p>
          </div>
          {compact && <Badge tone={statusTone(unit.status)}>{humanise(unit.status)}</Badge>}
        </div>

        {/* Type and class are independent — shown side by side so nobody reads
            "Elegant" as a kind of apartment. */}
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md bg-[var(--foakh-cream)] px-2 py-1 text-[0.62rem] font-semibold tracking-[0.1em] text-[var(--foakh-ink)] uppercase">
            {type.name}
          </span>
          <span className="rounded-md bg-[var(--foakh-terracotta)]/10 px-2 py-1 text-[0.62rem] font-semibold tracking-[0.1em] text-[var(--foakh-terracotta-dark)] uppercase">
            {classInfo.name}
          </span>
        </div>

        {/* Read-only facts about the layout, derived in one place so this card
            can never disagree with the booking wizard about what a Type A is. */}
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--foakh-text)]">
          {layoutSpecs(type).map((spec) => (
            <li key={spec}>{spec}</li>
          ))}
        </ul>

        <div className="mt-auto border-t border-[var(--foakh-border)] pt-3">
          <p className="text-xs text-[var(--foakh-muted)]">{formatArea(type.areaSqFt)} sq ft</p>

          {unit.priceRupees === null ? (
            <p className="mt-1 text-sm font-medium text-[var(--foakh-muted)]">
              Price not published
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-[var(--foakh-muted)]">
                {formatRate(unit.pricePerSqFt ?? 0)} / sq ft
              </p>
              <p className="font-display mt-0.5 text-xl font-medium text-[var(--foakh-ink)]">
                {formatPkrFromRupees(unit.priceRupees)}
              </p>
            </>
          )}

          {unit.needsPriceConfirmation && (
            // Never let a provisional figure look like a final one.
            <p className="mt-2 rounded-md bg-[#fdf1e3] px-2 py-1 text-[0.62rem] font-semibold tracking-wide text-[#8a5a1f] uppercase">
              Needs confirmation
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/inventory/${unit.id}`} variant="secondary" size="sm" className="flex-1">
            View details
          </ButtonLink>
          {isBookable ? (
            <ButtonLink
              href={`/bookings/new?unitId=${unit.id}&classCode=${unit.classCode}`}
              size="sm"
              className="flex-1"
            >
              Start booking
            </ButtonLink>
          ) : (
            <span className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--foakh-border-strong)] px-3 py-1.5 text-xs text-[var(--foakh-muted)]">
              {unit.needsPriceConfirmation ? 'Price unconfirmed' : humanise(unit.status)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Row form used inside the booking wizard, where the photo is a distraction. */
export function UnitPickRow({
  unit,
  selected,
  onSelect,
}: {
  unit: Unit;
  selected: boolean;
  onSelect: () => void;
}) {
  const type = findType(unit.unitTypeCode);

  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors ${
        selected
          ? 'border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)]/5'
          : 'border-[var(--foakh-border-strong)] bg-white hover:bg-[var(--foakh-cream-soft)]'
      }`}
    >
      <input
        type="radio"
        name="unit"
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <div>
        <p className="text-sm font-medium text-[var(--foakh-ink)]">Unit {unit.unitNumber}</p>
        <p className="mt-0.5 text-xs text-[var(--foakh-muted)]">
          {type.name} · {formatArea(type.areaSqFt)} sq ft · Floor {unit.floorLevel}
        </p>
      </div>
      <Badge tone={statusTone(unit.status)}>{humanise(unit.status)}</Badge>
    </label>
  );
}

/** Explains the calculation rather than just asserting a number. */
export function PriceBreakdown({
  areaSqFt,
  pricePerSqFt,
  totalRupees,
}: {
  areaSqFt: number;
  pricePerSqFt: number;
  totalRupees: number;
}) {
  return (
    <div className="rounded-xl border border-[var(--foakh-border)] bg-[var(--foakh-cream-soft)] p-4">
      <dl className="space-y-1.5 font-mono text-sm">
        <div className="flex justify-between">
          <dt className="text-[var(--foakh-muted)]">Area</dt>
          <dd className="text-[var(--foakh-ink)]">{formatArea(areaSqFt)} sq ft</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--foakh-muted)]">Rate</dt>
          <dd className="text-[var(--foakh-ink)]">× PKR {formatRate(pricePerSqFt)} / sq ft</dd>
        </div>
        <div className="border-t border-[var(--foakh-border-strong)] pt-2">
          <div className="flex justify-between">
            <dt className="font-semibold text-[var(--foakh-ink)]">Total</dt>
            <dd className="font-display text-base font-medium text-[var(--foakh-ink)]">
              {formatPkrFromRupees(totalRupees)}
            </dd>
          </div>
        </div>
      </dl>
    </div>
  );
}
