import { Prisma } from '@prisma/client';

import { buildCommissionPlan } from '../../src/common/money/commission';
import { formatPkr, percentOf, pricePerSqFt, splitEvenly, sum } from '../../src/common/money/money';
import { buildPaymentPlan } from '../../src/common/money/payment-plan';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** The Foakh price matrix, exactly as supplied. */
const MATRIX = [
  { type: 'A', area: 1102, classic: 18_800_000, elegant: 21_000_000, sonder: 22_000_000 },
  { type: 'B', area: 860, classic: 14_500_000, elegant: 16_300_000, sonder: 17_200_000 },
  { type: 'C', area: 682, classic: 11_600_000, elegant: 12_950_000, sonder: 13_640_000 },
] as const;

describe('pricing matrix and per-square-foot rates', () => {
  it('derives the documented Type A rates', () => {
    // The three figures quoted in the specification, to two decimal places.
    expect(pricePerSqFt(D(18_800_000), D(1102)).toFixed(2)).toBe('17059.89');
    expect(pricePerSqFt(D(21_000_000), D(1102)).toFixed(2)).toBe('19056.26');
    expect(pricePerSqFt(D(22_000_000), D(1102)).toFixed(2)).toBe('19963.70');
  });

  it('derives an exact PKR 20,000/sq ft for the penthouse', () => {
    expect(pricePerSqFt(D(64_000_000), D(3200)).toString()).toBe('20000');
  });

  it('reproduces every supplied price from area × rate', () => {
    for (const row of MATRIX) {
      for (const price of [row.classic, row.elegant, row.sonder]) {
        const rate = pricePerSqFt(D(price), D(row.area));
        // Rate is a derived display figure; the total is authoritative. Rate ×
        // area must land within a rupee of the agreed price.
        const reconstructed = rate.times(D(row.area));
        expect(reconstructed.minus(D(price)).abs().lessThan(1)).toBe(true);
      }
    }
  });

  it('rejects a zero area rather than dividing by it', () => {
    expect(() => pricePerSqFt(D(1_000_000), D(0))).toThrow(/greater than zero/);
  });
});

describe('splitEvenly', () => {
  it('always reconciles to the pool', () => {
    for (const [pool, parts] of [
      [11_280_000, 44],
      [1, 3],
      [100, 7],
      [7_899_999.99, 44],
    ] as const) {
      const amounts = splitEvenly(D(pool), parts);
      expect(amounts).toHaveLength(parts);
      expect(sum(amounts).equals(D(pool))).toBe(true);
    }
  });

  it('puts the residual on the final part', () => {
    const amounts = splitEvenly(D(100), 3);
    expect(amounts[0]?.toFixed(2)).toBe('33.33');
    expect(amounts[1]?.toFixed(2)).toBe('33.33');
    expect(amounts[2]?.toFixed(2)).toBe('33.34');
  });

  it('refuses a non-positive part count', () => {
    expect(() => splitEvenly(D(100), 0)).toThrow();
    expect(() => splitEvenly(D(100), 2.5)).toThrow();
  });
});

