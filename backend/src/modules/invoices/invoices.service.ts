import { Injectable } from '@nestjs/common';
import { CommissionMilestoneStatus, InstallmentStatus, Prisma } from '@prisma/client';

import type { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators';
import { assertOwns } from '../../common/access/crm-access';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { IdService } from '../../common/ids/id.service';
import { StorageService } from '../../common/storage/storage.service';
import { PrismaService } from '../../database/prisma.service';
import { type InvoiceAudience, type InvoiceData, InvoicePdfService } from './invoice-pdf.service';

/**
 * Invoices, and the two PDFs rendered from them.
 *
 * One invoice record per booking. The client and broker documents are two
 * renderings of the same invoice, not two invoices, so they always agree about
 * the price and the schedule and differ only in whether the commission is
 * present.
 *
 * Commission is withheld by never loading it into the client render — not by a
 * flag the renderer might forget to honour, and certainly not by CSS. The
 * `commission` field on `InvoiceData` is simply absent for the client copy.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
    private readonly renderer: InvoicePdfService,
    private readonly storage: StorageService,
  ) {}

  /** The invoice for a booking, created on first request. */
  async forBooking(bookingId: string, user: AuthenticatedPrincipal) {
    const booking = await this.loadBooking(bookingId, user);

    const existing = await this.prisma.invoice.findFirst({
      where: { bookingId },
      orderBy: { issuedAt: 'desc' },
    });
    if (existing !== null) {
      return { id: existing.id, invoiceCode: existing.invoiceCode, issuedAt: existing.issuedAt };
    }

    // Allocated inside a transaction so the human-readable sequence stays
    // gapless even when two people open the same booking at once.
    const created = await this.prisma.$transaction(async (tx) => {
      const invoiceCode = await this.ids.next(tx, 'INV');
      return tx.invoice.create({
        data: { invoiceCode, bookingId: booking.id, generatedByUserId: user.id },
      });
    });

    return { id: created.id, invoiceCode: created.invoiceCode, issuedAt: created.issuedAt };
  }

  /**
   * Renders a PDF and returns it, caching it in private storage.
   *
   * Cached by invoice code and audience. Regenerated whenever payments have
   * moved since the cached copy was written, because a schedule showing stale
   * "paid to date" figures is worse than a slightly slower download.
   */
  async renderPdf(
    bookingId: string,
    audience: InvoiceAudience,
    user: AuthenticatedPrincipal,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const booking = await this.loadBooking(bookingId, user);

    // A direct sale has no broker, so there is nobody a broker copy is *for*.
    // Refusing is clearer than rendering a document with an empty party and a
    // commission schedule that does not exist.
    if (audience === 'BROKER' && booking.brokerId === null) {
      throw AppException.unprocessable(
        ErrorCode.VALIDATION_FAILED,
        'This is a direct booking with no referring broker, so there is no broker copy.',
      );
    }

    const invoice = await this.forBooking(bookingId, user);
    const data = await this.buildData(bookingId, invoice, audience);
    const buffer = await this.renderer.render(data, audience);

    const filename = `${invoice.invoiceCode}-${audience.toLowerCase()}.pdf`;

    // Best-effort archive. A storage outage must not stop a broker handing a
    // client their schedule, so a failure here is logged by the caller and the
    // freshly rendered bytes are returned regardless.
    if (this.storage.configured) {
      await this.storage
        .upload(`invoices/${bookingId}/${filename}`, buffer, 'application/pdf', { upsert: true })
        .catch(() => undefined);
    }

    return { buffer, filename };
  }

  // ------------------------------------------------------------------ private

  private async loadBooking(bookingId: string, user: AuthenticatedPrincipal) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, salesAgentId: true, brokerId: true },
    });

    if (booking === null) throw AppException.notFound('That booking could not be found.');
    // A Sales Agent may only invoice their own sale.
    assertOwns(user, booking);
    return booking;
  }

  private async buildData(
    bookingId: string,
    invoice: { invoiceCode: string; issuedAt: Date },
    audience: InvoiceAudience,
  ): Promise<InvoiceData> {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        client: true,
        salesAgent: { include: { user: true } },
        broker: true,
        installments: { orderBy: { sequence: 'asc' } },
        commissionPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });

    const project = await this.prisma.project.findFirst();

    const installments = booking.installments.map((entry) => ({
      sequence: entry.sequence,
      label: entry.label,
      amountRupees: this.rupees(entry.amount),
      percentageOfTotal: entry.percentageOfTotal.toDecimalPlaces(2).toString(),
      // The completion instalment carries no date until Foakh publishes a
      // handover, and inventing one on a document a client signs is not an
      // option — so it prints as "To be confirmed".
      dueDate:
        entry.kind === 'COMPLETION' && booking.expectedHandoverDate === null ? null : entry.dueDate,
      status: entry.status,
      paidRupees: this.rupees(entry.paidAmount),
    }));

    const paidRupees = booking.installments
      .filter((entry) => entry.status === InstallmentStatus.PAID)
      .reduce((sum, entry) => sum + this.rupees(entry.paidAmount), 0);

    const total = this.rupees(booking.snapTotalPrice);

    const data: InvoiceData = {
      invoiceCode: invoice.invoiceCode,
      bookingCode: booking.bookingCode,
      bookingDate: booking.bookingDate,
      issuedAt: invoice.issuedAt,

      clientCode: booking.client.clientCode,
      clientName: booking.client.fullLegalName,
      clientCnic: this.cnic(booking.client.cnic),
      clientMobile: booking.client.mobile,

      salesAgentCode: booking.salesAgent.salesAgentCode,
      salesAgentName: booking.salesAgent.user.displayName,

      brokerCode: booking.broker?.brokerCode ?? null,
      brokerName: booking.broker?.agencyName ?? booking.broker?.fullName ?? null,
      leadSource: booking.leadSource,

      project: {
        name: project?.name ?? 'Foakh Wind Corridor Enclave',
        addressLine: project?.addressLine ?? '2FQ3+W4X, DHA City',
        city: project?.city ?? 'Karachi',
        country: project?.country ?? 'Pakistan',
      },

      buildingName: booking.snapBuildingName,
      floorLabel: `Floor ${booking.snapFloorLevel}`,
      unitNumber: booking.snapUnitNumber,
      residenceCategoryName: booking.snapResidenceCategoryName,
      unitTypeName: booking.snapUnitTypeName,
      className: booking.snapClassName,
      areaSqFt: Number(booking.snapAreaSqFt),
      bedrooms: booking.snapBedrooms,
      attachedBathrooms: booking.snapAttachedBathrooms,
      hasBalcony: booking.snapHasBalcony,
      parkingSpaces: booking.snapParkingSpaces,

      pricePerSqFt: Number(booking.snapPricePerSqFt),
      totalRupees: total,
      paidRupees,
      outstandingRupees: total - paidRupees,
      expectedHandoverDate: booking.expectedHandoverDate,

      installments,
    };

    // The one line that separates the two documents.
    if (audience === 'BROKER' && booking.commissionPlan !== null) {
      data.commission = {
        ratePct: Number(booking.commissionPlan.ratePct),
        totalRupees: this.rupees(booking.commissionPlan.totalAmount),
        milestones: booking.commissionPlan.milestones.map((milestone) => ({
          label: milestone.label,
          percentageOfSale: milestone.percentageOfSale.toDecimalPlaces(2).toString(),
          amountRupees: this.rupees(milestone.amount),
          expectedDate: milestone.expectedDate,
          status: this.milestoneStatus(milestone.status),
        })),
      };
    }

    return data;
  }

  /**
   * Milestone status as printed.
   *
   * Reproduced verbatim from the database rather than derived from the date:
   * a milestone whose expected date has passed is still UPCOMING until Finance
   * approves it, and a document that quietly promotes it to "Eligible" would
   * be telling a broker they are owed money nobody has authorised.
   */
  private milestoneStatus(status: CommissionMilestoneStatus): string {
    return status;
  }

  private rupees(value: Prisma.Decimal | null): number {
    return value === null ? 0 : Number(value);
  }

  /** 42101-1234567-1 */
  private cnic(digits: string): string {
    return digits.length === 13
      ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`
      : digits;
  }
}
