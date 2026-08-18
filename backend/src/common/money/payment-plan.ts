import { Prisma } from '@prisma/client';

import { type Money, floorPaisa, money, percentOf, splitEvenly, sum, toPaisa } from './money';

/**
 * The Foakh client payment plan.
 *
 *   10%  Down payment          booking date
 *   10%  Second milestone      booking date + 60 days
 *   10%  Third milestone       booking date + 120 days
 *   60%  Monthly pool          44 monthly instalments
 *   10%  Completion            expected handover date
 *
 * The arithmetic detail that matters:
 *
 * The monthly instalment is **not** 1.36% of the sale. 1.36 × 44 = 59.84, so a
 * schedule built from that percentage collects 99.84% of the price and leaves
 * 0.16% — PKR 30,080 on a PKR 18,800,000 apartment — permanently unbilled.
 *
 * So the pool is computed first (60% of the price) and divided by 44. The
 * displayed "≈1.36% monthly" is a label derived from the amount, never the
 * other way round.
 *
 * The four fixed tranches are rounded to paisa and the monthly pool is taken as
 * the *residual* of the price, so the schedule sums to the sale price exactly
 * regardless of how the percentages round.
 */

export const FOAKH_PLAN_SHAPE = {
  downPaymentPct: 10,
  secondPct: 10,
  thirdPct: 10,
  monthlyPoolPct: 60,
  completionPct: 10,
  monthlyCount: 44,
  secondMilestoneDays: 60,
  thirdMilestoneDays: 120,
} as const;

export type PlannedInstallmentKind =
  'DOWN_PAYMENT' | 'MILESTONE_60D' | 'MILESTONE_120D' | 'MONTHLY' | 'COMPLETION';

export interface PlannedInstallment {
  sequence: number;
  kind: PlannedInstallmentKind;
  label: string;
  amount: Money;
  /** Derived from the amount for display. Never used to compute the amount. */
  percentageOfTotal: Money;
  dueDate: Date;
}

export interface PaymentPlanInput {
  totalAmount: Money;
  bookingDate: Date;
  /**
   * When the 44 monthly instalments begin. Admin-configured — the default is
   * one month after the 120-day milestone, but it is an input rather than a
   * constant because it is a commercial decision, not arithmetic.
   */
  monthlyStartDate: Date;
  /**
   * Expected handover. Nullable because Foakh has not published one: the
   * completion instalment is still generated (the money is owed) but carries
   * no date until an administrator sets it, rather than a date we invented.
   */
  expectedHandoverDate: Date | null;
  shape?: typeof FOAKH_PLAN_SHAPE;
}

export interface PaymentPlanResult {
  installments: PlannedInstallment[];
  monthlyPoolAmount: Money;
  monthlyBaseAmount: Money;
  monthlyCount: number;
  /** Sums to `totalAmount` exactly — asserted before the plan is returned. */
  total: Money;
}

export function buildPaymentPlan(input: PaymentPlanInput): PaymentPlanResult {
  const shape = input.shape ?? FOAKH_PLAN_SHAPE;
  const total = toPaisa(input.totalAmount);

  if (total.lessThanOrEqualTo(0)) {
    throw new Error('Cannot build a payment plan for a non-positive sale price');
  }

  const downPayment = percentOf(total, shape.downPaymentPct);
  const second = percentOf(total, shape.secondPct);
  const third = percentOf(total, shape.thirdPct);
  const completion = percentOf(total, shape.completionPct);

  // The pool is the residual, not an independently rounded 60%. This is what
  // guarantees the schedule reconciles to the price to the last paisa.
  const monthlyPool = total.minus(downPayment).minus(second).minus(third).minus(completion);

  if (monthlyPool.lessThanOrEqualTo(0)) {
    throw new Error('Payment plan percentages leave nothing for the monthly pool');
  }

  const monthlyAmounts = splitEvenly(monthlyPool, shape.monthlyCount);
  const installments: PlannedInstallment[] = [];

  installments.push({
    sequence: 1,
    kind: 'DOWN_PAYMENT',
    label: 'Down payment',
    amount: downPayment,
    percentageOfTotal: percentageOf(downPayment, total),
    dueDate: input.bookingDate,
  });

  installments.push({
    sequence: 2,
    kind: 'MILESTONE_60D',
    label: `Second payment (${shape.secondMilestoneDays} days)`,
    amount: second,
    percentageOfTotal: percentageOf(second, total),
    dueDate: addDays(input.bookingDate, shape.secondMilestoneDays),
  });

  installments.push({
    sequence: 3,
    kind: 'MILESTONE_120D',
    label: `Third payment (${shape.thirdMilestoneDays} days)`,
    amount: third,
    percentageOfTotal: percentageOf(third, total),
    dueDate: addDays(input.bookingDate, shape.thirdMilestoneDays),
  });

  monthlyAmounts.forEach((amount, index) => {
    installments.push({
      sequence: 4 + index,
      kind: 'MONTHLY',
      label: `Monthly instalment ${index + 1} of ${shape.monthlyCount}`,
      amount,
      percentageOfTotal: percentageOf(amount, total),
      dueDate: addMonths(input.monthlyStartDate, index),
    });
  });

  installments.push({
    sequence: 4 + shape.monthlyCount,
    kind: 'COMPLETION',
    label: 'Completion / handover',
    amount: completion,
    percentageOfTotal: percentageOf(completion, total),
    // Falls back to the last monthly date only so the column is never null in
    // the database; the API reports `expectedHandoverDate: null` so the UI can
    // show "to be confirmed" rather than a date nobody agreed.
    dueDate: input.expectedHandoverDate ?? addMonths(input.monthlyStartDate, shape.monthlyCount),
  });

  const reconciled = sum(installments.map((entry) => entry.amount));
  if (!reconciled.equals(total)) {
    // Unreachable by construction. Kept because a schedule that silently fails
    // to reconcile is the single most damaging bug this module could ship.
    throw new Error(
      `Payment plan does not reconcile: schedule totals ${reconciled.toString()} against a sale price of ${total.toString()}`,
    );
  }

  return {
    installments,
    monthlyPoolAmount: monthlyPool,
    monthlyBaseAmount: monthlyAmounts[0] ?? new Prisma.Decimal(0),
    monthlyCount: shape.monthlyCount,
    total: reconciled,
  };
}

/** Share of the sale an amount represents, to six places. Display only. */
function percentageOf(amount: Money, total: Money): Money {
  return amount.dividedBy(total).times(100).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

export function addDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Adds calendar months, clamping the day of month.
 *
 * 31 January + 1 month is 28 February, not 3 March. A schedule that silently
 * skips into the next month drifts further every year and produces due dates
 * the client never agreed to.
 */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const targetDay = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDayOfMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();

  result.setUTCDate(Math.min(targetDay, lastDayOfMonth));
  return result;
}

/** The "≈1.36%" figure printed on schedules, derived from the real amount. */
export function approximateMonthlyPercentage(result: PaymentPlanResult, total: Money): string {
  return result.monthlyBaseAmount
    .dividedBy(total)
    .times(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    .toString();
}

export { money, floorPaisa };
