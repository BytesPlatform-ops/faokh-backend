import { Injectable } from '@nestjs/common';
import { Prisma, UnitStatus } from '@prisma/client';

import { AppException } from '../../common/errors/app.exception';
import { toRate, toRupees } from '../../common/presenters';
import { PrismaService } from '../../database/prisma.service';
import type { ListUnitsDto } from './inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUnitsDto) {
    // Every layout-level filter has to be composed into ONE `unitType` object.
    // Spreading several `{ unitType: ... }` keys silently drops all but the
    // last, so a search for "Type A, 3 bedrooms" would quietly stop filtering
    // by type and return the whole building.
    const unitTypeFilter: Prisma.UnitTypeWhereInput = {
      ...(query.residenceCategory ? { residenceCategory: query.residenceCategory } : {}),
      ...(query.unitTypeCode ? { code: query.unitTypeCode } : {}),
      // Bedrooms narrow a shortlist; they are not a residence type. 3 means
      // "three or more".
      ...(query.bedrooms !== undefined
        ? { bedrooms: query.bedrooms >= 3 ? { gte: 3 } : query.bedrooms }
        : {}),
      ...(query.hasBalcony !== undefined ? { hasBalcony: query.hasBalcony } : {}),
    };

    const units = await this.prisma.unit.findMany({
      // One JOIN instead of a round trip per relation. See the generator block
      // in schema.prisma for why that is worth caring about here.
      relationLoadStrategy: 'join',
      where: {
        ...(query.buildingCode ? { building: { code: query.buildingCode } } : {}),
        ...(query.floorLevel !== undefined ? { floor: { level: query.floorLevel } } : {}),
        ...(query.classCode ? { class: { code: query.classCode } } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.search ? { unitNumber: { contains: query.search, mode: 'insensitive' } } : {}),
        // Applied in SQL rather than in the client so a broker on a phone is not
        // downloading the whole building in order to filter it.
        ...(Object.keys(unitTypeFilter).length > 0 ? { unitType: unitTypeFilter } : {}),
        ...(query.minParking !== undefined ? { parkingSpaces: { gte: query.minParking } } : {}),
      },
      orderBy: [
        { building: { sortOrder: 'asc' } },
        { floor: { level: 'asc' } },
        { unitNumber: 'asc' },
      ],
      include: unitInclude,
    });

    const prices = await this.priceIndex();
    const presented = units.map((unit) => presentUnit(unit, prices));

    // Budget filters against the resolved price, which depends on the class —
    // so it is applied after presentation rather than in the query.
    return presented.filter((unit) => {
      if (unit.priceRupees === null)
        return query.minBudget === undefined && query.maxBudget === undefined;
      if (query.minBudget !== undefined && unit.priceRupees < query.minBudget) return false;
      if (query.maxBudget !== undefined && unit.priceRupees > query.maxBudget) return false;
      return true;
    });
  }

  async getById(id: string) {
    const unit = await this.prisma.unit.findUnique({
      relationLoadStrategy: 'join',
      where: { id },
      include: unitInclude,
    });
    if (unit === null) throw AppException.notFound('That unit could not be found.');
    return presentUnit(unit, await this.priceIndex());
  }

  /**
   * The live price matrix, keyed by layout and class.
   *
   * A unit's price is the intersection of its layout type and its class, not a
   * column on the unit — the same physical apartment has three prices. Loading
   * the whole matrix once (thirteen rows) and resolving in memory keeps a list
   * of forty units to two queries instead of forty-one.
   *
   * Rows with `effectiveTo` set are historical: a booking already signed against
   * one keeps its frozen snapshot, but nothing new may be priced from it.
   */
  private async priceIndex(): Promise<PriceIndex> {
    const rows = await this.prisma.pricingConfiguration.findMany({
      where: { effectiveTo: null },
      include: { unitType: { select: { code: true } }, class: { select: { code: true } } },
    });

    return new Map(
      rows.map((row) => [
        priceKey(row.unitType.code, row.class.code),
        {
          price: row.price,
          pricePerSqFt: row.pricePerSqFt,
          needsConfirmation: row.needsConfirmation,
        },
      ]),
    );
  }

  /**
   * Floors in a building with a live count of what is genuinely sellable.
   *
   * The booking wizard shows these so a broker never taps into an empty floor.
   */
  async floorAvailability(buildingCode: string, unitTypeCode?: string) {
    const floors = await this.prisma.floor.findMany({
      where: { building: { code: buildingCode } },
      orderBy: { level: 'asc' },
      include: {
        units: {
          // Scoped to the chosen layout: "3 available" must mean three units the
          // client can actually buy, not three units of any type.
          where: unitTypeCode ? { unitType: { code: unitTypeCode } } : {},
          select: { status: true },
        },
      },
    });

    return floors.map((floor) => {
      const availableCount = floor.units.filter(
        (unit) => unit.status === UnitStatus.AVAILABLE,
      ).length;
      return { level: floor.level, availableCount, matchesRequirements: availableCount > 0 };
    });
  }

  /** The full price matrix for a unit type, for the class-comparison step. */
  async pricesForType(unitTypeCode: string) {
    const rows = await this.prisma.pricingConfiguration.findMany({
      where: { unitType: { code: unitTypeCode }, effectiveTo: null },
      include: { unitType: true, class: true },
    });

    return rows.map((row) => ({
      unitTypeCode: row.unitType.code,
      classCode: row.class.code,
      price: toRupees(row.price),
      pricePerSqFt: toRate(row.pricePerSqFt),
      needsConfirmation: row.needsConfirmation,
      ...(row.confirmationNote !== null ? { confirmationNote: row.confirmationNote } : {}),
    }));
  }

  async buildings() {
    return this.prisma.building.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { code: true, name: true, plannedUnitCount: true },
    });
  }

  async productMaster() {
    const [types, classes, project] = await Promise.all([
      this.prisma.unitType.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.apartmentClass.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.project.findFirst(),
    ]);

    return {
      types: types.map((type) => ({
        code: type.code,
        residenceCategory: type.residenceCategory,
        name: type.name,
        areaSqFt: Number(type.areaSqFt),
        bedrooms: type.bedrooms,
        bathrooms: type.bathrooms,
        attachedBathrooms: type.attachedBathrooms,
        hasBalcony: type.hasBalcony,
        includedParkingSpaces: type.includedParkingSpaces,
        parkingPurchasableSeparately: type.parkingPurchasableSeparately,
        spansFloors: type.spansFloors,
        ...(type.floorSpanLabel !== null ? { floorSpanLabel: type.floorSpanLabel } : {}),
        description: type.description ?? '',
      })),
      classes: classes.map((entry) => ({
        code: entry.code,
        name: entry.name,
        furnishingLevel: entry.furnishingLevel,
        isServiced: entry.isServiced,
        description: entry.description ?? '',
      })),
      project:
        project === null
          ? null
          : {
              name: project.name,
              city: project.city,
              totalFloors: project.totalFloors,
              currency: project.currency,
              // Never invented: prints as "To be confirmed" until Foakh sets it.
              expectedHandoverDate: project.expectedHandoverDate?.toISOString() ?? null,
            },
    };
  }
}

