import { randomBytes, randomInt } from 'node:crypto';

/**
 * Alphabet for human-facing references. Deliberately excludes the characters
 * people confuse when reading a code back over the phone: I/1, O/0, U/V.
 * Sales staff transcribe these from calls, so ambiguity is a real cost.
 */
const HUMAN_ALPHABET = 'ACDEFGHJKLMNPQRSTWXYZ23456789';

/**
 * `FWCE-260819-A7K2` — prefix, booking date, four random characters.
 *
 * The date component is derived in the appointment's own time zone so a
 * Karachi viewing booked late evening UTC-time still reads as that day.
 * Uniqueness is enforced by the UNIQUE constraint on `appointments.reference`;
 * the caller retries on collision rather than trusting randomness alone.
 */
export function generateBookingReference(
  prefix: string,
  when: Date,
  timezone: string,
  randomLength = 4,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(when);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';

  const datePart = `${get('year')}${get('month')}${get('day')}`;
  return `${prefix}-${datePart}-${randomCode(randomLength)}`;
}

/** Uniformly distributed code over {@link HUMAN_ALPHABET} (no modulo bias). */
export function randomCode(length: number): string {
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += HUMAN_ALPHABET[randomInt(HUMAN_ALPHABET.length)];
  }
  return out;
}

/**
 * Opaque, URL-safe token for booking drafts, guest manage links and session
 * cookies. 32 bytes of entropy — these are bearer credentials, so they are
 * sized to resist guessing rather than to look tidy.
 */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Stable identity for an availability slot. Written to `dedupeKey`, which is
 * UNIQUE, so seeding twice cannot produce two rows for the same real slot.
 */
export function availabilitySlotDedupeKey(
  type: string,
  startsAt: Date,
  hostUserId: string | null,
): string {
  return `${type}:${startsAt.toISOString()}:${hostUserId ?? 'POOL'}`;
}
