'use client';

import { use, useCallback, useEffect, useState } from 'react';

import { CommissionTable, InstallmentTable, PlanShapeSummary } from '@/components/booking/InstallmentTable';
import { PriceBreakdown } from '@/components/inventory/UnitCard';
import { PageHeader } from '@/components/shell/CrmShell';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  Detail,
  ErrorState,
  LoadingBlock,
  Notice,
  Stat,
  humanise,
} from '@/components/ui';
import { formatCnic, formatDate, formatPhone, formatPkr } from '@/lib/format';
import type { Booking, SessionUser } from '@/services/crm';
import { bookingsService, canViewCommission, sessionService } from '@/services/crm';

export default function BookingDetailPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = use(params);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [found, session] = await Promise.all([
        bookingsService.getById(bookingId),
        sessionService.current(),
      ]);
      if (found === null) {
        setError('That booking could not be found.');
        return;
      }
      setBooking(found);
      setUser(session);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the booking.');
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error !== null) {
    return (
      <>
        <PageHeader title="Booking" breadcrumb={{ href: '/bookings', label: 'Bookings' }} />
        <ErrorState message={error} onRetry={() => void load()} />
      </>
    );
  }

  if (booking === null || user === null) {
    return (
      <>
        <PageHeader title="Booking" breadcrumb={{ href: '/bookings', label: 'Bookings' }} />
        <LoadingBlock label="Loading booking" />
      </>
    );
  }

  const snap = booking.snapshot;
  // Commission is hidden from anyone not entitled to see it. The client copy of
  // the invoice never contains it at all.
  const showCommission = canViewCommission(user);
  const monthly = booking.installments.filter((entry) => entry.kind === 'MONTHLY');
  const approxMonthlyPct =
    monthly[0] === undefined ? 0 : Math.round(monthly[0].percentageOfTotal * 100) / 100;

  return (
    <>
      <PageHeader
        title={`Booking ${booking.bookingCode}`}
        subtitle={`${booking.clientName} · Unit ${snap.unitNumber} · booked ${formatDate(booking.bookingDate)}`}
        breadcrumb={{ href: '/bookings', label: 'Bookings' }}
        actions={
          <>
            <ButtonLink href={`/bookings/${booking.id}/invoice?copy=CLIENT`} variant="secondary">
              Client copy
            </ButtonLink>
            {showCommission && (
              <ButtonLink href={`/bookings/${booking.id}/invoice?copy=BROKER`}>
                Broker copy
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sale price" value={formatPkr(snap.totalPricePaisa)} />
        <Stat label="Paid" value={formatPkr(booking.paidPaisa)} />
        <Stat
          label="Outstanding"
          value={formatPkr(booking.outstandingPaisa)}
          tone={booking.outstandingPaisa > 0 ? 'warning' : 'default'}
        />
        <Stat
          label="Status"
          value={humanise(booking.status)}
          hint={`Invoice ${booking.invoiceCode}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Client" />
          <dl className="flex flex-col gap-4 p-5">
            <Detail label="Client ID" value={<span className="font-mono">{booking.clientCode}</span>} />
            <Detail label="Name" value={booking.clientName} />
            <Detail label="CNIC" value={<span className="font-mono">{formatCnic(booking.clientCnic)}</span>} />
            <Detail label="Phone" value={formatPhone(booking.clientMobile)} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Broker" />
          <dl className="flex flex-col gap-4 p-5">
            <Detail label="Broker ID" value={<span className="font-mono">{booking.brokerCode}</span>} />
            <Detail label="Name" value={booking.brokerName} />
            <Detail label="Commission rate" value={`${booking.commissionRatePct}%`} />
            {showCommission && (
              <Detail label="Total commission" value={formatPkr(booking.commissionTotalPaisa)} />
            )}
          </dl>
        </Card>

        <Card>
          <CardHeader title="Property" subtitle="Snapshot taken at confirmation" />
          <dl className="grid grid-cols-2 gap-4 p-5">
            <Detail label="Building" value={snap.buildingName} />
            <Detail label="Floor" value={snap.floorLevel} />
            <Detail label="Unit" value={snap.unitNumber} />
            <Detail label="Residence category" value={snap.residenceCategoryName} />
            <Detail label="Layout" value={snap.unitTypeName} />
            <Detail label="Class" value={snap.className} />
            <Detail label="Area" value={`${snap.areaSqFt} sq ft`} />
            {snap.bedrooms > 0 && <Detail label="Bedrooms" value={snap.bedrooms} />}
            {snap.attachedBathrooms > 0 && (
              <Detail label="Attached bathrooms" value={snap.attachedBathrooms} />
            )}
            <Detail label="Balcony" value={snap.hasBalcony ? 'Yes' : 'No'} />
            <Detail label="Parking" value={snap.parkingSpaces > 0 ? `${snap.parkingSpaces} included` : 'Separate'} />
          </dl>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Pricing" subtitle="Frozen at confirmation — later price changes do not apply." />
          <div className="p-5">
            <div className="max-w-md">
              <PriceBreakdown
                areaSqFt={snap.areaSqFt}
                pricePerSqFt={snap.pricePerSqFt}
                totalRupees={snap.totalPricePaisa / 100}
              />
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Payment schedule" subtitle={`${booking.installments.length} instalments`} />
          <div className="flex flex-col gap-4 p-5">
            <PlanShapeSummary
              totalPaisa={snap.totalPricePaisa}
              monthlyCount={monthly.length}
              monthlyBasePaisa={monthly[0]?.amountPaisa ?? 0}
              approximateMonthlyPct={approxMonthlyPct}
            />
            {booking.expectedHandoverDate === null && (
              <Notice tone="info" title="Handover date not yet configured">
                The completion instalment prints as &ldquo;To be confirmed&rdquo; until Foakh sets a date.
              </Notice>
            )}
            <InstallmentTable
              installments={booking.installments}
              approximateMonthlyPct={approxMonthlyPct}
            />
          </div>
        </Card>

        {showCommission && (
          <Card className="lg:col-span-3">
            <CardHeader
              title="Broker commission"
              subtitle={`${booking.commissionRatePct}% of the sale · ${formatPkr(booking.commissionTotalPaisa)} across four milestones`}
              action={<Badge tone="neutral">Not shown on the client copy</Badge>}
            />
            <div className="p-5">
              <CommissionTable milestones={booking.commissionMilestones} />
            </div>
          </Card>
        )}

        <Card className="lg:col-span-3">
          <CardHeader title="Documents" />
          <div className="p-5">
            <p className="text-sm text-[var(--foakh-text)]">
              Booking form and payment receipts will appear here once document storage is
              connected. In demo mode no files are stored.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
