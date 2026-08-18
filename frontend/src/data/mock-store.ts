import {
  BUILDINGS,
  PROJECT,
  RESIDENCE_CATEGORIES,
  findClass,
  findPrice,
  findType,
} from '@/data/master-data';
import { buildCommissionPlan, buildPaymentPlan, toPaisa } from '@/lib/money';
import type {
  Booking,
  Broker,
  Client,
  ClassCode,
  CommissionMilestone,
  Installment,
  Payment,
  SessionUser,
  Unit,
  UnitStatus,
  UnitTypeCode,
} from '@/services/crm/types';

/**
 * The in-memory mock database.
 *
 * Deterministic: seeded from a fixed base date and a small PRNG, so the same
 * demo data appears on every reload and screenshots stay stable. Mutations
 * (creating a client, confirming a booking) persist for the life of the browser
 * tab and are explicitly *not* written anywhere — the UI says so rather than
 * implying a transaction happened.
 *
 * Everything here is generated through the same money functions the real
 * schedules use, so a mock booking's 47-line payment plan is arithmetically
 * identical to one the backend would produce.
 */

/** Fixed so demo data does not drift between sessions. */
const BASE_DATE = new Date('2026-08-17T00:00:00.000Z');

/** Small deterministic PRNG — `Math.random()` would make the demo unstable. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function code(prefix: string, index: number, year = 2026): string {
  return `${prefix}-${year}-${String(index).padStart(6, '0')}`;
}

function daysAgo(days: number): Date {
  return new Date(BASE_DATE.getTime() - days * 86_400_000);
}

// ------------------------------------------------------------------- brokers

export const MOCK_BROKERS: Broker[] = [
  {
    id: 'brk-1',
    brokerCode: code('BRK', 1),
    name: 'Imran Sheikh',
    email: 'broker1@foakh.local',
    mobile: '+923001234567',
    companyName: 'Sheikh Estates',
    commissionRatePct: 4,
    status: 'ACTIVE',
  },
  {
    id: 'brk-2',
    brokerCode: code('BRK', 2),
    name: 'Ayesha Malik',
    email: 'broker2@foakh.local',
    mobile: '+923339876543',
    companyName: 'Malik Property Advisors',
    commissionRatePct: 4,
    status: 'ACTIVE',
  },
];

/** The signed-in principal in mock mode. A broker, so row-level scoping is
 *  exercised rather than bypassed by an admin session. */
export const MOCK_SESSION: SessionUser = {
  id: 'usr-broker-1',
  name: 'Imran Sheikh',
  email: 'broker1@foakh.local',
  roles: ['BROKER'],
  broker: MOCK_BROKERS[0],
};

// ----------------------------------------------------------------- inventory

/**
 * Demo unit allocation.
 *
 * Foakh confirmed 20 units per building but has NOT stated the mix by type or
 * floor. This is therefore a placeholder layout — two per floor across floors
 * 1–10 cycling the four types, plus one penthouse per building on floors 11–12
 * — and every unit carries a note saying so.
 */
