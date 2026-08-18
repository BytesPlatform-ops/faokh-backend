import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { type AppEnv, APP_ENV } from './config/config.tokens';
import { StorageService } from './common/storage/storage.service';
import { buildOpenApiDocument } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const env = app.get<AppEnv>(APP_ENV);
  const logger = new Logger('Bootstrap');

  app.use(
    helmet({
      // This API serves JSON, never HTML, so the default CSP is noise.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: env.nodeEnv === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(compression());

  // Bookings are a few hundred bytes; capping removes an easy memory vector.
  app.useBodyParser('json', { limit: '256kb' });
  app.set('trust proxy', 1);

  app.enableCors({
    origin: (origin, callback) => {
      // Server-to-server calls carry no Origin header.
      if (origin === undefined) return callback(null, true);
      if (env.corsAllowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not permitted by CORS policy`), false);
    },
    // Auth travels in the Authorization header, so credentials are not needed;
    // the allow-list stays exact regardless.
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip anything not on the DTO, then reject if it was sent anyway.
      // Silent stripping hides client bugs; this surfaces them.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );

  app.enableShutdownHooks();

  // Provisioned at boot, and asserted private. Doing it here rather than in a
  // deploy script means a fresh environment is self-configuring, and an
  // existing bucket that has been made public stops the server rather than
  // silently accepting CNIC scans into a world-readable location.
  await app.get(StorageService).ensureBucket();

  if (env.nodeEnv !== 'production') {
    buildOpenApiDocument(app);
    logger.log(`OpenAPI UI at ${env.apiPublicUrl}/api/docs`);
  }

  await app.listen(env.port, '0.0.0.0');
  logger.log(`Foakh Broker CRM API listening on ${env.port} [${env.nodeEnv}]`);
  if (env.supabaseUrl === undefined) {
    logger.warn('SUPABASE_URL is not set — token verification will reject every request');
  }
}

void bootstrap();
