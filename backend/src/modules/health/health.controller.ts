import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness deliberately checks nothing external. A probe that fails when
   * Supabase is briefly unreachable would restart every replica during a blip,
   * turning a recoverable incident into an outage.
   */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness — the process is up' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  /**
   * The plain status endpoint, for uptime monitors and deployment checks.
   *
   * Reports whether the API is up, whether PostgreSQL answers, and whether
   * Supabase Auth is reachable — and nothing else. No connection strings, no
   * project ref, no key material: a health endpoint is unauthenticated by
   * definition, so everything it returns is public.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Overall status — API, database, Supabase' })
  async status() {
    const [database, supabase] = await Promise.all([this.checkDatabase(), this.checkSupabase()]);
    const healthy = database === 'up' && supabase !== 'down';

    return {
      status: healthy ? 'ok' : 'degraded',
      api: 'up',
      database,
      supabase,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness — Supabase PostgreSQL is reachable' })
  async ready() {
    const database = await this.checkDatabase();
    return database === 'up' ? { status: 'ok', database } : { status: 'degraded', database };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      // Deliberately swallowed: the driver's message can contain the host and
      // user from the connection string, and this endpoint is public.
      return 'down';
    }
  }

  private async checkSupabase(): Promise<'up' | 'down' | 'not-configured'> {
    const url = process.env.SUPABASE_URL;
    if (url === undefined || url.trim() === '') return 'not-configured';

    try {
      // The JWKS document is public by design and is what token verification
      // actually depends on, so reaching it is the honest readiness signal.
      // Five seconds, not one or two: this endpoint is informational and a
      // single slow round trip should not report a healthy service as degraded.
      // Liveness is /health/live, which deliberately checks nothing external,
      // so a blip here never causes a restart.
      const response = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
