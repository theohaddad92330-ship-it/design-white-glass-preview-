import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { leadDecisionInputSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { QualificationLeadsService, type LeadDecisionRead } from './qualification-leads.service'

class LeadDecisionDto extends createZodDto(leadDecisionInputSchema) {}

/**
 * #2172 — les décisions prises sur les pistes à qualifier d'un dossier.
 *
 * La file elle-même n'a pas de route : elle se dérive côté écran des lignes que
 * `GET /projects?account_id=…` rend déjà, sous la même clé React Query. Ajouter
 * une seconde route qui rende la même liste en ferait deux listes qui peuvent
 * se contredire à l'écran.
 */
@Controller('accounts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class QualificationLeadsController {
  constructor(
    private readonly leads: QualificationLeadsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /** `@WorkspaceRead()` et non une permission : lire ce que l'équipe a écarté
   *  est ce qui empêche deux commerciaux de requalifier la même piste, et ça
   *  n'ouvre aucune écriture. ⚠️ Le marqueur se pose SOUS le verbe HTTP :
   *  au-dessus, il compterait pour la route précédente (GA-05). */
  @Get(':id/qualification-leads/decisions')
  @WorkspaceRead()
  async decisions(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<LeadDecisionRead[]> {
    return this.leads.decisions(await this.workspaceOf(user.userId), accountId)
  }

  /** Écarter ou mettre en veille. Le clic EST la décision — aucune porte de
   *  plus : rien ne sort de l'espace, rien n'est supprimé. */
  @Post(':id/qualification-leads/:leadKey/decision')
  @RequirePermission('records:write')
  async decide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('leadKey') leadKey: string,
    @Body() dto: LeadDecisionDto,
  ): Promise<LeadDecisionRead> {
    return this.leads.decide(await this.workspaceOf(user.userId), accountId, leadKey, user.userId, dto)
  }

  /** Reprendre une piste écartée : la décision s'efface, la piste revient. */
  @Delete(':id/qualification-leads/:leadKey/decision')
  @RequirePermission('records:write')
  async reopen(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) _accountId: string,
    @Param('leadKey') leadKey: string,
  ): Promise<{ reopened: true }> {
    return this.leads.reopen(await this.workspaceOf(user.userId), leadKey)
  }
}
