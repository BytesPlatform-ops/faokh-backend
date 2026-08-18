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

export function canViewCommission(user: SessionUser): boolean {
  // A broker sees their own commission; finance and management see all. Nobody
  // else does, and the client copy of an invoice never shows it at all.
  return user.roles.some((role) =>
    ['BROKER', 'FINANCE', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role),
  );
}

export function isBroker(user: SessionUser): boolean {
  return user.roles.includes('BROKER');
}
