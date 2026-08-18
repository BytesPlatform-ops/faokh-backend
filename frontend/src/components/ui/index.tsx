'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

/**
 * The CRM primitive set.
 *
 * Kept deliberately small and in one file: this is an operational tool, and a
 * sprawling component library invites five slightly different buttons. Every
 * primitive here carries the Foakh palette but is tuned for density and
 * scanning rather than for the marketing site's cinematic pacing.
 */

// ------------------------------------------------------------------- Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--foakh-terracotta)] text-white hover:bg-[var(--foakh-terracotta-deep)] shadow-sm',
  secondary:
    'bg-white text-[var(--foakh-terracotta-deep)] border border-[var(--foakh-border-strong)] hover:bg-[var(--foakh-cream)]',
  ghost: 'bg-transparent text-[var(--foakh-text)] hover:bg-[var(--foakh-cream)] hover:text-[var(--foakh-ink)]',
  danger: 'bg-[#9b2c2c] text-white hover:bg-[#7d2323]',
};

const SIZES: Record<Size, string> = {
  // All clear the WCAG 2.2 24px minimum; md/lg clear the 44px comfort target.
  sm: 'px-3 py-1.5 text-xs min-h-[32px]',
  md: 'px-4 py-2.5 text-sm min-h-[44px]',
  lg: 'px-6 py-3 text-base min-h-[48px]',
};

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap';

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className = '',
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      // Buttons inside forms default to submit, which causes more accidental
      // submissions than any other HTML default.
      type="button"
      className={`${BUTTON_BASE} ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className = '',
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
} & React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={`${BUTTON_BASE} ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  );
}

// --------------------------------------------------------------------- Card

