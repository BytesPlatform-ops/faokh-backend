import { getStore } from '@/data/mock-store';
import type { Client, CreateClientInput, Paginated } from './types';
import { IS_MOCK, apiFetch, simulateLatency } from './config';

export interface ClientListQuery {
  search?: string;
  page?: number;
  pageSize?: number;
  /** Brokers are scoped to their own book; managers see everything. */
  salesAgentId?: string;
}

export const clientsService = {
  async list(query: ClientListQuery = {}): Promise<Paginated<Client>> {
    if (!IS_MOCK) {
      const params = new URLSearchParams();
      if (query.search) params.set('search', query.search);
      if (query.page) params.set('page', String(query.page));
      return apiFetch<Paginated<Client>>(`/clients?${params.toString()}`);
    }

    await simulateLatency();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const search = query.search?.trim().toLowerCase();

    const filtered = getStore().clients.filter((client) => {
      if (query.salesAgentId !== undefined && client.salesAgentId !== query.salesAgentId) {
        return false;
      }
      if (search === undefined || search.length === 0) return true;

      // Searching by phone or CNIC must work regardless of how the user types
      // the separators, so both sides are reduced to digits.
      const digits = search.replace(/\D/g, '');
      return (
        client.fullLegalName.toLowerCase().includes(search) ||
        client.clientCode.toLowerCase().includes(search) ||
        (digits.length >= 4 &&
          (client.cnic.includes(digits) || client.mobile.replace(/\D/g, '').includes(digits)))
      );
    });

    const start = (page - 1) * pageSize;
    return {
      data: filtered.slice(start, start + pageSize),
      page,
      pageSize,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    };
  },

  async getById(clientId: string): Promise<Client | null> {
    if (!IS_MOCK) return apiFetch<Client>(`/clients/${clientId}`);
    await simulateLatency(150);
    return getStore().clients.find((client) => client.id === clientId) ?? null;
  },

  async create(input: CreateClientInput): Promise<Client> {
    if (!IS_MOCK) {
      // `documents` holds browser File objects, which JSON.stringify flattens
      // to `{}` — the API would reject them and, worse, a silently-accepted
      // empty object would look like a successful upload. Files need a
      // multipart request to the document endpoint, which is a separate step
      // after the client exists and has an id to attach them to.
      const payload = { ...input };
      delete payload.documents;

      return apiFetch<Client>('/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    throw new Error(
      'Creating a client requires the API. Set NEXT_PUBLIC_DATA_MODE=api and start the ' +
        'NestJS backend — the Client ID and the Sales Agent attribution are allocated there.',
    );
  },

};
