import { Prisma } from '@prisma/client';

/**
 * Money primitives.
 *
 * Every amount in this system is a `Prisma.Decimal` backed by a PostgreSQL
 * NUMERIC column. Nothing is ever a JavaScript `number`: at PKR 64,000,000 a
 * binary floating-point error is not a rounding artefact, it is a figure on a
 * signed payment schedule that does not add up.
 */

export type Money = Prisma.Decimal;

export const ZERO: Money = new Prisma.Decimal(0);
export const HUNDRED: Money = new Prisma.Decimal(100);

export function money(value: Prisma.Decimal.Value): Money {
  return new Prisma.Decimal(value);
}

/** Rounds to whole paisa, half away from zero — the convention on invoices. */
export function toPaisa(value: Money): Money {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Rounds *down* to whole paisa.
 *
 * Used when splitting a pool into equal parts: rounding each part down
 * guarantees the parts never sum to more than the pool, leaving a small
 * positive residual for the final part to absorb. Rounding to nearest would
 * risk overshooting the total.
 */
export function floorPaisa(value: Money): Money {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

/** `percentOf(18_800_000, 10)` → 1,880,000.00 */
export function percentOf(amount: Money, percent: Prisma.Decimal.Value): Money {
  return toPaisa(amount.times(new Prisma.Decimal(percent)).dividedBy(HUNDRED));
}

/**
 * Price per square foot, to four decimal places.
 *
 * Four rather than two because it is a derived display rate, not a settlement
 * amount: PKR 18,800,000 ÷ 1,102 sq ft is 17,059.8911, and printing
 * "17,059.89 × 1,102 = 18,799,998.78" on a client's schedule invites a
 * question that has no good answer. The authoritative figure is always the
 * total; the rate is shown for comparison between units.
 */
export function pricePerSqFt(total: Money, areaSqFt: Money): Money {
  if (areaSqFt.lessThanOrEqualTo(0)) {
    throw new Error('Area must be greater than zero to derive a per-square-foot rate');
  }
  return total.dividedBy(areaSqFt).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

export function sum(values: Money[]): Money {
  return values.reduce((total, value) => total.plus(value), ZERO);
}

/**
 * Splits `pool` into `parts` amounts that sum to `pool` exactly.
 *
 * This is the function the 44-month schedule depends on. Dividing 11,280,000
 * by 44 gives 256,363.636…; forty-four rounded copies do not add back to the
 * pool. So every part except the last is rounded down and the last absorbs the
 * residual — which is also how a human writes a payment plan, and keeps the
 * discrepancy in one visible place rather than smeared across the schedule.
 */
export function splitEvenly(pool: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new Error('Split requires a positive whole number of parts');
  }

  const base = floorPaisa(pool.dividedBy(parts));
  const amounts: Money[] = [];
  let allocated = ZERO;

  for (let index = 0; index < parts - 1; index += 1) {
    amounts.push(base);
    allocated = allocated.plus(base);
  }
  amounts.push(pool.minus(allocated));

  return amounts;
}

/** Formats for display: `PKR 18,800,000.00`. Presentation only — never parse
 *  this back into a calculation. */
export function formatPkr(value: Money, options: { withSymbol?: boolean } = {}): string {
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value.toFixed(2)));

  return options.withSymbol === false ? formatted : `PKR ${formatted}`;
}

/** `17,059.89` — the per-square-foot rate, trimmed to two places for print. */
export function formatRate(value: Money): string {
  return new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value.toFixed(2)));
}
