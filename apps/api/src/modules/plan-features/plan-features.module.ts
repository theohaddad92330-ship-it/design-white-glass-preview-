import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { PlanCatalogModule } from '../credits/plan-catalog.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { PlanFeatureGuard } from './plan-feature.guard'
import { PlanFeaturesService } from './plan-features.service'

/**
 * Le gating par OFFRE : quelles features un palier ouvre, et le garde qui refuse
 * les autres. Module autonome (règle #7) — le retirer ne casse rien d'autre que
 * les routes qui le montent, et rien ici n'écrit en base.
 *
 * Importé par les modules dont une route porte `@RequireFeature(...)` ; le guard
 * est exporté pour être posé à côté du guard d'identité de ces routes.
 */
@Module({
  imports: [TypeOrmModule.forFeature([WorkspaceEntity, SubscriptionEntity]), PlanCatalogModule, WorkspaceModule],
  providers: [PlanFeaturesService, PlanFeatureGuard],
  exports: [PlanFeaturesService, PlanFeatureGuard],
})
export class PlanFeaturesModule {}