function buildUnits(): Unit[] {
  const random = makeRandom(20260817);
  const units: Unit[] = [];
  const typeCycle: UnitTypeCode[] = ['A', 'B', 'C', 'D'];
  const classCycle: ClassCode[] = ['CLASSIC', 'ELEGANT', 'SONDER'];

  for (const building of BUILDINGS) {
    let cycle = 0;

    for (let level = 1; level <= 10; level += 1) {
      for (let position = 1; position <= 2; position += 1) {
        const typeCode = typeCycle[cycle % typeCycle.length] ?? 'A';
        const classCode = classCycle[cycle % classCycle.length] ?? 'CLASSIC';
        cycle += 1;

        const type = findType(typeCode);
        const price = findPrice(typeCode, classCode);

        // A realistic spread of statuses so the filters and the dashboard have
        // something to show.
        const roll = random();
        const status: UnitStatus =
          roll > 0.82 ? 'BOOKED' : roll > 0.74 ? 'ON_HOLD' : roll > 0.7 ? 'SOLD' : roll > 0.67 ? 'BLOCKED' : 'AVAILABLE';

        units.push({
          id: `${building.code}-${level}-${position}`,
          unitNumber: `${building.code}-${String(level).padStart(2, '0')}${String(position).padStart(2, '0')}`,
          buildingCode: building.code,
          buildingName: building.name,
          floorLevel: level,
          residenceCategory: type.residenceCategory,
          unitTypeCode: typeCode,
          classCode,
          status,
          parkingSpaces: type.includedParkingSpaces,
          priceRupees: price?.price ?? null,
          pricePerSqFt: price?.pricePerSqFt ?? null,
          needsPriceConfirmation: price?.needsConfirmation ?? false,
          notes: 'Demo allocation — Foakh has not confirmed the unit mix.',
        });
      }
    }

    // Penthouse, spanning floors 11–12.
    const penthousePrice = findPrice('PH', 'CLASSIC');
    units.push({
      id: `${building.code}-PH`,
      unitNumber: `${building.code}-PH01`,
      buildingCode: building.code,
      buildingName: building.name,
      floorLevel: 11,
      residenceCategory: 'DUPLEX_PENTHOUSE',
      unitTypeCode: 'PH',
      classCode: 'CLASSIC',
      status: 'AVAILABLE',
      parkingSpaces: 1,
      priceRupees: penthousePrice?.price ?? null,
      pricePerSqFt: penthousePrice?.pricePerSqFt ?? null,
      needsPriceConfirmation: false,
      notes: 'Duplex penthouse spanning floors 11–12. Demo allocation.',
    });
  }

  return units;
}

// ------------------------------------------------------------------- clients

const CLIENT_SEEDS = [
  ['Ahmed Raza Khan', 'Muhammad Raza Khan', '3520212345671', '+923001112233', 'Karachi', 'Sindh', 'Business Owner'],
  ['Fatima Siddiqui', 'Abdul Siddiqui', '4210198765432', '+923212223344', 'Karachi', 'Sindh', 'Consultant Physician'],
  ['Bilal Ahmed Qureshi', 'Ahmed Qureshi', '3520298765123', '+923334445566', 'Lahore', 'Punjab', 'Software Architect'],
  ['Zainab Hassan', 'Hassan Ali', '4230187654321', '+923455556677', 'Karachi', 'Sindh', 'Textile Exporter'],
  ['Usman Tariq', 'Tariq Mehmood', '3810112345678', '+923006667788', 'Islamabad', 'Federal', 'Civil Engineer'],
  ['Sana Iqbal', 'Iqbal Hussain', '4220123456789', '+923217778899', 'Karachi', 'Sindh', 'Architect'],
  ['Hamza Sheikh', 'Yousuf Sheikh', '3520255544433', '+923338889900', 'Karachi', 'Sindh', 'Investment Banker'],
  ['Ayesha Noor', 'Noor Muhammad', '4210144556677', '+923459990011', 'Hyderabad', 'Sindh', 'Dentist'],
] as const;

