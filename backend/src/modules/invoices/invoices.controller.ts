import { Controller, Get, Param, Res } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CRM_ROLES, assertRole } from '../../common/access/crm-access';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators';
import { UuidParamDto } from '../../common/dto/param.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@Controller('bookings/:id')
@Roles(...CRM_ROLES)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get('invoice')
  @ApiOperation({ summary: 'The invoice record for a booking, created on first request' })
  invoice(@Param() params: UuidParamDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.invoices.forBooking(params.id, user);
  }

  /**
   * The client's copy — property, price and the full payment schedule.
   *
   * Contains no commission figure. That is enforced by the data never being
   * loaded for this render, so there is nothing in the file to uncover.
   */
  @Get('invoice/client-pdf')
  @ApiOperation({ summary: 'A4 landscape client invoice (no commission)' })
  async clientPdf(
    @Param() params: UuidParamDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.invoices.renderPdf(params.id, 'CLIENT', user);
    this.send(response, buffer, filename);
  }

  /**
   * The broker's copy — everything on the client copy plus the 4% schedule.
   *
   * Restricted beyond the ownership check the service already applies: a
   * booking-operations user may legitimately reach a booking without being
   * entitled to see what the broker earns on it.
   */
  @Get('invoice/broker-pdf')
  @ApiOperation({ summary: 'A4 landscape broker invoice (includes commission)' })
  async brokerPdf(
    @Param() params: UuidParamDto,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Res() response: Response,
  ) {
    assertRole(
      user,
      RoleName.SALES_AGENT,
      RoleName.FINANCE,
      RoleName.MANAGER,
      RoleName.ADMIN,
      RoleName.SUPER_ADMIN,
    );

    const { buffer, filename } = await this.invoices.renderPdf(params.id, 'BROKER', user);
    this.send(response, buffer, filename);
  }

  private send(response: Response, buffer: Buffer, filename: string): void {
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', buffer.length);
    response.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    // These documents identify a real person and their finances; no shared
    // cache should ever hold a copy.
    response.setHeader('Cache-Control', 'private, no-store');
    response.end(buffer);
  }
}
