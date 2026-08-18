import { RoleName } from '@prisma/client';

import type { AuthenticatedPrincipal } from '../decorators/auth.decorators';
import { AppException } from '../errors/app.exception';

/** Roles that see the whole book of business rather than only their own. */
const FULL_VISIBILITY: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.FINANCE,
];

export function hasFullVisibility(user: AuthenticatedPrincipal): boolean {
  return user.roles.some((role) => FULL_VISIBILITY.includes(role));
}

/**
 * The Sales Agent's own-records filter.
 *
 * Returns undefined for managers, finance and admins (no restriction) and the
 * agent's id otherwise. Every list endpoint passes this through, so an agent
 * listing clients sees their own — enforced on the server, never by omitting a
 * filter control in the UI.
 *
 * Note this scopes by *Sales Agent*, not by broker. An external broker is a
 * referral partner attached to a booking, not an owner of records, and does
 * not log in at all.
 */
export function visibilityScope(user: AuthenticatedPrincipal): string | undefined {
  if (hasFullVisibility(user)) return undefined;
  if (user.salesAgent === null) {
    // A non-privileged user with no agent record can own nothing. Denying is
    // safer than falling through to "no filter", which would show everything.
    throw AppException.forbidden('Your account is not linked to an active Sales Agent.');
  }
  return user.salesAgent.id;
}

/**
 * Record-level authorisation, applied after the record is loaded.
 *
 * Guards can only answer "may this role reach this route"; they cannot know
 * that client 123 belongs to another broker. This is what stops a broker
 * reading a colleague's book by guessing an id.
 */
export function assertOwns(
  user: AuthenticatedPrincipal,
  record: { salesAgentId?: string | null },
): void {
  if (hasFullVisibility(user)) return;
  if (user.salesAgent !== null && record.salesAgentId === user.salesAgent.id) return;
  // Deliberately not "this belongs to Imran Sheikh": confirming that a record
  // exists is itself a small disclosure.
  throw AppException.forbidden('You do not have access to this record.');
}

export function assertRole(user: AuthenticatedPrincipal, ...allowed: RoleName[]): void {
  if (!user.roles.some((role) => allowed.includes(role))) {
    throw AppException.forbidden('Your role does not permit this action.');
  }
}

/** Every role that may reach the CRM at all. */
export const CRM_ROLES: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.FINANCE,
  RoleName.SALES_AGENT,
];