export function Card({
  className = '',
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-[var(--foakh-border)] bg-white shadow-[var(--foakh-shadow-soft)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--foakh-border)] px-5 py-4">
      <div>
        <h2 className="font-display text-base font-medium text-[var(--foakh-ink)]">{title}</h2>
        {subtitle !== undefined && (
          <p className="mt-0.5 text-xs text-[var(--foakh-muted)]">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

// -------------------------------------------------------------------- Badge

export type BadgeTone = 'available' | 'hold' | 'booked' | 'sold' | 'blocked' | 'neutral' | 'warning' | 'success' | 'danger';

const TONES: Record<BadgeTone, string> = {
  available: 'bg-[#e7f0e9] text-[#2c5c3c] ring-[#2c5c3c]/20',
  hold: 'bg-[#fdf1e3] text-[#8a5a1f] ring-[#8a5a1f]/20',
  booked: 'bg-[#f4e6e1] text-[var(--foakh-terracotta-dark)] ring-[var(--foakh-terracotta)]/25',
  sold: 'bg-[#ece7e3] text-[#4a3f39] ring-[#4a3f39]/20',
  blocked: 'bg-[#eceff1] text-[#4b5563] ring-[#4b5563]/20',
  neutral: 'bg-[var(--foakh-cream)] text-[var(--foakh-text)] ring-[var(--foakh-border-strong)]',
  warning: 'bg-[#fdf1e3] text-[#8a5a1f] ring-[#8a5a1f]/25',
  success: 'bg-[#e7f0e9] text-[#2c5c3c] ring-[#2c5c3c]/20',
  danger: 'bg-[#f9e6e6] text-[#9b2c2c] ring-[#9b2c2c]/20',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.65rem] font-semibold tracking-[0.08em] uppercase ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Maps a domain status to a tone once, so no screen invents its own colours. */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'AVAILABLE':
    case 'PAID':
    case 'CLEARED':
    case 'CONFIRMED':
    case 'ACTIVE':
      return 'available';
    case 'ON_HOLD':
    case 'PENDING':
    case 'UPCOMING':
    case 'PARTIALLY_PAID':
      return 'hold';
    case 'BOOKED':
    case 'ELIGIBLE':
    case 'APPROVED':
      return 'booked';
    case 'SOLD':
    case 'COMPLETED':
      return 'sold';
    case 'BLOCKED':
    case 'HELD':
      return 'blocked';
    case 'OVERDUE':
    case 'CANCELLED':
    case 'BOUNCED':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** `ON_HOLD` → `On hold`. */
export function humanise(value: string): string {
  const lower = value.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// --------------------------------------------------------------------- Stat

export function Stat({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[0.65rem] font-medium tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
        {label}
      </p>
      <p
        className={`font-display mt-2 text-2xl leading-none font-medium ${
          tone === 'danger'
            ? 'text-[#9b2c2c]'
            : tone === 'warning'
              ? 'text-[#8a5a1f]'
              : 'text-[var(--foakh-ink)]'
        }`}
      >
        {value}
      </p>
      {hint !== undefined && <p className="mt-1.5 text-xs text-[var(--foakh-muted)]">{hint}</p>}
    </>
  );

  const className =
    'rounded-xl border border-[var(--foakh-border)] bg-white px-5 py-4 shadow-[var(--foakh-shadow-soft)] transition-shadow';

  return href === undefined ? (
    <div className={className}>{body}</div>
  ) : (
    <Link href={href} className={`${className} block hover:shadow-[var(--foakh-shadow-medium)]`}>
      {body}
    </Link>
  );
}

// ------------------------------------------------------------------- Fields

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-[var(--foakh-ink)]">
        {label}
        {required === true && (
          <>
            <span aria-hidden="true" className="ml-1 text-[var(--foakh-terracotta)]">*</span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {hint !== undefined && <p className="mt-1 text-xs text-[var(--foakh-muted)]">{hint}</p>}
      <div className="mt-1.5">{children}</div>
      {error !== undefined && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-[#9b2c2c]">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-[var(--foakh-ink)] min-h-[44px] ' +
  'placeholder:text-[var(--foakh-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--foakh-terracotta)]/40';

export function Input({
  invalid,
  className = '',
  ...rest
}: { invalid?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      aria-invalid={invalid === true}
      className={`${CONTROL} ${invalid === true ? 'border-[#9b2c2c]' : 'border-[var(--foakh-border-strong)]'} ${className}`}
      {...rest}
    />
  );
}

export function Select({
  className = '',
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`${CONTROL} border-[var(--foakh-border-strong)] ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className = '',
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${CONTROL} border-[var(--foakh-border-strong)] ${className}`}
      {...rest}
    />
  );
}

// ------------------------------------------------------- states: loading etc.

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[var(--foakh-cream-warm)] ${className}`} />;
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--foakh-border-strong)] bg-[var(--foakh-cream-soft)] px-6 py-14 text-center">
      <h3 className="font-display text-lg text-[var(--foakh-ink)]">{title}</h3>
      <p className="max-w-md text-sm text-[var(--foakh-text)]">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-[#9b2c2c]/30 bg-[#f9e6e6] px-5 py-4"
    >
      <p className="text-sm font-medium text-[#9b2c2c]">{message}</p>
      {onRetry !== undefined && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({
  tone = 'warning',
  title,
  children,
}: {
  tone?: 'warning' | 'info';
  title: string;
  children?: React.ReactNode;
}) {
  const styles =
    tone === 'warning'
      ? 'border-[#8a5a1f]/30 bg-[#fdf1e3] text-[#6d4715]'
      : 'border-[var(--foakh-border-strong)] bg-[var(--foakh-cream)] text-[var(--foakh-text)]';

  return (
    <div className={`rounded-xl border px-4 py-3 ${styles}`}>
      <p className="text-sm font-semibold">{title}</p>
      {children !== undefined && <div className="mt-1 text-xs leading-relaxed">{children}</div>}
    </div>
  );
}

// -------------------------------------------------------------------- Modal

/**
 * Confirmation dialog for destructive or irreversible actions.
 *
 * Uses the native `<dialog>` element so focus trapping, Escape-to-close and the
 * top layer come from the platform rather than from hand-rolled key handlers
 * that are always slightly wrong.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: Variant;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-[var(--foakh-border)] bg-white p-0 backdrop:bg-black/40"
    >
      <div className="px-6 py-5">
        <h2 className="font-display text-lg font-medium text-[var(--foakh-ink)]">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foakh-text)]">{description}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} disabled={busy}>
            {busy === true ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

// -------------------------------------------------------------------- Table

/**
 * A table that becomes a card list below `md`.
 *
 * Horizontally scrolling tables are the standard mobile CRM failure: a broker
 * on a phone at a site visit cannot read a 9-column grid. Each row therefore
 * renders twice — as a real `<tr>` for wide screens and as a labelled card for
 * narrow ones — rather than being squeezed.
 */
export function DataTable<T>({
  columns,
  rows,
  getKey,
  renderCard,
  emptyState,
}: {
  columns: { key: string; header: string; align?: 'left' | 'right'; render: (row: T) => React.ReactNode }[];
  rows: T[];
  getKey: (row: T) => string;
  renderCard: (row: T) => React.ReactNode;
  emptyState?: React.ReactNode;
}) {
  if (rows.length === 0) return <>{emptyState}</>;

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-[var(--foakh-border)] bg-white md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--foakh-border)] bg-[var(--foakh-cream-soft)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-4 py-3 text-[0.65rem] font-semibold tracking-[0.12em] text-[var(--foakh-muted)] uppercase ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={getKey(row)}
                className="border-b border-[var(--foakh-border)] last:border-0 hover:bg-[var(--foakh-cream-soft)]"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 text-[var(--foakh-ink)] ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <div key={getKey(row)}>{renderCard(row)}</div>
        ))}
      </div>
    </>
  );
}

/** Label/value pair used across detail screens and mobile cards. */
export function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.62rem] font-medium tracking-[0.14em] text-[var(--foakh-muted)] uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-[var(--foakh-ink)]">{value}</dd>
    </div>
  );
}

// -------------------------------------------------------------------- Drawer

/**
 * A side drawer built on the native `<dialog>` element.
 *
 * Used for creating a client without leaving the booking wizard. `<dialog>`
 * gives focus trapping, Escape-to-close and the top layer from the platform,
 * which hand-rolled key handlers get subtly wrong — and losing focus
 * containment mid-form is exactly how a broker ends up typing into the page
 * behind the overlay.
 *
 * It fills the screen below `sm`: a twenty-field form in a 360px-wide side
 * panel is unusable on a phone.
 */
export function Drawer({
  open,
  title,
  description,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        // Escape must not discard a part-filled form silently; the caller
        // decides whether to confirm.
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-dvh w-full max-w-full bg-transparent p-0 backdrop:bg-black/40 sm:ml-auto sm:w-[min(46rem,100vw)]"
    >
      <div className="flex h-dvh flex-col bg-[var(--foakh-cream-soft)]">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--foakh-border)] bg-white px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-medium text-[var(--foakh-ink)]">{title}</h2>
            {description !== undefined && (
              <p className="mt-0.5 text-xs text-[var(--foakh-muted)]">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target -mr-2 flex items-center justify-center rounded-lg px-3 text-[var(--foakh-muted)] hover:bg-[var(--foakh-cream)] hover:text-[var(--foakh-ink)]"
          >
            <span aria-hidden="true" className="text-lg">×</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer !== undefined && (
          <footer className="border-t border-[var(--foakh-border)] bg-white px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}

/** Groups related fields inside a long form so it can be scanned. */
export function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-3 text-[0.62rem] font-semibold tracking-[0.16em] text-[var(--foakh-muted)] uppercase">
        {title}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/**
 * A row of mutually-exclusive choices rendered as pills.
 *
 * A `<select>` hides the options behind a tap; for three-to-five short choices
 * on a form a broker fills in front of a client, showing them all is faster and
 * makes the current answer legible at a glance.
 */
export function ChoiceGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-[var(--foakh-ink)]">{label}</p>
      {hint !== undefined && <p className="mt-1 text-xs text-[var(--foakh-muted)]">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`tap-target rounded-lg border px-4 py-2 text-sm transition-colors ${
                selected
                  ? 'border-[var(--foakh-terracotta)] bg-[var(--foakh-terracotta)] font-medium text-white'
                  : 'border-[var(--foakh-border-strong)] bg-white text-[var(--foakh-text)] hover:bg-[var(--foakh-cream)]'
              }`}
            >
              {option.label}
              {option.description !== undefined && (
                <span className={`ml-1.5 text-xs ${selected ? 'opacity-80' : 'opacity-60'}`}>
                  {option.description}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
