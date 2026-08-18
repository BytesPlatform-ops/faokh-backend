import { MOCK_SESSION } from '@/data/mock-store';
import type { SessionUser } from './types';
import { IS_MOCK, apiFetch, simulateLatency } from './config';

/**
 * The signed-in principal.
 *
 * In mock mode this is always a broker, so every screen exercises broker-scoped
 * visibility rather than the permissive admin path. Role checks in the UI are
 * a usability affordance only — the server remains the authority once `api`
 * mode is live.
 */
export const sessionService = {
  async current(): Promise<SessionUser> {
    if (IS_MOCK) {
      await simulateLatency(120);
      return MOCK_SESSION;
    }
    return apiFetch<SessionUser>('/auth/me');
  },
};

/**
 * Whether this user may see broker commission figures.
 *
 * A Sales Agent needs to, because they answer the broker's questions about
 * payout timing. The figure is still absent from the client copy of an invoice
 * entirely — this governs CRM screens, not documents.
 */
export function canViewCommission(user: SessionUser): boolean {
  return user.roles.some((role) =>
    ['SALES_AGENT', 'FINANCE', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role),
  );
}

export function isSalesAgent(user: SessionUser): boolean {
  return user.roles.includes('SALES_AGENT');
}
