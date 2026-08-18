import { ResidenceCategory } from '@prisma/client';

/**
 * Display names for the residence categories.
 *
 * Kept server-side and frozen into the booking snapshot, so a printed schedule
 * always says what it said on the day it was signed even if the wording is
 * changed later. "Duplex Penthouse" is never abbreviated to a type letter.
 */
export const RESIDENCE_CATEGORY_NAMES: Record<ResidenceCategory, string> = {
  [ResidenceCategory.APARTMENT]: 'Apartment',
  [ResidenceCategory.DUPLEX_PENTHOUSE]: 'Duplex Penthouse',
};
