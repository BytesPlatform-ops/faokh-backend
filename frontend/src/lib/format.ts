import { toRupees, type Paisa } from './money';

/**
 * Pakistan-first presentation.
 *
 * Every date in this CRM is rendered in Asia/Karachi regardless of where the
 * browser is. A broker in Dubai and one in Karachi must read the same due date
 * off the same booking, and a schedule that shifts by a day depending on who
 * opens it is a support call.
 */
export const FOAKH_TIMEZONE = 'Asia/Karachi';
export const FOAKH_LOCALE = 'en-PK';

/** `PKR 21,000,000` — grouped the way the Foakh price list is written. */
export function formatPkr(paisa: Paisa, options: { decimals?: boolean } = {}): string {
  const decimals = options.decimals ?? false;
  return `PKR ${new Intl.NumberFormat(FOAKH_LOCALE, {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(toRupees(paisa))}`;
}

/** From a plain rupee number, for master-data prices. */
export function formatPkrFromRupees(rupees: number, options: { decimals?: boolean } = {}): string {
  return formatPkr(Math.round(rupees * 100), options);
}

/** `19,056.26` — the per-square-foot rate, two places for print. */
export function formatRate(rate: number): string {
  return new Intl.NumberFormat(FOAKH_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate);
}

/** `1,102` sq ft. */
export function formatArea(sqFt: number): string {
  return new Intl.NumberFormat(FOAKH_LOCALE, { maximumFractionDigits: 0 }).format(sqFt);
}

/** `15 Jan 2026` — unambiguous, and never the US month-first order. */
export function formatDate(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return 'To be confirmed';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: FOAKH_TIMEZONE,
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FOAKH_TIMEZONE,
  }).format(date);
}

/** "3 days overdue", "due in 12 days" — the phrasing finance staff scan for. */
export function relativeDueLabel(due: Date | string | null): string {
  if (due === null) return 'To be confirmed';
  const date = typeof due === 'string' ? new Date(due) : due;
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);

  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return 'Yesterday';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

// ------------------------------------------------------------------------ CNIC

/** `35202-1234567-1`. Stored digits-only; formatted only for display. */
export function formatCnic(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  if (clean.length !== 13) return digits;
  return `${clean.slice(0, 5)}-${clean.slice(5, 12)}-${clean.slice(12)}`;
}

/** Progressive formatting as the user types, so the mask never fights them. */
export function maskCnicInput(value: string): string {
  const clean = value.replace(/\D/g, '').slice(0, 13);
  if (clean.length <= 5) return clean;
  if (clean.length <= 12) return `${clean.slice(0, 5)}-${clean.slice(5)}`;
  return `${clean.slice(0, 5)}-${clean.slice(5, 12)}-${clean.slice(12)}`;
}

export function isValidCnic(value: string): boolean {
  return value.replace(/\D/g, '').length === 13;
}

export function stripCnic(value: string): string {
  return value.replace(/\D/g, '');
}

// ----------------------------------------------------------------------- phone

/**
 * Pakistani mobile display: `0300 1234567`, or `+92 300 1234567` when stored
 * internationally. Accepts either on input.
 */
export function formatPhone(value: string): string {
  const clean = value.replace(/[^\d+]/g, '');
  if (clean.startsWith('+92') && clean.length === 13) {
    return `+92 ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  if (clean.startsWith('03') && clean.length === 11) {
    return `${clean.slice(0, 4)} ${clean.slice(4)}`;
  }
  return value;
}

export function maskPhoneInput(value: string): string {
  const clean = value.replace(/[^\d+]/g, '');
  return clean.slice(0, 13);
}

export function isValidPakistaniMobile(value: string): boolean {
  const clean = value.replace(/[^\d+]/g, '');
  return /^03\d{9}$/.test(clean) || /^\+923\d{9}$/.test(clean);
}

/** Normalises to E.164 for storage, matching what the backend expects. */
export function toE164(value: string): string {
  const clean = value.replace(/[^\d+]/g, '');
  if (clean.startsWith('+')) return clean;
  if (clean.startsWith('03')) return `+92${clean.slice(1)}`;
  return clean;
}

// ------------------------------------------------------------------ date input

/**
 * Parses an `<input type="date">` value (`YYYY-MM-DD`) into a local Date.
 *
 * `new Date('2000-01-01')` parses as UTC midnight, which in Pakistan is 5am the
 * same day but in the Americas is the *previous* day — enough to make an
 * eighteenth birthday land a day early. Constructing from parts keeps the date
 * the person actually typed.
 *
 * Returns null for anything that is not a real calendar date, including
 * impossible ones like 31 February that the string format still permits.
 */
export function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  // Rolls over for impossible dates: 31 Feb becomes 2 or 3 March, and the parts
  // no longer match what was asked for.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Local midnight today — the comparison point for "past" and "future". */
export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Whole years from `from` to `to`.
 *
 * Counts the way a birthday does: someone born on 29 February turns 18 on
 * 1 March in a non-leap year, not on the 28th.
 */
export function yearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear();
  const monthDelta = to.getMonth() - from.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && to.getDate() < from.getDate())) years -= 1;
  return years;
}
