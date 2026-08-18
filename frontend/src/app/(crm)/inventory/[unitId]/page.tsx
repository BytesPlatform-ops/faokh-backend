'use client';

import Image from 'next/image';
import { use, useCallback, useEffect, useState } from 'react';

import { InstallmentTable, PlanShapeSummary } from '@/components/booking/InstallmentTable';
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
  humanise,
  statusTone,
} from '@/components/ui';
import { APARTMENT_CLASSES, findClass, findPrice, findType } from '@/data/master-data';
import { formatArea, formatPkrFromRupees, formatRate } from '@/lib/format';
import type { BookingPreview, ClassCode, Unit } from '@/services/crm';
import { bookingsService, inventoryService } from '@/services/crm';

/**
 * The unit detail screen — an agent's sales presentation, not a record view.
 *
 * The class switcher is the centre of it: the same physical apartment has three
 * prices, and a broker sitting with a client needs to move between them without
 * losing their place.
 */
export default function UnitDetailPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = use(params);

  const [unit, setUnit] = useState<Unit | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassCode | null>(null);
  const [preview, setPreview] = useState<BookingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);

  const load = useCallback(async () => {
    try {
      const found = await inventoryService.getById(unitId);
      if (found === null) {
        setError('That unit could not be found.');
        return;
      }
      setUnit(found);
      setSelectedClass(found.classCode);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the unit.');
    }
  }, [unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-price whenever the class changes. Type and class are independent, so
  // this is a lookup in the matrix rather than a different unit.
  useEffect(() => {
    if (unit === null || selectedClass === null) return;
    let cancelled = false;

    void bookingsService
      .preview({
        unit,
        classCode: selectedClass,
        bookingDate: bookingsService.defaultBookingDate(),
      })
      .then((result) => {
        if (!cancelled) setPreview(result);
      });

    return () => {
      cancelled = true;
    };
  }, [unit, selectedClass]);

  if (error !== null) {
    return (
      <>
        <PageHeader title="Unit" breadcrumb={{ href: '/inventory', label: 'Inventory' }} />
        <ErrorState message={error} onRetry={() => void load()} />
      </>
    );
  }

  if (unit === null || selectedClass === null) {
    return (
      <>
        <PageHeader title="Unit" breadcrumb={{ href: '/inventory', label: 'Inventory' }} />
        <LoadingBlock label="Loading unit" />
      </>
    );
  }

  const type = findType(unit.unitTypeCode);
  const classInfo = findClass(selectedClass);
  const price = findPrice(unit.unitTypeCode, selectedClass);
  const canBook = unit.status === 'AVAILABLE' && preview?.blockedReason === null;

  return (
    <>
      <PageHeader
        title={`Unit ${unit.unitNumber}`}
        subtitle={`${unit.buildingName} Block · Floor ${unit.floorLevel}${
          type.spansFloors > 1 ? `–${unit.floorLevel + type.spansFloors - 1}` : ''
        }`}
        breadcrumb={{ href: '/inventory', label: 'Inventory' }}
        actions={
          canBook ? (
            <ButtonLink href={`/bookings/new?unitId=${unit.id}&classCode=${selectedClass}`}>
              Start booking
            </ButtonLink>
          ) : (
            <Badge tone={statusTone(unit.status)}>{humanise(unit.status)}</Badge>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          {/* ------------------------------------------------------ gallery */}
          <Card className="overflow-hidden">
            <div className="relative aspect-[16/9] w-full bg-[var(--foakh-cream-warm)]">
              {type.images[activeImage] !== undefined && (
                <Image
                  src={type.images[activeImage]}
                  alt={`${type.name} residence`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  priority
                  className="object-cover"
                />
              )}
              <div className="absolute top-3 right-3">
                <Badge tone={statusTone(unit.status)}>{humanise(unit.status)}</Badge>
              </div>
            </div>
            {type.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3">
                {type.images.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => setActiveImage(index)}
                    aria-label={`View image ${index + 1}`}
                    aria-current={index === activeImage}
                    className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-md ${
                      index === activeImage
                        ? 'ring-2 ring-[var(--foakh-terracotta)]'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Image src={image} alt="" fill sizes="96px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* ------------------------------------------ specification */}
          <Card>
            <CardHeader title="Specification" subtitle={type.description} />
            <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
              <Detail
                label="Residence category"
                value={type.residenceCategory === 'DUPLEX_PENTHOUSE' ? 'Duplex Penthouse' : 'Apartment'}
              />
              <Detail label="Layout" value={type.name} />
              <Detail label="Class" value={classInfo.name} />
              <Detail label="Area" value={`${formatArea(type.areaSqFt)} sq ft`} />
              {type.bedrooms > 0 && <Detail label="Bedrooms" value={type.bedrooms} />}
              {/* Foakh has published no bathroom count for the duplex, so the
                  row is omitted rather than printed as zero. */}
              {type.attachedBathrooms > 0 && (
                <Detail label="Attached bathrooms" value={type.attachedBathrooms} />
              )}
              <Detail label="Balcony" value={type.hasBalcony ? 'Yes' : 'No'} />
              <Detail
                label="Parking"
                value={unit.parkingSpaces > 0 ? `${unit.parkingSpaces} included` : 'Purchased separately'}
              />
              {type.floorSpanLabel !== undefined && (
                <Detail label="Floors" value={type.floorSpanLabel} />
              )}
              <Detail label="Furnishing" value={classInfo.description} />
            </dl>
          </Card>

          {/* ------------------------------------------- payment plan */}
          {preview !== null && preview.blockedReason === null && (
            <Card>
              <CardHeader
                title="Payment plan preview"
                subtitle="Generated from the booking date; dates shift with the actual booking."
              />
              <div className="flex flex-col gap-4 p-5">
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
              </div>
            </Card>
          )}
        </div>

        {/* ------------------------------------------------ pricing sidebar */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Class and price" subtitle="Class is independent of apartment type." />
            <div className="flex flex-col gap-4 p-5">
              <fieldset className="border-0 p-0">
                <legend className="sr-only">Select a class</legend>
                <div className="flex flex-col gap-2">
                  {APARTMENT_CLASSES.map((entry) => {
                    const entryPrice = findPrice(unit.unitTypeCode, entry.code);
                    const isSelected = entry.code === selectedClass;
                    const unavailable = entryPrice?.price === null;

                    return (
                      <label
                        key={entry.code}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                          isSelected
                            ? 'border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)]/5'
                            : 'border-[var(--foakh-border-strong)] hover:bg-[var(--foakh-cream-soft)]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="class"
                          checked={isSelected}
                          onChange={() => setSelectedClass(entry.code)}
                          className="sr-only"
                        />
                        <div>
                          <p className="text-sm font-medium text-[var(--foakh-ink)]">{entry.name}</p>
                          <p className="text-xs text-[var(--foakh-muted)]">{entry.description}</p>
                        </div>
                        <span className="text-sm font-medium tabular-nums text-[var(--foakh-ink)]">
                          {unavailable || entryPrice?.price === null || entryPrice === undefined
                            ? '—'
                            : formatPkrFromRupees(entryPrice.price)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {price?.price != null && (
                <PriceBreakdown
                  areaSqFt={type.areaSqFt}
                  pricePerSqFt={price.pricePerSqFt ?? 0}
                  totalRupees={price.price}
                />
              )}

              {price?.needsConfirmation === true && (
                <Notice title="Provisional price — requires confirmation">
                  {price.confirmationNote}
                </Notice>
              )}

              {price?.price == null && (
                <Notice title="No published price">
                  Foakh has not supplied a figure for {type.name} in {classInfo.name}. This
                  combination cannot be sold until a price is configured.
                </Notice>
              )}

              {canBook ? (
                <ButtonLink
                  href={`/bookings/new?unitId=${unit.id}&classCode=${selectedClass}`}
                  size="lg"
                  fullWidth
                >
                  Start booking
                </ButtonLink>
              ) : (
                <p className="rounded-lg border border-dashed border-[var(--foakh-border-strong)] px-3 py-2.5 text-center text-xs text-[var(--foakh-muted)]">
                  {preview?.blockedReason ?? `This unit is ${humanise(unit.status).toLowerCase()}.`}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Rate comparison" subtitle="Per square foot, by class." />
            <ul className="divide-y divide-[var(--foakh-border)]">
              {APARTMENT_CLASSES.map((entry) => {
                const entryPrice = findPrice(unit.unitTypeCode, entry.code);
                return (
                  <li key={entry.code} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-[var(--foakh-text)]">{entry.name}</span>
                    <span className="font-mono text-sm text-[var(--foakh-ink)]">
                      {entryPrice?.pricePerSqFt == null
                        ? '—'
                        : `PKR ${formatRate(entryPrice.pricePerSqFt)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
