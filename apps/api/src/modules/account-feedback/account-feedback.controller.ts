import { Body, Controller, Get, NotFoundException, Optional, Param, Post, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { AccountFeedbackItem } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AccountEntity } from '../../database/entities/account.entity'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { OrgGraphVersionService } from '../org-graph/org-graph.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountFeedbackService } from './account-feedback.service'
import { CreateAccountFeedbackDto } from './dto/account-feedback.dto'

/**
 * Capture structurée du feedback dossier (A2). JWT-guardé ; l'appartenance du
 * compte au workspace actif de l'appelant est vérifiée AVANT toute écriture /
 * lecture (404 sinon — jamais le dossier d'une autre équipe). L'auteur est
 * toujours l'utilisateur du token, jamais une valeur du body.
 */
@Controller('accounts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AccountFeedbackController {
  constructor(
    private readonly feedback: AccountFeedbackService,
    private readonly workspaceContext: WorkspaceContextService,
    // Repo direct (pas AccountsModule) : un simple check d'appartenance — évite
    // un cycle de modules Analysis → AccountFeedback → Accounts → Analysis.
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    // Versionnement du graphe d'organigramme (Annexe Organigramme §5) —
    // `@Optional()` pour que les specs à constructeur nu restent valides.
    // Absent = capture du retour inchangée, simplement sans bump de version.
    @Optional() private readonly orgGraph?: OrgGraphVersionService,
  ) {}

  // Corriger une note ou un axe MODIFIE le dossier — et déclenche un
  // recalcul plus un bump de version du graphe. C'est `records:write`, et la
  // route ne déclarait rien : un `viewer` pouvait réécrire le score d'un
  // dossier qu'il n'a que le droit de lire.
  @RequirePermission('records:write')
  @Post(':id/feedback')
  async create(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateAccountFeedbackDto,
  ): Promise<{ item: AccountFeedbackItem }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInWorkspace(id, workspaceId)
    const item = await this.feedback.create({
      accountId: id,
      workspaceId,
      userId: user.userId,
      target: dto.target,
      targetRef: dto.targetRef,
      verdict: dto.verdict,
      note: dto.note,
    })
    // Une correction ne se contente plus d'une directive texte pour le prochain
    // prompt : elle produit une nouvelle version du graphe, mémorise l'élément
    // écarté et l'élague du graphe déjà affiché (p30). Best-effort — le retour
    // est déjà enregistré, un échec de versionnement ne doit pas le perdre.
    await this.orgGraph?.recordCorrection({
      accountId: id,
      target: dto.target,
      targetRef: dto.targetRef,
      verdict: dto.verdict,
    })
    return { item }
  }

  /** Les retours déjà posés sur ce dossier (état des boutons côté UI). */
  @Get(':id/feedback')
  async list(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: AccountFeedbackItem[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.assertAccountInWorkspace(id, workspaceId)
    return { items: await this.feedback.listForAccount(id, workspaceId) }
  }

  private async assertAccountInWorkspace(accountId: string, workspaceId: string): Promise<void> {
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) {
      throw new NotFoundException('Compte introuvable')
    }
  }
}
