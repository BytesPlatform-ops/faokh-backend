import { Injectable } from '@nestjs/common';
import { InstallmentStatus, PaymentStatus, Prisma } from '@prisma/client';

import { assertOwns } from '../../common/access/crm-access';
import type { AuthenticatedPrincipal } from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { IdService } from '../../common/ids/id.service';
import { toPaisa } from '../../common/presenters';
import { PrismaService } from '../../database/prisma.service';
import type { RecordPaymentDto } from './payments.dto';

/**
 * Recording money received against a booking.
 *
 * Two rules shape everything here:
 *
 *  1. A payment and the installment it settles must move together. Recording
 *     the receipt but failing to advance the installment leaves a client shown
 *     as owing money they have paid, so both happen in one transaction.
 *
 *  2. An installment's paid figure is always recomputed from the payments that
 *     actually exist, never incremented. Incrementing drifts the moment any
 *     payment is reversed or corrected, and a schedule that quietly disagrees
 *     with its own receipts is the worst kind of bug to find late.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdService,
  ) {}

  async installmentsFor(bookingId: string, user: AuthenticatedPrincipal) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, salesAgentId: true, expectedHandoverDate: true },
    });
    if (booking === null) throw AppException.notFound('That booking could not be found.');
    assertOwns(user, booking);

    const installments = await this.prisma.installment.findMany({
      where: { bookingId },
      orderBy: { sequence: 'asc' },
      include: { payments: { orderBy: { receivedAt: 'asc' } } },
    });

    return installments.map((entry) => ({
      id: entry.id,
      sequence: entry.sequence,
      kind: entry.kind,
      label: entry.label,
      percentageOfTotal: entry.percentageOfTotal.toDecimalPlaces(2).toString(),
      amountPaisa: toPaisa(entry.amount),
      paidPaisa: toPaisa(entry.paidAmount),
      // The completion instalment has no real date until Foakh publishes a
      // handover; the stored date is a placeholder and must not be shown.
      dueDate:
        entry.kind === 'COMPLETION' && booking.expectedHandoverDate === null
          ? null
          : entry.dueDate.toISOString(),
      status: entry.status,
      paidAt: entry.paidAt?.toISOString() ?? null,
      payments: entry.payments.map((payment) => ({
        id: payment.id,
        paymentCode: payment.paymentCode,
        amountPaisa: toPaisa(payment.amount),
        method: payment.method,
        reference: payment.reference,
        status: payment.status,
        receivedAt: payment.receivedAt.toISOString(),
      })),
    }));
  }

  async record(input: RecordPaymentDto, user: AuthenticatedPrincipal) {
    const amount = new Prisma.Decimal(input.amountRupees);
    if (amount.lessThanOrEqualTo(0)) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'A payment must be for a positive amount.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        select: { id: true, salesAgentId: true },
      });
      if (booking === null) throw AppException.notFound('That booking could not be found.');
      assertOwns(user, booking);

      const installment =
        input.installmentId === undefined
          ? null
          : await tx.installment.findUnique({ where: { id: input.installmentId } });

      if (input.installmentId !== undefined) {
        if (installment === null) {
          throw AppException.notFound('That instalment could not be found.');
        }
        // Guards against a payment being attached to another booking's
        // schedule, which would corrupt two clients' balances at once.
        if (installment.bookingId !== booking.id) {
          throw AppException.badRequest(
            ErrorCode.VALIDATION_FAILED,
            'That instalment belongs to a different booking.',
          );
        }
        if (installment.status === InstallmentStatus.WAIVED) {
          throw AppException.unprocessable(
            ErrorCode.VALIDATION_FAILED,
            'That instalment has been waived and cannot take a payment.',
          );
        }
      }

      const paymentCode = await this.ids.next(tx, 'PAY');
      const payment = await tx.payment.create({
        data: {
          paymentCode,
          bookingId: booking.id,
          ...(installment !== null ? { installmentId: installment.id } : {}),
          amount,
          method: input.method,
          ...(input.reference !== undefined ? { reference: input.reference } : {}),
          receivedAt: new Date(input.receivedAt),
          recordedByUserId: user.id,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });

      if (installment !== null) {
        await this.resettle(tx, installment.id);
      }

      return { id: payment.id, paymentCode: payment.paymentCode };
    });
  }

  /**
   * Recomputes an installment from its surviving payments.
   *
   * Bounced and reversed receipts are excluded, so correcting a mistake is a
   * matter of changing the payment's status rather than hand-editing a balance.
   */
  private async resettle(tx: Prisma.TransactionClient, installmentId: string): Promise<void> {
    const installment = await tx.installment.findUniqueOrThrow({
      where: { id: installmentId },
      include: {
        payments: {
          where: { status: { in: [PaymentStatus.RECORDED, PaymentStatus.CLEARED] } },
          orderBy: { receivedAt: 'asc' },
        },
      },
    });

    const paid = installment.payments.reduce(
      (sum, payment) => sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );

    const settled = paid.greaterThanOrEqualTo(installment.amount);
    const status = settled
      ? InstallmentStatus.PAID
      : paid.greaterThan(0)
        ? InstallmentStatus.PARTIALLY_PAID
        : InstallmentStatus.PENDING;

    await tx.installment.update({
      where: { id: installmentId },
      data: {
        paidAmount: paid,
        status,
        // The date the balance was actually cleared — the last contributing
        // receipt, not "now", so a payment recorded late dates correctly.
        paidAt: settled ? (installment.payments.at(-1)?.receivedAt ?? new Date()) : null,
      },
    });
  }
}
