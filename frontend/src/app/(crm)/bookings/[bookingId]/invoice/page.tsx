'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, use, useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/components/shell/CrmShell';
import { Button, ButtonLink, ErrorState, LoadingBlock, Notice, Skeleton } from '@/components/ui';
import { PROJECT } from '@/data/master-data';
import { formatArea, formatCnic, formatDate, formatPhone, formatPkr, formatRate } from '@/lib/format';
import type { InvoiceCopy, InvoiceDocumentData } from '@/services/crm';
import { invoicesService } from '@/services/crm';

/**
 * A4 landscape invoice preview.
 *
 * Laid out at the real aspect ratio (297 × 210 mm) and printed through the
 * browser, so what a broker sees on screen is what comes out of the printer.
 * Server-side PDF generation returns with the backend; until then this is the
 * document, not a mock-up of one.
 *
 * The client and broker copies are produced from *different data*, not from the
 * same page with a section hidden by CSS. A print stylesheet is not an access
 * control, and a client must never be handed a document containing their
 * broker's fee.
 */
function InvoiceContent({ bookingId }: { bookingId: string }) {
  const params = useSearchParams();
  const copy = (params.get('copy') as InvoiceCopy | null) ?? 'CLIENT';

  const [data, setData] = useState<InvoiceDocumentData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await invoicesService.forBooking(bookingId, copy);
      if (result === null) {
        setError('That booking could not be found.');
        return;
      }
      setData(result);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build the invoice.');
    }
  }, [bookingId, copy]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error !== null) {
    return (
      <>
        <PageHeader title="Invoice" breadcrumb={{ href: `/bookings/${bookingId}`, label: 'Booking' }} />
        <ErrorState message={error} onRetry={() => void load()} />
      </>
    );
  }

  if (data === null) {
    return (
      <>
        <PageHeader title="Invoice" breadcrumb={{ href: `/bookings/${bookingId}`, label: 'Booking' }} />
        <LoadingBlock label="Building invoice" />
      </>
    );
  }

  const { booking, showCommission } = data;
  const snap = booking.snapshot;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={copy === 'BROKER' ? 'Broker copy' : 'Client copy'}
          subtitle={`${booking.invoiceCode} · ${booking.bookingCode}`}
          breadcrumb={{ href: `/bookings/${bookingId}`, label: 'Booking' }}
          actions={
            <>
              <ButtonLink
                href={`/bookings/${bookingId}/invoice?copy=${copy === 'BROKER' ? 'CLIENT' : 'BROKER'}`}
                variant="secondary"
              >
                Switch to {copy === 'BROKER' ? 'client' : 'broker'} copy
              </ButtonLink>
              <Button onClick={() => window.print()}>Print / Save as PDF</Button>
            </>
          }
        />

        <div className="mb-5">
          <Notice tone="info" title="Print or save as PDF from here">
            The real A4 landscape document. Printing through the browser gives a PDF identical
            to what is on screen. The server also renders this document directly — that route
            needs the API, and this build is running on the demo store.
          </Notice>
        </div>
      </div>

      {/* ---------------------------------------------------------- document */}
      <div className="overflow-x-auto">
        <article
          // 297 × 210 mm at 96dpi ≈ 1123 × 794 px. Fixed width so the on-screen
          // preview and the printed sheet share a layout.
          className="invoice-sheet mx-auto w-[1123px] bg-white p-10 text-[#2b211d] shadow-[var(--foakh-shadow-medium)] print:w-full print:p-0 print:shadow-none"
        >
          {/* Header */}
          <header className="flex items-start justify-between border-b-2 border-[var(--foakh-terracotta)] pb-4">
            <div>
              <h1 className="font-display text-2xl font-medium tracking-tight">FOAKH</h1>
              <p className="mt-0.5 text-[0.7rem] tracking-[0.2em] text-[#8a7a70] uppercase">
                Wind Corridor Enclave
              </p>
              <p className="mt-1 text-[0.68rem] text-[#625750]">
                {PROJECT.addressLine}, {PROJECT.city}, {PROJECT.country}
              </p>
            </div>
            <div className="text-right text-[0.7rem]">
              <p className="font-display text-lg font-medium">
                {copy === 'BROKER' ? 'Broker Copy' : 'Client Copy'}
              </p>
              <table className="mt-1 ml-auto text-right">
                <tbody>
                  <tr><td className="pr-3 text-[#8a7a70]">Invoice</td><td className="font-mono">{booking.invoiceCode}</td></tr>
                  <tr><td className="pr-3 text-[#8a7a70]">Booking</td><td className="font-mono">{booking.bookingCode}</td></tr>
                  <tr><td className="pr-3 text-[#8a7a70]">Generated</td><td>{formatDate(data.generatedAt)}</td></tr>
                </tbody>
              </table>
            </div>
          </header>

          {/* Client / broker / property */}
          <section className="mt-5 grid grid-cols-3 gap-6 text-[0.72rem]">
            <div>
              <h2 className="mb-2 text-[0.62rem] font-semibold tracking-[0.16em] text-[#8a7a70] uppercase">Client</h2>
              <p className="font-semibold">{booking.clientName}</p>
              <p className="mt-0.5 text-[#625750]">Client ID <span className="font-mono">{booking.clientCode}</span></p>
              <p className="text-[#625750]">CNIC <span className="font-mono">{formatCnic(booking.clientCnic)}</span></p>
              <p className="text-[#625750]">Phone {formatPhone(booking.clientMobile)}</p>
            </div>
            <div>
              <h2 className="mb-2 text-[0.62rem] font-semibold tracking-[0.16em] text-[#8a7a70] uppercase">Broker</h2>
              <p className="font-semibold">{booking.brokerName}</p>
              <p className="mt-0.5 text-[#625750]">Broker ID <span className="font-mono">{booking.brokerCode}</span></p>
              <p className="text-[#625750]">Booking date {formatDate(booking.bookingDate)}</p>
              <p className="text-[#625750]">
                Expected handover {booking.expectedHandoverDate === null ? 'To be confirmed' : formatDate(booking.expectedHandoverDate)}
              </p>
            </div>
            <div>
              <h2 className="mb-2 text-[0.62rem] font-semibold tracking-[0.16em] text-[#8a7a70] uppercase">Property</h2>
              <p className="font-semibold">Unit {snap.unitNumber} · {snap.buildingName} Block</p>
              <p className="mt-0.5 text-[#625750]">
                Floor {snap.floorLevel} · {snap.residenceCategoryName} · {snap.unitTypeName} ·{' '}
                {snap.className}
              </p>
              <p className="text-[#625750]">
                {[
                  snap.bedrooms > 0 ? `${snap.bedrooms} bed` : null,
                  snap.attachedBathrooms > 0 ? `${snap.attachedBathrooms} attached bath` : null,
                  snap.hasBalcony ? 'Balcony' : 'No balcony',
                  snap.parkingSpaces > 0 ? `${snap.parkingSpaces} parking` : 'Parking separate',
                ]
                  .filter((part) => part !== null)
                  .join(' · ')}
              </p>
              <p className="text-[#625750]">{formatArea(snap.areaSqFt)} sq ft</p>
            </div>
          </section>

          {/* Pricing */}
          <section className="mt-5 rounded-md border border-[#e0d5cb] bg-[#faf6f0] px-5 py-3">
            <div className="flex items-end justify-between font-mono text-[0.75rem]">
              <span>{formatArea(snap.areaSqFt)} sq ft</span>
              <span>× PKR {formatRate(snap.pricePerSqFt)} / sq ft</span>
              <span className="font-display text-lg font-medium">
                {formatPkr(snap.totalPricePaisa)}
              </span>
            </div>
          </section>

          {/* Payment schedule */}
          <section className="mt-5">
            <h2 className="mb-2 text-[0.62rem] font-semibold tracking-[0.16em] text-[#8a7a70] uppercase">
              Client payment schedule
            </h2>
            <table className="w-full border-collapse text-[0.66rem]">
              <thead>
                <tr className="border-y border-[#e0d5cb] bg-[#faf6f0] text-left">
                  <th className="px-2 py-1.5 font-semibold">#</th>
                  <th className="px-2 py-1.5 font-semibold">Milestone</th>
                  <th className="px-2 py-1.5 font-semibold">Due date</th>
                  <th className="px-2 py-1.5 text-right font-semibold">%</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {booking.installments.map((entry) => (
                  <tr key={entry.sequence} className="border-b border-[#efe7df]">
                    <td className="px-2 py-1 tabular-nums">{entry.sequence}</td>
                    <td className="px-2 py-1">{entry.label}</td>
                    <td className="px-2 py-1">
                      {entry.dueDate === null ? 'To be confirmed' : formatDate(entry.dueDate)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{entry.percentageOfTotal.toFixed(2)}%</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatPkr(entry.amountPaisa)}</td>
                    <td className="px-2 py-1">{entry.status.replace('_', ' ').toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--foakh-terracotta)] font-semibold">
                  <td className="px-2 py-1.5" colSpan={4}>Total</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatPkr(snap.totalPricePaisa)}</td>
                  <td />
                </tr>
                <tr>
                  <td className="px-2 py-1" colSpan={4}>Paid to date</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatPkr(booking.paidPaisa)}</td>
                  <td />
                </tr>
                <tr>
                  <td className="px-2 py-1" colSpan={4}>Outstanding</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatPkr(booking.outstandingPaisa)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>

          {/* Commission — broker copy only, by data rather than by CSS. */}
          {showCommission && (
            <section className="mt-5">
              <h2 className="mb-2 text-[0.62rem] font-semibold tracking-[0.16em] text-[#8a7a70] uppercase">
                Broker commission schedule · {booking.commissionRatePct}% of sale
              </h2>
              <table className="w-full border-collapse text-[0.66rem]">
                <thead>
                  <tr className="border-y border-[#e0d5cb] bg-[#faf6f0] text-left">
                    <th className="px-2 py-1.5 font-semibold">Milestone</th>
                    <th className="px-2 py-1.5 font-semibold">Expected date</th>
                    <th className="px-2 py-1.5 text-right font-semibold">% of sale</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
                    <th className="px-2 py-1.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {booking.commissionMilestones.map((entry) => (
                    <tr key={entry.sequence} className="border-b border-[#efe7df]">
                      <td className="px-2 py-1">{entry.label}</td>
                      <td className="px-2 py-1">{formatDate(entry.expectedDate)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{entry.percentageOfSale.toFixed(2)}%</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatPkr(entry.amountPaisa)}</td>
                      <td className="px-2 py-1">{entry.status.toLowerCase()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--foakh-terracotta)] font-semibold">
                    <td className="px-2 py-1.5" colSpan={3}>Total commission</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatPkr(booking.commissionTotalPaisa)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </section>
          )}

          {/* Signatures */}
          <footer className="mt-8 grid grid-cols-3 gap-8 text-[0.66rem]">
            {['Client signature', 'Broker signature', 'Authorised signature'].map((label) => (
              <div key={label}>
                <div className="h-10 border-b border-[#2b211d]" />
                <p className="mt-1 text-[#625750]">{label}</p>
              </div>
            ))}
            <p className="col-span-3 mt-2 text-[0.6rem] text-[#8a7a70]">
              This schedule is generated from the booking record. Amounts are in Pakistani
              Rupees. The monthly instalments are the 60% pool divided by 44 and sum, with the
              other tranches, to exactly 100% of the sale price.
            </p>
          </footer>
        </article>
      </div>
    </>
  );
}

export default function InvoicePage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <InvoiceContent bookingId={bookingId} />
    </Suspense>
  );
}
