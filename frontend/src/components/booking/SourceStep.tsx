'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  Button,
  ChoiceGroup,
  Drawer,
  ErrorState,
  Field,
  Input,
  Notice,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { formatPhone, isValidPakistaniMobile, maskPhoneInput } from '@/lib/format';
import type { Broker, LeadSource } from '@/services/crm';
import { LEAD_SOURCES, brokersService } from '@/services/crm';

/**
 * How the client reached Foakh, and — when a broker introduced them — which one.
 *
 * This is the step that decides whether a 4% commission schedule will exist at
 * all. A direct sale creates none; a broker-referred sale creates one against
 * that broker. Getting it wrong is not a display problem, so the broker is
 * attached to the client at creation rather than patched on afterwards.
 *
 * The Sales Agent is never chosen here. That comes from the authenticated
 * session and is not editable — an agent picking who a sale belongs to is
 * exactly the attribution hole this restructure closes.
 */
export function SourceStep({
  leadSource,
  broker,
  onChangeSource,
  onSelectBroker,
}: {
  leadSource: LeadSource;
  broker: Broker | null;
  onChangeSource: (source: LeadSource) => void;
  onSelectBroker: (broker: Broker | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Broker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const needsBroker = leadSource === 'BROKER';

  const load = useCallback(async (term: string) => {
    try {
      setResults(await brokersService.list(term));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load brokers.');
    }
  }, []);

  useEffect(() => {
    if (!needsBroker) return;
    void load(search);
  }, [needsBroker, search, load]);

  return (
    <div className="flex flex-col gap-6">
      <ChoiceGroup
        label="Lead source"
        hint="Recorded on the client. Only an external broker earns commission."
        value={leadSource}
        onChange={(next) => {
          onChangeSource(next);
          // Changing away from a broker referral must drop the broker, or the
          // client would keep a referral its source no longer claims.
          if (next !== 'BROKER') onSelectBroker(null);
        }}
        options={LEAD_SOURCES.map((entry) => ({
          value: entry.value,
          label: entry.label,
          ...(entry.hint !== undefined ? { description: entry.hint } : {}),
        }))}
      />

      {!needsBroker && (
        <Notice tone="info" title="No broker commission on this booking">
          This is a direct sale. The client belongs to you as the Sales Agent, and no referral
          commission schedule will be generated.
        </Notice>
      )}

      {needsBroker && (
        <div className="flex flex-col gap-4">
          {broker !== null ? (
            <div
              data-testid="selected-broker"
              className="rounded-xl border border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)]/5 px-4 py-3"
            >
              <p className="text-[0.6rem] font-semibold tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
                Introduced by
              </p>
              <p className="font-display mt-1 text-lg font-medium text-[var(--foakh-ink)]">
                {broker.agencyName ?? broker.fullName}
              </p>
              <p className="mt-0.5 font-mono text-xs text-[var(--foakh-muted)]">
                {broker.brokerCode} · {formatPhone(broker.mobile)}
              </p>
              <p className="mt-2 text-xs text-[var(--foakh-muted)]">
                This booking will generate a {broker.commissionRatePct}% commission schedule for
                them, in four 1% milestones.
              </p>
              <div className="mt-3">
                <Button variant="ghost" size="sm" onClick={() => onSelectBroker(null)}>
                  Change broker
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[16rem] flex-1">
                  <Field label="Find the broker" htmlFor="broker-search">
                    <Input
                      id="broker-search"
                      placeholder="Name, agency, BRK code or mobile"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </Field>
                </div>
                <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
                  + Add new broker
                </Button>
              </div>

              {error !== null ? (
                <ErrorState message={error} onRetry={() => void load(search)} />
              ) : results === null ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              ) : results.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--foakh-border-strong)] px-4 py-6 text-center">
                  <p className="text-sm text-[var(--foakh-text)]">
                    {search === ''
                      ? 'No brokers recorded yet.'
                      : `No broker matches “${search}”.`}
                  </p>
                  <p className="mt-1 text-xs text-[var(--foakh-muted)]">
                    Add them here — you will not lose this booking.
                  </p>
                  <Button className="mt-3" onClick={() => setDrawerOpen(true)}>
                    + Add new broker
                  </Button>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {results.map((entry) => (
                    <li key={entry.id}>
                      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--foakh-border-strong)] bg-white px-4 py-3 hover:bg-[var(--foakh-cream-soft)]">
                        <input
                          type="radio"
                          name="broker"
                          className="sr-only"
                          onChange={() => onSelectBroker(entry)}
                        />
                        <span>
                          <span className="block text-sm font-medium text-[var(--foakh-ink)]">
                            {entry.agencyName ?? entry.fullName}
                          </span>
                          <span className="block font-mono text-[0.68rem] text-[var(--foakh-muted)]">
                            {entry.brokerCode} · {formatPhone(entry.mobile)}
                          </span>
                        </span>
                        <span className="text-[0.68rem] text-[var(--foakh-muted)]">
                          {entry.referredBookingCount} booking
                          {entry.referredBookingCount === 1 ? '' : 's'}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <NewBrokerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={(created) => {
          setDrawerOpen(false);
          onSelectBroker(created);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Inline broker creation.
 *
 * Name and mobile only. A Sales Agent is usually reading a business card
 * mid-conversation, and demanding a CNIC, an NTN and a full address at first
 * contact is how a referral ends up unrecorded — which costs the broker their
 * commission and Foakh the relationship.
 */
function NewBrokerDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (broker: Broker) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Karachi');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 3) next.fullName = 'Enter the broker’s full name.';
    if (!isValidPakistaniMobile(mobile)) {
      next.mobile = 'Enter a Pakistani mobile number, e.g. 0300 1234567.';
    }
    if (email.length > 0 && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
      next.email = 'Enter a valid email address.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const created = await brokersService.create({
        fullName: fullName.trim(),
        mobile,
        ...(agencyName.trim() !== '' ? { agencyName: agencyName.trim() } : {}),
        ...(email.trim() !== '' ? { email: email.trim() } : {}),
        ...(city.trim() !== '' ? { city: city.trim() } : {}),
        ...(notes.trim() !== '' ? { notes: notes.trim() } : {}),
      });

      setFullName('');
      setAgencyName('');
      setMobile('');
      setEmail('');
      setNotes('');
      onCreated(created);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Could not save the broker.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add a new broker">
      <div className="flex flex-col gap-5 p-5">
        {submitError !== null && <ErrorState message={submitError} />}

        <Notice tone="info" title="Only a name and a mobile are needed">
          A Broker ID is allocated on save. Everything else can be filled in later from the
          broker’s record.
        </Notice>

        <Field label="Full name" required htmlFor="b-name" error={errors.fullName}>
          <Input
            id="b-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            invalid={errors.fullName !== undefined}
          />
        </Field>

        <Field label="Agency / company" htmlFor="b-agency" hint="Optional.">
          <Input
            id="b-agency"
            value={agencyName}
            onChange={(event) => setAgencyName(event.target.value)}
          />
        </Field>

        <Field label="Mobile" required htmlFor="b-mobile" error={errors.mobile}>
          <Input
            id="b-mobile"
            type="tel"
            inputMode="tel"
            value={mobile}
            onChange={(event) => setMobile(maskPhoneInput(event.target.value))}
            invalid={errors.mobile !== undefined}
          />
        </Field>

        <Field label="Email" htmlFor="b-email" error={errors.email}>
          <Input
            id="b-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            invalid={errors.email !== undefined}
          />
        </Field>

        <Field label="City" htmlFor="b-city">
          <Input id="b-city" value={city} onChange={(event) => setCity(event.target.value)} />
        </Field>

        <Field label="Notes" htmlFor="b-notes">
          <Textarea id="b-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save & continue booking'}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
