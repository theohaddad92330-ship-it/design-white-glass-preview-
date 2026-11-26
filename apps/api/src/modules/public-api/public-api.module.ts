import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { AccountsModule } from '../accounts/accounts.module'
import { ApiKeysModule } from '../api-keys/api-keys.module'
import { ApiKeyScopeGuard } from './api-key-scope.guard'
import { ApiKeyThrottlerGuard } from './api-key-throttler.guard'
import { ApiKeyGuard } from './api-key.guard'
import { PublicApiService } from './public-api.service'
import { V1Controller } from './v1.controller'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'

/**
 * Public read API (`/v1/*`), authenticated by workspace API keys (see
 * `api-keys`). Deliberately its own module so `main.ts` can build the OpenAPI
 * document with `include: [PublicApiModule]` — ONLY this surface is documented
 * at `/v1/docs`, never the internal API. Self-contained: removing this module
 * (plus `api-keys`) removes the whole public surface (rule #7).
 */
@Module({
  imports: [
    // Gating par offre : `/v1` demande la feature `public_api`.
    PlanFeaturesModule,
    TypeOrmModule.forFeature([ContactEntity, AnalysisRunEntity]),
    // ApiKeysService for the guard's hash lookup.
    ApiKeysModule,
    // AccountsService for the workspace-scoped account reads.
    AccountsModule,
  ],
  controllers: [V1Controller],
  providers: [PublicApiService, ApiKeyGuard, ApiKeyScopeGuard, ApiKeyThrottlerGuard],
})
export class PublicApiModule {}
