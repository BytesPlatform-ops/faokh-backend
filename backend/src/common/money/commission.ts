import { Prisma } from '@prisma/client';

import { type Money, percentOf, sum, toPaisa } from './money';
import { addDays } from './payment-plan';

/**
 * Broker commission: 4% of the booked sale price, released in four 1%
 * milestones.
 *
 *   1%  on the down payment      booking date
 *   1%  at 60 days               booking date + 60 days
 *   1%  at 120 days              booking date + 120 days
 *   1%  at one year              booking date + 365 days
 *
 * On PKR 18,800,000 that is PKR 752,000 total and PKR 188,000 per milestone.
 *
 * Two deliberate properties:
 *
 *  * The four milestones sum to the total **exactly**. The last absorbs any
 *    rounding residual, so a broker is never short a rupee and the ledger
 *    never carries an unexplainable remainder.
 *
 *  * Milestones are generated as UPCOMING. Reaching the date does not make a
 *    milestone payable — that is a finance decision, taken after checking the
 *    client actually paid. A schedule that pays itself is how commission goes
 *    out on a booking that was cancelled the week before.
 */

export const FOAKH_COMMISSION_SHAPE = {
  totalRatePct: 4,
  milestones: [
    { sequence: 1, label: 'Down payment milestone', percentOfSale: 1, offsetDays: 0 },
    { sequence: 2, label: '60-day milestone', percentOfSale: 1, offsetDays: 60 },
    { sequence: 3, label: '120-day milestone', percentOfSale: 1, offsetDays: 120 },
    { sequence: 4, label: 'One-year milestone', percentOfSale: 1, offsetDays: 365 },
  ],
} as const;

export interface PlannedCommissionMilestone {
  sequence: number;
  label: string;
  percentageOfSale: Money;
  amount: Money;
  expectedDate: Date;
}

export interface CommissionPlanResult {
  ratePct: Money;
  basisAmount: Money;
  totalAmount: Money;
  milestones: PlannedCommissionMilestone[];
}

export interface CommissionPlanInput {
  /** The booked sale price — the snapshot on the booking, not a live price. */
  salePrice: Money;
  bookingDate: Date;
  /** Broker's agreed rate. Defaults to the Foakh standard 4%. */
  ratePct?: Prisma.Decimal.Value;
  shape?: typeof FOAKH_COMMISSION_SHAPE;
}

export function buildCommissionPlan(input: CommissionPlanInput): CommissionPlanResult {
  const shape = input.shape ?? FOAKH_COMMISSION_SHAPE;
  const basisAmount = toPaisa(input.salePrice);
  const ratePct = new Prisma.Decimal(input.ratePct ?? shape.totalRatePct);

  if (basisAmount.lessThanOrEqualTo(0)) {
    throw new Error('Cannot build a commission plan for a non-positive sale price');
  }
  if (ratePct.lessThan(0) || ratePct.greaterThan(100)) {
    throw new Error('Commission rate must be between 0 and 100 percent');
  }

  const totalAmount = percentOf(basisAmount, ratePct);

  // Each milestone's share *of the commission*, so a non-standard broker rate
  // still splits into four equal parts that reconcile to their own total.
  const configuredTotalPct = shape.milestones.reduce(
    (running, entry) => running.plus(entry.percentOfSale),
    new Prisma.Decimal(0),
  );

  const milestones: PlannedCommissionMilestone[] = [];
  let allocated = new Prisma.Decimal(0);

  shape.milestones.forEach((entry, index) => {
    const isLast = index === shape.milestones.length - 1;
    const share = new Prisma.Decimal(entry.percentOfSale).dividedBy(configuredTotalPct);

    // The final milestone takes the residual so the four always sum to the
    // commission total exactly.
    const amount = isLast ? totalAmount.minus(allocated) : toPaisa(totalAmount.times(share));
    allocated = allocated.plus(amount);

    milestones.push({
      sequence: entry.sequence,
      label: entry.label,
      percentageOfSale: ratePct.times(share).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
      amount,
      expectedDate: addDays(input.bookingDate, entry.offsetDays),
    });
  });

  const reconciled = sum(milestones.map((entry) => entry.amount));
  if (!reconciled.equals(totalAmount)) {
    throw new Error(
      `Commission milestones total ${reconciled.toString()} against a commission of ${totalAmount.toString()}`,
    );
  }

  return { ratePct, basisAmount, totalAmount, milestones };
}
