import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { APP_ENV } from './config.tokens';
import { validateEnv } from './env.validation';

/**
 * `@nestjs/config` is used purely for its `.env` file loading. The validated,
 * fully-typed {@link AppEnv} object is what the rest of the application
 * injects — nothing outside this module reads `process.env`, so there is one
 * place to audit for configuration and one place that can fail a boot.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // In production, configuration arrives from the orchestrator's
      // environment; a stray .env file on the image must not override it.
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      envFilePath: ['.env'],
    }),
  ],
  providers: [
    {
      provide: APP_ENV,
      useFactory: () => validateEnv(process.env),
    },
  ],
  exports: [APP_ENV],
})
export class AppConfigModule {}
