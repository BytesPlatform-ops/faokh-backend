/**
 * Foakh product master data.
 *
 * Everything Foakh has stated is here verbatim. Anything Foakh has *not*
 * stated is either omitted or explicitly flagged — this file is the single
 * place where "what we were told" is separated from "what we assumed".
 */

export type SeedResidenceCategory = 'APARTMENT' | 'DUPLEX_PENTHOUSE';

export interface SeedUnitType {
  code: string;
  name: string;
  /**
   * Apartment or duplex penthouse.
   *
   * The penthouse is a category of its own, never a fifth apartment layout —
   * it has no A–D specification and must not surface anywhere as "Type E".
   */
  residenceCategory: SeedResidenceCategory;
  areaSqFt: string;
  bedrooms: number;
  bathrooms: number;
  /** En-suite bathrooms. Type A's three are all attached. */
  attachedBathrooms: number;
  hasBalcony: boolean;
  includedParkingSpaces: number;
  /** Available at extra cost. Foakh has published no price, so none is quoted. */
  parkingPurchasableSeparately: boolean;
  spansFloors: number;
  /** "11th + 12th Floor", printed instead of a single floor number. */
  floorSpanLabel?: string;
  description: string;
  sortOrder: number;
}

export const UNIT_TYPES: SeedUnitType[] = [
  {
    code: 'A',
    name: 'Type A',
    residenceCategory: 'APARTMENT',
    areaSqFt: '1102.00',
    bedrooms: 3,
    bathrooms: 3,
    attachedBathrooms: 3,
    hasBalcony: true,
    includedParkingSpaces: 1,
    parkingPurchasableSeparately: false,
    spansFloors: 1,
    description: '3 bedrooms, 3 attached bathrooms, balcony, one car parking included.',
    sortOrder: 1,
  },
  {
    code: 'B',
    name: 'Type B',
    residenceCategory: 'APARTMENT',
    areaSqFt: '860.00',
    bedrooms: 2,
    bathrooms: 2,
    attachedBathrooms: 2,
    hasBalcony: true,
    includedParkingSpaces: 1,
    parkingPurchasableSeparately: false,
    spansFloors: 1,
    description: '2 bedrooms, 2 attached bathrooms, balcony, one car parking included.',
    sortOrder: 2,
  },
  {
    code: 'C',
    name: 'Type C',
    residenceCategory: 'APARTMENT',
    areaSqFt: '682.00',
    bedrooms: 2,
    bathrooms: 2,
    attachedBathrooms: 2,
    hasBalcony: false,
    includedParkingSpaces: 0,
    parkingPurchasableSeparately: true,
    spansFloors: 1,
    description: '2 bedrooms, 2 attached bathrooms. No balcony. Parking purchased separately.',
    sortOrder: 3,
  },
  {
    code: 'D',
    name: 'Type D',
    residenceCategory: 'APARTMENT',
    areaSqFt: '464.00',
    bedrooms: 1,
    bathrooms: 1,
    attachedBathrooms: 1,
    hasBalcony: false,
    includedParkingSpaces: 0,
    parkingPurchasableSeparately: true,
    spansFloors: 1,
    description: '1 bedroom, 1 attached bathroom. No balcony. Parking purchased separately.',
    sortOrder: 4,
  },
  {
    code: 'PH',
    name: 'Duplex Penthouse',
    residenceCategory: 'DUPLEX_PENTHOUSE',
    areaSqFt: '3200.00',
    bedrooms: 3,
    // Foakh has supplied no bathroom count for the duplex. Copying the bedroom
    // count would be an invention, so it stays zero and every screen omits the
    // row rather than printing a number nobody confirmed.
    bathrooms: 0,
    attachedBathrooms: 0,
    hasBalcony: true,
    includedParkingSpaces: 1,
    parkingPurchasableSeparately: false,
    // Occupies the 11th and 12th floors.
    spansFloors: 2,
    floorSpanLabel: '11th + 12th Floor',
    description:
      'Duplex penthouse spanning the 11th and 12th floors. 3 bedrooms. Remaining ' +
      'specifications not yet confirmed by Foakh.',
    sortOrder: 5,
  },
];

export const CLASSES = [
  {
    code: 'CLASSIC',
    name: 'Classic',
    furnishingLevel: 'UNFURNISHED' as const,
    isServiced: false,
    description: 'No furnishing.',
    sortOrder: 1,
  },
  {
    code: 'ELEGANT',
    name: 'Elegant',
    furnishingLevel: 'FURNISHED' as const,
    isServiced: false,
    description: 'Fully furnished.',
    sortOrder: 2,
  },
  {
    code: 'SONDER',
    name: 'Sonder',
    furnishingLevel: 'FURNISHED_SERVICED' as const,
    isServiced: true,
    description: 'Fully furnished and serviced.',
    sortOrder: 3,
  },
];

export interface SeedPrice {
  unitTypeCode: string;
  classCode: string;
  price: string;
  /** True when the figure has not been ratified by Foakh. */
  needsConfirmation: boolean;
  confirmationNote?: string;
}

/**
 * The price matrix.
 *
 * Type D Elegant and Sonder are the only entries flagged. Foakh supplied
 * PKR 88,160,000 and PKR 92,800,000, which cannot be right: they would price a
 * 464 sq ft one-bedroom at PKR 190,000 and PKR 200,000 per square foot, an
 * order of magnitude above every other unit in the building.
 *
 * Dividing both by ten gives PKR 19,000 and PKR 20,000 per square foot — and
 * PKR 20,000/sq ft is exactly the Sonder rate for Types B, C and the
 * penthouse. The corrected reading is therefore almost certainly right, but it
 * is stored with `needsConfirmation` set, and the booking engine refuses to
 * price a deal from an unconfirmed row. An administrator must ratify it in
 * Admin → Pricing before a Type D Elegant or Sonder can be sold.
 */
