import { getStore } from '@/data/mock-store';
import type { CommissionSummaryRow } from './types';
import { IS_MOCK, apiFetch, simulateLatency } from './config';

export const commissionsService = {
  async summary(brokerId?: string): Promise<CommissionSummaryRow[]> {
    if (!IS_MOCK) {
      return apiFetch<CommissionSummaryRow[]>(
        `/commissions${brokerId ? `?brokerId=${brokerId}` : ''}`,
      );
    }

    await simulateLatency();

    return getStore()
      .bookings.filter((booking) => brokerId === undefined || booking.brokerId === brokerId)
      .map((booking) => {
        const milestones = booking.commissionMilestones;

        // "Earned" is anything past the upcoming stage — the milestone has been
        // reached. "Paid" is money that has actually left. The gap between them
        // is what a broker chases, so it is a first-class figure.
        const earned = milestones
          .filter((entry) => ['ELIGIBLE', 'APPROVED', 'PAID'].includes(entry.status))
          .reduce((sum, entry) => sum + entry.amountPaisa, 0);
        const paid = milestones
          .filter((entry) => entry.status === 'PAID')
          .reduce((sum, entry) => sum + entry.amountPaisa, 0);

        const next = milestones.find((entry) =>
          ['UPCOMING', 'ELIGIBLE', 'APPROVED'].includes(entry.status),
        );

        return {
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          clientName: booking.clientName,
          unitNumber: booking.snapshot.unitNumber,
          salePricePaisa: booking.snapshot.totalPricePaisa,
          totalCommissionPaisa: booking.commissionTotalPaisa,
          earnedPaisa: earned,
          paidPaisa: paid,
          outstandingPaisa: earned - paid,
          nextDate: next?.expectedDate ?? null,
          nextStatus: next?.status ?? null,
          milestones,
        };
      });
  },
};
