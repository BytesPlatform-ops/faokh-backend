/**
 * Boot-time environment validation.
 *
 * Every problem is collected before throwing, so a misconfigured deployment
 * reports all of its faults at once instead of one per restart. Values are
 * parsed into their real types here and nowhere else — no `parseInt` scattered
 * through services, no `process.env` reads outside this file.
 */

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppEnv {
  nodeEnv: NodeEnv;
  port: number;
  apiPublicUrl: string;
  webPublicUrl: string;
  corsAllowedOrigins: string[];

  databaseUrl: string;

  redisUrl: string;
  queuesEnabled: boolean;

  sessionSecret: string;
  /** Raw 32-byte AES-256-GCM key, already base64-decoded and length-checked. */
  encryptionKey: Buffer;
  sessionTtlHours: number;
  sessionCookieName: string;
  sessionCookieDomain: string | undefined;

  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  googleAllowedHostedDomains: string[];
  googleCalendarEnabled: boolean;

  bootstrapAdminEmail: string | undefined;
  bootstrapAdminPassword: string | undefined;
  bootstrapAdminName: string;

  emailProvider: string;
  whatsappProvider: string;
  smsProvider: string;
  notificationsFromEmail: string;
  notificationsFromName: string;

  bookingDraftTtlHours: number;
  defaultTimezone: string;
  bookingReferencePrefix: string;

  featureClientSignup: boolean;
  /** Supabase project URL, e.g. https://abc.supabase.co */
  supabaseUrl: string | undefined;
  /** Service-role key. Server-only — never reaches the browser. */
  supabaseServiceRoleKey: string | undefined;
  /** Legacy HS256 signing secret, for projects not yet on asymmetric keys. */
  supabaseJwtSecret: string | undefined;
  supabaseStorageBucket: string;
  featureRealUnitReservation: boolean;
  featureReservationPayment: boolean;

  logLevel: string;
  logPretty: boolean;

  throttleTtlSeconds: number;
  throttleLimit: number;
}

class EnvErrors {
  private readonly messages: string[] = [];

  add(key: string, problem: string): void {
    this.messages.push(`  ${key}: ${problem}`);
  }

  throwIfAny(): void {
    if (this.messages.length > 0) {
      throw new Error(
        `Invalid environment configuration:\n${this.messages.join('\n')}\n` +
          `See .env.example for the expected shape of each variable.`,
      );
    }
  }
}

type Raw = Record<string, unknown>;

const str = (raw: Raw, key: string): string | undefined => {
  const value = raw[key];
  if (value === undefined || value === null) return undefined;
  // Environment values are always strings in practice, but `process.env` is
  // typed loosely and a non-string would stringify to "[object Object]" —
  // which would then pass a non-empty check and be treated as configuration.
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
};

const required = (raw: Raw, key: string, errors: EnvErrors): string => {
  const value = str(raw, key);
  if (value === undefined) {
    errors.add(key, 'is required but was empty or missing');
    return '';
  }
  return value;
};

const bool = (raw: Raw, key: string, fallback: boolean, errors: EnvErrors): boolean => {
  const value = str(raw, key);
  if (value === undefined) return fallback;
  const normalized = value.toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  errors.add(key, `expected a boolean (true/false) but received "${value}"`);
  return fallback;
};

const int = (
  raw: Raw,
  key: string,
  fallback: number,
  errors: EnvErrors,
  bounds?: { min?: number; max?: number },
): number => {
  const value = str(raw, key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    errors.add(key, `expected an integer but received "${value}"`);
    return fallback;
  }
  if (bounds?.min !== undefined && parsed < bounds.min) {
    errors.add(key, `must be at least ${bounds.min} (received ${parsed})`);
    return fallback;
  }
  if (bounds?.max !== undefined && parsed > bounds.max) {
    errors.add(key, `must be at most ${bounds.max} (received ${parsed})`);
    return fallback;
  }
  return parsed;
};