export const PRICES: SeedPrice[] = [
  { unitTypeCode: 'A', classCode: 'CLASSIC', price: '18800000.00', needsConfirmation: false },
  { unitTypeCode: 'A', classCode: 'ELEGANT', price: '21000000.00', needsConfirmation: false },
  { unitTypeCode: 'A', classCode: 'SONDER', price: '22000000.00', needsConfirmation: false },

  { unitTypeCode: 'B', classCode: 'CLASSIC', price: '14500000.00', needsConfirmation: false },
  { unitTypeCode: 'B', classCode: 'ELEGANT', price: '16300000.00', needsConfirmation: false },
  { unitTypeCode: 'B', classCode: 'SONDER', price: '17200000.00', needsConfirmation: false },

  { unitTypeCode: 'C', classCode: 'CLASSIC', price: '11600000.00', needsConfirmation: false },
  { unitTypeCode: 'C', classCode: 'ELEGANT', price: '12950000.00', needsConfirmation: false },
  { unitTypeCode: 'C', classCode: 'SONDER', price: '13640000.00', needsConfirmation: false },

  { unitTypeCode: 'D', classCode: 'CLASSIC', price: '7900000.00', needsConfirmation: false },
  {
    unitTypeCode: 'D',
    classCode: 'ELEGANT',
    price: '8816000.00',
    needsConfirmation: true,
    confirmationNote:
      'PROVISIONAL. Foakh supplied PKR 88,160,000, which prices a 464 sq ft unit at ' +
      'PKR 190,000/sq ft. Seeded as PKR 8,816,000 (= PKR 19,000/sq ft), consistent with ' +
      'the rest of the matrix. Requires Foakh confirmation before any Type D Elegant sale.',
  },
  {
    unitTypeCode: 'D',
    classCode: 'SONDER',
    price: '9280000.00',
    needsConfirmation: true,
    confirmationNote:
      'PROVISIONAL. Foakh supplied PKR 92,800,000, which prices a 464 sq ft unit at ' +
      'PKR 200,000/sq ft. Seeded as PKR 9,280,000 (= PKR 20,000/sq ft, the Sonder rate ' +
      'for Types B, C and the penthouse). Requires Foakh confirmation before sale.',
  },

  // The penthouse price was supplied without a class. It is attached to
  // Classic; the furnished and serviced variants are unpriced rather than
  // guessed, and are therefore unsellable until Foakh supplies figures.
  { unitTypeCode: 'PH', classCode: 'CLASSIC', price: '64000000.00', needsConfirmation: false },
];

export const PROJECT = {
  code: 'FWCE',
  name: 'Foakh Wind Corridor Enclave',
  /** The current address. Older Foakh addresses must not appear anywhere. */
  addressLine: '2FQ3+W4X, DHA City',
  city: 'Karachi',
  province: 'Sindh',
  country: 'Pakistan',
  timezone: 'Asia/Karachi',
  totalFloors: 12,
  currency: 'PKR',
  /**
   * NOT SET. Foakh has published no handover date, and every booking copies
   * this onto the completion instalment of a printed payment schedule. An
   * invented date here becomes a contractual commitment.
   */
  expectedHandoverDate: null as Date | null,
};

export const BUILDINGS = [
  { code: 'ABD', name: 'Abdullah', sortOrder: 1, plannedUnitCount: 20 },
  { code: 'UMR', name: 'Umer', sortOrder: 2, plannedUnitCount: 20 },
];

/**
 * Demo inventory allocation.
 *
 * Foakh stated "20 units per building" but has NOT stated how those 20 break
 * down by type or floor. This layout is therefore a placeholder so the
 * application is usable end to end, not a statement of fact: two units per
 * floor across floors 1–10, cycling the four apartment types, plus one
 * penthouse per building on floors 11–12.
 *
 * Every seeded unit carries a note saying so, and the whole allocation is
 * skipped when SEED_DEMO_INVENTORY=false. Admin → Inventory is the real way to
 * allocate stock.
 */
export const STANDARD_INVENTORY = {
  /** Standard apartments occupy floors 1–10 of both blocks. */
  floors: 10,

  /**
   * Confirmed by Foakh: every floor of every block carries two of each layout.
   *
   *   2 × A + 2 × B + 2 × C + 2 × D = 8 per floor
   *   8 × 10 floors                 = 80 per building
   *   80 × 2 buildings              = 160 standard apartments
   *
   * This replaces the earlier demo allocation, which cycled the four types
   * arbitrarily and produced an inventory nobody could reconcile against the
   * real building.
   */
  perFloorByType: { A: 2, B: 2, C: 2, D: 2 } as Record<string, number>,

  /**
   * Unit numbering: `ABD-05-A1` — block, floor, layout, then which of the two.
   *
   * TEMPORARY AND CONFIGURABLE. Foakh has not supplied the official apartment
   * numbers, so these are readable placeholders, not legal identifiers. They
   * must be replaced before anything is signed, and nothing should treat them
   * as immutable in the meantime.
   */
  numbering: {
    isProvisional: true,
    format: '{BLOCK}-{FLOOR2}-{TYPE}{INDEX}',
    note:
      'PROVISIONAL NUMBERING — Foakh has not issued official apartment numbers. ' +
      'Readable placeholder only; replace before contracts are issued.',
  },

  penthouseFloor: 11,
  penthousesPerBuilding: 1,
};

/** `ABD-05-A1` */
export function unitNumberFor(
  buildingCode: string,
  floorLevel: number,
  typeCode: string,
  index: number,
): string {
  return `${buildingCode}-${String(floorLevel).padStart(2, '0')}-${typeCode}${index}`;
}
