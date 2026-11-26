import { Body, Controller, Get, Logger, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { changeAccountGateSchema } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { DecisionGatesService } from '../decision-gates/decision-gates.service'
import { AccountGateService, type GateDecisionResult } from './account-gate.service'

class ChangeAccountGateDto extends createZodDto(changeAccountGateSchema) {}

/**
 * La porte G1 (BEL-CRM-102). Gardée par `records:write` : décider qu'un compte
 * entre au portefeuille ou en sort est une écriture de fiche, et le §14 la
 * réserve au commercial sur son périmètre, à l'administrateur partout.
 */
@Controller('accounts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AccountGateController {
  private readonly logger = new Logger(AccountGateController.name)

  constructor(
    private readonly gate: AccountGateService,
    private readonly gates: DecisionGatesService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Patch(':id/gate')
  @RequirePermission('records:write')
  async decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeAccountGateDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<GateDecisionResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const decided = await this.gate.decide(workspaceId, id, dto.gate, dto.reason ?? null, user.userId)

    // Le franchissement de la porte est journalisé ICI — le contrôleur est la
    // couche où un geste utilisateur traverse légitimement deux domaines
    // (règle §3.2, mesurée par GA-07). C'est le PREMIER appelant réel de la
    // porte `account_priority`, déclarée au catalogue depuis le 19/08 et jamais
    // franchie : une porte nommée dans un enum et jamais appelée est une case à
    // cocher, pas une gouvernance.
    //
    // APRÈS l'écriture, et en best-effort : une trace en échec ne doit pas
    // annuler une décision que l'utilisateur a prise.
    try {
      await this.gates.record(workspaceId, user.userId, {
        gate: 'account_priority',
        subject: 'account',
        subjectId: decided.id,
        decision: dto.gate === 'parked' ? 'refuse' : 'accept',
        reason: decided.gate_reason,
        missing: [],
      })
    } catch (cause) {
      this.logger.warn('franchissement G1 non journalisé', { error: cause, accountId: id })
    }

    return decided
  }

  /** Les motifs d'écartement de l'espace : les siens d'abord, les propositions
   *  ensuite. Lecture ouverte — savoir pourquoi l'équipe dit non n'est pas une
   *  information sensible, c'est même ce qui évite de reposer la question. */
  @Get('gate/park-reasons')
  async listReasons(
    @CurrentUser() user: CurrentUserPayload,
    @Query('lang') lang?: string,
  ): Promise<{ items: { label: string; used: boolean }[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.gate.listReasons(workspaceId, lang === 'en' ? 'en' : 'fr')
  }
}
