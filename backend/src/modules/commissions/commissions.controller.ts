import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CRM_ROLES, visibilityScope } from '../../common/access/crm-access';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators';
import { toPaisa } from '../../common/presenters';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('commissions')
@Controller('commissions')
@Roles(...CRM_ROLES)
export class CommissionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Commission summary per booking',
    description:
      '"Earned" counts milestones that have been reached; "paid" counts money that has ' +
      'actually left. The gap between them is what a broker chases, so both are returned ' +
      'rather than one blended figure.',
  })
  async summary(@CurrentUser() user: AuthenticatedPrincipal) {
    const scope = visibilityScope(user);

    const plans = await this.prisma.commissionPlan.findMany({
      // Scoped through the booking: a Sales Agent sees the broker commissions
      // arising from their own sales. They are staff and earn none of it.
      where: scope === undefined ? {} : { booking: { salesAgentId: scope } },
      include: {
        milestones: { orderBy: { sequence: 'asc' } },
        booking: {
          select: {
            id: true,
            bookingCode: true,
            snapUnitNumber: true,
            snapTotalPrice: true,
            client: { select: { fullLegalName: true } },
          },
        },
      },
      orderBy: { generatedAt: 'desc' },
    });

    return plans.map((plan) => {
      const earned = plan.milestones
        .filter((entry) => ['ELIGIBLE', 'APPROVED', 'PAID'].includes(entry.status))
        .reduce((sum, entry) => sum + toPaisa(entry.amount), 0);
      const paid = plan.milestones
        .filter((entry) => entry.status === 'PAID')
        .reduce((sum, entry) => sum + toPaisa(entry.amount), 0);
      const next = plan.milestones.find((entry) =>
        ['UPCOMING', 'ELIGIBLE', 'APPROVED'].includes(entry.status),
      );

      return {
        bookingId: plan.booking.id,
        bookingCode: plan.booking.bookingCode,
        clientName: plan.booking.client.fullLegalName,
        unitNumber: plan.booking.snapUnitNumber,
        salePricePaisa: toPaisa(plan.booking.snapTotalPrice),
        totalCommissionPaisa: toPaisa(plan.totalAmount),
        earnedPaisa: earned,
        paidPaisa: paid,
        outstandingPaisa: earned - paid,
        nextDate: next?.expectedDate.toISOString() ?? null,
        nextStatus: next?.status ?? null,
        milestones: plan.milestones.map((entry) => ({
          id: entry.id,
          sequence: entry.sequence,
          label: entry.label,
          percentageOfSale: Number(entry.percentageOfSale),
          amountPaisa: toPaisa(entry.amount),
          expectedDate: entry.expectedDate.toISOString(),
          status: entry.status,
        })),
      };
    });
  }
}
