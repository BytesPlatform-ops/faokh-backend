import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCommissionPlan,
  buildPaymentPlan,
  pricePerSqFt,
  splitEvenly,
  toPaisa,
} from './money.ts';

/**
 * Parity with the backend money engine.
 *
 * The frontend duplicates the payment-plan and commission arithmetic so the CRM
 * can show a schedule before anything is persisted. These assertions are the
 * same figures `backend/test/unit/money.spec.ts` asserts — if the two ever
 * disagree, a broker is showing a client a schedule the server will not honour.
 *
 * Run with:  node --test src/lib/money.test.ts
 */

const BOOKING = new Date(Date.UTC(2026, 0, 15));
const MONTHLY_START = new Date(Date.UTC(2026, 5, 15));

test('per-square-foot rates match the Foakh price list', () => {
  assert.equal(pricePerSqFt(18_800_000, 1102).toFixed(2), '17059.89');
  assert.equal(pricePerSqFt(21_000_000, 1102).toFixed(2), '19056.26');
  assert.equal(pricePerSqFt(22_000_000, 1102).toFixed(2), '19963.70');
  assert.equal(pricePerSqFt(64_000_000, 3200), 20_000);
  // The corrected Type D figures land on clean rates, which is the evidence
  // the supplied values were out by a factor of ten.
  assert.equal(pricePerSqFt(8_816_000, 464), 19_000);
  assert.equal(pricePerSqFt(9_280_000, 464), 20_000);
});

test('splitEvenly always reconciles to the pool', () => {
  for (const [pool, parts] of [[1_128_000_000, 44], [100, 3], [1, 7]] as const) {
    const parts_ = splitEvenly(pool, parts);
    assert.equal(parts_.reduce((a, b) => a + b, 0), pool);
  }
});

test('payment plan sums to exactly 100% of the sale price', () => {
  for (const total of [18_800_000, 21_000_000, 14_500_000, 11_600_000, 7_900_000, 64_000_000, 3_333_333.33]) {
    const plan = buildPaymentPlan({ totalRupees: total, bookingDate: BOOKING, monthlyStartDate: MONTHLY_START });
    const sum = plan.installments.reduce((acc, entry) => acc + entry.amountPaisa, 0);
    assert.equal(sum, toPaisa(total), `schedule for ${total} does not reconcile`);
  }
});

test('Type A Classic splits exactly as specified', () => {
  const plan = buildPaymentPlan({
    totalRupees: 18_800_000,
    bookingDate: BOOKING,
    monthlyStartDate: MONTHLY_START,
  });

  assert.equal(plan.installments.length, 3 + 44 + 1);
  assert.equal(plan.monthlyPoolPaisa, toPaisa(11_280_000));
  assert.equal(plan.monthlyBasePaisa, toPaisa(256_363.63));

  const monthly = plan.installments.filter((e) => e.kind === 'MONTHLY');
  assert.equal(monthly.length, 44);
  assert.equal(monthly.at(-1)?.amountPaisa, toPaisa(256_363.91));
  assert.equal(plan.installments[0]?.amountPaisa, toPaisa(1_880_000));
});

test('the monthly instalment is NOT 1.36% of the sale', () => {
  // 1.36% x 44 = 59.84%, short by PKR 30,080 on this apartment.
  const naive = Math.round(18_800_000 * 1.36) * 44; // in paisa terms via *100/100
  const plan = buildPaymentPlan({ totalRupees: 18_800_000, bookingDate: BOOKING, monthlyStartDate: MONTHLY_START });
  assert.equal(naive, toPaisa(11_249_920));
  assert.equal(plan.monthlyPoolPaisa - naive, toPaisa(30_080));
});

test('completion instalment carries no invented handover date', () => {
  const plan = buildPaymentPlan({ totalRupees: 18_800_000, bookingDate: BOOKING, monthlyStartDate: MONTHLY_START });
  const completion = plan.installments.at(-1);
  assert.equal(completion?.kind, 'COMPLETION');
  assert.equal(completion?.dueDate, null);
});

test('commission is 4% in four equal 1% milestones', () => {
  const plan = buildCommissionPlan({ salePriceRupees: 18_800_000, bookingDate: BOOKING });
  assert.equal(plan.totalPaisa, toPaisa(752_000));
  assert.equal(plan.milestones.length, 4);
  for (const milestone of plan.milestones) {
    assert.equal(milestone.amountPaisa, toPaisa(188_000));
  }
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  assert.equal(iso(plan.milestones[0]!.expectedDate), '2026-01-15');
  assert.equal(iso(plan.milestones[1]!.expectedDate), '2026-03-16');
  assert.equal(iso(plan.milestones[2]!.expectedDate), '2026-05-15');
  assert.equal(iso(plan.milestones[3]!.expectedDate), '2027-01-15');
});

test('commission milestones always reconcile to the total', () => {
  for (const price of [18_800_000, 13_640_000, 64_000_000, 999_999.99]) {
    const plan = buildCommissionPlan({ salePriceRupees: price, bookingDate: BOOKING });
    const sum = plan.milestones.reduce((acc, m) => acc + m.amountPaisa, 0);
    assert.equal(sum, plan.totalPaisa);
  }
});
