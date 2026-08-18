/**
 * Money and the Foakh payment plan — frontend mirror.
 *
 * This is a deliberate, careful duplication of the backend's validated money
 * engine (`backend/src/common/money/*`), which has 22 passing tests. It exists
 * because the CRM must show a payment schedule before a booking is persisted,
 * and in mock mode there is no backend at all.
 *
 * Two rules keep the duplication honest:
 *
 *  1. **Identical formulas.** The monthly instalment is the 60% pool divided by
 *     44 — never 1.36% of the sale. 1.36 × 44 = 59.84%, which under-collects by
 *     0.16% (PKR 30,080 on a PKR 18,800,000 apartment). The "~1.36% monthly"
 *     label shown in the UI is derived *from* the amount, never used to compute
 *     it.
 *
 *  2. **Backend wins.** Once `NEXT_PUBLIC_DATA_MODE=api`, schedules come from
 *     the server and these functions are used only for previews. They must
 *     agree to the paisa; `money.spec.ts` asserts the same figures the backend
 *     suite does.
 *
 * Amounts are handled in **paisa as integers** rather than floats. JavaScript
 * has no decimal type, and 0.1 + 0.2 inside a PKR 64,000,000 schedule is a
 * dispute, not a rounding artefact.
 */

/** An amount in paisa (1/100 PKR). Always an integer. */
export type Paisa = number;

export function toPaisa(rupees: number): Paisa {
  return Math.round(rupees * 100);
}

export function toRupees(paisa: Paisa): number {
  return paisa / 100;
}

/** Splits a pool into `parts` that sum back to the pool exactly. */
export function splitEvenly(pool: Paisa, parts: number): Paisa[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new Error('splitEvenly requires a positive whole number of parts');
  }
  // Floor each share so the parts can never exceed the pool; the residual
  // lands on the final part, which is also how a human writes a schedule.
  const base = Math.floor(pool / parts);
  const amounts = Array.from({ length: parts - 1 }, () => base);
  amounts.push(pool - base * (parts - 1));
  return amounts;
}

export function percentOfPaisa(total: Paisa, percent: number): Paisa {
  return Math.round((total * percent) / 100);
}

/**
 * Price per square foot, to four decimal places.
 *
 * Four rather than two because it is a derived display rate: PKR 21,000,000 ÷
 * 1,102 sq ft is 19,056.2613, and printing "19,056.26 × 1,102 = 20,999,998.52"
 * on a client's schedule invites a question with no good answer. The total is
 * always authoritative; the rate exists to compare units.
 */
export function pricePerSqFt(totalRupees: number, areaSqFt: number): number {
  if (areaSqFt <= 0) throw new Error('Area must be greater than zero');
  return Math.round((totalRupees / areaSqFt) * 10_000) / 10_000;
}

// ---------------------------------------------------------------- payment plan

export const PLAN_SHAPE = {
  downPaymentPct: 10,
  secondPct: 10,
  thirdPct: 10,
  monthlyPoolPct: 60,
  completionPct: 10,
  monthlyCount: 44,
  secondMilestoneDays: 60,
  thirdMilestoneDays: 120,
  /** Configurable. Defaults to one month after the 120-day milestone. */
  monthlyStartOffsetDays: 150,
} as const;

export type InstallmentKind =
  | 'DOWN_PAYMENT'
  | 'MILESTONE_60D'
  | 'MILESTONE_120D'
  | 'MONTHLY'
  | 'COMPLETION';

export interface PlannedInstallment {
  sequence: number;
  kind: InstallmentKind;
  label: string;
  amountPaisa: Paisa;
  /** Derived from the amount, for display only. */
  percentageOfTotal: number;
  /** Null for completion until Foakh confirms a handover date. */
  dueDate: Date | null;
}

export interface PaymentPlanPreview {
  installments: PlannedInstallment[];
  monthlyPoolPaisa: Paisa;
  monthlyBasePaisa: Paisa;
  monthlyCount: number;
  totalPaisa: Paisa;
  /** The "~1.36%" label, computed from the real instalment amount. */
  approximateMonthlyPct: number;
}

