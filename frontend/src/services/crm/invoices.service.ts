import type { Booking } from './types';
import { bookingsService } from './bookings.service';

export type InvoiceCopy = 'CLIENT' | 'BROKER';

export interface InvoiceDocumentData {
  booking: Booking;
  copy: InvoiceCopy;
  generatedAt: string;
  /**
   * Commission appears on the broker copy only. This is enforced by the data
   * the renderer receives, not by a CSS rule — a print stylesheet is not an
   * access control, and a client must never be handed a document containing
   * their broker's fee.
   */
  showCommission: boolean;
}

export const invoicesService = {
  async forBooking(bookingId: string, copy: InvoiceCopy): Promise<InvoiceDocumentData | null> {
    const booking = await bookingsService.getById(bookingId);
    if (booking === null) return null;

    return {
      booking,
      copy,
      generatedAt: new Date().toISOString(),
      showCommission: copy === 'BROKER',
    };
  },
};
