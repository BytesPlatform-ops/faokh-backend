import { formatArea } from '@/lib/format';
import type { ApartmentType } from '@/services/crm/types';

/**
 * Read-only specifications derived from a layout type.
 *
 * Bedrooms, bathrooms, balcony, parking and area are *consequences* of the
 * layout, not choices a broker makes. Deriving them in one place means the
 * requirements step, the property step and the unit card can never disagree
 * with each other about what a Type A is.
 *
 * Anything Foakh has not stated is omitted rather than defaulted — a spec line
 * that reads "0 Bathrooms" is worse than no bathroom line at all.
 */
export function layoutSpecs(type: ApartmentType): string[] {
  const specs: string[] = [];

  if (type.bedrooms > 0) {
    specs.push(`${type.bedrooms} ${plural(type.bedrooms, 'Bedroom')}`);
  }

  if (type.attachedBathrooms > 0) {
    specs.push(`${type.attachedBathrooms} Attached ${plural(type.attachedBathrooms, 'Bathroom')}`);
  } else if (type.bathrooms > 0) {
    specs.push(`${type.bathrooms} ${plural(type.bathrooms, 'Bathroom')}`);
  }

  if (type.hasBalcony) specs.push('Balcony');

  if (type.includedParkingSpaces > 0) {
    specs.push(`${type.includedParkingSpaces} Parking`);
  } else if (type.parkingPurchasableSeparately) {
    specs.push('Parking purchased separately');
  }

  specs.push(`${formatArea(type.areaSqFt)} sq ft`);

  if (type.floorSpanLabel !== undefined) specs.push(type.floorSpanLabel);

  return specs;
}

/** The one-line form used inside dense lists and summaries. */
export function layoutSpecLine(type: ApartmentType): string {
  return layoutSpecs(type).join(' · ');
}

/** "Type A" / "Duplex Penthouse" — never "Type E". */
export function layoutLabel(type: ApartmentType): string {
  return type.name;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
