import { Injectable } from '@nestjs/common';
import { BrokerStatus, CommissionMilestoneStatus, Prisma } from '@prisma/client';

import type { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors/app.exception';
import { IdService } from '../../common/ids/id.service';
import { toPaisa } from '../../common/presenters';
import { PrismaService } from '../../database/prisma.service';
import type { CreateBrokerDto, ListBrokersDto, UpdateBrokerDto } from './brokers.dto';

/**
 * External referral brokers — channel partners, not staff.
 *
 * A broker does not log in. A Sales Agent records one when a client was
 * introduced by them, and the broker then earns the 4% on that client's
 * bookings. This is deliberately a different entity from `SalesAgent`: earlier
 * versions of this system used one table for both, which made every internal
 * employee look like an outside partner earning referral commission.
 *
 * Brokers are visible to every Sales Agent, not scoped per-agent — a referral
 * partner introduced by one colleague is frequently served by another, and
 * hiding them would produce duplicate broker records for the same firm.
 */
@Injectable()
export class BrokersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async list(query: ListBrokersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const search = query.search?.trim();

    const where: Prisma.BrokerWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' as const } },
              { agencyName: { contains: search, mode: 'insensitive' as const } },
              { brokerCode: { contains: search, mode: 'insensitive' as const } },
              { mobile: { contains: search.replace(/\D/g, '') } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.broker.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: brokerInclude,
      }),
      this.prisma.broker.count({ where }),
    ]);

    return { data: rows.map(presentBroker), total, page, pageSize };
  }

  async getById(id: string) {
    const broker = await this.prisma.broker.findUnique({ where: { id }, include: brokerInclude });
    if (broker === null) throw AppException.notFound('That broker could not be found.');
    return presentBroker(broker);
  }

  /**
   * Records a new broker and allocates its `BRK-YYYY-######`.
   *
   * The creating Sales Agent is taken from the session, so the CRM can always
   * say who first brought a partner into the book.
   */
  async create(dto: CreateBrokerDto, user: AuthenticatedPrincipal) {
    const mobile = normaliseMobile(dto.mobile);

    // A duplicate broker splits one partner's commission across two records and
    // is painful to merge later, so the mobile is treated as the identity.
    const existing = await this.prisma.broker.findFirst({ where: { mobile } });
    if (existing !== null) {
      throw AppException.conflict(
        'DUPLICATE_RESOURCE',
        `${existing.brokerCode} already exists with that mobile number.`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const brokerCode = await this.ids.next(tx, 'BRK');
      return tx.broker.create({
        data: {
          brokerCode,
          fullName: dto.fullName.trim(),
          mobile,
          agencyName: dto.agencyName?.trim() ?? null,
          cnic: dto.cnic?.replace(/\D/g, '') ?? null,
          whatsapp: dto.whatsapp === undefined ? null : normaliseMobile(dto.whatsapp),
          email: dto.email?.trim() ?? null,
          addressLine: dto.addressLine?.trim() ?? null,
          city: dto.city?.trim() ?? null,
          ntn: dto.ntn?.trim() ?? null,
          notes: dto.notes?.trim() ?? null,
          status: BrokerStatus.ACTIVE,
          createdBySalesAgentId: user.salesAgent?.id ?? null,
        },
        include: brokerInclude,
      });
    });

    return presentBroker(created);
  }

  async update(id: string, dto: UpdateBrokerDto) {
    const broker = await this.prisma.broker.findUnique({ where: { id } });
    if (broker === null) throw AppException.notFound('That broker could not be found.');

    const updated = await this.prisma.broker.update({
      where: { id },
      data: {
        fullName: dto.fullName.trim(),
        mobile: normaliseMobile(dto.mobile),
        agencyName: dto.agencyName?.trim() ?? null,
        cnic: dto.cnic?.replace(/\D/g, '') ?? null,
        whatsapp: dto.whatsapp === undefined ? null : normaliseMobile(dto.whatsapp),
        email: dto.email?.trim() ?? null,
        addressLine: dto.addressLine?.trim() ?? null,
        city: dto.city?.trim() ?? null,
        ntn: dto.ntn?.trim() ?? null,
        notes: dto.notes?.trim() ?? null,
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: brokerInclude,
    });

    return presentBroker(updated);
  }
}

const brokerInclude = {
  createdBySalesAgent: {
    select: { salesAgentCode: true, user: { select: { displayName: true } } },
  },
  clients: { select: { id: true } },
  bookings: { select: { id: true, snapTotalPrice: true } },
  commissionPlans: { select: { totalAmount: true } },
  milestones: { select: { amount: true, status: true } },
} satisfies Prisma.BrokerInclude;

type BrokerWithRelations = Prisma.BrokerGetPayload<{ include: typeof brokerInclude }>;

function presentBroker(broker: BrokerWithRelations) {
  const salesValuePaisa = broker.bookings.reduce(
    (sum, booking) => sum + toPaisa(booking.snapTotalPrice),
    0,
  );
  const commissionTotalPaisa = broker.commissionPlans.reduce(
    (sum, plan) => sum + toPaisa(plan.totalAmount),
    0,
  );

  // Paid is what Finance has actually released. Everything else is outstanding,
  // including milestones whose date has passed — reaching a date earns nothing.
  const commissionPaidPaisa = broker.milestones
    .filter((entry) => entry.status === CommissionMilestoneStatus.PAID)
    .reduce((sum, entry) => sum + toPaisa(entry.amount), 0);

  return {
    id: broker.id,
    brokerCode: broker.brokerCode,
    fullName: broker.fullName,
    agencyName: broker.agencyName ?? undefined,
    cnic: broker.cnic ?? undefined,
    mobile: broker.mobile,
    whatsapp: broker.whatsapp ?? undefined,
    email: broker.email ?? undefined,
    addressLine: broker.addressLine ?? undefined,
    city: broker.city ?? undefined,
    ntn: broker.ntn ?? undefined,
    notes: broker.notes ?? undefined,
    commissionRatePct: Number(broker.commissionRatePct),
    status: broker.status,
    isActive: broker.isActive,

    createdBySalesAgentCode: broker.createdBySalesAgent?.salesAgentCode ?? undefined,
    createdBySalesAgentName: broker.createdBySalesAgent?.user.displayName ?? undefined,
    createdAt: broker.createdAt.toISOString(),
    updatedAt: broker.updatedAt.toISOString(),

    referredClientCount: broker.clients.length,
    referredBookingCount: broker.bookings.length,
    salesValuePaisa,
    commissionTotalPaisa,
    commissionPaidPaisa,
    commissionOutstandingPaisa: commissionTotalPaisa - commissionPaidPaisa,
  };
}

/** `03001234567` and `+923001234567` are the same broker. */
function normaliseMobile(value: string): string {
  const digits = value.replace(/\D/g, '');
  const local = digits.startsWith('92') ? digits.slice(2) : digits.replace(/^0/, '');
  return `+92${local}`;
}
