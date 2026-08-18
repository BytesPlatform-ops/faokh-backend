import { getStore } from '@/data/mock-store';
import type { DashboardMetrics } from './types';
import { IS_MOCK, apiFetch, simulateLatency } from './config';

export const dashboardService = {
  async metrics(brokerId?: string): Promise<DashboardMetrics> {
    if (!IS_MOCK) {
      return apiFetch<DashboardMetrics>(`/dashboard${brokerId ? `?brokerId=${brokerId}` : ''}`);
    }

    await simulateLatency(300);
    const store = getStore();

    // Inventory counts are project-wide even for a broker: a broker needs to
    // know what is left to sell, not only what they personally sold.
    const availableUnits = store.units.filter((unit) => unit.status === 'AVAILABLE').length;
    const bookedUnits = store.units.filter((unit) =>
      ['BOOKED', 'SOLD'].includes(unit.status),
    ).length;

    // Financial figures are broker-scoped.
    const bookings = store.bookings.filter(
      (booking) => brokerId === undefined || booking.brokerId === brokerId,
    );

    const totalSales = bookings.reduce((sum, b) => sum + b.snapshot.totalPricePaisa, 0);
    const collected = bookings.reduce((sum, b) => sum + b.paidPaisa, 0);

    const allInstallments = bookings.flatMap((booking) =>
      booking.installments.map((entry) => ({ booking, entry })),
    );

    const now = Date.now();
    const soon = now + 30 * 86_400_000;

    const dueSoon = allInstallments.filter(
      ({ entry }) =>
        entry.status === 'PENDING' &&
        entry.dueDate !== null &&
        new Date(entry.dueDate).getTime() >= now &&
        new Date(entry.dueDate).getTime() <= soon,
    );
    const overdue = allInstallments.filter(({ entry }) => entry.status === 'OVERDUE');

    const milestones = bookings.flatMap((booking) => booking.commissionMilestones);
    const commissionEarned = milestones
      .filter((entry) => ['ELIGIBLE', 'APPROVED', 'PAID'].includes(entry.status))
      .reduce((sum, entry) => sum + entry.amountPaisa, 0);
    const commissionPaid = milestones
      .filter((entry) => entry.status === 'PAID')
      .reduce((sum, entry) => sum + entry.amountPaisa, 0);

    return {
      availableUnits,
      bookedUnits,
      totalUnits: store.units.length,
      totalSalesValuePaisa: totalSales,
      collectedPaisa: collected,
      outstandingPaisa: totalSales - collected,
      paymentsDueSoon: {
        count: dueSoon.length,
        amountPaisa: dueSoon.reduce((sum, { entry }) => sum + entry.amountPaisa, 0),
      },
      overduePayments: {
        count: overdue.length,
        amountPaisa: overdue.reduce((sum, { entry }) => sum + entry.amountPaisa, 0),
      },
      commissionEarnedPaisa: commissionEarned,
      commissionPaidPaisa: commissionPaid,
      commissionOutstandingPaisa: commissionEarned - commissionPaid,
      recentClients: store.clients
        .filter((client) => brokerId === undefined || client.brokerId === brokerId)
        .slice(0, 5),
      recentBookings: bookings.slice(0, 5),
      upcomingInstallments: [...dueSoon, ...overdue]
        .sort((a, b) => (a.entry.dueDate ?? '').localeCompare(b.entry.dueDate ?? ''))
        .slice(0, 6)
        .map(({ booking, entry }) => ({
          bookingCode: booking.bookingCode,
          clientName: booking.clientName,
          label: entry.label,
          dueDate: entry.dueDate,
          amountPaisa: entry.amountPaisa,
          status: entry.status,
        })),
    };
  },
};
