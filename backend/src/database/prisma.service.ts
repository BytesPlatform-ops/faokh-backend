import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { type AppEnv, InjectEnv } from '../config/config.tokens';

/**
 * A Prisma transaction client. Repository methods accept this so they can be
 * composed inside a larger transaction — booking creation writes an
 * appointment, a lead, a contact, an opportunity and an activity, and either
 * all of them land or none do.
 */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@InjectEnv() private readonly env: AppEnv) {
    super({
      datasources: { db: { url: env.databaseUrl } },
      log:
        env.nodeEnv === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ]
          : [
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ],
      errorFormat: env.nodeEnv === 'production' ? 'minimal' : 'pretty',
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.env.nodeEnv === 'development') {
      // Query text is logged in development only. Parameters are never logged
      // in any environment — they carry names, emails and phone numbers.
      // @ts-expect-error `$on('query')` is only typed when the event log level
      // is statically known, which it is not with a conditional log config.
      this.$on('query', (event: Prisma.QueryEvent) => {
        this.logger.debug(`${event.duration}ms ${event.query}`);
      });
    }

    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Runs `work` in a SERIALIZABLE transaction, retrying on Postgres
   * serialization failures.
   *
   * Booking is the case this exists for: two visitors racing for the last slot
   * must not both succeed. Row locking (below) does the primary work, but
   * under SERIALIZABLE Postgres may still abort a transaction with 40001, and
   * the correct response to that is to retry rather than to surface an error —
   * the second attempt sees the committed state and fails cleanly on capacity.
   */
  async transactionWithRetry<T>(
    work: (tx: PrismaTransaction) => Promise<T>,
    options: { maxAttempts?: number; timeoutMs?: number } = {},
  ): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: options.timeoutMs ?? 10_000,
        });
      } catch (error) {
        lastError = error;
        if (!isRetryableTransactionError(error) || attempt === maxAttempts) {
          throw error;
        }
        // Jittered backoff: two transactions retrying in lockstep would
        // collide again on the same schedule.
        const backoffMs = 25 * attempt + Math.floor(Math.random() * 25);
        this.logger.warn(
          `Transaction conflict (attempt ${attempt}/${maxAttempts}); retrying in ${backoffMs}ms`,
        );
        await sleep(backoffMs);
      }
    }

    throw lastError;
  }

  /**
   * Takes a row-level write lock on an availability slot and returns its
   * current capacity, or null when the slot does not exist.
   *
   * `SELECT ... FOR UPDATE` is the whole point: a concurrent transaction
   * asking for the same slot blocks here until this one commits or rolls back,
   * so it can never read stale capacity and oversell. Checking availability in
   * application code without this lock is the classic double-booking bug.
   */
  async lockAvailabilitySlot(
    tx: PrismaTransaction,
    slotId: string,
  ): Promise<{ id: string; capacity: number; bookedCount: number; isActive: boolean } | null> {
    const rows = await tx.$queryRaw<
      { id: string; capacity: number; booked_count: number; is_active: boolean }[]
    >`
      SELECT id, capacity, booked_count, is_active
      FROM availability_slots
      WHERE id = ${slotId}::uuid
      FOR UPDATE
    `;

    const row = rows[0];
    if (row === undefined) return null;

    return {
      id: row.id,
      capacity: row.capacity,
      bookedCount: row.booked_count,
      isActive: row.is_active,
    };
  }

  /** Truncates every table except migrations. Test helper — refuses to run
   *  outside NODE_ENV=test so it cannot be pointed at a real database. */
  async truncateAllTables(): Promise<void> {
    if (this.env.nodeEnv !== 'test') {
      throw new Error('truncateAllTables() is only available when NODE_ENV=test');
    }

    const tables = await this.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `;
    if (tables.length === 0) return;

    const list = tables.map((table) => `"public"."${table.tablename}"`).join(', ');
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
}

/**
 * Postgres 40001 (serialization failure) and 40P01 (deadlock detected) are
 * both "try again" conditions rather than genuine errors.
 */
function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034 is Prisma's own wrapper for a write conflict / deadlock.
    if (error.code === 'P2034') return true;
    const dbCode = (error.meta as { code?: string } | undefined)?.code;
    return dbCode === '40001' || dbCode === '40P01';
  }
  if (error instanceof Error) {
    return error.message.includes('40001') || error.message.includes('40P01');
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
