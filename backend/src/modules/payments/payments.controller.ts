import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CRM_ROLES } from '../../common/access/crm-access';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators';
import { UuidParamDto } from '../../common/dto/param.dto';
import { RecordPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Roles(...CRM_ROLES)
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * The schedule with its receipts attached.
   *
   * Deliberately NOT `/bookings/:id/installments` — BookingsController already
   * serves that, and a second controller claiming the same path would simply
   * be shadowed by whichever module Nest registered first. This is the same
   * schedule plus the payments recorded against each line.
   */
  @Get('bookings/:id/payments')
  @ApiOperation({ summary: 'The payment schedule for a booking, with receipts' })
  schedule(@Param() params: UuidParamDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.payments.installmentsFor(params.id, user);
  }

  @Post('payments')
  @ApiOperation({ summary: 'Record money received against a booking' })
  record(@Body() body: RecordPaymentDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.payments.record(body, user);
  }
}
