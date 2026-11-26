import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ApiKeyEntity } from '../../database/entities/api-key.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ApiKeysController } from './api-keys.controller'
import { ApiKeysService } from './api-keys.service'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'

/**
 * Workspace API keys for the public `/v1` API. This module owns the key
 * LIFECYCLE (create/list/revoke, JWT + RBAC); the consuming surface (the
 * `ApiKeyGuard`-protected `/v1` controller) lives in `public-api` and imports
 * this module for the exported {@link ApiKeysService}. Self-contained —
 * removing it (plus `public-api`) takes the whole feature offline (rule #7).
 */
@Module({
  // WorkspaceModule supplies WorkspacePermissionGuard + WorkspaceContextService.
  imports: [
    // Gating par offre : émettre une clé demande la feature `public_api`.
    PlanFeaturesModule,
    TypeOrmModule.forFeature([ApiKeyEntity]),
    WorkspaceModule,
  ],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
