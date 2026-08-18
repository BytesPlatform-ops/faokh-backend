'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/components/shell/CrmShell';
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
} from '@/components/ui';
import { isValidCnic, isValidPakistaniMobile, maskCnicInput, maskPhoneInput } from '@/lib/format';
import { clientsService } from '@/services/crm';

/**
 * The new-client form, in five steps.
 *
 * A single page with thirty fields is the fastest way to make a broker abandon
 * data entry halfway. Grouping into Identity → Contact → Address →
 * Professional → Additional keeps each screen to something a person can hold in
 * their head, and validation runs per step so mistakes surface next to the
 * field rather than at the end.
 *
 * Only three fields are genuinely required: legal name, CNIC and mobile. Those
 * are what identify and reach a buyer; everything else can be filled in later.
 */

const STEPS = ['Identity', 'Contact', 'Address', 'Professional', 'Additional'] as const;

const PROVINCES = ['Sindh', 'Punjab', 'Khyber Pakhtunkhwa', 'Balochistan', 'Gilgit-Baltistan', 'Azad Kashmir', 'Federal'];

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

const EMPTY: FormState = {
  fullLegalName: '', fatherOrHusbandName: '', cnic: '', cnicExpiry: '', dateOfBirth: '',
  nationality: 'Pakistani', mobile: '', whatsapp: '', email: '', currentAddress: '',
  permanentAddress: '', city: 'Karachi', province: 'Sindh', occupation: '', companyName: '',
  ntn: '', filerStatus: 'UNKNOWN', coApplicantName: '', coApplicantCnic: '', nomineeName: '',
  nomineeCnic: '', notes: '',
};

