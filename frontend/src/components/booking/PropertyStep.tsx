'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

import { Badge, Button, EmptyState, ErrorState, Skeleton, humanise, statusTone } from '@/components/ui';
import { RESIDENCE_CATEGORIES, findPrice, typesForCategory } from '@/data/master-data';
import { formatPkrFromRupees } from '@/lib/format';
import { layoutSpecs } from '@/lib/specs';
import type {
  ApartmentType,
  BuildingCode,
  ClassCode,
  FloorAvailability,
  ResidenceCategory,
  Unit,
  UnitTypeCode,
} from '@/services/crm';
import { inventoryService } from '@/services/crm';

/**
 * The whole property choice, without leaving the booking.
 *
 *   Residence category  →  Layout type  →  Building  →  Floor  →  Unit
 *
 * The order is the product hierarchy, and it is deliberate: category and layout
 * are what a client actually talks about ("a two-bedroom", "the penthouse"),
 * while building, floor and unit are where that lands physically. Choosing the
 * layout first also means the floor and unit screens show a handful of relevant
 * units instead of forty.
 *
 * Specifications — bedrooms, bathrooms, balcony, parking, area — are *derived*
 * from the layout and rendered read-only everywhere. They are never inputs.
 */

// ------------------------------------------------------------------ category

export function CategoryPicker({
  selected,
  onSelect,
}: {
  selected: ResidenceCategory | null;
  onSelect: (category: ResidenceCategory) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {RESIDENCE_CATEGORIES.map((category) => {
          const isSelected = selected === category.code;
          const layouts = typesForCategory(category.code);

          return (
            <label
              key={category.code}
              className={`relative cursor-pointer overflow-hidden rounded-xl border transition-colors ${
                isSelected
                  ? 'border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)]/5'
                  : 'border-[var(--foakh-border-strong)] bg-white hover:bg-[var(--foakh-cream-soft)]'
              }`}
            >
              <input
                type="radio"
                name="residence-category"
                checked={isSelected}
                onChange={() => onSelect(category.code)}
                className="sr-only"
              />
              <div className="relative aspect-[16/8] w-full bg-[var(--foakh-cream-warm)]">
                <Image
                  src={category.image}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
              <div className="px-5 py-4">
                <p className="font-display text-xl font-medium text-[var(--foakh-ink)]">
                  {category.name}
                </p>
                <p className="mt-1 text-xs text-[var(--foakh-muted)]">{category.description}</p>
                {category.code === 'DUPLEX_PENTHOUSE' && layouts[0] !== undefined && (
                  <p className="mt-2 text-xs text-[var(--foakh-text)]">
                    {layoutSpecs(layouts[0]).join(' · ')}
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>

      <p className="text-xs text-[var(--foakh-muted)]">
        A duplex penthouse is its own residence, not a larger apartment layout — it has no Type
        A–D specification.
      </p>
    </div>
  );
}

// -------------------------------------------------------------------- layout

/**
 * The four apartment layouts.
 *
 * Each card shows the specifications the layout *implies*. The broker chooses a
 * layout; they never choose a bedroom count, because a bedroom count is not a
 * thing Foakh sells.
 */
export function LayoutPicker({
  selected,
  onSelect,
}: {
  selected: UnitTypeCode | null;
  onSelect: (code: UnitTypeCode) => void;
}) {
  const layouts = typesForCategory('APARTMENT');

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {layouts.map((type) => {
        const isSelected = selected === type.code;
        const cheapest = findPrice(type.code, 'CLASSIC');

        return (
          <label
            key={type.code}
            className={`flex cursor-pointer flex-col overflow-hidden rounded-xl border transition-colors ${
              isSelected
                ? 'border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)]/5'
                : 'border-[var(--foakh-border-strong)] bg-white hover:bg-[var(--foakh-cream-soft)]'
            }`}
          >
            <input
              type="radio"
              name="layout-type"
              checked={isSelected}
              onChange={() => onSelect(type.code)}
              className="sr-only"
            />

            {type.images[0] !== undefined && (
              <div className="relative aspect-[16/9] w-full bg-[var(--foakh-cream-warm)]">
                <Image
                  src={type.images[0]}
                  alt={`${type.name} layout`}
                  fill
                  sizes="(max-width: 640px) 100vw, 40vw"
                  className="object-cover"
                />
              </div>
            )}

            <div className="flex flex-1 flex-col gap-2 p-4">
              <p className="font-display text-lg font-medium text-[var(--foakh-ink)]">
                {type.name}
              </p>
              <SpecList type={type} />
              {cheapest?.price != null && (
                <p className="mt-auto border-t border-[var(--foakh-border)] pt-2 text-xs text-[var(--foakh-muted)]">
                  From{' '}
                  <span className="font-medium text-[var(--foakh-ink)]">
                    {formatPkrFromRupees(cheapest.price)}
                  </span>{' '}
                  · price depends on class
                </p>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Read-only specifications for a layout.
 *
 * Rendered as a definition list rather than form controls, because that is what
 * these are: facts about the layout the broker has chosen.
 */
export function SpecList({ type }: { type: ApartmentType }) {
  return (
    <ul className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--foakh-text)]">
      {layoutSpecs(type).map((spec, index) => (
        <li key={spec} className="flex items-center gap-2">
          {index > 0 && (
            <span aria-hidden="true" className="text-[var(--foakh-muted)] opacity-50">
              ·
            </span>
          )}
          {spec}
        </li>
      ))}
    </ul>
  );
}

/** The confirmation strip shown once a layout is locked in. */
export function SelectedLayoutSummary({ type }: { type: ApartmentType }) {
  return (
    <div className="rounded-lg border border-[var(--foakh-line,var(--foakh-border))] bg-[var(--foakh-cream-soft)] px-4 py-3">
      <p className="text-[0.6rem] font-semibold tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
        {type.name} specifications
      </p>
      <div className="mt-1.5">
        <SpecList type={type} />
      </div>
      <p className="mt-1.5 text-[0.68rem] text-[var(--foakh-muted)]">
        Fixed by the layout — not selectable.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ building

export function BuildingPicker({
  selected,
  onSelect,
}: {
  selected: BuildingCode | null;
  onSelect: (code: BuildingCode) => void;
}) {
  const buildings = inventoryService.buildings();
  const project = inventoryService.project();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {buildings.map((building) => {
        const isSelected = selected === building.code;
        return (
          <label
            key={building.code}
            className={`relative cursor-pointer overflow-hidden rounded-xl border transition-colors ${
              isSelected
                ? 'border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)]/5'
                : 'border-[var(--foakh-border-strong)] bg-white hover:bg-[var(--foakh-cream-soft)]'
            }`}
          >
            <input
              type="radio"
              name="building"
              checked={isSelected}
              onChange={() => onSelect(building.code)}
              className="sr-only"
            />
            <div className="relative aspect-[16/7] w-full bg-[var(--foakh-cream-warm)]">
              <Image
                src="/media/residences/duplex-penthouses/exterior.jpg"
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover opacity-90"
              />
            </div>
            <div className="px-5 py-4">
              <p className="font-display text-xl font-medium text-[var(--foakh-ink)]">
                {building.name} Block
              </p>
              <p className="mt-1 text-xs text-[var(--foakh-muted)]">
                {building.plannedUnitCount} units · {project.totalFloors} floors
              </p>
            </div>
          </label>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------- floor

export function FloorPicker({
  buildingCode,
  unitTypeCode,
  typeName,
  selected,
  onSelect,
  onChooseOtherBuilding,
  onChangeType,
}: {
  buildingCode: BuildingCode;
  unitTypeCode: UnitTypeCode | null;
  typeName: string;
  selected: number | null;
  onSelect: (level: number | null) => void;
  onChooseOtherBuilding: () => void;
  onChangeType: () => void;
}) {
  const [floors, setFloors] = useState<FloorAvailability[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFloors(await inventoryService.floorAvailability(buildingCode, unitTypeCode));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load floors.');
    }
  }, [buildingCode, unitTypeCode]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error !== null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (floors === null) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 12 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const totalAvailable = floors.reduce((sum, floor) => sum + floor.availableCount, 0);

  // Genuinely nothing to sell here — not a preference filter hiding stock. The
  // three ways out are stated plainly, because "no results" with no next step
  // is where a broker gets stuck mid-conversation with a client.
  if (totalAvailable === 0) {
    return (
      <EmptyState
        title={`No available ${typeName} units in ${buildingCode === 'ABD' ? 'Abdullah' : 'Umer'} Block`}
        description="Every unit of this layout here is booked, sold or blocked."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onChooseOtherBuilding}>
              View the other block
            </Button>
            <Button variant="ghost" onClick={onChangeType}>
              Choose another type
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--foakh-muted)]">
          {totalAvailable} {typeName} unit{totalAvailable === 1 ? '' : 's'} available in this
          building.
        </p>
        <Button
          variant={selected === null ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onSelect(null)}
        >
          All available floors
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {floors.map((floor) => {
          const isSelected = selected === floor.level;
          const isEmpty = floor.availableCount === 0;

          return (
            <button
              key={floor.level}
              type="button"
              // A floor with nothing to sell is not worth a tap. Disabling it is
              // kinder than letting a broker land on an empty screen.
              disabled={isEmpty}
              aria-pressed={isSelected}
              onClick={() => onSelect(floor.level)}
              className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                isEmpty
                  ? 'cursor-not-allowed border-[var(--foakh-border)] bg-[var(--foakh-cream-soft)] opacity-55'
                  : isSelected
                    ? 'border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)]/5'
                    : 'border-[var(--foakh-border-strong)] bg-white hover:bg-[var(--foakh-cream-soft)]'
              }`}
            >
              <span className="block text-sm font-medium text-[var(--foakh-ink)]">
                Floor {String(floor.level).padStart(2, '0')}
              </span>
              <span
                className={`mt-0.5 block text-xs ${
                  isEmpty ? 'text-[var(--foakh-muted)]' : 'text-[var(--foakh-terracotta-deep)]'
                }`}
              >
                {isEmpty
                  ? 'None available'
                  : `${floor.availableCount} available`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- unit

export function UnitPicker({
  buildingCode,
  floorLevel,
  unitTypeCode,
  classCode,
  typeName,
  selected,
  onSelect,
  onChooseOtherBuilding,
  onChangeType,
}: {
  buildingCode: BuildingCode;
  floorLevel: number | null;
  unitTypeCode: UnitTypeCode | null;
  classCode: ClassCode | null;
  typeName: string;
  selected: Unit | null;
  onSelect: (unit: Unit) => void;
  onChooseOtherBuilding: () => void;
  onChangeType: () => void;
}) {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUnits(
        await inventoryService.available(
          {
            buildingCode,
            ...(floorLevel !== null ? { floorLevel } : {}),
            ...(unitTypeCode !== null ? { unitTypeCode } : {}),
          },
          classCode,
        ),
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load units.');
    }
  }, [buildingCode, floorLevel, unitTypeCode, classCode]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error !== null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (units === null) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-56 w-full" />
        ))}
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <EmptyState
        title={`No available ${typeName} units${floorLevel === null ? '' : ` on floor ${floorLevel}`}`}
        description="Nothing of this layout is free here."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onChooseOtherBuilding}>
              View the other block
            </Button>
            <Button variant="ghost" onClick={onChangeType}>
              Choose another type
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {units.map((unit) => (
        <BookingUnitCard
          key={unit.id}
          unit={unit}
          selected={selected?.id === unit.id}
          onSelect={() => onSelect(unit)}
        />
      ))}
    </div>
  );
}

/**
 * A unit card tuned for the wizard: selectable, and showing the "from" price
 * across classes rather than one class's figure — the class is chosen next.
 */
export function BookingUnitCard({
  unit,
  selected,
  onSelect,
}: {
  unit: Unit;
  selected: boolean;
  onSelect: () => void;
}) {
  const type = inventoryService.typeFor(unit);
  const image = type.images[0];

  return (
    <label
      className={`flex cursor-pointer flex-col overflow-hidden rounded-xl border transition-colors ${
        selected
          ? 'border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)]/5'
          : 'border-[var(--foakh-border-strong)] bg-white hover:bg-[var(--foakh-cream-soft)]'
      }`}
    >
      <input
        type="radio"
        name="booking-unit"
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />

      {image !== undefined && (
        <div className="relative aspect-[16/9] w-full bg-[var(--foakh-cream-warm)]">
          <Image
            src={image}
            alt={`${type.name} residence`}
            fill
            sizes="(max-width: 640px) 100vw, 40vw"
            className="object-cover"
          />
          <span className="absolute top-2 right-2">
            <Badge tone={statusTone(unit.status)}>{humanise(unit.status)}</Badge>
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <p className="font-display text-base font-medium text-[var(--foakh-ink)]">
            Unit {unit.unitNumber}
          </p>
          <p className="mt-0.5 text-xs text-[var(--foakh-muted)]">
            {unit.buildingName} ·{' '}
            {type.floorSpanLabel ?? `Floor ${unit.floorLevel}`}
          </p>
        </div>

        <span className="w-fit rounded-md bg-[var(--foakh-cream)] px-2 py-1 text-[0.6rem] font-semibold tracking-[0.1em] text-[var(--foakh-ink)] uppercase">
          {type.name}
        </span>

        <SpecList type={type} />

        {unit.priceRupees !== null && (
          <p className="mt-auto border-t border-[var(--foakh-border)] pt-2 text-xs text-[var(--foakh-muted)]">
            From{' '}
            <span className="font-medium text-[var(--foakh-ink)]">
              {formatPkrFromRupees(unit.priceRupees)}
            </span>{' '}
            · price depends on class
          </p>
        )}
      </div>
    </label>
  );
}
