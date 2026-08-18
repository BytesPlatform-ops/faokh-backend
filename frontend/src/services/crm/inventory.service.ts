import {
  APARTMENT_CLASSES,
  APARTMENT_TYPES,
  BUILDINGS,
  PRICE_MATRIX,
  PROJECT,
  RESIDENCE_CATEGORIES,
  apartmentLayouts,
  findPrice,
  findType,
} from '@/data/master-data';
import { getStore } from '@/data/mock-store';
import type {
  ApartmentClassInfo,
  ApartmentType,
  ClassCode,
  FloorAvailability,
  PriceEntry,
  ProjectInfo,
  Unit,
  UnitFilters,
  UnitTypeCode,
} from './types';
import { IS_MOCK, apiFetch, simulateLatency } from './config';

export const inventoryService = {
  async list(filters: UnitFilters = {}): Promise<Unit[]> {
    if (!IS_MOCK) {
      const query = new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value !== undefined) as [string, string][],
      );
      return apiFetch<Unit[]>(`/inventory?${query.toString()}`);
    }

    await simulateLatency();
    const search = filters.search?.trim().toLowerCase();

    return getStore().units.filter((unit) => {
      if (filters.residenceCategory && unit.residenceCategory !== filters.residenceCategory) {
        return false;
      }
      if (filters.buildingCode && unit.buildingCode !== filters.buildingCode) return false;
      if (filters.floorLevel !== undefined && unit.floorLevel !== filters.floorLevel) return false;
      if (filters.unitTypeCode && unit.unitTypeCode !== filters.unitTypeCode) return false;
      if (filters.classCode && unit.classCode !== filters.classCode) return false;
      if (filters.status && unit.status !== filters.status) return false;
      if (search && !unit.unitNumber.toLowerCase().includes(search)) return false;
      return true;
    });
  },

  async getById(unitId: string): Promise<Unit | null> {
    if (!IS_MOCK) return apiFetch<Unit>(`/inventory/${unitId}`);
    await simulateLatency(150);
    return getStore().units.find((unit) => unit.id === unitId) ?? null;
  },

  /**
   * Re-prices a unit for a different class.
   *
   * Class and type are independent, so the same physical unit has three prices.
   * The booking wizard uses this when the broker changes class.
   */
  async priceFor(unitId: string, classCode: ClassCode): Promise<Unit | null> {
    const unit = await this.getById(unitId);
    if (unit === null) return null;

    const price = findPrice(unit.unitTypeCode, classCode);
    return {
      ...unit,
      classCode,
      priceRupees: price?.price ?? null,
      pricePerSqFt: price?.pricePerSqFt ?? null,
      needsPriceConfirmation: price?.needsConfirmation ?? false,
    };
  },

  /**
   * Floors in a building, with a live count of what is actually sellable.
   *
   * Scoped to the layout the broker has already chosen, because that is the
   * only sensible reading of "available" at this point in the flow: a floor
   * whose only free unit is a Type D is not a floor with availability when the
   * client is buying a Type A. Floors with nothing are still returned — with a
   * zero count — so the shape of the building stays visible, and the UI
   * disables them rather than hiding them.
   */
  async floorAvailability(
    buildingCode: Unit['buildingCode'],
    unitTypeCode?: UnitTypeCode | null,
  ): Promise<FloorAvailability[]> {
    if (!IS_MOCK) {
      const query = unitTypeCode ? `?unitTypeCode=${unitTypeCode}` : '';
      return apiFetch<FloorAvailability[]>(`/inventory/floors/${buildingCode}${query}`);
    }

    await simulateLatency(180);
    const units = getStore().units.filter(
      (unit) =>
        unit.buildingCode === buildingCode &&
        (unitTypeCode == null || unit.unitTypeCode === unitTypeCode),
    );

    const byLevel = new Map<number, Unit[]>();
    for (const unit of units) {
      const existing = byLevel.get(unit.floorLevel);
      if (existing === undefined) byLevel.set(unit.floorLevel, [unit]);
      else existing.push(unit);
    }

    return [...byLevel.entries()]
      .map(([level, floorUnits]) => {
        const availableCount = floorUnits.filter((unit) => unit.status === 'AVAILABLE').length;
        return { level, availableCount, matchesRequirements: availableCount > 0 };
      })
      .sort((a, b) => a.level - b.level);
  },

  /**
   * The units a broker may actually pick from, priced at the chosen class.
   *
   * Deterministic: what comes back is exactly what matches the layout, building
   * and floor already chosen. There is no recommendation engine and no
   * "outside your preferences" bucket — the broker is deliberately selecting a
   * property, and a second list of things they did not ask for is noise at the
   * moment they are trying to close.
   *
   * Prices are resolved per class rather than read off the unit, because the
   * same physical apartment has three prices and the class was chosen upstream.
   */
  async available(filters: UnitFilters, classCode: ClassCode | null): Promise<Unit[]> {
    const units = await this.list({ ...filters, status: 'AVAILABLE' });
    if (classCode === null) return units;

    return units.map((unit) => {
      const price = findPrice(unit.unitTypeCode, classCode);
      return {
        ...unit,
        classCode,
        priceRupees: price?.price ?? null,
        pricePerSqFt: price?.pricePerSqFt ?? null,
        needsPriceConfirmation: price?.needsConfirmation ?? false,
      };
    });
  },

  /** Every price for a unit type, so the class step can show the comparison. */
  async pricesForType(unitTypeCode: UnitTypeCode): Promise<PriceEntry[]> {
    if (!IS_MOCK) return apiFetch<PriceEntry[]>(`/inventory/pricing/${unitTypeCode}`);
    await simulateLatency(80);
    return PRICE_MATRIX.filter((entry) => entry.unitTypeCode === unitTypeCode);
  },

  async priceEntry(
    unitTypeCode: UnitTypeCode,
    classCode: ClassCode,
  ): Promise<PriceEntry | undefined> {
    const entries = await this.pricesForType(unitTypeCode);
    return entries.find((entry) => entry.classCode === classCode);
  },

  types(): ApartmentType[] {
    return APARTMENT_TYPES;
  },

  /** The four apartment layouts — the penthouse is a category, not a layout. */
  layouts(): ApartmentType[] {
    return apartmentLayouts();
  },

  categories() {
    return RESIDENCE_CATEGORIES;
  },

  classes(): ApartmentClassInfo[] {
    return APARTMENT_CLASSES;
  },

  buildings() {
    return BUILDINGS;
  },

  project(): ProjectInfo {
    return {
      name: PROJECT.name,
      addressLine: PROJECT.addressLine,
      city: PROJECT.city,
      country: PROJECT.country,
      totalFloors: PROJECT.totalFloors,
      currency: PROJECT.currency,
      expectedHandoverDate: PROJECT.expectedHandoverDate,
    };
  },

  /** True once somebody has ratified a provisional price. */
  isPriceConfirmed(unitTypeCode: UnitTypeCode, classCode: ClassCode): boolean {
    if (!IS_MOCK) return false;
    return getStore().confirmedPrices.has(`${unitTypeCode}:${classCode}`);
  },

  /**
   * Ratifies a provisional price.
   *
   * Deliberately records *who* rather than just flipping a flag. Type D Elegant
   * and Sonder differ from Foakh's supplied figures by a factor of ten, so the
   * one thing that must never happen is a corrected price reaching a signed
   * contract with nobody's name against it.
   */
  async confirmPrice(
    unitTypeCode: UnitTypeCode,
    classCode: ClassCode,
    confirmedBy: string,
  ): Promise<void> {
    if (!IS_MOCK) {
      await apiFetch(`/inventory/pricing/${unitTypeCode}/${classCode}/confirm`, {
        method: 'POST',
      });
      return;
    }

    await simulateLatency(250);
    getStore().confirmedPrices.set(`${unitTypeCode}:${classCode}`, {
      confirmedBy,
      confirmedAt: new Date().toISOString(),
    });
  },

  typeFor(unit: Unit): ApartmentType {
    return findType(unit.unitTypeCode);
  },

  /** The layout behind a code, for screens that have a code but no unit yet. */
  typeByCode(code: UnitTypeCode): ApartmentType {
    return findType(code);
  },
};
