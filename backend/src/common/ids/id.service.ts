import { Injectable } from '@nestjs/common';

import type { PrismaTransaction } from '../../database/prisma.service';

/**
 * `SAG` is the internal Foakh sales employee; `BRK` is an external referral
 * broker. They are different people and must never share a sequence.
 */
export type IdPrefix = 'CLI' | 'SAG' | 'BRK' | 'BKG' | 'INV' | 'PAY';

/**
 * Human-readable identifiers: `CLI-2026-000001`.
 *
 * Two properties matter and neither is free:
 *
 *  * **No gaps.** Finance staff read these aloud and reconcile them against
 *    paper. A missing number prompts "where is BKG-2026-000042?", so the
 *    counter is incremented inside the caller's transaction — if the booking
 *    rolls back, the number is never consumed. A Postgres sequence would keep
 *    counting through a rollback.
 *
 *  * **No collisions under concurrency.** The `UPDATE ... RETURNING` below
 *    takes a row lock on the counter for the duration of the transaction, so
 *    two agents submitting simultaneously queue rather than both reading the
 *    same value.
 *
 * The trade is that concurrent bookings serialise briefly on one row. At this
 * volume that is irrelevant, and it buys a gapless audit trail.
 */
@Injectable()
export class IdService {
  async next(tx: PrismaTransaction, prefix: IdPrefix, when: Date = new Date()): Promise<string> {
    const year = when.getUTCFullYear();

    // Upsert-and-return in one statement. Doing this as a read followed by a
    // write would leave a window in which two transactions read the same value.
    const rows = await tx.$queryRaw<{ last_value: number }[]>`
      INSERT INTO id_sequences (id, prefix, year, last_value, updated_at)
      VALUES (gen_random_uuid(), ${prefix}, ${year}, 1, now())
      ON CONFLICT (prefix, year)
      DO UPDATE SET last_value = id_sequences.last_value + 1, updated_at = now()
      RETURNING last_value
    `;

    const value = rows[0]?.last_value;
    if (value === undefined) {
      throw new Error(`Could not allocate an identifier for ${prefix}`);
    }

    return format(prefix, year, value);
  }

  /** Peeks without consuming. For "next number will be…" displays only. */
  async peek(tx: PrismaTransaction, prefix: IdPrefix, when: Date = new Date()): Promise<string> {
    const year = when.getUTCFullYear();
    const sequence = await tx.idSequence.findUnique({ where: { prefix_year: { prefix, year } } });
    return format(prefix, year, (sequence?.lastValue ?? 0) + 1);
  }
}

function format(prefix: string, year: number, value: number): string {
  return `${prefix}-${year}-${String(value).padStart(6, '0')}`;
}

/** Shape check used by route params, so a malformed code never reaches a query. */
export const ID_PATTERN = /^(CLI|BRK|BKG|INV|PAY)-\d{4}-\d{6}$/;
