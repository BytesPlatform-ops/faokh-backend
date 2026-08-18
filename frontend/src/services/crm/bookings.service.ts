import { findClass, findPrice, findType } from '@/data/master-data';
import { BASE_DATE, getStore } from '@/data/mock-store';
import { buildCommissionPlan, buildPaymentPlan, toPaisa } from '@/lib/money';
import type {
  Booking,
  ClassCode,
  CommissionMilestone,
  CreateBookingInput,
  Installment,
  Paginated,
  Unit,
} from './types';
import { IS_MOCK, apiFetch, simulateLatency } from './config';
import { inventoryService } from './inventory.service';

export interface BookingPreview {
  unit: Unit;
  classCode: ClassCode;
  areaSqFt: number;
  pricePerSqFt: number;
  totalPaisa: number;
  installments: Installment[];
  commissionMilestones: CommissionMilestone[];
  commissionTotalPaisa: number;
  approximateMonthlyPct: number;
  monthlyBasePaisa: number;
  /** Blocks confirmation when the price has not been ratified by Foakh. */
  blockedReason: string | null;
}

export const bookingsService = {
  async list(query: { salesAgentId?: string; page?: number } = {}): Promise<Paginated<Booking>> {
    if (!IS_MOCK) return apiFetch<Paginated<Booking>>('/bookings');

    await simulateLatency();
    const filtered = getStore().bookings.filter(
      (booking) => query.salesAgentId === undefined || booking.salesAgentId === query.salesAgentId,
    );

    return {
      data: [...filtered].sort((a, b) => b.bookingDate.localeCompare(a.bookingDate)),
      page: 1,
      pageSize: filtered.length || 1,
      total: filtered.length,
      totalPages: 1,
    };
  },

  async getById(bookingId: string): Promise<Booking | null> {
    if (!IS_MOCK) return apiFetch<Booking>(`/bookings/${bookingId}`);
    await simulateLatency(150);
    return getStore().bookings.find((booking) => booking.id === bookingId) ?? null;
  },

  /**
   * Computes the full financial picture for a prospective booking.
   *
   * Used by the wizard's pricing and payment-plan steps, and by the unit detail
   * page's plan preview. Runs entirely through the same money functions the
   * backend uses, so what the broker shows the client is what the server will
   * later persist.
   */
  async preview(input: {
    unit: Unit;
    classCode: ClassCode;
    bookingDate: Date;
  }): Promise<BookingPreview> {
    const type = findType(input.unit.unitTypeCode);
    const price = findPrice(input.unit.unitTypeCode, input.classCode);

    if (price === undefined || price.price === null) {
      return {
        unit: input.unit,
        classCode: input.classCode,
        areaSqFt: type.areaSqFt,
        pricePerSqFt: 0,
        totalPaisa: 0,
        installments: [],
        commissionMilestones: [],
        commissionTotalPaisa: 0,
        approximateMonthlyPct: 0,
        monthlyBasePaisa: 0,
        blockedReason: `No price is published for ${type.name} in ${findClass(input.classCode).name}.`,
      };
    }

    const plan = buildPaymentPlan({
      totalRupees: price.price,
      bookingDate: input.bookingDate,
      expectedHandoverDate: null,
    });
    const commission = buildCommissionPlan({
      salePriceRupees: price.price,
      bookingDate: input.bookingDate,
    });

    return {
      unit: input.unit,
      classCode: input.classCode,
      areaSqFt: type.areaSqFt,
      pricePerSqFt: price.pricePerSqFt ?? 0,
      totalPaisa: toPaisa(price.price),
      installments: plan.installments.map((entry) => ({
        id: `preview-${entry.sequence}`,
        sequence: entry.sequence,
        kind: entry.kind,
        label: entry.label,
        percentageOfTotal: entry.percentageOfTotal,
        amountPaisa: entry.amountPaisa,
        paidPaisa: 0,
        dueDate: entry.dueDate?.toISOString() ?? null,
        status: 'PENDING',
      })),
      commissionMilestones: commission.milestones.map((entry) => ({
        id: `preview-cms-${entry.sequence}`,
        sequence: entry.sequence,
        label: entry.label,
        percentageOfSale: entry.percentageOfSale,
        amountPaisa: entry.amountPaisa,
        expectedDate: entry.expectedDate.toISOString(),
        status: 'UPCOMING',
      })),
      commissionTotalPaisa: commission.totalPaisa,
      approximateMonthlyPct: plan.approximateMonthlyPct,
      monthlyBasePaisa: plan.monthlyBasePaisa,
      // The Type D Elegant/Sonder guard, mirrored from the backend: an
      // unratified figure must never become a signed contract. It lifts once
      // somebody ratifies the price — the block exists to force a decision, not
      // to make the unit permanently unsellable.
      blockedReason:
        price.needsConfirmation &&
        !inventoryService.isPriceConfirmed(input.unit.unitTypeCode, input.classCode)
          ? `The price for ${type.name} ${findClass(input.classCode).name} is provisional. ` +
            'Confirm it below before this unit can be sold.'
          : null,
    };
  },

  /**
   * Confirms a booking.
   *
   * Only through the API. Creating one means allocating a gapless booking code,
   * locking the unit row, freezing a price snapshot, generating a 48-line
   * schedule and — when a broker introduced the client — a commission plan, all
   * inside one transaction. None of that can be honestly simulated in a browser
   * tab, and a mock that appeared to succeed would be the most damaging kind of
   * fake: one that looks like a sale.
   */
  async create(input: CreateBookingInput): Promise<Booking> {
    if (IS_MOCK) {
      throw new Error(
        'Confirming a booking requires the API. Set NEXT_PUBLIC_DATA_MODE=api and start the ' +
          'NestJS backend.',
      );
    }

    return apiFetch<Booking>('/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  },


  /** Today, in the project's timezone, for wizard defaults. */
  defaultBookingDate(): Date {
    return IS_MOCK ? new Date(BASE_DATE) : new Date();
  },
};