const list = (raw: Raw, key: string): string[] => {
  const value = str(raw, key);
  if (value === undefined) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const url = (raw: Raw, key: string, errors: EnvErrors, fallback = ''): string => {
  const value = str(raw, key) ?? fallback;
  if (value === '') {
    errors.add(key, 'is required but was empty or missing');
    return value;
  }
  try {
    // Trailing slashes make redirect-URI comparison brittle, so strip them here.
    return new URL(value).toString().replace(/\/+$/, '');
  } catch {
    errors.add(key, `must be an absolute URL (received "${value}")`);
    return value;
  }
};

export function validateEnv(raw: Raw): AppEnv {
  const errors = new EnvErrors();

  const nodeEnvRaw = str(raw, 'NODE_ENV') ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnvRaw)) {
    errors.add('NODE_ENV', `must be development, test or production (received "${nodeEnvRaw}")`);
  }
  const nodeEnv = nodeEnvRaw as NodeEnv;
  const isProduction = nodeEnv === 'production';

  const databaseUrl = required(raw, 'DATABASE_URL', errors);
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.add('DATABASE_URL', 'must be a postgresql:// connection string');
  }

  const sessionSecret = required(raw, 'SESSION_SECRET', errors);
  if (sessionSecret && sessionSecret.length < 32) {
    errors.add('SESSION_SECRET', 'must be at least 32 characters — run: openssl rand -base64 48');
  }
  if (isProduction && sessionSecret.startsWith('CHANGE_ME')) {
    errors.add('SESSION_SECRET', 'still holds the placeholder value from .env.example');
  }

  // AES-256-GCM needs exactly 32 bytes of key material. Validating the decoded
  // length here turns a runtime crypto throw into a startup error.
  const encryptionKeyRaw = required(raw, 'ENCRYPTION_KEY', errors);
  let encryptionKey = Buffer.alloc(32);
  if (encryptionKeyRaw) {
    if (isProduction && encryptionKeyRaw.startsWith('CHANGE_ME')) {
      errors.add('ENCRYPTION_KEY', 'still holds the placeholder value from .env.example');
    }
    const decoded = Buffer.from(encryptionKeyRaw, 'base64');
    if (decoded.length !== 32) {
      errors.add(
        'ENCRYPTION_KEY',
        `must decode to exactly 32 bytes for AES-256-GCM (got ${decoded.length}) — ` +
          `run: openssl rand -base64 32`,
      );
    } else {
      encryptionKey = decoded;
    }
  }

  const corsAllowedOrigins = list(raw, 'CORS_ALLOWED_ORIGINS');
  if (corsAllowedOrigins.includes('*')) {
    // The API authenticates with cookies; a wildcard origin plus credentials is
    // rejected by browsers anyway and signals a misunderstanding worth failing on.
    errors.add(
      'CORS_ALLOWED_ORIGINS',
      'cannot contain "*" because this API uses credentialed cookies — list exact origins',
    );
  }
  if (isProduction && corsAllowedOrigins.length === 0) {
    errors.add('CORS_ALLOWED_ORIGINS', 'must list at least one origin in production');
  }

  const googleClientId = str(raw, 'GOOGLE_CLIENT_ID');
  const googleClientSecret = str(raw, 'GOOGLE_CLIENT_SECRET');
  if ((googleClientId === undefined) !== (googleClientSecret === undefined)) {
    errors.add(
      'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET',
      'must be set together — one without the other cannot complete an OAuth exchange',
    );
  }

  const googleCalendarEnabled = bool(raw, 'GOOGLE_CALENDAR_ENABLED', false, errors);
  if (googleCalendarEnabled && googleClientId === undefined) {
    errors.add(
      'GOOGLE_CALENDAR_ENABLED',
      'is true but GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not configured',
    );
  }

  const bootstrapAdminPassword = str(raw, 'BOOTSTRAP_ADMIN_PASSWORD');
  if (bootstrapAdminPassword !== undefined && bootstrapAdminPassword.length < 12) {
    errors.add('BOOTSTRAP_ADMIN_PASSWORD', 'must be at least 12 characters when set');
  }
  if (isProduction && bootstrapAdminPassword !== undefined && googleClientId !== undefined) {
    errors.add(
      'BOOTSTRAP_ADMIN_PASSWORD',
      'should be blank in production once Google sign-in is configured — ' +
        'fallback credentials are a bootstrap mechanism, not a standing login',
    );
  }

  const defaultTimezone = str(raw, 'DEFAULT_TIMEZONE') ?? 'Asia/Karachi';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: defaultTimezone });
  } catch {
    errors.add(
      'DEFAULT_TIMEZONE',
      `is not a recognised IANA time zone (received "${defaultTimezone}")`,
    );
  }

  const env: AppEnv = {
    nodeEnv,
    port: int(raw, 'PORT', 4000, errors, { min: 1, max: 65535 }),
    apiPublicUrl: url(raw, 'API_PUBLIC_URL', errors, 'http://localhost:4000'),
    webPublicUrl: url(raw, 'WEB_PUBLIC_URL', errors, 'http://localhost:3000'),
    corsAllowedOrigins,

    databaseUrl,

    redisUrl: str(raw, 'REDIS_URL') ?? 'redis://localhost:6379',
    queuesEnabled: bool(raw, 'QUEUES_ENABLED', true, errors),

    sessionSecret,
    encryptionKey,
    sessionTtlHours: int(raw, 'SESSION_TTL_HOURS', 12, errors, { min: 1, max: 720 }),
    sessionCookieName: str(raw, 'SESSION_COOKIE_NAME') ?? 'foakh_session',
    sessionCookieDomain: str(raw, 'SESSION_COOKIE_DOMAIN'),

    googleClientId,
    googleClientSecret,
    googleAllowedHostedDomains: list(raw, 'GOOGLE_ALLOWED_HOSTED_DOMAINS').map((d) =>
      d.toLowerCase(),
    ),
    googleCalendarEnabled,

    bootstrapAdminEmail: str(raw, 'BOOTSTRAP_ADMIN_EMAIL'),
    bootstrapAdminPassword,
    bootstrapAdminName: str(raw, 'BOOTSTRAP_ADMIN_NAME') ?? 'Foakh Administrator',

    emailProvider: str(raw, 'EMAIL_PROVIDER') ?? 'log',
    whatsappProvider: str(raw, 'WHATSAPP_PROVIDER') ?? 'log',
    smsProvider: str(raw, 'SMS_PROVIDER') ?? 'log',
    notificationsFromEmail: str(raw, 'NOTIFICATIONS_FROM_EMAIL') ?? 'reservations@fwce.info',
    notificationsFromName: str(raw, 'NOTIFICATIONS_FROM_NAME') ?? 'Foakh Residences',

    bookingDraftTtlHours: int(raw, 'BOOKING_DRAFT_TTL_HOURS', 72, errors, { min: 1, max: 720 }),
    defaultTimezone,
    bookingReferencePrefix: (str(raw, 'BOOKING_REFERENCE_PREFIX') ?? 'FWCE').toUpperCase(),

    featureClientSignup: bool(raw, 'FEATURE_CLIENT_SIGNUP', false, errors),
    supabaseUrl: str(raw, 'SUPABASE_URL')?.replace(/\/+$/, ''),
    supabaseServiceRoleKey: str(raw, 'SUPABASE_SERVICE_ROLE_KEY'),
    supabaseJwtSecret: str(raw, 'SUPABASE_JWT_SECRET'),
    supabaseStorageBucket: str(raw, 'SUPABASE_STORAGE_BUCKET') ?? 'foakh-documents',
    featureRealUnitReservation: bool(raw, 'FEATURE_REAL_UNIT_RESERVATION', false, errors),
    featureReservationPayment: bool(raw, 'FEATURE_RESERVATION_PAYMENT', false, errors),

    logLevel: str(raw, 'LOG_LEVEL') ?? (isProduction ? 'info' : 'debug'),
    logPretty: bool(raw, 'LOG_PRETTY', !isProduction, errors) && !isProduction,

    throttleTtlSeconds: int(raw, 'THROTTLE_TTL_SECONDS', 60, errors, { min: 1 }),
    throttleLimit: int(raw, 'THROTTLE_LIMIT', 120, errors, { min: 1 }),
  };

  // Payments cannot be meaningfully enabled without the reservation flow that
  // produces something to pay for.
  if (env.featureReservationPayment && !env.featureRealUnitReservation) {
    errors.add(
      'FEATURE_RESERVATION_PAYMENT',
      'requires FEATURE_REAL_UNIT_RESERVATION — there is nothing to take payment against',
    );
  }

  errors.throwIfAny();
  return env;
}
