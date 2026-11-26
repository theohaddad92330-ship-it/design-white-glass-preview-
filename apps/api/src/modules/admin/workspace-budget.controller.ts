import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import type { BudgetGateVerdict, ToolDailyCapStatus, WorkspaceBudgetLevers } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { WorkspaceBudgetCheckDto } from './dto/workspace-budget-check.dto'
import { WorkspaceBudgetLeversDto } from './dto/workspace-budget-levers.dto'
import { WorkspaceBudgetService } from './workspace-budget.service'

/**
 * Contrôles admin de gouvernance de coût — épopée #2975 (#2440.83-89).
 *
 * Même garde que le reste de `internal/admin` : `InternalSecretGuard` (secret
 * partagé, jamais un JWT utilisateur). `POST .../check` est la PORTE elle-même
 * — un appelant (analyse, chat, enrichissement…) l'interroge avec le coût
 * ESTIMÉ de l'action AVANT de la lancer, jamais après.
 */
@Controller('internal/admin/workspaces/:workspaceId/budget')
@UseGuards(InternalSecretGuard)
export class WorkspaceBudgetController {
  constructor(private readonly budget: WorkspaceBudgetService) {}

  @Get()
  getLevers(@Param('workspaceId') workspaceId: string): Promise<WorkspaceBudgetLevers> {
    return this.budget.getLevers(workspaceId)
  }

  @Put()
  setLevers(@Param('workspaceId') workspaceId: string, @Body() body: WorkspaceBudgetLeversDto): Promise<void> {
    return this.budget.setLevers(workspaceId, body)
  }

  @Post('check')
  checkGate(
    @Param('workspaceId') workspaceId: string,
    @Body() body: WorkspaceBudgetCheckDto,
  ): Promise<BudgetGateVerdict> {
    return this.budget.checkGate(workspaceId, body.actorUserId, body.actionKey, body.estimatedCostUsd)
  }

  /** #2975 — le LEDGER en lecture : une ligne par appel modèle déjà compté,
   *  du mois civil en cours, jamais agrégée entre espaces (GA-43). */
  @Get('ledger')
  listLedger(@Param('workspaceId') workspaceId: string) {
    return this.budget.listLedger(workspaceId)
  }

  /** #2440.45 — le quota quotidien PAR OUTIL (`AI_TOOL_DAILY_CAP_USD`) et la
   *  dépense du jour d'UN espace (GA-43). Liste vide = aucun quota réglé. */
  @Get('tool-quotas')
  getToolQuotas(@Param('workspaceId') workspaceId: string): Promise<ToolDailyCapStatus[]> {
    return this.budget.getToolQuotas(workspaceId)
  }
}
