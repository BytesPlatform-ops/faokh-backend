'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/shell/CrmShell';
import { UnitCard } from '@/components/inventory/UnitCard';
import { Button, EmptyState, ErrorState, Field, Input, Select, Skeleton } from '@/components/ui';
import { APARTMENT_CLASSES, APARTMENT_TYPES, BUILDINGS, PROJECT } from '@/data/master-data';
import type { ClassCode, Unit, UnitFilters, UnitStatus, UnitTypeCode } from '@/services/crm';
import { inventoryService } from '@/services/crm';

const STATUSES: UnitStatus[] = ['AVAILABLE', 'ON_HOLD', 'BOOKED', 'SOLD', 'BLOCKED'];

function InventoryContent() {
  const params = useSearchParams();
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters are initialised from the URL so dashboard tiles can deep-link into
  // a pre-filtered inventory ("12 available" → the available units).
  const [filters, setFilters] = useState<UnitFilters>(() => ({
    ...(params.get('status') !== null ? { status: params.get('status') as UnitStatus } : {}),
    ...(params.get('building') !== null
      ? { buildingCode: params.get('building') as 'ABD' | 'UMR' }
      : {}),
  }));

  const load = useCallback(async (active: UnitFilters) => {
    try {
      setUnits(await inventoryService.list(active));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load inventory.');
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  const counts = useMemo(() => {
    if (units === null) return null;
    return {
      total: units.length,
      available: units.filter((unit) => unit.status === 'AVAILABLE').length,
    };
  }, [units]);

  function update(patch: Partial<UnitFilters>) {
    // Clearing here rather than in the effect keeps the skeleton behaviour
    // without a synchronous state update inside the effect body.
    setUnits(null);
    setFilters((previous) => ({ ...previous, ...patch }));
  }

  function clearFilters() {
    setUnits(null);
    setFilters({});
  }

  const hasFilters = Object.values(filters).some((value) => value !== undefined && value !== '');

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={
          counts === null
            ? `${PROJECT.name}`
            : `${counts.available} available of ${counts.total} shown`
        }
      />

      {/* ---------------------------------------------------------- filters */}
      <section aria-label="Filter inventory" className="mb-6 rounded-xl border border-[var(--foakh-border)] bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Search" htmlFor="unit-search">
            <Input
              id="unit-search"
              type="search"
              placeholder="Unit number"
              value={filters.search ?? ''}
              onChange={(event) => update({ search: event.target.value || undefined })}
            />
          </Field>

          <Field label="Building" htmlFor="filter-building">
            <Select
              id="filter-building"
              value={filters.buildingCode ?? ''}
              onChange={(event) =>
                update({ buildingCode: (event.target.value || undefined) as 'ABD' | 'UMR' | undefined })
              }
            >
              <option value="">All buildings</option>
              {BUILDINGS.map((building) => (
                <option key={building.code} value={building.code}>{building.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Floor" htmlFor="filter-floor">
            <Select
              id="filter-floor"
              value={filters.floorLevel ?? ''}
              onChange={(event) =>
                update({ floorLevel: event.target.value === '' ? undefined : Number(event.target.value) })
              }
            >
              <option value="">All floors</option>
              {Array.from({ length: PROJECT.totalFloors }, (_, index) => index + 1).map((level) => (
                <option key={level} value={level}>Floor {level}</option>
              ))}
            </Select>
          </Field>

          <Field label="Type" htmlFor="filter-type">
            <Select
              id="filter-type"
              value={filters.unitTypeCode ?? ''}
              onChange={(event) =>
                update({ unitTypeCode: (event.target.value || undefined) as UnitTypeCode | undefined })
              }
            >
              <option value="">All types</option>
              {APARTMENT_TYPES.map((type) => (
                <option key={type.code} value={type.code}>{type.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Class" htmlFor="filter-class">
            <Select
              id="filter-class"
              value={filters.classCode ?? ''}
              onChange={(event) =>
                update({ classCode: (event.target.value || undefined) as ClassCode | undefined })
              }
            >
              <option value="">All classes</option>
              {APARTMENT_CLASSES.map((entry) => (
                <option key={entry.code} value={entry.code}>{entry.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor="filter-status">
            <Select
              id="filter-status"
              value={filters.status ?? ''}
              onChange={(event) =>
                update({ status: (event.target.value || undefined) as UnitStatus | undefined })
              }
            >
              <option value="">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {hasFilters && (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ grid */}
      {error !== null ? (
        <ErrorState message={error} onRetry={() => void load(filters)} />
      ) : units === null ? (
        <div
          role="status"
          aria-live="polite"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          <span className="sr-only">Loading inventory</span>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-[26rem] w-full" />
          ))}
        </div>
      ) : units.length === 0 ? (
        <EmptyState
          title="No units match these filters"
          description="Try widening the building, floor or status filter."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {units.map((unit) => (
            <UnitCard key={unit.id} unit={unit} />
          ))}
        </div>
      )}
    </>
  );
}

export default function InventoryPage() {
  // `useSearchParams` needs a Suspense boundary so the shell is not pulled into
  // client-side rendering wholesale.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <InventoryContent />
    </Suspense>
  );
}
