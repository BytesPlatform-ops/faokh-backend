import { getStore } from '@/data/mock-store';
import type { Payment } from './types';
import { IS_MOCK, apiFetch, simulateLatency } from './config';

export const paymentsService = {
  async list(bookingId?: string): Promise<Payment[]> {
    if (!IS_MOCK) {
      return apiFetch<Payment[]>(`/payments${bookingId ? `?bookingId=${bookingId}` : ''}`);
    }
    await simulateLatency();
    const payments = getStore().payments;
    return bookingId === undefined
      ? [...payments].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      : payments.filter((payment) => payment.bookingId === bookingId);
  },
};
