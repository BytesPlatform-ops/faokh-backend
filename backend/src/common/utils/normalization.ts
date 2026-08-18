import parsePhoneNumberFromString, { type CountryCode } from 'libphonenumber-js';

/**
 * Contact deduplication is only as good as its normalization. These two
 * functions define what "the same person" means, so they live in one file and
 * are used by every write path — the booking API, CRM lead creation and the
 * seed script alike.
 */

/**
 * Lower-cased, trimmed email.
 *
 * Deliberately does NOT strip Gmail dots or `+tag` suffixes: `a.b@gmail.com`
 * and `ab@gmail.com` reach the same inbox, but treating them as one person
 * would silently merge two genuinely distinct enquiries for every other
 * provider, and a wrong merge in a CRM is far more damaging than a duplicate.
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (email === null || email === undefined) return null;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  // A value that is not shaped like an address must not become a dedup key —
  // two different junk strings would otherwise collide on the UNIQUE index.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * E.164 phone, e.g. `+923001234567`.
 *
 * Foakh's audience is split between Pakistan and overseas buyers, so a bare
 * `0300...` is interpreted against `defaultCountry` while anything already in
 * international form is parsed on its own terms. Unparseable input returns
 * null rather than a half-normalized string that would pollute the index.
 */
export function normalizePhone(
  phone: string | null | undefined,
  defaultCountry: string = 'PK',
): string | null {
  if (phone === null || phone === undefined) return null;
  const trimmed = phone.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as CountryCode);
    if (parsed === undefined || !parsed.isValid()) return null;
    return parsed.number;
  } catch {
    return null;
  }
}

/** Collapses runs of whitespace so "Ahmed   Khan" and "Ahmed Khan" match. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Both normalized identifiers for a submission, plus whether the submission
 * carries any usable dedup key at all. A contact with neither cannot be
 * deduplicated and the caller must decide whether that is acceptable.
 */
export interface NormalizedIdentity {
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  hasIdentifier: boolean;
}

export function normalizeIdentity(
  email: string | null | undefined,
  phone: string | null | undefined,
  defaultCountry?: string,
): NormalizedIdentity {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone, defaultCountry);
  return {
    normalizedEmail,
    normalizedPhone,
    hasIdentifier: normalizedEmail !== null || normalizedPhone !== null,
  };
}
