import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RolesGuard } from './common/guards/roles.guard';
import { StorageService } from './common/storage/storage.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppConfigModule } from './config/config.module';
import { type AppEnv, APP_ENV } from './config/config.tokens';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { SupabaseAuthGuard } from './modules/auth/supabase-auth.guard';
import { BookingsModule } from './modules/bookings/bookings.module';
import { BrokersModule } from './modules/brokers/brokers.module';
import { ClientsModule } from './modules/clients/clients.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';

/**
 * The Foakh Broker CRM API.
 *
 * Identity comes from Supabase Auth; authorisation is enforced here. The guard
 * order below is significant and runs top to bottom:
 *
 *   1. Throttler       cheapest rejection first, before any database work
 *   2. SupabaseAuth    verifies the bearer token, establishes request.user
 *   3. Roles           needs request.user to know its roles
 *
 * Authentication is global and opt-out (`@Public()`), so a route added without
 * a decorator is protected rather than exposed.
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuthModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        throttlers: [{ ttl: env.throttleTtlSeconds * 1000, limit: env.throttleLimit }],
      }),
    }),

    ClientsModule,
    BrokersModule,
    InventoryModule,
    BookingsModule,
    CommissionsModule,
    PaymentsModule,
    InvoicesModule,
    DashboardModule,
    HealthModule,
  ],
  providers: [
    StorageService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
