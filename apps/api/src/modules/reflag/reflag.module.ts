import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ReflagService } from './reflag.service'

/**
 * Global module — `ReflagService` is meant to be reachable from any domain that
 * wants to gate a behaviour, so it is exposed once instead of being threaded
 * through every feature module's `imports`. Same pattern as `StripeModule` and
 * `SupabaseModule`.
 *
 * Self-contained (repo rule #7): removing this module and the injections leaves
 * the app running — every call site already treats a disabled flag as the
 * normal case.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [ReflagService],
  exports: [ReflagService],
})
export class ReflagModule {}
