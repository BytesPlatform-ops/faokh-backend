import type {
  ApartmentClassInfo,
  ApartmentType,
  PriceEntry,
  ResidenceCategory,
  UnitTypeCode,
} from '@/services/crm/types';

/**
 * The two residence categories Foakh sells.
 *
 * A duplex penthouse is not a fifth apartment layout — it has its own area,
 * its own floor span and no A/B/C/D specification — so it sits beside the
 * apartment category rather than inside it.
 */
export const RESIDENCE_CATEGORIES: {
  code: ResidenceCategory;
  name: string;
  description: string;
  image: string;
}[] = [
  {
    code: 'APARTMENT',
    name: 'Apartment',
    description: 'Type A, B, C or D across floors 1–10 of either block.',
    image: '/media/residences/classic/hero.jpg',
  },
  {
    code: 'DUPLEX_PENTHOUSE',
    name: 'Duplex Penthouse',
    description: '3,200 sq ft across the 11th and 12th floors.',
    image: '/media/residences/duplex-penthouses/hero.jpg',
  },
];

/**
 * Foakh product master data.
 *
 * Mirrors `backend/prisma/master-data.ts` exactly. Anything Foakh has stated is
 * here verbatim; anything Foakh has *not* stated is flagged rather than filled
 * in. This file is the single place where "told" and "assumed" are separable.
 *
 * Type and class are independent: specifications live on the type, furnishing
 * lives on the class, and price is the intersection. Elegant and Sonder are
 * emphatically **not** apartment types.
 */

export const PROJECT = {
  name: 'Foakh Wind Corridor Enclave',
  addressLine: '2FQ3+W4X, DHA City',
  city: 'Karachi',
  country: 'Pakistan',
  totalFloors: 12,
  currency: 'PKR',
  /** Never invented — printed schedules show "To be confirmed". */
  expectedHandoverDate: null as string | null,
} as const;

export const BUILDINGS = [
  { code: 'ABD' as const, name: 'Abdullah', plannedUnitCount: 20 },
  { code: 'UMR' as const, name: 'Umer', plannedUnitCount: 20 },
];

export const APARTMENT_TYPES: ApartmentType[] = [
  {
    code: 'A',
    residenceCategory: 'APARTMENT',
    name: 'Type A',
    areaSqFt: 1102,
    bedrooms: 3,
    bathrooms: 3,
    // All three are en-suite — a genuine selling point, so it is master data
    // rather than something a broker describes from memory.
    attachedBathrooms: 3,
    hasBalcony: true,
    includedParkingSpaces: 1,
    parkingPurchasableSeparately: false,
    spansFloors: 1,
    description:
      'The largest of the standard residences. Three bedrooms, three bathrooms and a ' +
      'balcony, with one car parking space included.',
    images: [
      '/media/residences/classic/hero.jpg',
      '/media/residences/classic/living.jpg',
      '/media/residences/classic/kitchen.jpg',
      '/media/residences/classic/balcony.jpg',
    ],
  },
  {
    code: 'B',
    residenceCategory: 'APARTMENT',
    name: 'Type B',
    areaSqFt: 860,
    bedrooms: 2,
    bathrooms: 2,
    attachedBathrooms: 2,
    hasBalcony: true,
    includedParkingSpaces: 1,
    parkingPurchasableSeparately: false,
    spansFloors: 1,
    description:
      'A two-bedroom residence with a balcony and one included parking space.',
    images: [
      '/media/residences/elegant/hero.jpg',
      '/media/residences/elegant/living.jpg',
      '/media/residences/elegant/bedroom.jpg',
    ],
  },
  {
    code: 'C',
    residenceCategory: 'APARTMENT',
    name: 'Type C',
    areaSqFt: 682,
    bedrooms: 2,
    bathrooms: 2,
    attachedBathrooms: 2,
    hasBalcony: false,
    includedParkingSpaces: 0,
    // Foakh has published no parking price yet, so the UI says "purchased
    // separately" and never quotes a figure.
    parkingPurchasableSeparately: true,
    spansFloors: 1,
    description:
      'A compact two-bedroom residence. No balcony; parking is purchased separately.',
    images: [
      '/media/residences/sonder-class/hero.jpg',
      '/media/residences/sonder-class/living.jpg',
      '/media/residences/sonder-class/kitchen.jpg',
    ],
  },
  {
    code: 'D',
    residenceCategory: 'APARTMENT',
    name: 'Type D',
    areaSqFt: 464,
    bedrooms: 1,
    bathrooms: 1,
    attachedBathrooms: 1,
    hasBalcony: false,
    includedParkingSpaces: 0,
    parkingPurchasableSeparately: true,
    spansFloors: 1,
    description:
      'A one-bedroom residence. No balcony; parking is purchased separately.',
    images: ['/media/residences/elegant/gallery-01.jpg', '/media/residences/elegant/living.jpg'],
  },
  {
    code: 'PH',
    residenceCategory: 'DUPLEX_PENTHOUSE',
    name: 'Duplex Penthouse',
    areaSqFt: 3200,
    bedrooms: 3,
    // Foakh has supplied no bathroom count for the duplex. Left equal to the
    // bedroom count would be an invention, so it is 0 and the UI omits the row
    // rather than printing a number nobody confirmed.
    bathrooms: 0,
    attachedBathrooms: 0,
    hasBalcony: true,
    includedParkingSpaces: 1,
    parkingPurchasableSeparately: false,
    spansFloors: 2,
    floorSpanLabel: '11th + 12th Floor',
    description:
      'A duplex penthouse spanning the 11th and 12th floors, with three bedrooms and a ' +
      'commanding outlook across the wind corridor. Remaining specifications are not ' +
      'yet confirmed by Foakh.',
    images: [
      '/media/residences/duplex-penthouses/hero.jpg',
      '/media/residences/duplex-penthouses/pool.jpg',
      '/media/residences/duplex-penthouses/living.jpg',
      '/media/residences/duplex-penthouses/balcony.jpg',
    ],
  },
];