const unitInclude = {
  building: { select: { code: true, name: true } },
  floor: { select: { level: true } },
  unitType: { select: { code: true, areaSqFt: true, residenceCategory: true } },
  class: { select: { code: true } },
} satisfies Prisma.UnitInclude;

type UnitWithRelations = Prisma.UnitGetPayload<{ include: typeof unitInclude }>;

interface PriceRow {
  price: Prisma.Decimal;
  pricePerSqFt: Prisma.Decimal;
  needsConfirmation: boolean;
}

type PriceIndex = Map<string, PriceRow>;

function priceKey(unitTypeCode: string, classCode: string): string {
  return `${unitTypeCode}:${classCode}`;
}

function presentUnit(unit: UnitWithRelations, prices: PriceIndex) {
  const matrix = prices.get(priceKey(unit.unitType.code, unit.class.code));

  // A per-unit override wins when set — it exists so a specific apartment can
  // be sold at an agreed figure — but it is deliberately rare, so the matrix is
  // what almost every unit resolves to.
  const override = toRupees(unit.listPriceOverride);
  const area = Number(unit.unitType.areaSqFt);

  const priceRupees = override ?? toRupees(matrix?.price ?? null);
  const pricePerSqFt =
    override !== null
      ? area > 0
        ? Math.round((override / area) * 10_000) / 10_000
        : null
      : toRate(matrix?.pricePerSqFt ?? null);

  return {
    id: unit.id,
    unitNumber: unit.unitNumber,
    buildingCode: unit.building.code,
    buildingName: unit.building.name,
    floorLevel: unit.floor.level,
    unitTypeCode: unit.unitType.code,
    residenceCategory: unit.unitType.residenceCategory,
    classCode: unit.class.code,
    status: unit.status,
    parkingSpaces: unit.parkingSpaces,
    priceRupees,
    pricePerSqFt,
    // An override is an agreed figure, so it is never flagged; only the matrix
    // carries figures Foakh has yet to ratify.
    needsPriceConfirmation: override !== null ? false : (matrix?.needsConfirmation ?? false),
    notes: unit.notes ?? undefined,
  };
}