function buildClients(): Client[] {
  return CLIENT_SEEDS.map((seed, index) => {
    const [name, father, cnic, mobile, city, province, occupation] = seed;
    const broker = MOCK_BROKERS[index % 2] ?? MOCK_BROKERS[0]!;

    return {
      id: `cli-${index + 1}`,
      clientCode: code('CLI', index + 1),
      fullLegalName: name,
      fatherOrHusbandName: father,
      cnic,
      cnicExpiry: '2031-06-30',
      dateOfBirth: `19${75 + index}-04-12`,
      nationality: 'Pakistani',
      mobile,
      whatsapp: mobile,
      email: `${name.split(' ')[0]?.toLowerCase()}@example.com`,
      currentAddress: `House ${12 + index}, Street ${4 + index}, Phase ${(index % 8) + 1}`,
      permanentAddress: `House ${12 + index}, Street ${4 + index}, Phase ${(index % 8) + 1}`,
      city,
      province,
      occupation,
      companyName: index % 3 === 0 ? 'Private Limited' : undefined,
      filerStatus: index % 2 === 0 ? 'FILER' : 'UNKNOWN',
      notes: index === 0 ? 'Referred by an existing owner. Prefers upper floors.' : undefined,
      brokerId: broker.id,
      brokerCode: broker.brokerCode,
      brokerName: broker.name,
      interestedTypeCode: (['A', 'B', 'C', 'D', 'PH'] as const)[index % 5],
      bookingStatus: index < 3 ? 'BOOKED' : 'NONE',
      lastActivityAt: daysAgo(index * 3).toISOString(),
      createdAt: daysAgo(30 - index * 2).toISOString(),
      documents: [],
    } satisfies Client;
  });
}

// ------------------------------------------------------------------ bookings

function buildBooking(
  index: number,
  client: Client,
  unit: Unit,
  classCode: ClassCode,
  bookingDate: Date,
  paidInstallments: number,
): Booking {
  const type = findType(unit.unitTypeCode);
  const classInfo = findClass(classCode);
  const price = findPrice(unit.unitTypeCode, classCode);
  const totalRupees = price?.price ?? 0;

  const plan = buildPaymentPlan({
    totalRupees,
    bookingDate,
    expectedHandoverDate: null,
  });
  const commission = buildCommissionPlan({ salePriceRupees: totalRupees, bookingDate });

  const installments: Installment[] = plan.installments.map((entry, position) => {
    const isPaid = position < paidInstallments;
    const isOverdue =
      !isPaid && entry.dueDate !== null && entry.dueDate.getTime() < BASE_DATE.getTime();

    return {
      id: `ins-${index}-${entry.sequence}`,
      sequence: entry.sequence,
      kind: entry.kind,
      label: entry.label,
      percentageOfTotal: entry.percentageOfTotal,
      amountPaisa: entry.amountPaisa,
      paidPaisa: isPaid ? entry.amountPaisa : 0,
      dueDate: entry.dueDate?.toISOString() ?? null,
      status: isPaid ? 'PAID' : isOverdue ? 'OVERDUE' : 'PENDING',
    };
  });

  const milestones: CommissionMilestone[] = commission.milestones.map((entry, position) => {
    const reached = entry.expectedDate.getTime() <= BASE_DATE.getTime();
    const status = position === 0 && reached ? 'PAID' : reached ? 'ELIGIBLE' : 'UPCOMING';

    return {
      id: `cms-${index}-${entry.sequence}`,
      sequence: entry.sequence,
      label: entry.label,
      percentageOfSale: entry.percentageOfSale,
      amountPaisa: entry.amountPaisa,
      expectedDate: entry.expectedDate.toISOString(),
      status,
    };
  });

  const paidPaisa = installments.reduce((sum, entry) => sum + entry.paidPaisa, 0);

  return {
    id: `bkg-${index}`,
    bookingCode: code('BKG', index),
    status: 'CONFIRMED',
    bookingDate: bookingDate.toISOString(),
    currency: 'PKR',

    clientId: client.id,
    clientCode: client.clientCode,
    clientName: client.fullLegalName,
    clientCnic: client.cnic,
    clientMobile: client.mobile,

    brokerId: client.brokerId,
    brokerCode: client.brokerCode,
    brokerName: client.brokerName,

    unitId: unit.id,
    snapshot: {
      unitNumber: unit.unitNumber,
      buildingName: unit.buildingName,
      floorLevel: unit.floorLevel,
      residenceCategory: type.residenceCategory,
      residenceCategoryName:
        RESIDENCE_CATEGORIES.find((entry) => entry.code === type.residenceCategory)?.name ??
        type.name,
      unitTypeCode: unit.unitTypeCode,
      unitTypeName: type.name,
      classCode,
      className: classInfo.name,
      bedrooms: type.bedrooms,
      bathrooms: type.bathrooms,
      attachedBathrooms: type.attachedBathrooms,
      hasBalcony: type.hasBalcony,
      parkingSpaces: unit.parkingSpaces,
      areaSqFt: type.areaSqFt,
      pricePerSqFt: price?.pricePerSqFt ?? 0,
      totalPricePaisa: toPaisa(totalRupees),
    },

    expectedHandoverDate: PROJECT.expectedHandoverDate,

    installments,
    commissionMilestones: milestones,
    commissionRatePct: commission.ratePct,
    commissionTotalPaisa: commission.totalPaisa,

    paidPaisa,
    outstandingPaisa: toPaisa(totalRupees) - paidPaisa,

    invoiceCode: code('INV', index),
    createdAt: bookingDate.toISOString(),
  };
}

