'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { BookingSummary, BookingSummaryMobile } from '@/components/booking/BookingSummary';
import { ClassStep } from '@/components/booking/ClassStep';
import { ClientStep } from '@/components/booking/ClientStep';
import { InstallmentTable, PlanShapeSummary } from '@/components/booking/InstallmentTable';
import {
  BuildingPicker,
  CategoryPicker,
  FloorPicker,
  LayoutPicker,
  SelectedLayoutSummary,
  SpecList,
  UnitPicker,
} from '@/components/booking/PropertyStep';
import { PriceBreakdown } from '@/components/inventory/UnitCard';
import { PageHeader } from '@/components/shell/CrmShell';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Detail,
  ErrorState,
  Notice,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { formatArea, formatCnic, formatDate, formatPhone, formatPkr } from '@/lib/format';
import type {
  BookingPreview,
  BookingSelection,
  ClassCode,
  Client,
  SessionUser,
  Unit,
} from '@/services/crm';
import { bookingsService, inventoryService, sessionService } from '@/services/crm';
import { EMPTY_SELECTION } from '@/services/crm/types';

/**
 * The booking wizard — the whole transaction, start to finish.
 *
 * A broker never has to leave this page: the client can be created here,
 * inventory is browsed here, and the schedule is generated here. `/clients` and
 * `/inventory` remain for CRM management, but nothing in this flow depends on
 * visiting them.
 *
 * The flow follows the product hierarchy and nothing else:
 *
 *   client → category → layout → class → building → floor → unit → plan → review
 *
 * There is deliberately no requirements questionnaire. Bedrooms, bathrooms,
 * balcony, parking and area are consequences of the layout, so asking for them
 * is asking a broker to re-enter facts the CRM already holds; budget, purpose
 * and payment preference belong on the client's CRM profile, where they can be
 * captured without standing between a decided buyer and the inventory. Nothing
 * in this wizard filters stock on a preference — every list is exactly what is
 * available for what has actually been chosen.
 *
 * Ten internal steps are shown as five stages. Ten progress dots make a
 * five-minute task look like a twenty-minute one, and a raw "step 7 of 10"
 * tells a sales agent nothing they can act on.
 */

type StepId =
  | 'CLIENT'
  | 'CATEGORY'
  | 'LAYOUT'
  | 'CLASS'
  | 'BUILDING'
  | 'FLOOR'
  | 'UNIT'
  | 'PLAN'
  | 'REVIEW'
  | 'CONFIRM';

/** The five stages the broker actually sees. */
const STAGES = ['Client', 'Residence', 'Property', 'Payment', 'Review'] as const;
type Stage = (typeof STAGES)[number];

const STEPS: { id: StepId; stage: Stage; title: string }[] = [
  { id: 'CLIENT', stage: 'Client', title: 'Select or create the client' },
  { id: 'CATEGORY', stage: 'Residence', title: 'What is being booked?' },
  { id: 'LAYOUT', stage: 'Residence', title: 'Choose the apartment type' },
  { id: 'CLASS', stage: 'Residence', title: 'Choose the residence class' },
  { id: 'BUILDING', stage: 'Property', title: 'Choose a building' },
  { id: 'FLOOR', stage: 'Property', title: 'Choose a floor' },
  { id: 'UNIT', stage: 'Property', title: 'Choose a unit' },
  { id: 'PLAN', stage: 'Payment', title: 'Price and payment plan' },
  { id: 'REVIEW', stage: 'Review', title: 'Review the booking' },
  { id: 'CONFIRM', stage: 'Review', title: 'Confirm' },
];

function WizardContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Every choice lives in one object so that clearing what a change invalidates
  // is a single obvious operation rather than six scattered setState calls that
  // can fall out of step with each other.
  const [client, setClient] = useState<Client | null>(null);
  const [selection, setSelection] = useState<BookingSelection>(EMPTY_SELECTION);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [preview, setPreview] = useState<BookingPreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [notes, setNotes] = useState('');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmingPrice, setConfirmingPrice] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const bookingDate = useMemo(() => bookingsService.defaultBookingDate(), []);
  const step = STEPS[stepIndex] ?? STEPS[0]!;
  const stage = step.stage;

  const type =
    selection.unitTypeCode === null ? null : inventoryService.typeByCode(selection.unitTypeCode);
  const classInfo = inventoryService.classes().find((entry) => entry.code === selection.classCode);
  const categoryName =
    inventoryService.categories().find((entry) => entry.code === selection.residenceCategory)
      ?.name ?? '—';

  useEffect(() => {
    void sessionService.current().then(setUser);
  }, []);

  // Deep link from a unit card in /inventory. The unit already answers every
  // question up to and including the floor, so they are carried across rather
  // than asked again; the client step still comes first, because it is the one
  // thing a booking cannot proceed without.
  useEffect(() => {
    const unitId = params.get('unitId');
    if (unitId === null) return;

    void inventoryService.getById(unitId).then((found) => {
      if (found === null) return;
      setUnit(found);
      setSelection({
        residenceCategory: found.residenceCategory,
        unitTypeCode: found.unitTypeCode,
        classCode: (params.get('classCode') as ClassCode | null) ?? found.classCode,
        buildingCode: found.buildingCode,
        floorLevel: found.floorLevel,
        unitId: found.id,
      });
    });
  }, [params]);

  // Price and schedule, recomputed whenever the unit or class changes.
  useEffect(() => {
    if (unit === null || selection.classCode === null) {
      setPreview(null);
      return;
    }
    let cancelled = false;

    void bookingsService
      .preview({ unit, classCode: selection.classCode, bookingDate })
      .then((result) => {
        if (!cancelled) setPreview(result);
      });

    return () => {
      cancelled = true;
    };
  }, [unit, selection.classCode, bookingDate]);

  /**
   * Applies a choice and discards everything downstream of it.
   *
   * Changing the layout after a unit is picked must not leave a Type B unit
   * attached to a Type A booking — so each setter states exactly what its own
   * change invalidates, in one place, rather than relying on every call site to
   * remember.
   */
  function choose(next: Partial<BookingSelection>, clearUnitFrom: keyof BookingSelection) {
    const order: (keyof BookingSelection)[] = [
      'residenceCategory',
      'unitTypeCode',
      'classCode',
      'buildingCode',
      'floorLevel',
      'unitId',
    ];
    const from = order.indexOf(clearUnitFrom);
    const cleared = Object.fromEntries(
      order.slice(from + 1).map((key) => [key, null]),
    ) as Partial<BookingSelection>;

    setSelection((current) => ({ ...current, ...cleared, ...next }));
    if (from < order.indexOf('unitId')) setUnit(null);
  }

  const isPenthouse = selection.residenceCategory === 'DUPLEX_PENTHOUSE';

  /**
   * Steps that do not apply to the current selection.
   *
   * A duplex penthouse has no Type A–D layout, so asking for one would be
   * asking a question with no valid answer.
   */
  const isSkipped = useCallback(
    (id: StepId): boolean => id === 'LAYOUT' && isPenthouse,
    [isPenthouse],
  );

  const go = useCallback(
    (direction: 1 | -1) => {
      setStepIndex((index) => {
        let next = index + direction;
        while (STEPS[next] !== undefined && isSkipped(STEPS[next]!.id)) next += direction;
        return Math.min(STEPS.length - 1, Math.max(0, next));
      });
    },
    [isSkipped],
  );

  /** Jumps back to a named step — used by the inventory empty states. */
  const goToStep = useCallback((id: StepId) => {
    const index = STEPS.findIndex((entry) => entry.id === id);
    if (index >= 0) setStepIndex(index);
  }, []);

  const canAdvance = useCallback((): boolean => {
    switch (step.id) {
      case 'CLIENT':
        return client !== null;
      case 'CATEGORY':
        return selection.residenceCategory !== null;
      case 'LAYOUT':
        return selection.unitTypeCode !== null;
      case 'CLASS':
        // A provisional price cannot become a signed contract.
        return (
          selection.classCode !== null &&
          (preview === null || preview.blockedReason === null)
        );
      case 'BUILDING':
        return selection.buildingCode !== null;
      // "All available floors" is a legitimate choice, so null passes.
      case 'FLOOR':
        return true;
      case 'UNIT':
        return unit !== null;
      case 'PLAN':
        return preview !== null && preview.blockedReason === null;
      case 'REVIEW':
        return acknowledged;
      default:
        return false;
    }
  }, [step.id, client, selection, unit, preview, acknowledged]);

  /**
   * Ratifies the provisional price and re-prices the booking.
   *
   * Deliberately an explicit action rather than a silent allowance: the guard
   * exists because Type D Elegant and Sonder arrived ten times too high, and
   * removing it without anybody's name against the decision is exactly the
   * failure it was put there to prevent.
   */
  async function confirmProvisionalPrice() {
    if (unit === null || selection.classCode === null) return;
    setConfirmingPrice(true);
    setError(null);

    try {
      await inventoryService.confirmPrice(
        unit.unitTypeCode,
        selection.classCode,
        user?.broker?.brokerCode ?? 'UNKNOWN',
      );
      // Re-priced through the same path as any other change, so the schedule
      // and commission are regenerated rather than patched.
      setPreview(
        await bookingsService.preview({ unit, classCode: selection.classCode, bookingDate }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not confirm that price.');
    } finally {
      setConfirmingPrice(false);
    }
  }

  async function confirm() {
    if (client === null || unit === null || selection.classCode === null) return;
    setSubmitting(true);
    setError(null);

    try {
      const booking = await bookingsService.create({
        clientId: client.id,
        unitId: unit.id,
        classCode: selection.classCode,
        bookingDate: bookingDate.toISOString(),
        notes: notes.trim() || undefined,
      });
      router.push(`/bookings/${booking.id}?created=1`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not confirm the booking.');
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const summaryData = {
    client,
    broker: user?.broker,
    unit,
    classCode: selection.classCode,
    totalPaisa: preview?.totalPaisa ?? null,
    pricePerSqFt: preview?.pricePerSqFt ?? null,
  };

  const activeStage = STAGES.indexOf(stage);

  return (
    <>
      <PageHeader
        title="New booking"
        subtitle={`${inventoryService.project().name} · ${formatDate(bookingDate)}`}
        breadcrumb={{ href: '/bookings', label: 'Bookings' }}
      />

      {/* --------------------------------------------------- five-stage progress */}
      <nav aria-label="Booking progress" className="mb-5">
        <ol
          data-testid="booking-stages"
          className="flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem] tracking-[0.1em] uppercase"
        >
          {STAGES.map((entry, index) => (
            <li key={entry} className="flex items-center gap-3">
              <span
                aria-current={entry === stage ? 'step' : undefined}
                className={
                  entry === stage
                    ? 'font-semibold text-[var(--foakh-terracotta-deep)]'
                    : index < activeStage
                      ? 'text-[var(--foakh-muted)]'
                      : 'text-[var(--foakh-muted)] opacity-50'
                }
              >
                <span className="sr-only">{`Stage ${index + 1} of ${STAGES.length}: `}</span>
                {entry}
              </span>
              {index < STAGES.length - 1 && (
                <span aria-hidden="true" className="text-[var(--foakh-muted)] opacity-40">
                  ·
                </span>
              )}
            </li>
          ))}
        </ol>
        {/* One segment per stage, not per internal step: the agent is told how
            far through the sale they are, not how many screens remain. */}
        <div aria-hidden="true" className="mt-3 flex gap-1">
          {STAGES.map((entry, index) => (
            <span
              key={entry}
              className={`h-[3px] flex-1 rounded-full ${
                index <= activeStage ? 'bg-[var(--foakh-terracotta)]' : 'bg-[var(--foakh-border)]'
              }`}
            />
          ))}
        </div>
      </nav>

      <div className="mb-4 lg:hidden">
        <BookingSummaryMobile data={summaryData} />
      </div>

      {error !== null && (
        <div className="mb-4">
          <ErrorState message={error} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardHeader title={step.title} subtitle={stage} />
          <div className="p-5">
            {step.id === 'CLIENT' && (
              <ClientStep selected={client} onSelect={setClient} brokerId={user?.broker?.id} />
            )}

            {step.id === 'CATEGORY' && (
              <CategoryPicker
                selected={selection.residenceCategory}
                onSelect={(category) => {
                  const keepsLayout =
                    selection.unitTypeCode !== null &&
                    inventoryService.typeByCode(selection.unitTypeCode).residenceCategory ===
                      category;

                  if (keepsLayout) choose({ residenceCategory: category }, 'unitTypeCode');
                  else choose({ residenceCategory: category }, 'residenceCategory');
                }}
              />
            )}

            {step.id === 'LAYOUT' && (
              <div className="flex flex-col gap-5">
                <LayoutPicker
                  selected={selection.unitTypeCode}
                  onSelect={(code) => choose({ unitTypeCode: code }, 'unitTypeCode')}
                />
                {type !== null && <SelectedLayoutSummary type={type} />}
              </div>
            )}

            {step.id === 'CLASS' && selection.unitTypeCode !== null && (
              <ClassStep
                unitTypeCode={selection.unitTypeCode}
                selected={selection.classCode}
                onSelect={(code) => choose({ classCode: code }, 'classCode')}
              />
            )}

            {step.id === 'BUILDING' && (
              <BuildingPicker
                selected={selection.buildingCode}
                onSelect={(code) => choose({ buildingCode: code }, 'buildingCode')}
              />
            )}

            {step.id === 'FLOOR' && selection.buildingCode !== null && (
              <FloorPicker
                buildingCode={selection.buildingCode}
                unitTypeCode={selection.unitTypeCode}
                typeName={type?.name ?? 'available'}
                selected={selection.floorLevel}
                onSelect={(level) => choose({ floorLevel: level }, 'floorLevel')}
                onChooseOtherBuilding={() =>
                  choose(
                    { buildingCode: selection.buildingCode === 'ABD' ? 'UMR' : 'ABD' },
                    'buildingCode',
                  )
                }
                onChangeType={() => goToStep('LAYOUT')}
              />
            )}

            {step.id === 'UNIT' && selection.buildingCode !== null && (
              <UnitPicker
                buildingCode={selection.buildingCode}
                floorLevel={selection.floorLevel}
                unitTypeCode={selection.unitTypeCode}
                classCode={selection.classCode}
                typeName={type?.name ?? 'available'}
                selected={unit}
                onSelect={(chosen) => {
                  setUnit(chosen);
                  setSelection((current) => ({ ...current, unitId: chosen.id }));
                }}
                onChooseOtherBuilding={() => {
                  choose(
                    { buildingCode: selection.buildingCode === 'ABD' ? 'UMR' : 'ABD' },
                    'buildingCode',
                  );
                  goToStep('FLOOR');
                }}
                onChangeType={() => goToStep('LAYOUT')}
              />
            )}

            {/* --------------------------------------- price and payment plan */}
            {step.id === 'PLAN' && preview !== null && unit !== null && type !== null && (
              <div className="flex flex-col gap-6">
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Detail label="Building" value={unit.buildingName} />
                  <Detail label="Floor" value={unit.floorLevel} />
                  <Detail label="Unit" value={unit.unitNumber} />
                  <Detail label="Category" value={categoryName} />
                  <Detail label="Type" value={type.name} />
                  <Detail label="Class" value={classInfo?.name ?? '—'} />
                  <Detail label="Furnishing" value={classInfo?.description ?? '—'} />
                </dl>

                {/* Property facts, never inputs. */}
                <div>
                  <h3 className="mb-2 text-[0.62rem] font-semibold tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
                    {type.name} specifications
                  </h3>
                  <SpecList type={type} />
                </div>

                {preview.blockedReason === null ? (
                  <>
                    <div className="max-w-md">
                      <PriceBreakdown
                        areaSqFt={preview.areaSqFt}
                        pricePerSqFt={preview.pricePerSqFt}
                        totalRupees={preview.totalPaisa / 100}
                      />
                    </div>

                    {/* The plan is applied automatically — there is no payment
                        preference to answer, because Foakh has one plan. */}
                    <PlanShapeSummary
                      totalPaisa={preview.totalPaisa}
                      monthlyCount={44}
                      monthlyBasePaisa={preview.monthlyBasePaisa}
                      approximateMonthlyPct={preview.approximateMonthlyPct}
                    />
                    <InstallmentTable
                      installments={preview.installments}
                      approximateMonthlyPct={preview.approximateMonthlyPct}
                    />
                    <Notice tone="info" title="Handover date not yet configured">
                      The completion instalment is scheduled but carries no date until Foakh
                      confirms handover. It prints as &ldquo;To be confirmed&rdquo;.
                    </Notice>
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Notice title="This price needs confirming before it can be sold">
                      {preview.blockedReason}
                    </Notice>

                    {/* The broker ratifies it here rather than waiting on an
                        administrator. The discrepancy is spelled out because
                        this is a factor-of-ten difference, and a confirmation
                        nobody understood is worse than no confirmation. */}
                    <div className="rounded-lg border border-[#e4c48a] bg-[#fdf1e3] px-4 py-3">
                      <p className="text-[0.62rem] font-semibold tracking-[0.16em] text-[#8a5a1f] uppercase">
                        What needs deciding
                      </p>
                      <p className="mt-1.5 text-sm text-[var(--foakh-text)]">
                        Foakh supplied {type.name} {classInfo?.name} at{' '}
                        <span className="font-mono">
                          {formatPkr((preview.totalPaisa || 0) * 10)}
                        </span>
                        , which prices {formatArea(type.areaSqFt)} sq ft at roughly ten times every
                        other rate in the matrix. Shown here as{' '}
                        <span className="font-mono">{formatPkr(preview.totalPaisa)}</span> — in line
                        with the rest of the price list.
                      </p>
                      <p className="mt-1.5 text-xs text-[var(--foakh-muted)]">
                        Confirming records your Broker ID against this price. It applies to every
                        later booking of {type.name} {classInfo?.name} too.
                      </p>
                      <div className="mt-3">
                        <Button
                          variant="secondary"
                          disabled={confirmingPrice}
                          onClick={() => void confirmProvisionalPrice()}
                        >
                          {confirmingPrice
                            ? 'Confirming…'
                            : `Confirm this price as ${user?.broker?.brokerCode ?? 'broker'}`}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ----------------------------------------------------- review */}
            {step.id === 'REVIEW' &&
              client !== null &&
              unit !== null &&
              type !== null &&
              preview !== null && (
                <div className="flex flex-col gap-6">
                  <div className="grid gap-6 lg:grid-cols-3">
                    <div>
                      <h3 className="mb-3 text-[0.62rem] font-semibold tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
                        Client
                      </h3>
                      <dl className="flex flex-col gap-3">
                        <Detail
                          label="Client ID"
                          value={<span className="font-mono">{client.clientCode}</span>}
                        />
                        <Detail label="Name" value={client.fullLegalName} />
                        <Detail
                          label="CNIC"
                          value={<span className="font-mono">{formatCnic(client.cnic)}</span>}
                        />
                        <Detail label="Mobile" value={formatPhone(client.mobile)} />
                      </dl>
                    </div>

                    <div>
                      <h3 className="mb-3 text-[0.62rem] font-semibold tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
                        Property
                      </h3>
                      <dl className="flex flex-col gap-3">
                        <Detail label="Unit" value={`${unit.unitNumber} · ${unit.buildingName}`} />
                        <Detail
                          label="Floor"
                          value={type.floorSpanLabel ?? unit.floorLevel}
                        />
                        <Detail label="Category" value={categoryName} />
                        <Detail
                          label="Type / Class"
                          value={`${type.name} · ${classInfo?.name ?? '—'}`}
                        />
                        <Detail label="Area" value={`${formatArea(type.areaSqFt)} sq ft`} />
                      </dl>
                    </div>

                    <div>
                      <h3 className="mb-3 text-[0.62rem] font-semibold tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
                        Financial
                      </h3>
                      <dl className="flex flex-col gap-3">
                        <Detail label="Total sale price" value={formatPkr(preview.totalPaisa)} />
                        <Detail
                          label="Down payment (10%)"
                          value={formatPkr(preview.installments[0]?.amountPaisa ?? 0)}
                        />
                        <Detail
                          label="Broker"
                          value={
                            <span className="font-mono">{user?.broker?.brokerCode ?? '—'}</span>
                          }
                        />
                        <Detail
                          label="Commission (4%)"
                          value={formatPkr(preview.commissionTotalPaisa)}
                        />
                      </dl>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="booking-notes"
                      className="text-sm font-medium text-[var(--foakh-ink)]"
                    >
                      Notes
                    </label>
                    <p className="mt-1 text-xs text-[var(--foakh-muted)]">
                      Optional. Recorded on the booking.
                    </p>
                    <div className="mt-2">
                      <Textarea
                        id="booking-notes"
                        rows={3}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                      />
                    </div>
                  </div>

                  {/* The one thing the agent must actively affirm. Folded into
                      review rather than given its own stage — it is a
                      confirmation of what is on this screen, not a step. */}
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--foakh-border-strong)] bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                      className="mt-0.5 h-5 w-5 accent-[var(--foakh-terracotta)]"
                    />
                    <span className="text-sm leading-relaxed text-[var(--foakh-text)]">
                      I confirm the client has reviewed the unit, the price and the full payment
                      schedule, and agrees to proceed with this booking.
                    </span>
                  </label>
                </div>
              )}

            {/* ---------------------------------------------------- confirm */}
            {step.id === 'CONFIRM' && client !== null && unit !== null && preview !== null && (
              <div className="flex flex-col gap-5">
                <dl className="grid gap-4 sm:grid-cols-3">
                  <Detail label="Client" value={client.fullLegalName} />
                  <Detail
                    label="Unit"
                    value={`${unit.unitNumber} · ${classInfo?.name ?? '—'}`}
                  />
                  <Detail label="Total" value={formatPkr(preview.totalPaisa)} />
                </dl>

                <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={submitting}>
                  Confirm booking
                </Button>
              </div>
            )}
          </div>

          {/* --------------------------------------------------- navigation */}
          <div className="sticky bottom-14 z-10 flex items-center justify-between gap-3 border-t border-[var(--foakh-border)] bg-white/95 px-5 py-4 backdrop-blur-sm lg:static lg:bottom-auto">
            <Button variant="ghost" onClick={() => go(-1)} disabled={stepIndex === 0}>
              Back
            </Button>
            <span className="hidden text-xs text-[var(--foakh-muted)] sm:inline">{stage}</span>
            <Button onClick={() => go(1)} disabled={!canAdvance() || stepIndex === STEPS.length - 1}>
              Continue
            </Button>
          </div>
        </Card>

        <BookingSummary data={summaryData} />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm this booking?"
        description={
          unit === null || client === null
            ? ''
            : `Unit ${unit.unitNumber} will be marked booked for ${client.fullLegalName}.`
        }
        confirmLabel="Confirm booking"
        busy={submitting}
        onConfirm={() => void confirm()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

export default function NewBookingPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <WizardContent />
    </Suspense>
  );
}