export const APARTMENT_CLASSES: ApartmentClassInfo[] = [
  {
    code: 'CLASSIC',
    name: 'Classic',
    furnishingLevel: 'UNFURNISHED',
    isServiced: false,
    description: 'No furnishing.',
  },
  {
    code: 'ELEGANT',
    name: 'Elegant',
    furnishingLevel: 'FURNISHED',
    isServiced: false,
    description: 'Fully furnished.',
  },
  {
    code: 'SONDER',
    name: 'Sonder',
    furnishingLevel: 'FURNISHED_SERVICED',
    isServiced: true,
    description: 'Fully furnished and serviced.',
  },
];

/**
 * The price matrix.
 *
 * Type D Elegant and Sonder are flagged. Foakh supplied PKR 88,160,000 and
 * PKR 92,800,000, which would price a 464 sq ft one-bedroom at PKR 190,000 and
 * PKR 200,000 per square foot — an order of magnitude above every other unit.
 * Dividing by ten gives exactly PKR 19,000 and PKR 20,000 per square foot, and
 * 20,000/sq ft is precisely the Sonder rate for Types B, C and the penthouse.
 *
 * The corrected reading is almost certainly right, but it is presented as
 * NEEDS CONFIRMATION throughout the UI and booking is blocked on it.
 */
export const PRICE_MATRIX: PriceEntry[] = [
  entry('A', 'CLASSIC', 18_800_000),
  entry('A', 'ELEGANT', 21_000_000),
  entry('A', 'SONDER', 22_000_000),

  entry('B', 'CLASSIC', 14_500_000),
  entry('B', 'ELEGANT', 16_300_000),
  entry('B', 'SONDER', 17_200_000),

  entry('C', 'CLASSIC', 11_600_000),
  entry('C', 'ELEGANT', 12_950_000),
  entry('C', 'SONDER', 13_640_000),

  entry('D', 'CLASSIC', 7_900_000),
  entry('D', 'ELEGANT', 8_816_000, {
    needsConfirmation: true,
    confirmationNote:
      'Provisional. Foakh supplied PKR 88,160,000 (PKR 190,000/sq ft). Shown as ' +
      'PKR 8,816,000 = PKR 19,000/sq ft, consistent with the rest of the matrix. ' +
      'Requires Foakh confirmation before sale.',
  }),
  entry('D', 'SONDER', 9_280_000, {
    needsConfirmation: true,
    confirmationNote:
      'Provisional. Foakh supplied PKR 92,800,000 (PKR 200,000/sq ft). Shown as ' +
      'PKR 9,280,000 = PKR 20,000/sq ft, the Sonder rate for Types B, C and the ' +
      'penthouse. Requires Foakh confirmation before sale.',
  }),

  // Supplied without a class. Attached to Classic; the furnished variants are
  // left unpriced rather than guessed, so they cannot be sold.
  entry('PH', 'CLASSIC', 64_000_000),
  entry('PH', 'ELEGANT', null),
  entry('PH', 'SONDER', null),
];

function entry(
  unitTypeCode: UnitTypeCode,
  classCode: PriceEntry['classCode'],
  price: number | null,
  options: { needsConfirmation?: boolean; confirmationNote?: string } = {},
): PriceEntry {
  const type = APARTMENT_TYPES.find((candidate) => candidate.code === unitTypeCode);
  const area = type?.areaSqFt ?? 0;

  return {
    unitTypeCode,
    classCode,
    price,
    pricePerSqFt:
      price === null || area === 0 ? null : Math.round((price / area) * 10_000) / 10_000,
    needsConfirmation: options.needsConfirmation ?? false,
    ...(options.confirmationNote !== undefined
      ? { confirmationNote: options.confirmationNote }
      : {}),
  };
}

/** The four layouts offered when the category is Apartment. */
export function apartmentLayouts(): ApartmentType[] {
  return APARTMENT_TYPES.filter((type) => type.residenceCategory === 'APARTMENT');
}

export function typesForCategory(category: ResidenceCategory): ApartmentType[] {
  return APARTMENT_TYPES.filter((type) => type.residenceCategory === category);
}

export function findType(code: UnitTypeCode): ApartmentType {
  const type = APARTMENT_TYPES.find((candidate) => candidate.code === code);
  if (type === undefined) throw new Error(`Unknown apartment type ${code}`);
  return type;
}

export function findClass(code: PriceEntry['classCode']): ApartmentClassInfo {
  const value = APARTMENT_CLASSES.find((candidate) => candidate.code === code);
  if (value === undefined) throw new Error(`Unknown class ${code}`);
  return value;
}

export function findPrice(
  unitTypeCode: UnitTypeCode,
  classCode: PriceEntry['classCode'],
): PriceEntry | undefined {
  return PRICE_MATRIX.find(
    (candidate) => candidate.unitTypeCode === unitTypeCode && candidate.classCode === classCode,
  );
}
