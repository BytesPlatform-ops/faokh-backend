import type { Broker, CreateBrokerInput } from './types';
import { IS_MOCK, apiFetch, simulateLatency } from './config';

/**
 * External referral brokers.
 *
 * A broker is a channel partner, not a user — they do not log in. A Sales Agent
 * records one when a client was introduced by them, and that attachment is what
 * later causes a 4% commission schedule to exist. A direct sale has no broker
 * and no commission.
 *
 * Brokers are visible to every Sales Agent rather than scoped per-agent: the
 * same firm often introduces clients to more than one colleague, and hiding
 * them would produce duplicate records for one partner.
 */
export const brokersService = {
  async list(search?: string): Promise<Broker[]> {
    if (!IS_MOCK) {
      const query = search === undefined || search === '' ? '' : `?search=${encodeURIComponent(search)}`;
      const response = await apiFetch<{ data: Broker[] }>(`/brokers${query}`);
      return response.data;
    }

    await simulateLatency(200);
    return [];
  },

  async getById(brokerId: string): Promise<Broker | null> {
    if (!IS_MOCK) return apiFetch<Broker>(`/brokers/${brokerId}`);
    await simulateLatency(150);
    return null;
  },

  /** Records a broker and allocates its `BRK-YYYY-######` server-side. */
  async create(input: CreateBrokerInput): Promise<Broker> {
    if (!IS_MOCK) {
      return apiFetch<Broker>('/brokers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    }

    await simulateLatency(400);
    throw new Error('Brokers require the API. Set NEXT_PUBLIC_DATA_MODE=api.');
  },
};
