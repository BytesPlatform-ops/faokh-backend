'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  Badge,
  Button,
  Drawer,
  ErrorState,
  Field,
  FieldGroup,
  Input,
  Notice,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import {
  formatCnic,
  formatPhone,
  isValidCnic,
  isValidPakistaniMobile,
  parseDateInput,
  startOfToday,
  stripCnic,
  yearsBetween,
  maskCnicInput,
  maskPhoneInput,
} from '@/lib/format';
import type { Client } from '@/services/crm';
import { clientsService } from '@/services/crm';

/**
 * Step 1 — attach a client to the booking.
 *
 * The critical behaviour is that **creating a client never leaves the wizard**.
 * Sending a broker to `/clients/new` mid-booking loses every selection they
 * have made and forces them to search for the person they just created. So the
 * form opens in a drawer, and on save the new client is selected automatically
 * and the booking continues.
 */

const PROVINCES = [
  'Sindh',
  'Punjab',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Gilgit-Baltistan',
  'Azad Kashmir',
  'Federal',
];

export function ClientStep({
  selected,
  onSelect,
}: {
  selected: Client | null;
  onSelect: (client: Client) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async (term: string) => {
    try {
      // No ownership filter is sent: the API scopes to the authenticated Sales
      // Agent server-side, which is the only place it can be enforced.
      const result = await clientsService.list({ search: term, pageSize: 8 });
      setResults(result.data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not search clients.');
    }
  }, []);

  useEffect(() => {
    void load(search);
  }, [search, load]);

  function handleCreated(client: Client) {
    // Select immediately and close — the broker must not have to find the
    // person they just entered.
    onSelect(client);
    setDrawerOpen(false);
    setSearch('');
  }

  return (
    <div className="flex flex-col gap-5">
      {selected !== null && (
        <div
          data-testid="selected-client"
          className="rounded-xl border border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)]/5 px-4 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-[var(--foakh-ink)]">
                {selected.fullLegalName}
              </p>
              <p className="mt-0.5 text-xs text-[var(--foakh-muted)]">
                <span className="font-mono">{selected.clientCode}</span> ·{' '}
                {formatCnic(selected.cnic)} · {formatPhone(selected.mobile)}
              </p>
            </div>
            <Badge tone="booked">Selected</Badge>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label="Find an existing client"
            htmlFor="booking-client-search"
            hint="Client ID, name, CNIC, mobile or WhatsApp."
          >
            <Input
              id="booking-client-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ahmed Khan · CLI-2026-000001 · 0300…"
            />
          </Field>
        </div>
        <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
          + Create new client
        </Button>
      </div>

      {error !== null ? (
        <ErrorState message={error} onRetry={() => void load(search)} />
      ) : results === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--foakh-border-strong)] bg-[var(--foakh-cream-soft)] px-5 py-8 text-center">
          <p className="text-sm font-medium text-[var(--foakh-ink)]">No matching client</p>
          <p className="mt-1 text-sm text-[var(--foakh-text)]">
            Create the client here and the booking will continue with them attached.
          </p>
          <Button className="mt-4" onClick={() => setDrawerOpen(true)}>
            + Create new client
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map((client) => (
            <li key={client.id}>
              <label
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors ${
                  selected?.id === client.id
                    ? 'border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)]/5'
                    : 'border-[var(--foakh-border-strong)] bg-white hover:bg-[var(--foakh-cream-soft)]'
                }`}
              >
                <input
                  type="radio"
                  name="booking-client"
                  checked={selected?.id === client.id}
                  onChange={() => onSelect(client)}
                  className="sr-only"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--foakh-ink)]">
                    {client.fullLegalName}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--foakh-muted)]">
                    <span className="font-mono">{client.clientCode}</span> ·{' '}
                    {formatCnic(client.cnic)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--foakh-text)]">{formatPhone(client.mobile)}</p>
                  {client.bookingStatus !== 'NONE' && (
                    <p className="mt-0.5 text-[0.62rem] text-[var(--foakh-muted)]">
                      Existing booking
                    </p>
                  )}
                </div>
              </label>
            </li>
          ))}
        </ul>
      )}

      <NewClientDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface FormState {
  fullLegalName: string;
  fatherOrHusbandName: string;
  cnic: string;
  cnicExpiry: string;
  dateOfBirth: string;
  nationality: string;
  mobile: string;
  whatsapp: string;
  email: string;
  currentAddress: string;
  permanentAddress: string;
  city: string;
  province: string;
  occupation: string;
  companyName: string;
  ntn: string;
  filerStatus: 'UNKNOWN' | 'FILER' | 'NON_FILER';
  coApplicantName: string;
  coApplicantCnic: string;
  nomineeName: string;
  nomineeCnic: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  fullLegalName: '', fatherOrHusbandName: '', cnic: '', cnicExpiry: '', dateOfBirth: '',
  nationality: 'Pakistani', mobile: '', whatsapp: '', email: '', currentAddress: '',
  permanentAddress: '', city: 'Karachi', province: 'Sindh', occupation: '', companyName: '',
  ntn: '', filerStatus: 'UNKNOWN', coApplicantName: '', coApplicantCnic: '', nomineeName: '',
  nomineeCnic: '', notes: '',
};

/**
 * The full client form, in a drawer.
 *
 * Carries the same fields as the standalone Add Client page — a broker must not
 * have to go back later and fill in what the "quick" version omitted. It is one
 * scrolling form rather than five steps, because inside a booking the broker
 * usually has the CNIC in hand and wants to get through it in one pass.
 */
function NewClientDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (client: Client) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (form.fullLegalName.trim().length < 3) {
      next.fullLegalName = 'Enter the full legal name as it appears on the CNIC.';
    }

    if (!isValidCnic(form.cnic)) {
      next.cnic = 'A CNIC has 13 digits, e.g. 35202-1234567-1.';
    } else {
      const digits = stripCnic(form.cnic);
      // The first digit is the province code; there is no province 0 or 9.
      if (!/^[1-8]/.test(digits)) {
        next.cnic = 'That is not a valid CNIC — the first digit is the province code (1–8).';
      } else if (/^(\d)\1{12}$/.test(digits)) {
        // 1111111111111 and friends pass a length check and are always typos.
        next.cnic = 'That CNIC looks like a placeholder. Check the card.';
      }
    }

    // --- dates ---------------------------------------------------------------
    // Both are optional; an entered value still has to make sense, because a
    // wrong date here ends up printed on a contract.
    const today = startOfToday();

    if (form.dateOfBirth !== '') {
      const dob = parseDateInput(form.dateOfBirth);
      if (dob === null) {
        next.dateOfBirth = 'Enter a valid date.';
      } else if (dob > today) {
        next.dateOfBirth = 'Date of birth cannot be in the future.';
      } else {
        const age = yearsBetween(dob, today);
        if (age < 18) {
          // A minor cannot contract for a property purchase in their own name.
          next.dateOfBirth = `The client would be ${age}. A buyer must be 18 or over.`;
        } else if (age > 120) {
          next.dateOfBirth = 'Check the date of birth — that would make the client over 120.';
        }
      }
    }

    if (form.cnicExpiry !== '') {
      const expiry = parseDateInput(form.cnicExpiry);
      if (expiry === null) {
        next.cnicExpiry = 'Enter a valid date.';
      } else if (expiry <= today) {
        // Foakh cannot verify identity against an expired card.
        next.cnicExpiry = 'This CNIC has expired. A valid CNIC is required to book.';
      } else if (yearsBetween(today, expiry) > 20) {
        // Pakistani CNICs run 10 years, or "lifetime" which is still dated.
        next.cnicExpiry = 'Check the expiry date — it is further out than any CNIC runs.';
      }
    }

    // Cross-field: a card cannot expire before its holder was born.
    if (next.dateOfBirth === undefined && next.cnicExpiry === undefined) {
      const dob = form.dateOfBirth === '' ? null : parseDateInput(form.dateOfBirth);
      const expiry = form.cnicExpiry === '' ? null : parseDateInput(form.cnicExpiry);
      if (dob !== null && expiry !== null && expiry <= dob) {
        next.cnicExpiry = 'The expiry date is before the date of birth. Check both.';
      }
    }

    // --- contact -------------------------------------------------------------
    if (!isValidPakistaniMobile(form.mobile)) {
      next.mobile = 'Enter a Pakistani mobile number, e.g. 0300 1234567.';
    }
    if (form.whatsapp.length > 0 && !isValidPakistaniMobile(form.whatsapp)) {
      next.whatsapp = 'Enter a Pakistani mobile number, or leave blank.';
    }
    if (form.email.length > 0 && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(form.email)) {
      next.email = 'Enter a valid email address.';
    }

    // --- other parties -------------------------------------------------------
    // Optional, but a CNIC that is present must be a real one — these end up on
    // the booking documents too.
    if (form.coApplicantCnic.length > 0 && !isValidCnic(form.coApplicantCnic)) {
      next.coApplicantCnic = 'A CNIC has 13 digits, e.g. 35202-1234567-1.';
    }
    if (form.nomineeCnic.length > 0 && !isValidCnic(form.nomineeCnic)) {
      next.nomineeCnic = 'A CNIC has 13 digits, e.g. 35202-1234567-1.';
    }
    if (
      form.coApplicantCnic.length > 0 &&
      isValidCnic(form.coApplicantCnic) &&
      isValidCnic(form.cnic) &&
      stripCnic(form.coApplicantCnic) === stripCnic(form.cnic)
    ) {
      next.coApplicantCnic = 'The co-applicant cannot be the same person as the client.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      // Goes through the same service the standalone page uses, so `api` mode
      // will hit the real endpoint without touching this component.
      const client = await clientsService.create({
        fullLegalName: form.fullLegalName.trim(),
        fatherOrHusbandName: form.fatherOrHusbandName.trim() || undefined,
        cnic: form.cnic,
        cnicExpiry: form.cnicExpiry || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        nationality: form.nationality,
        mobile: form.mobile,
        whatsapp: form.whatsapp || undefined,
        email: form.email || undefined,
        currentAddress: form.currentAddress || undefined,
        permanentAddress: form.permanentAddress || undefined,
        city: form.city || undefined,
        province: form.province || undefined,
        occupation: form.occupation || undefined,
        companyName: form.companyName || undefined,
        ntn: form.ntn || undefined,
        filerStatus: form.filerStatus,
        coApplicantName: form.coApplicantName || undefined,
        coApplicantCnic: form.coApplicantCnic || undefined,
        nomineeName: form.nomineeName || undefined,
        nomineeCnic: form.nomineeCnic || undefined,
        notes: form.notes || undefined,
        documents: files,

      });

      setForm(EMPTY_FORM);
      setFiles([]);
      onCreated(client);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Could not save the client.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer
      open={open}
      title="Create new client"
      description="Saved to the CRM and attached to this booking immediately."
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save & continue booking'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-7">
        {submitError !== null && <ErrorState message={submitError} />}

        <FieldGroup title="Personal">
          <Field label="Full legal name" required htmlFor="d-name" error={errors.fullLegalName}>
            <Input id="d-name" value={form.fullLegalName} onChange={(e) => set('fullLegalName', e.target.value)} invalid={errors.fullLegalName !== undefined} autoComplete="name" />
          </Field>
          <Field label="Father / Husband name" htmlFor="d-father">
            <Input id="d-father" value={form.fatherOrHusbandName} onChange={(e) => set('fatherOrHusbandName', e.target.value)} />
          </Field>
          <Field label="CNIC" required htmlFor="d-cnic" hint="Formatted as you type." error={errors.cnic}>
            <Input id="d-cnic" inputMode="numeric" placeholder="35202-1234567-1" value={form.cnic} onChange={(e) => set('cnic', maskCnicInput(e.target.value))} invalid={errors.cnic !== undefined} />
          </Field>
          <Field label="CNIC expiry" htmlFor="d-cnic-exp" error={errors.cnicExpiry}>
            <Input id="d-cnic-exp" type="date" value={form.cnicExpiry} onChange={(e) => set('cnicExpiry', e.target.value)} invalid={errors.cnicExpiry !== undefined} />
          </Field>
          <Field label="Date of birth" htmlFor="d-dob" error={errors.dateOfBirth}>
            <Input id="d-dob" type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} invalid={errors.dateOfBirth !== undefined} />
          </Field>
          <Field label="Nationality" htmlFor="d-nat">
            <Input id="d-nat" value={form.nationality} onChange={(e) => set('nationality', e.target.value)} />
          </Field>
        </FieldGroup>

        <FieldGroup title="Contact">
          <Field label="Mobile" required htmlFor="d-mobile" hint="e.g. 0300 1234567" error={errors.mobile}>
            <Input id="d-mobile" type="tel" inputMode="tel" value={form.mobile} onChange={(e) => set('mobile', maskPhoneInput(e.target.value))} invalid={errors.mobile !== undefined} autoComplete="tel" />
          </Field>
          <Field label="WhatsApp" htmlFor="d-wa" hint="Leave blank if same as mobile." error={errors.whatsapp}>
            <Input id="d-wa" type="tel" inputMode="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', maskPhoneInput(e.target.value))} invalid={errors.whatsapp !== undefined} />
          </Field>
          <Field label="Email" htmlFor="d-email" error={errors.email}>
            <Input id="d-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={errors.email !== undefined} autoComplete="email" />
          </Field>
        </FieldGroup>

        <FieldGroup title="Address">
          <Field label="Current address" htmlFor="d-addr1">
            <Textarea id="d-addr1" rows={2} value={form.currentAddress} onChange={(e) => set('currentAddress', e.target.value)} />
          </Field>
          <Field label="Permanent address" htmlFor="d-addr2">
            <Textarea id="d-addr2" rows={2} value={form.permanentAddress} onChange={(e) => set('permanentAddress', e.target.value)} />
          </Field>
          <Field label="City" htmlFor="d-city">
            <Input id="d-city" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Province" htmlFor="d-prov">
            <Select id="d-prov" value={form.province} onChange={(e) => set('province', e.target.value)}>
              {PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}
            </Select>
          </Field>
        </FieldGroup>

        <FieldGroup title="Professional">
          <Field label="Occupation" htmlFor="d-occ">
            <Input id="d-occ" value={form.occupation} onChange={(e) => set('occupation', e.target.value)} />
          </Field>
          <Field label="Company / business" htmlFor="d-co">
            <Input id="d-co" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
          </Field>
          <Field label="NTN" htmlFor="d-ntn" hint="Optional.">
            <Input id="d-ntn" value={form.ntn} onChange={(e) => set('ntn', e.target.value)} />
          </Field>
          <Field label="Filer status" htmlFor="d-filer">
            <Select id="d-filer" value={form.filerStatus} onChange={(e) => set('filerStatus', e.target.value as FormState['filerStatus'])}>
              <option value="UNKNOWN">Not known</option>
              <option value="FILER">Filer</option>
              <option value="NON_FILER">Non-filer</option>
            </Select>
          </Field>
        </FieldGroup>

        <FieldGroup title="Additional">
          <Field label="Co-applicant name" htmlFor="d-co-name">
            <Input id="d-co-name" value={form.coApplicantName} onChange={(e) => set('coApplicantName', e.target.value)} />
          </Field>
          <Field label="Co-applicant CNIC" htmlFor="d-co-cnic" error={errors.coApplicantCnic}>
            <Input id="d-co-cnic" inputMode="numeric" value={form.coApplicantCnic} onChange={(e) => set('coApplicantCnic', maskCnicInput(e.target.value))} invalid={errors.coApplicantCnic !== undefined} />
          </Field>
          <Field label="Nominee name" htmlFor="d-nom-name">
            <Input id="d-nom-name" value={form.nomineeName} onChange={(e) => set('nomineeName', e.target.value)} />
          </Field>
          <Field label="Nominee CNIC" htmlFor="d-nom-cnic" error={errors.nomineeCnic}>
            <Input id="d-nom-cnic" inputMode="numeric" value={form.nomineeCnic} onChange={(e) => set('nomineeCnic', maskCnicInput(e.target.value))} invalid={errors.nomineeCnic !== undefined} />
          </Field>
        </FieldGroup>

        <div className="flex flex-col gap-4">
          <Field label="Notes" htmlFor="d-notes">
            <Textarea id="d-notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>

          <Field
            label="Documents"
            htmlFor="d-docs"
            hint="CNIC front, CNIC back and client photo."
          >
            <input
              id="d-docs"
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              className="block w-full text-sm text-[var(--foakh-text)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--foakh-cream)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--foakh-terracotta-dark)]"
            />
          </Field>
          {files.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-[var(--foakh-text)]">
              {files.map((file) => (
                <li key={file.name}>
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </li>
              ))}
            </ul>
          )}

          <Notice tone="warning" title="Demo mode — files are not stored">
            File names are recorded against the client so the flow can be reviewed, but nothing
            is uploaded. Document storage arrives with Supabase Storage.
          </Notice>
        </div>
      </div>
    </Drawer>
  );
}
