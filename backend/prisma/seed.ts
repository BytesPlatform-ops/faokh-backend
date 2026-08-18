import {
  type ApartmentClass,
  SalesAgentStatus,
  Prisma,
  PrismaClient,
  RoleName,
  UnitStatus,
  type UnitType,
  UserStatus,
} from '@prisma/client';

import { hashPassword } from '../src/common/utils/crypto';
import { pricePerSqFt } from '../src/common/money/money';
import {
  BUILDINGS,
  CLASSES,
  PRICES,
  PROJECT,
  STANDARD_INVENTORY,
  UNIT_TYPES,
  unitNumberFor,
} from './master-data';

/**
 * Idempotent seed. Every write is an upsert keyed on a natural identifier and
 * nothing is ever deleted, so running it against an environment that already
 * has bookings converges rather than destroying data.
 */
const prisma = new PrismaClient();

/** Demo passwords. Documented in the README and refused in production. */
/**
 * The staff accounts a fresh environment needs to function.
 *
 * Not demo data: without a Sales Agent nobody can create a client, and without
 * an administrator nobody can configure prices. No demo clients, brokers or
 * bookings are seeded — the CRM starts empty and is filled by real use.
 */
const STAFF_USERS = [
  {
    email: 'admin@foakh.local',
    name: 'Foakh Administrator',
    role: RoleName.SUPER_ADMIN,
    password: 'FoakhAdmin!2026',
  },
  {
    email: 'manager@foakh.local',
    name: 'Sales Manager',
    role: RoleName.MANAGER,
    password: 'FoakhManager!2026',
  },
  {
    email: 'finance@foakh.local',
    name: 'Finance Officer',
    role: RoleName.FINANCE,
    password: 'FoakhFinance!2026',
  },
  {
    email: 'agent1@foakh.local',
    name: 'Ali Raza',
    role: RoleName.SALES_AGENT,
    password: 'FoakhAgent!2026',
    mobile: '+923001112221',
  },
  {
    email: 'agent2@foakh.local',
    name: 'Hina Shah',
    role: RoleName.SALES_AGENT,
    password: 'FoakhAgent!2026',
    mobile: '+923001112222',
  },
];

async function seedRoles(): Promise<void> {
  const descriptions: Record<RoleName, string> = {
    SUPER_ADMIN: 'Full access including configuration and user management.',
    ADMIN: 'Inventory, pricing, bookings and attribution overrides.',
    MANAGER: 'All Sales Agents, clients, bookings and reports.',
    FINANCE: 'Payments, receipts, outstanding instalments and commission payouts.',
    SALES_AGENT: 'Own clients, bookings and invoices. Internal Foakh sales staff.',
  };

  for (const name of Object.values(RoleName)) {
    await prisma.role.upsert({
      where: { name },
      update: { description: descriptions[name] },
      create: { name, description: descriptions[name] },
    });
  }
  console.log(`  roles                  ${Object.values(RoleName).length}`);
}

/** Allocates the next human-readable id, e.g. BRK-2026-000001. */
async function nextCode(prefix: string, year: number): Promise<string> {
  const sequence = await prisma.idSequence.upsert({
    where: { prefix_year: { prefix, year } },
    update: { lastValue: { increment: 1 } },
    create: { prefix, year, lastValue: 1 },
  });
  return `${prefix}-${year}-${String(sequence.lastValue).padStart(6, '0')}`;
}

