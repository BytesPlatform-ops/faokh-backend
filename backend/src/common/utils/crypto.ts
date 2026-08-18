import { createHash, randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// `promisify` resolves to the three-argument overload, which loses the options
// parameter this module depends on for its work factor.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing uses Node's built-in scrypt rather than argon2/bcrypt: both
 * of those are native addons, and this API's only password path is the
 * bootstrap administrator fallback. Avoiding a compiled dependency for a
 * rarely-used code path is the better trade — staff sign-in is Google OIDC.
 *
 * Parameters follow the OWASP scrypt guidance (N=2^17, r=8, p=1).
 */
const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;
// scrypt's memory need is roughly 128 * N * r; the default 32 MB cap is below
// what N=2^17 requires, so it is raised explicitly.
const SCRYPT_MAXMEM = 256 * SCRYPT_N * SCRYPT_R;

/** `scrypt$N$r$p$<salt b64>$<hash b64>` — self-describing, so the work factor
 *  can be raised later without invalidating existing hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });

  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltRaw, 'base64');
  const expected = Buffer.from(hashRaw, 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 256 * N * r,
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Session and manage tokens are stored hashed. They already carry 256 bits of
 * entropy, so a plain SHA-256 is correct here — the slow-KDF requirement
 * applies to low-entropy human passwords, not to random bearer tokens.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time string comparison for secrets (CSRF tokens, manage tokens). */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  // Hashing first gives both sides a fixed width.
  const hashA = createHash('sha256').update(bufferA).digest();
  const hashB = createHash('sha256').update(bufferB).digest();
  return timingSafeEqual(hashA, hashB);
}
