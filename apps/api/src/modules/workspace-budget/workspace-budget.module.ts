import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProviderCostEntity } from '../../database/entities/provider-cost.entity'
import { WorkspaceBudgetEntity } from '../../database/entities/workspace-budget.entity'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { WorkspaceBudgetController } from '../admin/workspace-budget.controller'
import { WorkspaceBudgetService } from '../admin/workspace-budget.service'
import { WORKSPACE_BUDGET_GATE, type BudgetGateChecker } from './workspace-budget-tokens'

/**
 * La porte de coût par espace (#2975) — module AUTONOME (règle 7), séparé
 * d'`AdminModule` : `AdminModule` importe déjà `AnalysisModule`, et
 * `AnalysisModule`/`CreditsModule` doivent pouvoir appeler `checkGate` AVANT
 * de débiter un crédit SANS importer tout `AdminModule` en retour — ce qui
 * fermerait un cycle. `WorkspaceBudgetController`/`WorkspaceBudgetService`
 * restent dans `modules/admin/` (leur route `internal/admin/workspaces/…`
 * décrit toujours un geste back-office) ; ce module ne fait qu'ASSEMBLER leur
 * DI depuis un point neutre que tout le monde peut importer.
 *
 * `ProviderCostEntity` est aussi enregistrée par `AdminModule` (lue en
 * lecture seule par `DecisionQueueService`) — deux `TypeOrmModule.forFeature`
 * sur la même entité ne posent aucun problème, chacun n'obtient qu'un
 * repository de plus sur la même connexion.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ProviderCostEntity, WorkspaceBudgetEntity])],
  controllers: [WorkspaceBudgetController],
  providers: [
    WorkspaceBudgetService,
    InternalSecretGuard,
    // Le jeton (`workspace-budget-tokens.ts`) — composé ICI, la couche que
    // GA-07 exempte, pour qu'un appelant (`CreditsService`) n'ait jamais à
    // importer `WorkspaceBudgetService` lui-même.
    {
      provide: WORKSPACE_BUDGET_GATE,
      inject: [WorkspaceBudgetService],
      useFactory:
        (service: WorkspaceBudgetService): BudgetGateChecker =>
        (workspaceId, actorUserId, actionKey, estimatedCostUsd) =>
          service.checkGate(workspaceId, actorUserId, actionKey, estimatedCostUsd),
    },
  ],
  exports: [WorkspaceBudgetService, WORKSPACE_BUDGET_GATE],
})
export class WorkspaceBudgetModule {}