// -------------------------------------------------------------------- store

class MockStore {
  units: Unit[] = buildUnits();
  clients: Client[] = buildClients();
  bookings: Booking[] = [];
  payments: Payment[] = [];

  /**
   * Provisional prices a person has explicitly ratified, keyed `TYPE:CLASS`.
   *
   * Type D Elegant and Sonder arrived from Foakh as PKR 88,160,000 and
   * PKR 92,800,000 — ten times every other rate in the matrix. They are held
   * back until somebody with the authority says which figure is real, and this
   * records that decision along with who made it, so a price that reached a
   * contract can always be traced to a person rather than to a silent default.
   */
  confirmedPrices = new Map<string, { confirmedBy: string; confirmedAt: string }>();

  constructor() {
    this.seedBookings();
  }

  private seedBookings(): void {
    const bookable = this.units.filter((unit) => unit.status === 'BOOKED' || unit.status === 'SOLD');

    const specs: { clientIndex: number; classCode: ClassCode; ageDays: number; paid: number }[] = [
      { clientIndex: 0, classCode: 'ELEGANT', ageDays: 200, paid: 6 },
      { clientIndex: 1, classCode: 'CLASSIC', ageDays: 120, paid: 4 },
      { clientIndex: 2, classCode: 'SONDER', ageDays: 45, paid: 2 },
    ];

    specs.forEach((spec, index) => {
      const client = this.clients[spec.clientIndex];
      const unit = bookable[index];
      if (client === undefined || unit === undefined) return;

      const booking = buildBooking(
        index + 1,
        client,
        unit,
        spec.classCode,
        daysAgo(spec.ageDays),
        spec.paid,
      );
      this.bookings.push(booking);

      // Corresponding payment records for every settled instalment.
      booking.installments
        .filter((entry) => entry.status === 'PAID')
        .forEach((entry, position) => {
          this.payments.push({
            id: `pay-${index}-${position}`,
            paymentCode: code('PAY', this.payments.length + 1),
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            installmentId: entry.id,
            installmentLabel: entry.label,
            clientName: booking.clientName,
            amountPaisa: entry.amountPaisa,
            method: position === 0 ? 'BANK_TRANSFER' : 'ONLINE',
            reference: `TRX-${100_000 + this.payments.length}`,
            status: 'CLEARED',
            receivedAt: entry.dueDate ?? booking.bookingDate,
          });
        });
    });
  }

  nextCode(prefix: 'CLI' | 'BKG' | 'INV' | 'PAY'): string {
    const counts: Record<string, number> = {
      CLI: this.clients.length,
      BKG: this.bookings.length,
      INV: this.bookings.length,
      PAY: this.payments.length,
    };
    return code(prefix, (counts[prefix] ?? 0) + 1);
  }
}

/**
 * A module-level singleton so state survives client-side navigation within a
 * tab. It is intentionally *not* persisted — reloading resets the demo, which
 * is the honest behaviour for a mode with no database behind it.
 */
let store: MockStore | null = null;

export function getStore(): MockStore {
  store ??= new MockStore();
  return store;
}

export { BASE_DATE, buildBooking, code as formatCode };
