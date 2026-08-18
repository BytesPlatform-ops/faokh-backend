'use client';

import { useCallback, useEffect, useState } from 'react';

import { SpecList } from '@/components/booking/PropertyStep';
import { Notice, Skeleton } from '@/components/ui';
import { formatPkrFromRupees, formatRate } from '@/lib/format';
import type { ClassCode, PriceEntry, UnitTypeCode } from '@/services/crm';
import { inventoryService } from '@/services/crm';

/**
 * The class, and therefore the price.
 *
 * Chosen against the *layout*, not a specific unit: every Type A is sold at the
 * same three prices, so the price is known before a physical apartment is
 * picked. That ordering is what lets a broker answer "what does a furnished
 * Type A cost?" without first hunting for an available unit.
 *
 * All three are shown side by side with the difference from Classic. The
 * numbers do the upgrade conversation on their own — there are no scarcity
 * mechanics here, and choosing Classic is presented as an equally normal
 * outcome.
 */
export function ClassStep({
  unitTypeCode,
  selected,
  onSelect,
}: {
  unitTypeCode: UnitTypeCode;
  selected: ClassCode | null;
  onSelect: (code: ClassCode) => void;
}) {
  const [prices, setPrices] = useState<PriceEntry[] | null>(null);

  const type = inventoryService.typeByCode(unitTypeCode);
  const classes = inventoryService.classes();

  const load = useCallback(async () => {
    setPrices(await inventoryService.pricesForType(unitTypeCode));
  }, [unitTypeCode]);

  useEffect(() => {
    void load();
  }, [load]);

  if (prices === null) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-56 w-full" />
        ))}
      </div>
    );
  }

  const classicPrice = prices.find((entry) => entry.classCode === 'CLASSIC')?.price ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {classes.map((classInfo) => {
          const entry = prices.find((price) => price.classCode === classInfo.code);
          const isSelected = selected === classInfo.code;
          const unavailable = entry === undefined || entry.price === null;
          const delta =
            entry?.price != null && classicPrice !== null ? entry.price - classicPrice : null;

          return (
            <label
              key={classInfo.code}
              className={`flex cursor-pointer flex-col gap-2 rounded-xl border px-4 py-4 transition-colors ${
                unavailable
                  ? 'cursor-not-allowed border-[var(--foakh-border)] bg-[var(--foakh-cream-soft)] opacity-60'
                  : isSelected
                    ? 'border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)]/5'
                    : 'border-[var(--foakh-border-strong)] bg-white hover:bg-[var(--foakh-cream-soft)]'
              }`}
            >
              <input
                type="radio"
                name="residence-class"
                checked={isSelected}
                disabled={unavailable}
                onChange={() => onSelect(classInfo.code)}
                className="sr-only"
              />

              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-lg font-medium text-[var(--foakh-ink)]">
                  {classInfo.name}
                </p>
              </div>

              <p className="text-xs text-[var(--foakh-muted)]">{classInfo.description}</p>

              {unavailable ? (
                <p className="mt-auto pt-2 text-sm text-[var(--foakh-muted)]">
                  No published price
                </p>
              ) : (
                <div className="mt-auto border-t border-[var(--foakh-border)] pt-2">
                  <p className="text-xs text-[var(--foakh-muted)]">
                    PKR {formatRate(entry.pricePerSqFt ?? 0)} / sq ft
                  </p>
                  <p className="font-display mt-0.5 text-lg font-medium text-[var(--foakh-ink)]">
                    {formatPkrFromRupees(entry.price ?? 0)}
                  </p>
                  {delta !== null && delta > 0 && (
                    <p className="mt-1 text-xs text-[var(--foakh-terracotta-deep)]">
                      + {formatPkrFromRupees(delta)} vs Classic
                    </p>
                  )}
                  {delta === 0 && (
                    <p className="mt-1 text-xs text-[var(--foakh-muted)]">Base price</p>
                  )}
                </div>
              )}

              {entry?.needsConfirmation === true && (
                <p className="rounded-md bg-[#fdf1e3] px-2 py-1 text-[0.6rem] font-semibold tracking-wide text-[#8a5a1f] uppercase">
                  Needs confirmation
                </p>
              )}
            </label>
          );
        })}
      </div>

      {prices.find((entry) => entry.classCode === selected)?.needsConfirmation === true && (
        <Notice title="This price is provisional and cannot be booked">
          {prices.find((entry) => entry.classCode === selected)?.confirmationNote}
        </Notice>
      )}

      {/* The layout's facts, restated so the broker can see what the price is
          buying. Class changes the finish and the figure, never the layout. */}
      <div className="rounded-lg border border-[var(--foakh-border)] bg-[var(--foakh-cream-soft)] px-4 py-3">
        <p className="text-[0.6rem] font-semibold tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
          {type.name} — included in every class
        </p>
        <div className="mt-1.5">
          <SpecList type={type} />
        </div>
      </div>
    </div>
  );
}
