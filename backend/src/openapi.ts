import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * The OpenAPI document is the single source of truth for the API contract.
 *
 * The frontend generates its client types from this file rather than
 * maintaining a parallel set of hand-written interfaces — two repositories
 * describing the same endpoints by hand drift within a sprint, and the drift
 * is only discovered at runtime.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Foakh Broker Booking CRM API')
    .setDescription(
      [
        'The API behind the Foakh Wind Corridor Enclave consultation booking journey',
        'and the internal sales CRM.',
        '',
        '## Authentication',
        '',
        'Public booking endpoints require no authentication at all — an account wall',
        'in front of the conversion funnel costs completions and buys nothing.',
        '',
        'CRM endpoints use an opaque, revocable session cookie issued after Google',
        'OpenID Connect sign-in. Cookie-authenticated mutations must also echo the',
        '`foakh_csrf` cookie in an `X-CSRF-Token` header.',
        '',
        '## Errors',
        '',
        'Every error uses one envelope. Branch on `error.code`, never on the message —',
        'messages are copy and will change:',
        '',
        '```json',
        '{ "error": { "code": "SLOT_UNAVAILABLE", "message": "…", "requestId": "req_…" } }',
        '```',
        '',
        '## Idempotency',
        '',
        '`POST /bookings` accepts an `Idempotency-Key` header. Repeating a request',
        'with the same key returns the original confirmation instead of creating a',
        'second booking.',
        '',
        '## What this API will not do',
        '',
        'Mock inventory is never presented as confirmed availability, and remaining',
        'slot capacity is not exposed. Both exist to keep scarcity claims honest.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'supabase')

    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Foakh Booking & CRM API',
  });

  return document;
}