export default function NewClientPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  function validateStep(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (step === 0) {
      if (form.fullLegalName.trim().length < 3) {
        next.fullLegalName = 'Enter the full legal name as it appears on the CNIC.';
      }
      if (!isValidCnic(form.cnic)) {
        next.cnic = 'A CNIC has 13 digits, e.g. 35202-1234567-1.';
      }
    }

    if (step === 1) {
      if (!isValidPakistaniMobile(form.mobile)) {
        next.mobile = 'Enter a Pakistani mobile number, e.g. 0300 1234567.';
      }
      if (form.email.length > 0 && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(form.email)) {
        next.email = 'Enter a valid email address.';
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validateStep()) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
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
      router.push(`/clients/${client.id}`);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Could not save the client.');
    } finally {
      setSubmitting(false);
    }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <>
      <PageHeader
        title="Add client"
        subtitle="Only name, CNIC and mobile are required — the rest can follow."
        breadcrumb={{ href: '/clients', label: 'Clients' }}
      />

      <nav aria-label="Form progress" className="mb-5">
        <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem] tracking-[0.1em] uppercase">
          {STEPS.map((label, index) => (
            <li key={label} className="flex items-center gap-3">
              <span
                aria-current={index === step ? 'step' : undefined}
                className={
                  index === step
                    ? 'font-semibold text-[var(--foakh-terracotta-deep)]'
                    : 'text-[var(--foakh-muted)] opacity-70'
                }
              >
                <span className="sr-only">{`Step ${index + 1} of ${STEPS.length}: `}</span>
                {label}
              </span>
              {index < STEPS.length - 1 && <span aria-hidden="true" className="opacity-40">·</span>}
            </li>
          ))}
        </ol>
        <div aria-hidden="true" className="mt-3 flex gap-1">
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={`h-[3px] flex-1 rounded-full ${index <= step ? 'bg-[var(--foakh-terracotta)]' : 'bg-[var(--foakh-border)]'}`}
            />
          ))}
        </div>
      </nav>

      {submitError !== null && (
        <div className="mb-4"><ErrorState message={submitError} /></div>
      )}

      <Card>
        <CardHeader title={`${step + 1}. ${STEPS[step]}`} />
        <div className="p-5">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full legal name" required htmlFor="name" error={errors.fullLegalName}>
                <Input id="name" value={form.fullLegalName} onChange={(e) => set('fullLegalName', e.target.value)} invalid={errors.fullLegalName !== undefined} autoComplete="name" />
              </Field>
              <Field label="Father / Husband name" htmlFor="father">
                <Input id="father" value={form.fatherOrHusbandName} onChange={(e) => set('fatherOrHusbandName', e.target.value)} />
              </Field>
              <Field label="CNIC" required htmlFor="cnic" hint="13 digits — formatted as you type." error={errors.cnic}>
                <Input id="cnic" inputMode="numeric" placeholder="35202-1234567-1" value={form.cnic} onChange={(e) => set('cnic', maskCnicInput(e.target.value))} invalid={errors.cnic !== undefined} />
              </Field>
              <Field label="CNIC expiry" htmlFor="cnic-expiry">
                <Input id="cnic-expiry" type="date" value={form.cnicExpiry} onChange={(e) => set('cnicExpiry', e.target.value)} />
              </Field>
              <Field label="Date of birth" htmlFor="dob">
                <Input id="dob" type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
              </Field>
              <Field label="Nationality" htmlFor="nationality">
                <Input id="nationality" value={form.nationality} onChange={(e) => set('nationality', e.target.value)} />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile" required htmlFor="mobile" hint="e.g. 0300 1234567" error={errors.mobile}>
                <Input id="mobile" type="tel" inputMode="tel" placeholder="03001234567" value={form.mobile} onChange={(e) => set('mobile', maskPhoneInput(e.target.value))} invalid={errors.mobile !== undefined} autoComplete="tel" />
              </Field>
              <Field label="WhatsApp" htmlFor="whatsapp" hint="Leave blank if same as mobile.">
                <Input id="whatsapp" type="tel" inputMode="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', maskPhoneInput(e.target.value))} />
              </Field>
              <Field label="Email" htmlFor="email" error={errors.email}>
                <Input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={errors.email !== undefined} autoComplete="email" />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Current address" htmlFor="current-address">
                <Textarea id="current-address" rows={3} value={form.currentAddress} onChange={(e) => set('currentAddress', e.target.value)} />
              </Field>
              <Field label="Permanent address" htmlFor="permanent-address">
                <Textarea id="permanent-address" rows={3} value={form.permanentAddress} onChange={(e) => set('permanentAddress', e.target.value)} />
              </Field>
              <Field label="City" htmlFor="city">
                <Input id="city" value={form.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
              <Field label="Province" htmlFor="province">
                <Select id="province" value={form.province} onChange={(e) => set('province', e.target.value)}>
                  {PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}
                </Select>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Occupation" htmlFor="occupation">
                <Input id="occupation" value={form.occupation} onChange={(e) => set('occupation', e.target.value)} />
              </Field>
              <Field label="Company / business" htmlFor="company">
                <Input id="company" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
              </Field>
              <Field label="NTN" htmlFor="ntn" hint="Optional.">
                <Input id="ntn" value={form.ntn} onChange={(e) => set('ntn', e.target.value)} />
              </Field>
              <Field label="Filer status" htmlFor="filer">
                <Select id="filer" value={form.filerStatus} onChange={(e) => set('filerStatus', e.target.value as FormState['filerStatus'])}>
                  <option value="UNKNOWN">Not known</option>
                  <option value="FILER">Filer</option>
                  <option value="NON_FILER">Non-filer</option>
                </Select>
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Co-applicant name" htmlFor="co-name">
                  <Input id="co-name" value={form.coApplicantName} onChange={(e) => set('coApplicantName', e.target.value)} />
                </Field>
                <Field label="Co-applicant CNIC" htmlFor="co-cnic">
                  <Input id="co-cnic" inputMode="numeric" value={form.coApplicantCnic} onChange={(e) => set('coApplicantCnic', maskCnicInput(e.target.value))} />
                </Field>
                <Field label="Nominee name" htmlFor="nom-name">
                  <Input id="nom-name" value={form.nomineeName} onChange={(e) => set('nomineeName', e.target.value)} />
                </Field>
                <Field label="Nominee CNIC" htmlFor="nom-cnic">
                  <Input id="nom-cnic" inputMode="numeric" value={form.nomineeCnic} onChange={(e) => set('nomineeCnic', maskCnicInput(e.target.value))} />
                </Field>
              </div>

              <Field label="Notes" htmlFor="notes">
                <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>

              <div>
                <Field label="Documents" htmlFor="documents" hint="CNIC front, CNIC back and client photo.">
                  <input
                    id="documents"
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                    className="block w-full text-sm text-[var(--foakh-text)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--foakh-cream)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--foakh-terracotta-dark)]"
                  />
                </Field>
                {files.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 text-xs text-[var(--foakh-text)]">
                    {files.map((file) => (
                      <li key={file.name}>{file.name} · {(file.size / 1024).toFixed(0)} KB</li>
                    ))}
                  </ul>
                )}
                <div className="mt-3">
                  <Notice tone="warning" title="Demo mode — files are not stored">
                    File names are recorded against the client so the flow can be reviewed, but
                    nothing is uploaded. Document storage arrives with the Supabase Storage
                    integration.
                  </Notice>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--foakh-border)] px-5 py-4">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
            Back
          </Button>
          <span className="text-xs text-[var(--foakh-muted)]">Step {step + 1} of {STEPS.length}</span>
          {isLast ? (
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save client'}
            </Button>
          ) : (
            <Button onClick={() => { if (validateStep()) setStep((s) => s + 1); }}>
              Continue
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}
