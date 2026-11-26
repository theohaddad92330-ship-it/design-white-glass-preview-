import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  decideLostDealRuleProposalRequestSchema,
  setWorkspaceMethodRuleActivationSchema,
  type LearnedRuleOutcomeTally,
  type LostDealRex,
  type LostDealRuleProposal,
  type WorkspaceMethodRule,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CapitalisationService } from './capitalisation.service'
import { WorkspaceMethodRulesService } from './workspace-method-rules.service'

class DecideLostDealRuleProposalDto extends createZodDto(decideLostDealRuleProposalRequestSchema) {}
class SetWorkspaceMethodRuleActivationDto extends createZodDto(setWorkspaceMethodRuleActivationSchema) {}

/**
 * #3295 — l'APPRENTISSAGE CONTRÔLÉ de bout en bout : lire ce qui existe (REX,
 * propositions, règles promues), trancher, activer. La création d'une
 * proposition reste sur `CapitalisationController` (`POST
 * lost-deal-rule-proposals`) ; ce contrôleur porte les deux gestes de
 * responsable — décider, puis activer — chacun sa permission.
 */
@Controller('capitalisation')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class WorkspaceMethodRulesController {
  constructor(
    private readonly capitalisation: CapitalisationService,
    private readonly rules: WorkspaceMethodRulesService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /** Les REX de perte de l'espace — la matière à CITER dans une proposition. */
  @Get('lost-deal-rex')
  @WorkspaceRead()
  async lostDealRex(@CurrentUser() user: CurrentUserPayload): Promise<{ items: LostDealRex[] }> {
    return { items: await this.capitalisation.lostDealRexForWorkspace(await this.workspaceOf(user.userId)) }
  }

  @Get('lost-deal-rule-proposals')
  @WorkspaceRead()
  async proposals(@CurrentUser() user: CurrentUserPayload): Promise<{ items: LostDealRuleProposal[] }> {
    return { items: await this.capitalisation.lostDealRuleProposalsForWorkspace(await this.workspaceOf(user.userId)) }
  }

  @Get('workspace-method-rules')
  @WorkspaceRead()
  async promotedRules(@CurrentUser() user: CurrentUserPayload): Promise<{ items: WorkspaceMethodRule[] }> {
    return { items: await this.rules.list(await this.workspaceOf(user.userId)) }
  }

  /** #3295 — la mesure des actions posées sous chaque règle apprise (comptes, jamais un taux). */
  @Get('workspace-method-rules/outcomes')
  @WorkspaceRead()
  async ruleOutcomes(@CurrentUser() user: CurrentUserPayload): Promise<{ items: LearnedRuleOutcomeTally[] }> {
    return { items: await this.rules.outcomes(await this.workspaceOf(user.userId)) }
  }

  /**
   * La validation humaine — le SEUL chemin hors de `pending`. Un rôle de
   * responsable (`team:manage`) : trancher ce que Laura finira par dire n'est
   * pas un geste de saisie. Adopter promeut la règle, désactivée.
   */
  @Patch('lost-deal-rule-proposals/:id/decide')
  @RequirePermission('team:manage')
  async decide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideLostDealRuleProposalDto,
  ): Promise<{ proposal: LostDealRuleProposal; rule: WorkspaceMethodRule | null }> {
    return this.rules.decide(await this.workspaceOf(user.userId), user.userId, id, dto.decision)
  }

  /** La revue d'activation — distincte de l'adoption ; désactiver = rollback. */
  @Patch('workspace-method-rules/:id/activation')
  @RequirePermission('team:manage')
  async setActivation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetWorkspaceMethodRuleActivationDto,
  ): Promise<WorkspaceMethodRule> {
    return this.rules.setActivation(await this.workspaceOf(user.userId), user.userId, id, dto)
  }
}
