import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/auth.decorators';
import type { AuthenticatedPrincipal } from './supabase-auth.service';
import { type AppEnv, InjectEnv } from '../../config/config.tokens';

@ApiTags('session')
@Controller()
export class AuthController {
  constructor(@InjectEnv() private readonly env: AppEnv) {}

  /**
   * The signed-in principal, shaped to the frontend's `SessionUser`.
   *
   * Exposed at both paths: `/session` is what this slice's specification names,
   * `/auth/me` is what the approved frontend already calls. Serving both costs
   * one decorator and avoids a needless frontend edit.
   */
  @Get(['session', 'auth/me'])
  @ApiOperation({ summary: 'The signed-in user, their roles and broker identity' })
  session(@CurrentUser() user: AuthenticatedPrincipal) {
    return {
      id: user.id,
      name: user.displayName,
      email: user.email,
      roles: user.roles,
      // The internal Foakh employee. An external referral broker is a separate
      // entity attached to a booking, never the authenticated user.
      salesAgent:
        user.salesAgent === null
          ? undefined
          : {
              id: user.salesAgent.id,
              salesAgentCode: user.salesAgent.salesAgentCode,
              name: user.displayName,
              email: user.email,
              status: 'ACTIVE' as const,
            },
      features: {
        realUnitReservation: this.env.featureRealUnitReservation,
      },
    };
  }
}
