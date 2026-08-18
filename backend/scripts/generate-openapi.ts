/* eslint-disable no-console */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { buildOpenApiDocument } from '../src/openapi';

/**
 * Writes `openapi.json` without a database, a Redis instance or a listening
 * port.
 *
 * This document is the contract between the two applications: the frontend
 * generates its client types from it (`pnpm api:types` in ../frontend) rather
 * than hand-maintaining a second copy of every DTO. Two repositories
 * describing the same endpoints by hand drift within a sprint, and the drift
 * is only ever discovered at runtime.
 *
 * PrismaService is replaced with a stub because the Swagger explorer only
 * needs route and DTO *metadata* — it never executes a handler. Requiring a
 * live Postgres to produce a schema document would make the contract
 * unbuildable in exactly the environments that most want it.
 */
async function generate(): Promise<void> {
  // Placeholders that satisfy configuration validation. Nothing here is used
  // to open a connection.
  process.env.NODE_ENV ??= 'development';
  process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
  process.env.SESSION_SECRET ??= 'openapi-generation-placeholder-secret-value-x';
  process.env.ENCRYPTION_KEY ??= Buffer.alloc(32).toString('base64');
  process.env.CORS_ALLOWED_ORIGINS ??= 'http://localhost:3000';
  process.env.QUEUES_ENABLED = 'false';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      // Only the lifecycle hooks Nest calls during init/shutdown.
      onModuleInit: () => Promise.resolve(),
      onModuleDestroy: () => Promise.resolve(),
      $connect: () => Promise.resolve(),
      $disconnect: () => Promise.resolve(),
    })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  // Must mirror main.ts exactly, or the document advertises paths that do not
  // exist — the frontend would generate a client for /api/bookings while the
  // server serves /api/v1/bookings.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();

  const document = buildOpenApiDocument(app);

  const target = resolve(process.cwd(), 'openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const paths = Object.keys(document.paths ?? {}).length;
  console.log(`Wrote ${target} — ${paths} paths`);

  await app.close();
}

generate().catch((error: unknown) => {
  console.error('OpenAPI generation failed:', error);
  process.exit(1);
});
