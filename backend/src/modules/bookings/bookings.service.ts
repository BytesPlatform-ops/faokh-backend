import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  CommissionMilestoneStatus,
  InstallmentStatus,
  Prisma,
  UnitStatus,
} from '@prisma/client';

import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { IdService } from '../../common/ids/id.service';
import { buildCommissionPlan } from '../../common/money/commission';
import { pricePerSqFt } from '../../common/money/money';
import { buildPaymentPlan } from '../../common/money/payment-plan';
import { RESIDENCE_CATEGORY_NAMES } from '../../common/residence';
import { PrismaService, type PrismaTransaction } from '../../database/prisma.service';

export interface CreateBookingInput {
  clientId: string;
  unitId: string;
  /** The class being sold. May differ from the unit's currently-marked class. */
  classId: string;
  bookingDate: Date;
  notes?: string;
}

export interface BookingActor {
  userId: string;
  /**
   * The acting Sales Agent. Ownership is taken from here and nowhere else —
   * never from the request body, which the caller controls.
   */
  salesAgentId: string | null;
  isStaff: boolean;
  /** Staff may process a booking on an agent's behalf, with a reason. */
  overrideSalesAgentId?: string;
  overrideReason?: string;
}

/**
 * Creating a booking is the one operation in this system that must be exactly
 * right, so the whole thing happens in a single serializable transaction:
 *
 *   lock the unit row  →  verify it is available
 *     →  resolve and freeze the price (unit type × class)
 *     →  snapshot every specification onto the booking
 *     →  generate the 47-line payment schedule
 *     →  generate the 4-milestone commission plan
 *     →  mark the unit BOOKED
 *
 * Either a broker gets a complete, internally consistent booking, or nothing is
 * written at all. There is no state in which a unit is marked sold with no
 * payment plan behind it.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async create(input: CreateBookingInput, actor: BookingActor) {
    // Attribution is derived from the authenticated principal. A broker cannot
    // pass a broker id and credit someone else; only staff can, and only with
    // a reason that is written to the audit log.
    const attribution = this.resolveAttribution(actor);

    return this.prisma.transactionWithRetry(async (tx) => {
      // --- 1. Claim the unit ------------------------------------------------
      // The lock comes first. Reading availability without it lets two brokers
      // both see the same unit free and both proceed — the double-booking bug.
      const unit = await this.lockUnit(tx, input.unitId);

      if (unit.status !== UnitStatus.AVAILABLE) {
        throw AppException.conflict(
          ErrorCode.UNIT_NOT_AVAILABLE,
          `Unit ${unit.unitNumber} is ${unit.status.toLowerCase().replace('_', ' ')} and cannot be booked.`,
        );
      }

      const [client, salesAgent, unitType, apartmentClass] = await Promise.all([
        tx.client.findUnique({ where: { id: input.clientId } }),
        tx.salesAgent.findUnique({ where: { id: attribution.salesAgentId } }),
        tx.unitType.findUnique({ where: { id: unit.unitTypeId } }),
        tx.apartmentClass.findUnique({ where: { id: input.classId } }),
      ]);

      if (client === null) throw AppException.notFound('That client could not be found.');
      if (unitType === null) throw AppException.notFound('That apartment type could not be found.');
      if (apartmentClass === null) throw AppException.notFound('That class could not be found.');
      if (salesAgent === null || !salesAgent.isActive) {
        throw AppException.unprocessable(
          ErrorCode.BROKER_NOT_ACTIVE,
          'The processing Sales Agent is not active.',
        );
      }

      // The referral broker is inherited from the client, because that is where
      // the introduction was recorded. Null is the ordinary case — a direct
      // sale — and it is precisely what stops a commission schedule existing.
      const broker =
        client.brokerId === null
          ? null
          : await tx.broker.findUnique({ where: { id: client.brokerId } });

      if (client.brokerId !== null && (broker === null || !broker.isActive)) {
        throw AppException.unprocessable(
          ErrorCode.BROKER_NOT_ACTIVE,
          'The referring broker on this client is not active.',
        );
      }

      // --- 2. Freeze the price ---------------------------------------------
      const pricing = await tx.pricingConfiguration.findFirst({
        where: { unitTypeId: unitType.id, classId: apartmentClass.id, effectiveTo: null },
      });

      if (pricing === null) {
        throw AppException.unprocessable(
          ErrorCode.PRICE_NOT_CONFIGURED,
          `No price is configured for ${unitType.name} in ${apartmentClass.name}.`,
        );
      }

      // The Type D Elegant/Sonder guard. An unratified figure must never become
      // a signed contract, so the sale is blocked rather than priced from a
      // number nobody at Foakh has confirmed.
      if (pricing.needsConfirmation) {
        throw AppException.unprocessable(
          ErrorCode.PRICE_NEEDS_CONFIRMATION,
          `The price for ${unitType.name} ${apartmentClass.name} is provisional and must be ` +
            'confirmed by an administrator before it can be sold.',
        );
      }

      const totalPrice = unit.listPriceOverride ?? pricing.price;
      const ratePerSqFt = unit.listPriceOverride
        ? pricePerSqFt(unit.listPriceOverride, unitType.areaSqFt)
        : pricing.pricePerSqFt;

      const project = await tx.project.findFirst();
      const bookingCode = await this.ids.next(tx, 'BKG', input.bookingDate);

      // --- 3. The booking, with everything snapshotted ---------------------
      const booking = await tx.booking.create({
        data: {
          bookingCode,
          clientId: client.id,
          salesAgentId: salesAgent.id,
          brokerId: broker?.id ?? null,
          leadSource: client.leadSource,
          unitId: unit.id,
          status: BookingStatus.CONFIRMED,
          bookingDate: input.bookingDate,
          pricingConfigurationId: pricing.id,

          snapUnitNumber: unit.unitNumber,
          snapBuildingName: unit.buildingName,
          snapFloorLevel: unit.floorLevel,
          snapUnitTypeCode: unitType.code,
          snapUnitTypeName: unitType.name,
          snapClassCode: apartmentClass.code,
          snapClassName: apartmentClass.name,
          snapResidenceCategory: unitType.residenceCategory,
          snapResidenceCategoryName: RESIDENCE_CATEGORY_NAMES[unitType.residenceCategory],
          snapBedrooms: unitType.bedrooms,
          snapBathrooms: unitType.bathrooms,
          snapAttachedBathrooms: unitType.attachedBathrooms,
          snapHasBalcony: unitType.hasBalcony,
          snapParkingSpaces: unit.parkingSpaces,
          snapAreaSqFt: unitType.areaSqFt,
          snapPricePerSqFt: ratePerSqFt,
          snapTotalPrice: totalPrice,
          currency: project?.currency ?? 'PKR',

          expectedHandoverDate: project?.expectedHandoverDate ?? null,
          attributionOverrideReason: attribution.overrideReason,
          notes: input.notes ?? null,
          createdByUserId: actor.userId,
        },
      });

      // --- 4. The client payment schedule ----------------------------------
      const monthlyStartDate = await this.resolveMonthlyStartDate(tx, input.bookingDate);

      const plan = buildPaymentPlan({
        totalAmount: totalPrice,
        bookingDate: input.bookingDate,
        monthlyStartDate,
        expectedHandoverDate: project?.expectedHandoverDate ?? null,
      });

      const paymentPlan = await tx.paymentPlan.create({
        data: {
          bookingId: booking.id,
          totalAmount: totalPrice,
          currency: booking.currency,
          downPaymentPct: new Prisma.Decimal(10),
          secondPct: new Prisma.Decimal(10),
          thirdPct: new Prisma.Decimal(10),
          monthlyPoolPct: new Prisma.Decimal(60),
          completionPct: new Prisma.Decimal(10),
          monthlyCount: plan.monthlyCount,
          monthlyPoolAmount: plan.monthlyPoolAmount,
          monthlyBaseAmount: plan.monthlyBaseAmount,
          monthlyStartDate,
          expectedHandoverDate: project?.expectedHandoverDate ?? null,
        },
      });

      await tx.installment.createMany({
        data: plan.installments.map((entry) => ({
          paymentPlanId: paymentPlan.id,
          bookingId: booking.id,
          sequence: entry.sequence,
          kind: entry.kind,
          label: entry.label,
          percentageOfTotal: entry.percentageOfTotal,
          amount: entry.amount,
          currency: booking.currency,
          dueDate: entry.dueDate,
          status: InstallmentStatus.PENDING,
        })),
      });

      // --- 5. The broker commission plan -------------------------------------
      //
      // Only when an external broker introduced the client. A direct sale
      // generates no commission record at all — not a zero-valued one — because
      // there is nobody to pay and a zero row would still show up in payout
      // reports as something awaiting approval.
      //
      // The internal Sales Agent is never paid this 4%. They are staff.
      if (broker !== null) {
        const commission = buildCommissionPlan({
          salePrice: totalPrice,
          bookingDate: input.bookingDate,
          ratePct: broker.commissionRatePct,
        });

        const commissionPlan = await tx.commissionPlan.create({
          data: {
            bookingId: booking.id,
            brokerId: broker.id,
            ratePct: commission.ratePct,
            basisAmount: commission.basisAmount,
            totalAmount: commission.totalAmount,
            currency: booking.currency,
          },
        });

        await tx.commissionMilestone.createMany({
          data: commission.milestones.map((entry) => ({
            commissionPlanId: commissionPlan.id,
            brokerId: broker.id,
            sequence: entry.sequence,
            label: entry.label,
            percentageOfSale: entry.percentageOfSale,
            amount: entry.amount,
            currency: booking.currency,
            expectedDate: entry.expectedDate,
            // UPCOMING, never PAID. Finance releases each milestone deliberately.
            status: CommissionMilestoneStatus.UPCOMING,
          })),
        });
      }

      // --- 6. Inventory ------------------------------------------------------
      await tx.unit.update({
        where: { id: unit.id },
        data: { status: UnitStatus.BOOKED, classId: apartmentClass.id },
      });

      await tx.auditLog.create({
        data: {
          action: 'booking.created',
          entityType: 'Booking',
          entityId: booking.id,
          actorUserId: actor.userId,
          after: {
            bookingCode,
            unitNumber: unit.unitNumber,
            unitType: unitType.code,
            class: apartmentClass.code,
            totalPrice: totalPrice.toString(),
            // Both parties recorded distinctly: who sold it, and who introduced
            // the client. A later audit needs to tell those apart.
            salesAgentCode: salesAgent.salesAgentCode,
            brokerCode: broker?.brokerCode ?? null,
            leadSource: client.leadSource,
          },
          reason: attribution.overrideReason ?? null,
        },
      });

      return booking;
    });
  }

  /**
   * An agent's own id always wins. Staff may process on an agent's behalf, but
   * only with a reason — an unexplained ownership change is indistinguishable
   * from a sale being quietly reassigned when it is reviewed six months later.
   */
  private resolveAttribution(actor: BookingActor): {
    salesAgentId: string;
    overrideReason: string | null;
  } {
    if (actor.salesAgentId !== null) {
      return { salesAgentId: actor.salesAgentId, overrideReason: null };
    }

    if (!actor.isStaff || actor.overrideSalesAgentId === undefined) {
      throw AppException.unprocessable(
        ErrorCode.BROKER_REQUIRED,
        'A booking must be processed by a Sales Agent.',
      );
    }

    if (actor.overrideReason === undefined || actor.overrideReason.trim().length < 5) {
      throw AppException.unprocessable(
        ErrorCode.ATTRIBUTION_REASON_REQUIRED,
        'Processing a booking on a Sales Agent’s behalf requires a reason.',
      );
    }

    return {
      salesAgentId: actor.overrideSalesAgentId,
      overrideReason: actor.overrideReason.trim(),
    };
  }

  /** `SELECT ... FOR UPDATE`. Nothing about the unit is read before this. */
  private async lockUnit(tx: PrismaTransaction, unitId: string) {
    const rows = await tx.$queryRaw<
      {
        id: string;
        unit_number: string;
        status: UnitStatus;
        unit_type_id: string;
        class_id: string;
        parking_spaces: number;
        list_price_override: Prisma.Decimal | null;
        building_name: string;
        floor_level: number;
      }[]
    >`
      SELECT u.id, u.unit_number, u.status, u.unit_type_id, u.class_id,
             u.parking_spaces, u.list_price_override,
             b.name AS building_name, f.level AS floor_level
      FROM units u
      JOIN buildings b ON b.id = u.building_id
      JOIN floors f ON f.id = u.floor_id
      WHERE u.id = ${unitId}::uuid
      FOR UPDATE OF u
    `;

    const row = rows[0];
    if (row === undefined) {
      throw AppException.notFound('That unit could not be found.');
    }

    return {
      id: row.id,
      unitNumber: row.unit_number,
      status: row.status,
      unitTypeId: row.unit_type_id,
      classId: row.class_id,
      parkingSpaces: row.parking_spaces,
      listPriceOverride: row.list_price_override,
      buildingName: row.building_name,
      floorLevel: row.floor_level,
    };
  }

  /** Configurable; defaults to one month after the 120-day milestone. */
  private async resolveMonthlyStartDate(tx: PrismaTransaction, bookingDate: Date): Promise<Date> {
    const setting = await tx.appSetting.findUnique({
      where: { key: 'payment_plan.monthly_start_offset_days' },
    });
    const offset = typeof setting?.value === 'number' ? setting.value : 150;

    const start = new Date(bookingDate.getTime());
    start.setUTCDate(start.getUTCDate() + offset);
    return start;
  }

  /** Cancelling releases the unit so it can be sold again, and voids the
   *  commission — a cancelled sale must not keep paying out. */
  async cancel(bookingId: string, actorUserId: string, reason: string) {
    return this.prisma.transactionWithRetry(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (booking === null) throw AppException.notFound('That booking could not be found.');

      if (booking.status !== BookingStatus.CONFIRMED) {
        throw AppException.conflict(
          ErrorCode.BOOKING_NOT_MODIFIABLE,
          `This booking is ${booking.status.toLowerCase()} and cannot be cancelled.`,
        );
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason,
          cancelledByUserId: actorUserId,
        },
      });

      await tx.unit.update({
        where: { id: booking.unitId },
        data: { status: UnitStatus.AVAILABLE },
      });

      // Milestones already paid are left alone — that money has gone. Only
      // unpaid ones are cancelled.
      await tx.commissionMilestone.updateMany({
        where: {
          commissionPlan: { bookingId },
          status: {
            in: [
              CommissionMilestoneStatus.UPCOMING,
              CommissionMilestoneStatus.ELIGIBLE,
              CommissionMilestoneStatus.APPROVED,
            ],
          },
        },
        data: { status: CommissionMilestoneStatus.CANCELLED },
      });

      await tx.auditLog.create({
        data: {
          action: 'booking.cancelled',
          entityType: 'Booking',
          entityId: bookingId,
          actorUserId,
          reason,
        },
      });

      return updated;
    });
  }
}