async function seedUsers(): Promise<void> {
  const year = new Date().getUTCFullYear();

  for (const spec of STAFF_USERS) {
    const passwordHash = await hashPassword(spec.password);

    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: { displayName: spec.name, status: UserStatus.ACTIVE },
      create: {
        email: spec.email,
        displayName: spec.name,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    const role = await prisma.role.findUniqueOrThrow({ where: { name: spec.role } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    // A Sales Agent profile carries the SAG code that attributes their work.
    // External brokers are a different entity entirely and are never seeded —
    // they are recorded by an agent when a real referral happens.
    if (spec.role === RoleName.SALES_AGENT) {
      const existing = await prisma.salesAgent.findUnique({ where: { userId: user.id } });
      if (existing === null) {
        await prisma.salesAgent.create({
          data: {
            userId: user.id,
            salesAgentCode: await nextCode('SAG', year),
            mobile: spec.mobile ?? null,
            status: SalesAgentStatus.ACTIVE,
          },
        });
      }
    }
  }

  const agents = await prisma.salesAgent.findMany({ include: { user: true } });
  console.log(`  staff users            ${STAFF_USERS.length}`);
  for (const agent of agents) {
    console.log(`    ${agent.salesAgentCode}  ${agent.user.email}  ${agent.user.displayName}`);
  }
}

async function seedProduct(): Promise<{
  types: Map<string, UnitType>;
  classes: Map<string, ApartmentClass>;
}> {
  const types = new Map<string, UnitType>();
  for (const spec of UNIT_TYPES) {
    const record = await prisma.unitType.upsert({
      where: { code: spec.code },
      update: {
        name: spec.name,
        residenceCategory: spec.residenceCategory,
        areaSqFt: new Prisma.Decimal(spec.areaSqFt),
        bedrooms: spec.bedrooms,
        bathrooms: spec.bathrooms,
        attachedBathrooms: spec.attachedBathrooms,
        hasBalcony: spec.hasBalcony,
        includedParkingSpaces: spec.includedParkingSpaces,
        parkingPurchasableSeparately: spec.parkingPurchasableSeparately,
        spansFloors: spec.spansFloors,
        floorSpanLabel: spec.floorSpanLabel ?? null,
        description: spec.description,
        sortOrder: spec.sortOrder,
      },
      create: {
        code: spec.code,
        name: spec.name,
        residenceCategory: spec.residenceCategory,
        areaSqFt: new Prisma.Decimal(spec.areaSqFt),
        bedrooms: spec.bedrooms,
        bathrooms: spec.bathrooms,
        attachedBathrooms: spec.attachedBathrooms,
        hasBalcony: spec.hasBalcony,
        includedParkingSpaces: spec.includedParkingSpaces,
        parkingPurchasableSeparately: spec.parkingPurchasableSeparately,
        spansFloors: spec.spansFloors,
        floorSpanLabel: spec.floorSpanLabel ?? null,
        description: spec.description,
        sortOrder: spec.sortOrder,
      },
    });
    types.set(spec.code, record);
  }

  const classes = new Map<string, ApartmentClass>();
  for (const spec of CLASSES) {
    const record = await prisma.apartmentClass.upsert({
      where: { code: spec.code },
      update: {
        name: spec.name,
        furnishingLevel: spec.furnishingLevel,
        isServiced: spec.isServiced,
        description: spec.description,
        sortOrder: spec.sortOrder,
      },
      create: {
        code: spec.code,
        name: spec.name,
        furnishingLevel: spec.furnishingLevel,
        isServiced: spec.isServiced,
        description: spec.description,
        sortOrder: spec.sortOrder,
      },
    });
    classes.set(spec.code, record);
  }

  console.log(`  unit types             ${types.size}`);
  console.log(`  classes                ${classes.size}`);
  return { types, classes };
}

async function seedPricing(
  types: Map<string, UnitType>,
  classes: Map<string, ApartmentClass>,
): Promise<void> {
  let flagged = 0;

  for (const spec of PRICES) {
    const unitType = types.get(spec.unitTypeCode);
    const apartmentClass = classes.get(spec.classCode);
    if (unitType === undefined || apartmentClass === undefined) continue;

    const price = new Prisma.Decimal(spec.price);
    // Derived and stored: the printed schedule must keep the rate that was
    // agreed even if the area master data is later corrected.
    const rate = pricePerSqFt(price, unitType.areaSqFt);

    const existing = await prisma.pricingConfiguration.findFirst({
      where: { unitTypeId: unitType.id, classId: apartmentClass.id, effectiveTo: null },
    });

    if (existing === null) {
      await prisma.pricingConfiguration.create({
        data: {
          unitTypeId: unitType.id,
          classId: apartmentClass.id,
          price,
          pricePerSqFt: rate,
          needsConfirmation: spec.needsConfirmation,
          confirmationNote: spec.confirmationNote ?? null,
        },
      });
    } else {
      // Never silently re-flag a price an administrator has already ratified.
      await prisma.pricingConfiguration.update({
        where: { id: existing.id },
        data: {
          price,
          pricePerSqFt: rate,
          ...(existing.confirmedAt === null
            ? {
                needsConfirmation: spec.needsConfirmation,
                confirmationNote: spec.confirmationNote ?? null,
              }
            : {}),
        },
      });
    }

    if (spec.needsConfirmation) flagged += 1;
  }

  console.log(`  pricing configurations ${PRICES.length}  (${flagged} awaiting confirmation)`);
}

async function seedInventory(
  types: Map<string, UnitType>,
  classes: Map<string, ApartmentClass>,
): Promise<void> {
  const project = await prisma.project.upsert({
    where: { code: PROJECT.code },
    update: {
      name: PROJECT.name,
      addressLine: PROJECT.addressLine,
      city: PROJECT.city,
      province: PROJECT.province,
      country: PROJECT.country,
      timezone: PROJECT.timezone,
      totalFloors: PROJECT.totalFloors,
      currency: PROJECT.currency,
    },
    create: {
      code: PROJECT.code,
      name: PROJECT.name,
      addressLine: PROJECT.addressLine,
      city: PROJECT.city,
      province: PROJECT.province,
      country: PROJECT.country,
      timezone: PROJECT.timezone,
      totalFloors: PROJECT.totalFloors,
      currency: PROJECT.currency,
      // Deliberately null — see master-data.ts.
      expectedHandoverDate: PROJECT.expectedHandoverDate,
    },
  });

  for (const spec of BUILDINGS) {
    const building = await prisma.building.upsert({
      where: { projectId_code: { projectId: project.id, code: spec.code } },
      update: {
        name: spec.name,
        sortOrder: spec.sortOrder,
        plannedUnitCount: spec.plannedUnitCount,
      },
      create: {
        projectId: project.id,
        code: spec.code,
        name: spec.name,
        sortOrder: spec.sortOrder,
        plannedUnitCount: spec.plannedUnitCount,
      },
    });

    for (let level = 1; level <= PROJECT.totalFloors; level += 1) {
      await prisma.floor.upsert({
        where: { buildingId_level: { buildingId: building.id, level } },
        update: {},
        create: { buildingId: building.id, level, label: `Floor ${level}` },
      });
    }
  }

  console.log(`  buildings              ${BUILDINGS.length} (${PROJECT.totalFloors} floors each)`);

  const classic = classes.get('CLASSIC');
  const penthouseType = types.get('PH');
  if (classic === undefined) return;

  let created = 0;
  const buildings = await prisma.building.findMany({ where: { projectId: project.id } });

  for (const building of buildings) {
    const floors = await prisma.floor.findMany({ where: { buildingId: building.id } });
    const floorByLevel = new Map(floors.map((floor) => [floor.level, floor]));

    // Two of every layout on every floor, 1 through 10. Not a cycle and not a
    // distribution — this is the confirmed shape of the real building, so the
    // seed is deterministic and reconcilable against it.
    for (let level = 1; level <= STANDARD_INVENTORY.floors; level += 1) {
      const floor = floorByLevel.get(level);
      if (floor === undefined) continue;

      for (const [typeCode, count] of Object.entries(STANDARD_INVENTORY.perFloorByType)) {
        const unitType = types.get(typeCode);
        if (unitType === undefined) continue;

        for (let index = 1; index <= count; index += 1) {
          const unitNumber = unitNumberFor(building.code, level, typeCode, index);

          const result = await prisma.unit.upsert({
            where: { buildingId_unitNumber: { buildingId: building.id, unitNumber } },
            update: {},
            create: {
              unitNumber,
              buildingId: building.id,
              floorId: floor.id,
              unitTypeId: unitType.id,
              // A nominal class only. The physical apartment is one unit; the
              // class is chosen per booking and frozen into its snapshot, which
              // is why the same unit is never seeded three times.
              classId: classic.id,
              status: UnitStatus.AVAILABLE,
              parkingSpaces: unitType.includedParkingSpaces,
              notes: STANDARD_INVENTORY.numbering.note,
            },
          });
          if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1;
        }
      }
    }

    // The duplex penthouse spans floors 11 and 12. Kept out of the standard
    // count deliberately — it is a separate residence category.
    const penthouseFloor = floorByLevel.get(STANDARD_INVENTORY.penthouseFloor);
    if (penthouseType !== undefined && penthouseFloor !== undefined) {
      for (let index = 1; index <= STANDARD_INVENTORY.penthousesPerBuilding; index += 1) {
        const unitNumber = `${building.code}-PH${String(index).padStart(2, '0')}`;
        await prisma.unit.upsert({
          where: { buildingId_unitNumber: { buildingId: building.id, unitNumber } },
          update: {},
          create: {
            unitNumber,
            buildingId: building.id,
            floorId: penthouseFloor.id,
            unitTypeId: penthouseType.id,
            classId: classic.id,
            status: UnitStatus.AVAILABLE,
            parkingSpaces: penthouseType.includedParkingSpaces,
            notes: 'Duplex penthouse spanning floors 11–12.',
          },
        });
      }
    }
  }

  // Asserted rather than assumed: a miscount here would put the CRM out of step
  // with the actual building, and nothing downstream would notice.
  const standard = await prisma.unit.count({ where: { unitType: { code: { not: 'PH' } } } });
  const expected =
    BUILDINGS.length *
    STANDARD_INVENTORY.floors *
    Object.values(STANDARD_INVENTORY.perFloorByType).reduce((sum, n) => sum + n, 0);

  if (standard !== expected) {
    throw new Error(
      `Inventory seed produced ${standard} standard apartments, expected ${expected}.`,
    );
  }

  console.log(`  standard apartments    ${standard} (${created} new) — 2×A/B/C/D per floor 1–10`);
  console.log(`  numbering              ${STANDARD_INVENTORY.numbering.format} (PROVISIONAL)`);
}

async function seedSettings(): Promise<void> {
  const settings: { key: string; value: Prisma.InputJsonValue | typeof Prisma.JsonNull }[] = [
    // One month after the 120-day milestone. An assumption, and configurable.
    { key: 'payment_plan.monthly_start_offset_days', value: 150 },
    { key: 'payment_plan.monthly_count', value: 44 },
    { key: 'commission.default_rate_pct', value: 4 },
    { key: 'inventory.allocation_confirmed', value: false },
    // Prisma.JsonNull is a stored JSON null, distinct from "column absent".
    { key: 'project.expected_handover_date', value: Prisma.JsonNull },
  ];

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log(`  app settings           ${settings.length}`);
}

async function main(): Promise<void> {
  console.log('\nSeeding Foakh Broker Booking CRM\n');
  await seedRoles();
  await seedUsers();
  const { types, classes } = await seedProduct();
  await seedPricing(types, classes);
  await seedInventory(types, classes);
  await seedSettings();

  console.log('\nRequires Foakh confirmation before use:');
  console.log('  · Type D Elegant  PKR 8,816,000  (supplied as 88,160,000)');
  console.log('  · Type D Sonder   PKR 9,280,000  (supplied as 92,800,000)');
  console.log('  · Expected handover date — not set');
  console.log('  · Unit mix per building — demo allocation only\n');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
