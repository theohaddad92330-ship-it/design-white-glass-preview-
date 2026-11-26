import { Controller, Get, UseGuards } from '@nestjs/common'
import type { MessageLearningSummary } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { MessageLearningSignalsService } from './message-learning-signals.service'

/**
 * #2877 (recette prod 02/10) — l'écran agrégat d'apprentissage des messages,
 * lu par l'ESPACE (les mêmes lectures que le back-office, sans secret interne).
 * L'espace vient du TOKEN, jamais d'un paramètre : aucun agrégat entre espaces
 * (#2385.10). Lecture seule — adopter ou refuser une règle reste un geste
 * d'opérateur (`internal-team-kpis.controller.ts`).
 */
@Controller('message-learning')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MessageLearningController {
  constructor(
    private readonly signals: MessageLearningSignalsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get('summary')
  @WorkspaceRead()
  async summary(@CurrentUser() user: CurrentUserPayload): Promise<MessageLearningSummary> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.signals.summaryForWorkspace(workspaceId)
  }
}
