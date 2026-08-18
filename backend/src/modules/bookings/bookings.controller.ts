import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CRM_ROLES, assertOwns, visibilityScope } from '../../common/access/crm-access';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators';
import { UuidParamDto } from '../../common/dto/param.dto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../database/prisma.service';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, ListBookingsDto } from './bookings.dto';
import { bookingInclude, presentBooking } from './bookings.presenter';

@ApiTags('bookings')
@Controller('bookings')
@Roles(...CRM_ROLES)
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List bookings, scoped to the caller' })
  async list(@Query() query: ListBookingsDto, @CurrentUser() user: AuthenticatedPrincipal) {
    const scope = visibilityScope(user);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = scope === undefined ? {} : { salesAgentId: scope };

    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        // A booking carries five relations, one of which is forty-eight
        // instalments. Loading them separately meant six network round trips
        // for a single page of results.
        relationLoadStrategy: 'join',
        where,
        orderBy: { bookingDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: bookingInclude,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: rows.map(presentBooking),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One booking, with schedule and commission' })
  async get(@Param() params: UuidParamDto, @CurrentUser() user: AuthenticatedPrincipal) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: params.id },
      include: bookingInclude,
    });
    if (booking === null) throw AppException.notFound('That booking could not be found.');
    assertOwns(user, booking);
    return presentBooking(booking);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a booking',
    description:
      'One serializable transaction: locks the unit, freezes the price, snapshots the ' +
      'specification, generates the 47-line schedule and the four commission milestones, ' +
      'and marks the unit booked. Two brokers racing for the same unit produce exactly ' +
      'one booking; the loser receives 409 UNIT_NOT_AVAILABLE.',
  })
  @ApiResponse({ status: 409, description: 'UNIT_NOT_AVAILABLE' })
  @ApiResponse({ status: 422, description: 'PRICE_NEEDS_CONFIRMATION / BROKER_REQUIRED' })
  async create(@Body() dto: CreateBookingDto, @CurrentUser() user: AuthenticatedPrincipal) {
    // The frontend speaks class *codes*; the service takes an id.
    const apartmentClass = await this.prisma.apartmentClass.findUnique({
      where: { code: dto.classCode },
      select: { id: true },
    });
    if (apartmentClass === null) {
      throw AppException.notFound(`Unknown residence class "${dto.classCode}".`);
    }

    const staffRoles: RoleName[] = [RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER];
    const isStaff = user.roles.some((role) => staffRoles.includes(role));

    // A broker may never send an override; only staff can reassign attribution.
    if (dto.overrideBrokerId !== undefined && !isStaff) {
      throw AppException.forbidden(
        'Only a manager may attribute a booking to another broker.',
        ErrorCode.FORBIDDEN,
      );
    }

    const booking = await this.bookings.create(
      {
        clientId: dto.clientId,
        unitId: dto.unitId,
        classId: apartmentClass.id,
        bookingDate: dto.bookingDate ?? new Date(),
        ...(dto.leadSource !== undefined ? { leadSource: dto.leadSource } : {}),
        ...(dto.brokerId !== undefined ? { brokerId: dto.brokerId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      {
        userId: user.id,
        salesAgentId: user.salesAgent?.id ?? null,
        isStaff,
        ...(dto.overrideBrokerId !== undefined ? { overrideBrokerId: dto.overrideBrokerId } : {}),
        ...(dto.overrideReason !== undefined ? { overrideReason: dto.overrideReason } : {}),
      },
    );

    const full = await this.prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: bookingInclude,
    });
    return presentBooking(full);
  }

  @Get(':id/installments')
  @ApiOperation({ summary: 'The client payment schedule for a booking' })
  async installments(@Param() params: UuidParamDto, @CurrentUser() user: AuthenticatedPrincipal) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: params.id },
      include: bookingInclude,
    });
    if (booking === null) throw AppException.notFound('That booking could not be found.');
    assertOwns(user, booking);
    return presentBooking(booking).installments;
  }

  @Get(':id/commissions')
  @ApiOperation({ summary: 'The broker commission schedule for a booking' })
  async commissions(@Param() params: UuidParamDto, @CurrentUser() user: AuthenticatedPrincipal) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: params.id },
      include: bookingInclude,
    });
    if (booking === null) throw AppException.notFound('That booking could not be found.');
    assertOwns(user, booking);

    const presented = presentBooking(booking);
    return {
      ratePct: presented.commissionRatePct,
      totalPaisa: presented.commissionTotalPaisa,
      milestones: presented.commissionMilestones,
    };
  }
}
