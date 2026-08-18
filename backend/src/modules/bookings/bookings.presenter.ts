import type { Prisma } from '@prisma/client';

import { toPaisa, toRate } from '../../common/presenters';

export const bookingInclude = {
  client: { select: { clientCode: true, fullLegalName: true, cnic: true, mobile: true } },
  salesAgent: {
    select: { salesAgentCode: true, user: { select: { displayName: true } } },
  },
  broker: { select: { brokerCode: true, fullName: true, agencyName: true } },
  installments: { orderBy: { sequence: 'asc' } },
  commissionPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
  invoices: { orderBy: { issuedAt: 'desc' }, take: 1 },
} satisfies Prisma.BookingInclude;

export type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

/**
 * Shapes a booking into the frontend's `Booking` contract.
 *
 * Money crosses this boundary as integer paisa; everything below `snapshot` is
 * the frozen record taken at confirmation, never recomputed from live pricing.
 */
export function presentBooking(booking: BookingWithRelations) {
  const paidPaisa = booking.installments.reduce((sum, entry) => sum + toPaisa(entry.paidAmount), 0);
  const totalPaisa = toPaisa(booking.snapTotalPrice);

  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    status: booking.status,
    bookingDate: booking.bookingDate.toISOString(),
    currency: booking.currency as 'PKR',

    clientId: booking.clientId,
    clientCode: booking.client.clientCode,
    clientName: booking.client.fullLegalName,
    clientCnic: booking.client.cnic,
    clientMobile: booking.client.mobile,

    // Three distinct parties: who bought, who sold it for Foakh, and who
    // introduced the buyer. Conflating the last two is what this restructure
    // exists to undo.
    salesAgentId: booking.salesAgentId,
    salesAgentCode: booking.salesAgent.salesAgentCode,
    salesAgentName: booking.salesAgent.user.displayName,

    leadSource: booking.leadSource,

    // Null on a direct sale — the normal case, not a missing value.
    brokerId: booking.brokerId,
    brokerCode: booking.broker?.brokerCode ?? null,
    brokerName: booking.broker?.agencyName ?? booking.broker?.fullName ?? null,

    unitId: booking.unitId,
    snapshot: {
      unitNumber: booking.snapUnitNumber,
      buildingName: booking.snapBuildingName,
      floorLevel: booking.snapFloorLevel,
      unitTypeCode: booking.snapUnitTypeCode,
      unitTypeName: booking.snapUnitTypeName,
      classCode: booking.snapClassCode,
      className: booking.snapClassName,
      residenceCategory: booking.snapResidenceCategory,
      residenceCategoryName: booking.snapResidenceCategoryName,
      bedrooms: booking.snapBedrooms,
      bathrooms: booking.snapBathrooms,
      attachedBathrooms: booking.snapAttachedBathrooms,
      hasBalcony: booking.snapHasBalcony,
      parkingSpaces: booking.snapParkingSpaces,
      areaSqFt: Number(booking.snapAreaSqFt),
      pricePerSqFt: toRate(booking.snapPricePerSqFt) ?? 0,
      totalPricePaisa: totalPaisa,
    },

    expectedHandoverDate: booking.expectedHandoverDate?.toISOString() ?? null,

    installments: booking.installments.map((entry) => ({
      id: entry.id,
      sequence: entry.sequence,
      kind: entry.kind,
      label: entry.label,
      percentageOfTotal: Number(entry.percentageOfTotal),
      amountPaisa: toPaisa(entry.amount),
      paidPaisa: toPaisa(entry.paidAmount),
      dueDate: entry.dueDate.toISOString(),
      status: entry.status,
    })),

    commissionMilestones:
      booking.commissionPlan?.milestones.map((entry) => ({
        id: entry.id,
        sequence: entry.sequence,
        label: entry.label,
        percentageOfSale: Number(entry.percentageOfSale),
        amountPaisa: toPaisa(entry.amount),
        expectedDate: entry.expectedDate.toISOString(),
        status: entry.status,
      })) ?? [],
    commissionRatePct: Number(booking.commissionPlan?.ratePct ?? 0),
    commissionTotalPaisa: toPaisa(booking.commissionPlan?.totalAmount),

    paidPaisa,
    outstandingPaisa: totalPaisa - paidPaisa,

    invoiceCode: booking.invoices[0]?.invoiceCode ?? '',
    createdAt: booking.createdAt.toISOString(),
    notes: booking.notes ?? undefined,
  };
}
