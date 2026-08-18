import type { Prisma } from '@prisma/client';

/**
 * Prisma ↔ frontend translation.
 *
 * The database stores money as NUMERIC (`Prisma.Decimal`); the approved
 * frontend contract carries money as **integer paisa**. Both are exact — the
 * conversion happens here, once, so no controller is tempted to hand a Decimal
 * to `JSON.stringify` and quietly ship `"18800000"` where a number was
 * expected.
 */

/** Rupee Decimal → integer paisa. */
export function toPaisa(value: Prisma.Decimal | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value.toFixed(2)) * 100);
}

/** Rupee Decimal → plain rupees, for prices the frontend formats itself. */
export function toRupees(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value.toFixed(2));
}

/** A four-decimal rate as a number. */
export function toRate(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value.toFixed(4));
}

export function toIso(value: Date | null | undefined): string | null {
  return value == null ? null : value.toISOString();
}
