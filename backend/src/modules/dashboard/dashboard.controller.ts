import { Controller, Get } from '@nestjs/common';
import { CommissionMilestoneStatus, InstallmentStatus, Prisma, UnitStatus } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CRM_ROLES, visibilityScope } from '../../common/access/crm-access';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators';
import { toPaisa } from '../../common/presenters';
import { PrismaService } from '../../database/prisma.service';
import { bookingInclude, presentBooking } from '../bookings/bookings.presenter';

@ApiTags('dashboard')
@Controller('dashboard')
@Roles(...CRM_ROLES)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Headline figures, scoped to the caller' })
  async metrics(@CurrentUser() user: AuthenticatedPrincipal) {
    const scope = visibilityScope(user);

    // Explicitly typed rather than inferred. Spreading a `{} | {...}` union into
    // a Prisma `where` widens it enough that a wrong relation name type-checks
    // and only fails at runtime — which is exactly what happened here once.
    const bookingWhere: Prisma.BookingWhereInput = scope === undefined ? {} : { brokerId: scope };

    // Instalments hang off a booking...
    const installmentWhere: Prisma.InstallmentWhereInput =
      scope === undefined ? {} : { booking: { brokerId: scope } };

    // ...but a commission milestone carries the broker directly, and reaches a
    // booking only through its plan. Same intent, different path.
    const milestoneWhere: Prisma.CommissionMilestoneWhereInput =
      scope === undefined ? {} : { brokerId: scope };

    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 86_400_000);

    // Every figure below is computed by the database.
    //
    // This endpoint used to load every booking with every relation — client,
    // broker, all forty-eight instalments, the commission plan, its milestones
    // and the invoices — purely to add some of them up in JavaScript, then
    // throw all but five away. Prisma issues a separate round trip per relation,
    // so the cost grew with both the number of bookings and the number of
    // relations, and against a database in another region each of those round
    // trips is most of a second.
    //
    // Aggregates keep this flat: the work no longer grows as Foakh sells more.
    const [
      availableUnits,
      bookedUnits,
      totalUnits,
      salesTotal,
      collectedTotal,
      dueSoon,
      overdue,
      commissionEarned,
      commissionPaid,
      recentBookings,
      clients,
      upcoming,
    ] = await Promise.all([
      this.prisma.unit.count({ where: { status: UnitStatus.AVAILABLE } }),
      this.prisma.unit.count({ where: { status: { in: [UnitStatus.BOOKED, UnitStatus.SOLD] } } }),
      this.prisma.unit.count(),

      this.prisma.booking.aggregate({ where: bookingWhere, _sum: { snapTotalPrice: true } }),

      this.prisma.installment.aggregate({
        where: { ...installmentWhere, status: InstallmentStatus.PAID },
        _sum: { paidAmount: true },
      }),

      this.prisma.installment.aggregate({
        where: {
          ...installmentWhere,
          status: InstallmentStatus.PENDING,
          dueDate: { gte: now, lte: soon },
        },
        _sum: { amount: true },
        _count: true,
      }),

      this.prisma.installment.aggregate({
        where: {
          ...installmentWhere,
          status: { not: InstallmentStatus.PAID },
          dueDate: { lt: now },
        },
        _sum: { amount: true },
        _count: true,
      }),

      // "Earned" is anything Finance has recognised. Reaching a date is not
      // enough — UPCOMING milestones are deliberately excluded.
      this.prisma.commissionMilestone.aggregate({
        where: {
          ...milestoneWhere,
          status: {
            in: [
              CommissionMilestoneStatus.ELIGIBLE,
              CommissionMilestoneStatus.APPROVED,
              CommissionMilestoneStatus.PAID,
            ],
          },
        },
        _sum: { amount: true },
      }),

      this.prisma.commissionMilestone.aggregate({
        where: { ...milestoneWhere, status: CommissionMilestoneStatus.PAID },
        _sum: { amount: true },
      }),

      // The only place the full booking shape is needed — and only five of them.
      this.prisma.booking.findMany({
        where: bookingWhere,
        orderBy: { bookingDate: 'desc' },
        take: 5,
        include: bookingInclude,
      }),

      this.prisma.client.findMany({
        where: scope === undefined ? {} : { brokerId: scope },
        orderBy: { lastActivityAt: 'desc' },
        take: 5,
        include: {
          salesAgent: {
            select: { salesAgentCode: true, user: { select: { displayName: true } } },
          },
          broker: { select: { brokerCode: true, fullName: true, agencyName: true } },
          documents: true,
          bookings: { select: { id: true } },
        },
      }),

      this.prisma.installment.findMany({
        where: {
          ...installmentWhere,
          OR: [
            { status: InstallmentStatus.PENDING, dueDate: { gte: now, lte: soon } },
            { status: { not: InstallmentStatus.PAID }, dueDate: { lt: now } },
          ],
        },
        orderBy: { dueDate: 'asc' },
        take: 6,
        include: {
          booking: { select: { bookingCode: true, client: { select: { fullLegalName: true } } } },
        },
      }),
    ]);

    const totalSalesPaisa = toPaisa(salesTotal._sum.snapTotalPrice) ?? 0;
    const collectedPaisa = toPaisa(collectedTotal._sum.paidAmount) ?? 0;
    const earnedPaisa = toPaisa(commissionEarned._sum.amount) ?? 0;
    const paidPaisa = toPaisa(commissionPaid._sum.amount) ?? 0;

    return {
      availableUnits,
      bookedUnits,
      totalUnits,
      totalSalesValuePaisa: totalSalesPaisa,
      collectedPaisa,
      outstandingPaisa: totalSalesPaisa - collectedPaisa,
      paymentsDueSoon: {
        count: dueSoon._count,
        amountPaisa: toPaisa(dueSoon._sum.amount) ?? 0,
      },
      overduePayments: {
        count: overdue._count,
        amountPaisa: toPaisa(overdue._sum.amount) ?? 0,
      },
      commissionEarnedPaisa: earnedPaisa,
      commissionPaidPaisa: paidPaisa,
      commissionOutstandingPaisa: earnedPaisa - paidPaisa,
      recentClients: clients.map((client) => ({
        id: client.id,
        clientCode: client.clientCode,
        fullLegalName: client.fullLegalName,
        cnic: client.cnic,
        mobile: client.mobile,
        nationality: client.nationality,
        salesAgentId: client.salesAgentId ?? '',
        salesAgentCode: client.salesAgent?.salesAgentCode ?? '',
        salesAgentName: client.salesAgent?.user.displayName ?? '',
        leadSource: client.leadSource,
        brokerId: client.brokerId ?? '',
        brokerCode: client.broker?.brokerCode ?? '',
        brokerName: client.broker?.agencyName ?? client.broker?.fullName ?? '',
        bookingStatus: client.bookings.length === 0 ? 'NONE' : 'BOOKED',
        lastActivityAt: client.lastActivityAt.toISOString(),
        createdAt: client.createdAt.toISOString(),
        documents: [],
      })),
      recentBookings: recentBookings.map(presentBooking),
      upcomingInstallments: upcoming.map((entry) => ({
        bookingCode: entry.booking.bookingCode,
        clientName: entry.booking.client.fullLegalName,
        label: entry.label,
        dueDate: entry.dueDate.toISOString(),
        amountPaisa: toPaisa(entry.amount) ?? 0,
        status: entry.status,
      })),
    };
  }
}
