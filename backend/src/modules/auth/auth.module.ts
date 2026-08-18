import { Global, Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SupabaseAuthService } from './supabase-auth.service';

/**
 * Global because the application-wide auth guard depends on
 * SupabaseAuthService, and a globally-registered guard cannot resolve a
 * provider from a module it does not import.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthService, SupabaseAuthGuard],
  exports: [SupabaseAuthService],
})
export class AuthModule {}