export function buildPaymentPlan(input: {
  totalRupees: number;
  bookingDate: Date;
  monthlyStartDate?: Date;
  /** Null means "to be confirmed" — never invent one. */
  expectedHandoverDate?: Date | null;
}): PaymentPlanPreview {
  const total = toPaisa(input.totalRupees);
  if (total <= 0) throw new Error('Cannot build a payment plan for a non-positive price');

  const down = percentOfPaisa(total, PLAN_SHAPE.downPaymentPct);
  const second = percentOfPaisa(total, PLAN_SHAPE.secondPct);
  const third = percentOfPaisa(total, PLAN_SHAPE.thirdPct);
  const completion = percentOfPaisa(total, PLAN_SHAPE.completionPct);

  // The pool is the residual, not an independently rounded 60%. This is what
  // guarantees the schedule reconciles to the sale price to the last paisa.
  const pool = total - down - second - third - completion;
  const monthlyAmounts = splitEvenly(pool, PLAN_SHAPE.monthlyCount);

  const monthlyStart =
    input.monthlyStartDate ?? addDays(input.bookingDate, PLAN_SHAPE.monthlyStartOffsetDays);

  const installments: PlannedInstallment[] = [
    {
      sequence: 1,
      kind: 'DOWN_PAYMENT',
      label: 'Down payment',
      amountPaisa: down,
      percentageOfTotal: pct(down, total),
      dueDate: input.bookingDate,
    },
    {
      sequence: 2,
      kind: 'MILESTONE_60D',
      label: 'Second payment (60 days)',
      amountPaisa: second,
      percentageOfTotal: pct(second, total),
      dueDate: addDays(input.bookingDate, PLAN_SHAPE.secondMilestoneDays),
    },
    {
      sequence: 3,
      kind: 'MILESTONE_120D',
      label: 'Third payment (120 days)',
      amountPaisa: third,
      percentageOfTotal: pct(third, total),
      dueDate: addDays(input.bookingDate, PLAN_SHAPE.thirdMilestoneDays),
    },
    ...monthlyAmounts.map((amountPaisa, index) => ({
      sequence: 4 + index,
      kind: 'MONTHLY' as const,
      label: `Monthly instalment ${index + 1} of ${PLAN_SHAPE.monthlyCount}`,
      amountPaisa,
      percentageOfTotal: pct(amountPaisa, total),
      dueDate: addMonths(monthlyStart, index),
    })),
    {
      sequence: 4 + PLAN_SHAPE.monthlyCount,
      kind: 'COMPLETION',
      label: 'Completion / handover',
      amountPaisa: completion,
      percentageOfTotal: pct(completion, total),
      // Stays null so the UI shows "To be confirmed" rather than a date
      // nobody at Foakh has agreed.
      dueDate: input.expectedHandoverDate ?? null,
    },
  ];

  const reconciled = installments.reduce((sum, entry) => sum + entry.amountPaisa, 0);
  if (reconciled !== total) {
    throw new Error(`Payment plan does not reconcile: ${reconciled} vs ${total}`);
  }

  const monthlyBase = monthlyAmounts[0] ?? 0;

  return {
    installments,
    monthlyPoolPaisa: pool,
    monthlyBasePaisa: monthlyBase,
    monthlyCount: PLAN_SHAPE.monthlyCount,
    totalPaisa: reconciled,
    approximateMonthlyPct: Math.round((monthlyBase / total) * 100 * 100) / 100,
  };
}

// ------------------------------------------------------------------ commission

export const COMMISSION_SHAPE = {
  totalRatePct: 4,
  milestones: [
    { sequence: 1, label: 'Down payment milestone', offsetDays: 0 },
    { sequence: 2, label: '60-day milestone', offsetDays: 60 },
    { sequence: 3, label: '120-day milestone', offsetDays: 120 },
    { sequence: 4, label: 'One-year milestone', offsetDays: 365 },
  ],
} as const;

export interface PlannedCommissionMilestone {
  sequence: number;
  label: string;
  percentageOfSale: number;
  amountPaisa: Paisa;
  expectedDate: Date;
}

export function buildCommissionPlan(input: {
  salePriceRupees: number;
  bookingDate: Date;
  ratePct?: number;
}): {
  ratePct: number;
  totalPaisa: Paisa;
  milestones: PlannedCommissionMilestone[];
} {
  const basis = toPaisa(input.salePriceRupees);
  const ratePct = input.ratePct ?? COMMISSION_SHAPE.totalRatePct;
  const total = percentOfPaisa(basis, ratePct);

  // Split the commission, not the sale, so a non-standard broker rate still
  // yields four parts that reconcile to their own total.
  const shares = splitEvenly(total, COMMISSION_SHAPE.milestones.length);

  return {
    ratePct,
    totalPaisa: total,
    milestones: COMMISSION_SHAPE.milestones.map((entry, index) => ({
      sequence: entry.sequence,
      label: entry.label,
      percentageOfSale: ratePct / COMMISSION_SHAPE.milestones.length,
      amountPaisa: shares[index] ?? 0,
      expectedDate: addDays(input.bookingDate, entry.offsetDays),
    })),
  };
}

// --------------------------------------------------------------------- dates

export function addDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Adds calendar months, clamping the day of month so 31 January + 1 month is
 * 28 February rather than rolling into March. A schedule that silently skips a
 * month drifts further every year.
 */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function pct(amount: Paisa, total: Paisa): number {
  return Math.round((amount / total) * 100 * 1_000_000) / 1_000_000;
}
