import { BUILDINGS, findPrice, findType } from '@/data/master-data';
import type {
  Booking,
  Client,
  ClassCode,
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

// ------------------------------------------------------------- sales agent

/**
 * The signed-in principal in mock mode — a Sales Agent, so row-level scoping is
 * exercised rather than bypassed by an admin session.
 *
 * No demo brokers exist here. An external broker is a real record created by an
 * agent through the API; inventing fake ones would put referral partners and
 * commission schedules into a store that is meant to hold none.
 */
export const MOCK_SESSION: SessionUser = {
  id: 'usr-agent-1',
  name: 'Ali Raza',
  email: 'agent1@foakh.local',
  roles: ['SALES_AGENT'],
  salesAgent: {
    id: 'sag-1',
    salesAgentCode: code('SAG', 1),
    name: 'Ali Raza',
    email: 'agent1@foakh.local',
    status: 'ACTIVE',
  },
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

// --------------------------------------------------------------- the store

/**
 * A Sales Agent session and the project's inventory. Nothing else.
 *
 * Clients, bookings, brokers and commissions all start empty and stay empty:
 * this build holds no demo records, and anything transactional needs the API,
 * where a real transaction, a real ID sequence and real concurrency protection
 * exist. Mock mode is for looking at screens, not for pretending to sell.
 */
class MockStore {
  units: Unit[] = buildUnits();
  clients: Client[] = [];
  bookings: Booking[] = [];
  payments: Payment[] = [];

  /** Provisional prices a person has ratified, keyed `TYPE:CLASS`. */
  confirmedPrices = new Map<string, { confirmedBy: string; confirmedAt: string }>();

  nextCode(prefix: string): string {
    const counts: Record<string, number> = {
      CLI: this.clients.length,
      BKG: this.bookings.length,
      PAY: this.payments.length,
    };
    return code(prefix, (counts[prefix] ?? 0) + 1);
  }
}

let store: MockStore | null = null;

export function getStore(): MockStore {
  store ??= new MockStore();
  return store;
}

export { BASE_DATE, code as formatCode };