describe('client payment plan', () => {
  const bookingDate = new Date(Date.UTC(2026, 0, 15));
  const monthlyStartDate = new Date(Date.UTC(2026, 5, 15));
  const handover = new Date(Date.UTC(2030, 5, 30));

  function plan(total: number) {
    return buildPaymentPlan({
      totalAmount: D(total),
      bookingDate,
      monthlyStartDate,
      expectedHandoverDate: handover,
    });
  }

  it('produces 47 instalments: 3 milestones + 44 monthly + completion', () => {
    const result = plan(18_800_000);
    expect(result.installments).toHaveLength(3 + 44 + 1);
    expect(result.installments.filter((i) => i.kind === 'MONTHLY')).toHaveLength(44);
  });

  it('sums to exactly 100% of the sale price', () => {
    // The single most important assertion in the system.
    for (const total of [18_800_000, 21_000_000, 14_500_000, 11_600_000, 7_900_000, 64_000_000]) {
      const result = plan(total);
      expect(sum(result.installments.map((i) => i.amount)).equals(D(total))).toBe(true);
    }
  });

  it('reconciles on prices that do not divide cleanly', () => {
    // Guards the residual logic against a future price with awkward decimals.
    for (const total of [10_000_001, 3_333_333.33, 999_999.99, 1]) {
      const result = plan(total);
      expect(sum(result.installments.map((i) => i.amount)).equals(D(total))).toBe(true);
    }
  });

  it('splits the Type A Classic price exactly as specified', () => {
    const result = plan(18_800_000);
    const byKind = (kind: string) => result.installments.filter((i) => i.kind === kind);

    expect(byKind('DOWN_PAYMENT')[0]?.amount.toFixed(2)).toBe('1880000.00');
    expect(byKind('MILESTONE_60D')[0]?.amount.toFixed(2)).toBe('1880000.00');
    expect(byKind('MILESTONE_120D')[0]?.amount.toFixed(2)).toBe('1880000.00');
    expect(byKind('COMPLETION')[0]?.amount.toFixed(2)).toBe('1880000.00');

    // 60% of 18,800,000 = 11,280,000, divided by 44.
    expect(result.monthlyPoolAmount.toFixed(2)).toBe('11280000.00');
    expect(result.monthlyBaseAmount.toFixed(2)).toBe('256363.63');

    const monthly = byKind('MONTHLY');
    expect(sum(monthly.map((i) => i.amount)).toFixed(2)).toBe('11280000.00');
    // The final monthly absorbs the residual.
    expect(monthly[43]?.amount.toFixed(2)).toBe('256363.91');
  });

  it('does NOT build the monthly amount from 1.36%', () => {
    // 1.36% × 44 = 59.84%, which would under-collect by 0.16% — PKR 30,080 on
    // this apartment. This asserts the pool-first calculation.
    const result = plan(18_800_000);
    const naive = percentOf(D(18_800_000), 1.36).times(44);
    expect(naive.toFixed(2)).toBe('11249920.00');
    // Exactly PKR 30,080 short — 0.16% of the sale, unbilled forever.
    expect(D(11_280_000).minus(naive).toFixed(2)).toBe('30080.00');
    expect(
      sum(result.installments.filter((i) => i.kind === 'MONTHLY').map((i) => i.amount)).greaterThan(
        naive,
      ),
    ).toBe(true);
  });

  it('generates the documented due dates', () => {
    const result = plan(18_800_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    expect(iso(result.installments[0]!.dueDate)).toBe('2026-01-15');
    expect(iso(result.installments[1]!.dueDate)).toBe('2026-03-16'); // +60 days
    expect(iso(result.installments[2]!.dueDate)).toBe('2026-05-15'); // +120 days

    const monthly = result.installments.filter((i) => i.kind === 'MONTHLY');
    expect(iso(monthly[0]!.dueDate)).toBe('2026-06-15');
    expect(iso(monthly[1]!.dueDate)).toBe('2026-07-15');
    // 44 monthly instalments run three years and eight months.
    expect(iso(monthly[43]!.dueDate)).toBe('2030-01-15');

    expect(iso(result.installments.at(-1)!.dueDate)).toBe('2030-06-30');
  });

  it('clamps month-end dates instead of rolling into the next month', () => {
    const result = buildPaymentPlan({
      totalAmount: D(18_800_000),
      bookingDate,
      monthlyStartDate: new Date(Date.UTC(2026, 0, 31)),
      expectedHandoverDate: handover,
    });
    const monthly = result.installments.filter((i) => i.kind === 'MONTHLY');
    // 31 January + 1 month must be 28 February, not 3 March.
    expect(monthly[1]!.dueDate.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(monthly[2]!.dueDate.toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  it('still schedules the completion instalment when no handover date is set', () => {
    const result = buildPaymentPlan({
      totalAmount: D(18_800_000),
      bookingDate,
      monthlyStartDate,
      expectedHandoverDate: null,
    });
    const completion = result.installments.at(-1)!;
    expect(completion.kind).toBe('COMPLETION');
    expect(completion.amount.toFixed(2)).toBe('1880000.00');
    expect(sum(result.installments.map((i) => i.amount)).toFixed(2)).toBe('18800000.00');
  });

  it('refuses a non-positive price', () => {
    expect(() => plan(0)).toThrow(/non-positive/);
  });
});

describe('broker commission', () => {
  const bookingDate = new Date(Date.UTC(2026, 0, 15));

  it('is 4% of the sale, in four equal 1% milestones', () => {
    const result = buildCommissionPlan({ salePrice: D(18_800_000), bookingDate });

    expect(result.totalAmount.toFixed(2)).toBe('752000.00');
    expect(result.milestones).toHaveLength(4);
    for (const milestone of result.milestones) {
      expect(milestone.amount.toFixed(2)).toBe('188000.00');
      expect(milestone.percentageOfSale.toFixed(2)).toBe('1.00');
    }
  });

  it('always reconciles to the commission total', () => {
    for (const price of [18_800_000, 21_000_000, 13_640_000, 64_000_000, 7_900_000, 999_999.99]) {
      const result = buildCommissionPlan({ salePrice: D(price), bookingDate });
      expect(sum(result.milestones.map((m) => m.amount)).equals(result.totalAmount)).toBe(true);
    }
  });

  it('generates the documented milestone dates', () => {
    const result = buildCommissionPlan({ salePrice: D(18_800_000), bookingDate });
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    expect(iso(result.milestones[0]!.expectedDate)).toBe('2026-01-15'); // booking
    expect(iso(result.milestones[1]!.expectedDate)).toBe('2026-03-16'); // +60
    expect(iso(result.milestones[2]!.expectedDate)).toBe('2026-05-15'); // +120
    expect(iso(result.milestones[3]!.expectedDate)).toBe('2027-01-15'); // +1 year
  });

  it('supports a non-standard broker rate and still reconciles', () => {
    const result = buildCommissionPlan({
      salePrice: D(18_800_000),
      bookingDate,
      ratePct: 2.5,
    });
    expect(result.totalAmount.toFixed(2)).toBe('470000.00');
    expect(sum(result.milestones.map((m) => m.amount)).toFixed(2)).toBe('470000.00');
  });

  it('rejects an out-of-range rate', () => {
    expect(() => buildCommissionPlan({ salePrice: D(1), bookingDate, ratePct: 120 })).toThrow();
    expect(() => buildCommissionPlan({ salePrice: D(1), bookingDate, ratePct: -1 })).toThrow();
  });
});

describe('formatting', () => {
  it('formats PKR for print', () => {
    expect(formatPkr(D(18_800_000))).toBe('PKR 18,800,000.00');
    expect(formatPkr(D(752_000), { withSymbol: false })).toBe('752,000.00');
  });
});
