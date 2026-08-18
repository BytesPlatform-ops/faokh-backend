'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/components/shell/CrmShell';
import {
  Badge,
  ButtonLink,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
} from '@/components/ui';
import { findType } from '@/data/master-data';
import { formatCnic, formatDate, formatPhone } from '@/lib/format';
import type { Client, SessionUser } from '@/services/crm';
import { clientsService, isSalesAgent, sessionService } from '@/services/crm';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    try {
      const session = await sessionService.current();
      setUser(session);
      const result = await clientsService.list({
        search: term,
        pageSize: 50,
        ...(isSalesAgent(session) ? { salesAgentId: session.salesAgent?.id } : {}),
      });
      setClients(result.data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load clients.');
    }
  }, []);

  useEffect(() => {
    void load(search);
  }, [search, load]);

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={user?.salesAgent !== undefined ? `Owned by ${user.salesAgent.salesAgentCode}` : undefined}
        actions={<ButtonLink href="/clients/new">Add Client</ButtonLink>}
      />

      <div className="mb-5 max-w-md">
        <Field label="Search" htmlFor="client-search" hint="Name, client ID, CNIC or phone.">
          <Input
            id="client-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ahmed Raza Khan"
          />
        </Field>
      </div>

      {error !== null ? (
        <ErrorState message={error} onRetry={() => void load(search)} />
      ) : clients === null ? (
        <LoadingBlock label="Loading clients" />
      ) : (
        <DataTable
          columns={[
            {
              key: 'code',
              header: 'Client ID',
              render: (row) => (
                <Link href={`/clients/${row.id}`} className="font-mono text-xs text-[var(--foakh-terracotta-deep)] hover:underline">
                  {row.clientCode}
                </Link>
              ),
            },
            { key: 'name', header: 'Name', render: (row) => row.fullLegalName },
            { key: 'cnic', header: 'CNIC', render: (row) => <span className="font-mono text-xs">{formatCnic(row.cnic)}</span> },
            { key: 'phone', header: 'Phone', render: (row) => formatPhone(row.mobile) },
            { key: 'broker', header: 'Broker', render: (row) => <span className="font-mono text-xs">{row.brokerCode}</span> },
            {
              key: 'interest',
              header: 'Interested in',
              render: (row) => (row.interestedTypeCode ? findType(row.interestedTypeCode).name : '—'),
            },
            {
              key: 'status',
              header: 'Booking',
              render: (row) => (
                <Badge tone={row.bookingStatus === 'NONE' ? 'neutral' : 'booked'}>
                  {row.bookingStatus === 'NONE' ? 'None' : 'Booked'}
                </Badge>
              ),
            },
            { key: 'activity', header: 'Last activity', render: (row) => formatDate(row.lastActivityAt) },
            { key: 'created', header: 'Created', render: (row) => formatDate(row.createdAt) },
          ]}
          rows={clients}
          getKey={(row) => row.id}
          renderCard={(row) => (
            <Link href={`/clients/${row.id}`} className="block rounded-lg border border-[var(--foakh-border)] bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--foakh-ink)]">{row.fullLegalName}</p>
                  <p className="mt-0.5 font-mono text-xs text-[var(--foakh-muted)]">{row.clientCode}</p>
                </div>
                <Badge tone={row.bookingStatus === 'NONE' ? 'neutral' : 'booked'}>
                  {row.bookingStatus === 'NONE' ? 'None' : 'Booked'}
                </Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-[var(--foakh-muted)]">CNIC</dt><dd className="font-mono">{formatCnic(row.cnic)}</dd></div>
                <div><dt className="text-[var(--foakh-muted)]">Phone</dt><dd>{formatPhone(row.mobile)}</dd></div>
              </dl>
            </Link>
          )}
          emptyState={
            <EmptyState
              title="No clients found"
              description={search === '' ? 'Add your first client to begin.' : 'Try a different search term.'}
              action={<ButtonLink href="/clients/new">Add Client</ButtonLink>}
            />
          }
        />
      )}
    </>
  );
}
