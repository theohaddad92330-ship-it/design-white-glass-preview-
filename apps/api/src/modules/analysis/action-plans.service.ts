import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { type EntityManager, Repository } from 'typeorm'
import type { AnalysisActionPlanBody } from '@bellum/contracts'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'

@Injectable()
export class ActionPlansService {
  constructor(
    @InjectRepository(ActionPlanEntity)
    private readonly actionPlans: Repository<ActionPlanEntity>,
  ) {}

  /** Persist the Phase 4 action plan. Accepts an optional ``manager`` so
   *  the caller can wrap the insert + outbox event in one transaction
   *  (see ``AnalysisPersistenceService.savePlan``).
   *
   *  Multi-user Phase 2: the row carries ``workspace_id`` (the run owner's
   *  active workspace, resolved by the caller) so the team-scoped reads see it;
   *  ``user_id`` is kept as created-by attribution. See
   *  ``agent_docs/multi-user-workspaces.md``. */
  async create(
    accountId: string,
    userId: string,
    workspaceId: string,
    body: AnalysisActionPlanBody,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(ActionPlanEntity) : this.actionPlans
    const row = repo.create({
      account_id: accountId,
      user_id: userId,
      workspace_id: workspaceId,
      strategy_type: body.strategy,
      strategy_justification: body.justification,
      weeks: body.phases,
    })
    await repo.save(row)
  }

  /* #1457 — `listDashboardActionItems` vivait ici et n'a plus d'appelant depuis
     le 04/09/2026. Son unique lecteur était `DashboardService.getKpisByUserId`,
     c'est-à-dire `GET /dashboard/kpis`, la route qui nourrissait l'onglet
     « Équipe » de `/dashboard` — un second cockpit d'équipe, non gardé, doublon
     de `/team`. La méthode part avec eux plutôt que de rester une lecture juste
     que personne n'appelle. Elle écrivait au passage `company_name: 'Entreprise'`
     en dur, une valeur de remplissage : à rebâtir un jour, ne pas la reprendre. */
}
