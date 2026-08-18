import { Injectable, Logger } from '@nestjs/common';
import { RoleName, UserStatus } from '@prisma/client';
// Pinned to jose 5, deliberately. Version 6 is ESM-only — its package exports
// carry no `require` condition — and this service compiles to CommonJS, so
// `require('jose')` throws ERR_REQUIRE_ESM the moment the built app starts on a
// runtime without Node's require-of-ESM support. Recent Node versions have it,
// which is why a development machine never notices; the deployed API died on
// every request until this was pinned back. Upgrade only alongside a move to
// ESM output.
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type AppEnv, InjectEnv } from '../../config/config.tokens';
import { PrismaService } from '../../database/prisma.service';

export interface AuthenticatedPrincipal {
  /** CRM user id — not the Supabase UUID. */
  id: string;
  /** Supabase Auth `sub`. The identity link, never shown to users. */
  supabaseUserId: string;
  email: string;
  displayName: string;
  roles: RoleName[];
  /**
   * Present only for Sales Agents. Attribution comes from here and nowhere
   * else — never from a request body, which a caller controls.
   *
   * This is the internal Foakh employee. An external referral broker is a
   * separate entity that does not log in.
   */
  salesAgent: { id: string; salesAgentCode: string } | null;
}

/**
 * Supabase Auth is the identity provider; this service is the bridge to the
 * CRM's own user records.
 *
 * Two identifiers, deliberately kept apart:
 *
 *   Supabase UUID   proves *who authenticated*. Opaque, never displayed.
 *   SAG-2026-000001 the business identity an agent's work is attributed to.
 *
 * Conflating them would put an auth-provider implementation detail on printed
 * paperwork, and would make migrating identity providers a data migration of
 * every historical booking.
 *
 * Tokens are verified locally against the project's JWKS rather than by calling
 * `/auth/v1/user` on every request — a network round-trip per API call would
 * put Supabase's availability in the critical path of every screen.
 */
@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | null;

  /**
   * Short-lived cache of resolved principals, keyed by Supabase user id.
   *
   * Without it every single API call pays a database round trip purely to
   * answer "who is this?" — and against a pooled Supabase instance in another
   * region that round trip costs roughly three quarters of a second, on top of
   * whatever the endpoint actually came to do.
   *
   * The trade is bounded and deliberate: a role change, a deactivation or a
   * agent being switched off takes effect within PRINCIPAL_TTL_MS rather than
   * instantly. Thirty seconds is short enough that no realistic offboarding is
   * affected, and long enough that an agent clicking around the CRM pays the
   * lookup once rather than on every screen.
   *
   * Only successful resolutions are cached. A rejected token — unprovisioned,
   * suspended, unknown — is re-checked every time, so revoking access is never
   * the case that gets delayed.
   */
  private readonly principals = new Map<
    string,
    { principal: AuthenticatedPrincipal; expiresAt: number }
  >();
  private static readonly PRINCIPAL_TTL_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    @InjectEnv() private readonly env: AppEnv,
  ) {
    this.jwks =
      env.supabaseUrl === undefined
        ? null
        : createRemoteJWKSet(new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }

  /**
   * Verifies a bearer token and resolves it to a CRM principal.
   *
   * A valid Supabase token is necessary but not sufficient: the user must also
   * have an ACTIVE CRM profile. That separation is what lets a manager disable
   * a departing agent immediately without touching the auth provider.
   */
  async verify(token: string): Promise<AuthenticatedPrincipal> {
    const payload = await this.verifyToken(token);
    const supabaseUserId = payload.sub;

    if (typeof supabaseUserId !== 'string') {
      throw AppException.unauthorized('That access token is not valid.');
    }

    const cached = this.principals.get(supabaseUserId);
    if (cached !== undefined && cached.expiresAt > Date.now()) return cached.principal;

    const user = await this.prisma.user.findUnique({
      where: { supabaseUserId },
      include: {
        roles: { include: { role: true } },
        salesAgent: { select: { id: true, salesAgentCode: true, isActive: true } },
      },
    });

    if (user === null) {
      // Authenticated with Supabase but not provisioned in the CRM. Treated as
      // "no access" rather than auto-provisioned: staff are invited by an
      // administrator, and self-provisioning would let anyone who can sign up
      // walk into the sales system.
      throw AppException.forbidden(
        'This account has not been given access to the Foakh CRM.',
        ErrorCode.FORBIDDEN,
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw AppException.forbidden(
        'This account is not active. Contact your administrator.',
        ErrorCode.FORBIDDEN,
      );
    }

    const principal: AuthenticatedPrincipal = {
      id: user.id,
      supabaseUserId,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles.map((entry) => entry.role.name),
      salesAgent:
        user.salesAgent === null || !user.salesAgent.isActive
          ? null
          : { id: user.salesAgent.id, salesAgentCode: user.salesAgent.salesAgentCode },
    };

    this.principals.set(supabaseUserId, {
      principal,
      expiresAt: Date.now() + SupabaseAuthService.PRINCIPAL_TTL_MS,
    });

    // The map is keyed by user, so it is bounded by staff headcount rather than
    // by traffic. This sweep only stops it holding entries for people who have
    // signed out and not come back.
    if (this.principals.size > 200) {
      const now = Date.now();
      for (const [key, entry] of this.principals) {
        if (entry.expiresAt <= now) this.principals.delete(key);
      }
    }

    return principal;
  }

  /** Drops a cached principal immediately — for use when a role or status changes. */
  invalidate(supabaseUserId: string): void {
    this.principals.delete(supabaseUserId);
  }

  private async verifyToken(token: string): Promise<JWTPayload> {
    try {
      // Asymmetric (current Supabase default): verified against the published
      // JWKS, so the backend never holds a signing secret.
      if (this.jwks !== null) {
        const { payload } = await jwtVerify(token, this.jwks, {
          issuer: `${this.env.supabaseUrl}/auth/v1`,
        });
        return payload;
      }
    } catch (error) {
      this.logger.debug(`JWKS verification failed: ${describe(error)}`);
    }

    // Legacy symmetric fallback for projects still issuing HS256 tokens.
    if (this.env.supabaseJwtSecret !== undefined) {
      try {
        const { payload } = await jwtVerify(
          token,
          new TextEncoder().encode(this.env.supabaseJwtSecret),
        );
        return payload;
      } catch (error) {
        this.logger.debug(`HS256 verification failed: ${describe(error)}`);
      }
    }

    throw AppException.unauthorized('That access token is not valid or has expired.');
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
