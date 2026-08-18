import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { RoleName } from '@prisma/client';
import type { Request } from 'express';

/**
 * The authenticated principal attached to a request by SupabaseAuthGuard.
 *
 * Declared here rather than in the auth module so that Express's type
 * augmentation and the guards can share it without a circular import.
 */
export interface AuthenticatedPrincipal {
  /** CRM user id. */
  id: string;
  /** Supabase Auth `sub` — the identity link, never displayed to users. */
  supabaseUserId: string;
  email: string;
  displayName: string;
  roles: RoleName[];
  /**
   * Present only for Sales Agents — the internal Foakh employee, and the sole
   * source of booking attribution. External brokers do not log in.
   */
  salesAgent: { id: string; salesAgentCode: string } | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedPrincipal;
    requestId?: string;
  }
}

export const IS_PUBLIC_KEY = 'foakh:isPublic';
export const ROLES_KEY = 'foakh:roles';

/**
 * Opts a route out of authentication.
 *
 * The guard is global and everything is protected by default, so a new CRM
 * endpoint is private unless someone deliberately marks it public. Forgetting
 * a decorator locks a route down; it never exposes one.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Restricts a route to the listed roles — coarse, route-level access.
 *
 * Record-level checks ("is this *my* client") cannot live in a guard, because
 * only the service knows about ownership. See `crm-access.ts`.
 */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (property: keyof AuthenticatedPrincipal | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (user === undefined) {
      // Reached only if a route uses @CurrentUser() while marked @Public() —
      // a wiring mistake, so it fails loudly rather than passing undefined
      // into a service that would treat it as "no owner".
      throw new UnauthorizedException('No authenticated user on this request.');
    }

    return property === undefined ? user : user[property];
  },
);
