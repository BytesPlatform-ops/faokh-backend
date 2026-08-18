import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors/app.exception';
import { SupabaseAuthService } from './supabase-auth.service';

/**
 * Registered globally, so every route requires a valid Supabase access token
 * unless it opts out with `@Public()`.
 *
 * Defaulting to closed means a new CRM endpoint added in a hurry is protected
 * by omission rather than exposed by it — the failure mode of the opposite
 * convention is a public endpoint nobody noticed.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: SupabaseAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization');

    if (header === undefined || !header.toLowerCase().startsWith('bearer ')) {
      throw AppException.unauthorized('Sign in to continue.');
    }

    request.user = await this.auth.verify(header.slice(7).trim());
    return true;
  }
}
