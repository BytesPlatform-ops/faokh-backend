'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/components/shell/CrmShell';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  Detail,
  EmptyState,
  ErrorState,
  LoadingBlock,
  humanise,
  statusTone,
} from '@/components/ui';
import { findType } from '@/data/master-data';
import { formatCnic, formatDate, formatPhone, formatPkr } from '@/lib/format';
import type { Booking, Client } from '@/services/crm';
import { bookingsService, clientsService } from '@/services/crm';

export default function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const found = await clientsService.getById(clientId);
      if (found === null) {
        setError('That client could not be found.');
        return;
      }
      setClient(found);
      const all = await bookingsService.list();
      setBookings(all.data.filter((booking) => booking.clientId === clientId));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the client.');
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error !== null) {
    return (
      <>
        <PageHeader title="Client" breadcrumb={{ href: '/clients', label: 'Clients' }} />
        <ErrorState message={error} onRetry={() => void load()} />
      </>
    );
  }

  if (client === null) {
    return (
      <>
        <PageHeader title="Client" breadcrumb={{ href: '/clients', label: 'Clients' }} />
        <LoadingBlock label="Loading client" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={client.fullLegalName}
        subtitle={`${client.clientCode} · added ${formatDate(client.createdAt)}`}
        breadcrumb={{ href: '/clients', label: 'Clients' }}
        actions={<ButtonLink href="/bookings/new">Start booking</ButtonLink>}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Identity" />
          <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
            <Detail label="Client ID" value={<span className="font-mono">{client.clientCode}</span>} />
            <Detail label="Full legal name" value={client.fullLegalName} />
            <Detail label="Father / Husband" value={client.fatherOrHusbandName ?? '—'} />
            <Detail label="CNIC" value={<span className="font-mono">{formatCnic(client.cnic)}</span>} />
            <Detail label="CNIC expiry" value={formatDate(client.cnicExpiry)} />
            <Detail label="Date of birth" value={formatDate(client.dateOfBirth)} />
            <Detail label="Nationality" value={client.nationality} />
            <Detail label="Occupation" value={client.occupation ?? '—'} />
            <Detail label="Company" value={client.companyName ?? '—'} />
          </dl>
        </Card>

        <Card>
          <CardHeader title="Contact" />
          <dl className="flex flex-col gap-4 p-5">
            <Detail label="Mobile" value={formatPhone(client.mobile)} />
            <Detail label="WhatsApp" value={client.whatsapp ? formatPhone(client.whatsapp) : '—'} />
            <Detail label="Email" value={client.email ?? '—'} />
            <Detail label="City" value={client.city ?? '—'} />
            <Detail label="Province" value={client.province ?? '—'} />
            <Detail label="Current address" value={client.currentAddress ?? '—'} />
            <Detail label="Broker" value={<span className="font-mono">{client.brokerCode}</span>} />
          </dl>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Bookings" subtitle={`${bookings.length} booking(s)`} />
          {bookings.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No bookings for this client"
                description="Start a booking from the wizard or the inventory."
                action={<ButtonLink href="/bookings/new" size="sm">Start booking</ButtonLink>}
              />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--foakh-border)]">
              {bookings.map((booking) => (
                <li key={booking.id}>
                  <Link href={`/bookings/${booking.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--foakh-cream-soft)]">
                    <div>
                      <p className="font-mono text-xs text-[var(--foakh-muted)]">{booking.bookingCode}</p>
                      <p className="mt-0.5 text-sm font-medium text-[var(--foakh-ink)]">
                        Unit {booking.snapshot.unitNumber} · {findType(booking.snapshot.unitTypeCode).name} · {booking.snapshot.className}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums">{formatPkr(booking.snapshot.totalPricePaisa)}</span>
                      <Badge tone={statusTone(booking.status)}>{humanise(booking.status)}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {client.notes !== undefined && (
          <Card className="lg:col-span-3">
            <CardHeader title="Notes" />
            <p className="p-5 text-sm leading-relaxed text-[var(--foakh-text)]">{client.notes}</p>
          </Card>
        )}
      </div>
    </>
  );
}
