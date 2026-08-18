import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import type { Request } from 'express';

import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/auth.decorators';
import { AppException } from '../errors/app.exception';

/**
 * Route-level role enforcement.
 *
 * This is the coarse half of authorisation — "may this role reach this
 * endpoint". The fine half ("is this *my* lead") cannot live in a guard,
 * because only the service knows about ownership; see the `assertCanAccess`
 * helpers in the CRM services.
 *
 * SUPER_ADMIN is not special-cased here. Every route that an administrator
 * should reach lists SUPER_ADMIN explicitly, so the permission model is
 * readable from the controller rather than from a hidden bypass.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required === undefined || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    // SessionAuthGuard runs first and would already have rejected this, but a
    // guard must not assume its own ordering.
    if (user === undefined) {
      throw AppException.unauthorized('Sign in to continue.');
    }

    const permitted = user.roles.some((role) => required.includes(role));
    if (!permitted) {
      throw AppException.forbidden('You do not have access to this resource.');
    }

    return true;
  }
}
