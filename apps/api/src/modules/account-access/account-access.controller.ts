import { Body, Controller, Get, Logger, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  accessQuestionAnswerSchema,
  createAccessFactSchema,
  type AccessBarrierClass,
  type AccessFact,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AccountEntitiesService } from '../account-entities/account-entities.service'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AccountAccessService, type AccessLandscape } from './account-access.service'

class CreateAccessFactDto extends createZodDto(createAccessFactSchema) {}
class AccessQuestionAnswerDto extends createZodDto(accessQuestionAnswerSchema) {}

/**
 * L'onglet Accès d'un dossier de compte (tome 1 §13, BEL-ACC-003).
 *
 * Lecture ouverte à l'espace : savoir par où on entre chez un compte est
 * exactement ce qu'une équipe commerciale doit partager.
 */
@Controller('accounts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AccountAccessController {
  private readonly logger = new Logger(AccountAccessController.name)

  constructor(
    private readonly access: AccountAccessService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly accountEntities: AccountEntitiesService,
  ) {}

  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /**
   * Le résumé d'accessibilité du PORTEFEUILLE — une classe par compte (manque
   * B du 30/08). Route LITTÉRALE déclarée avant `:id/access` : Nest/Express
   * matche dans l'ordre de déclaration, et un `:id` gourmand ne doit jamais
   * pouvoir capturer `access-summary` comme un identifiant de compte.
   *
   * Voir `AccountAccessService.accessSummary` : lecture, jamais un recalcul.
   */
  @Get('access-summary')
  async accessSummary(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ accountId: string; accessClass: AccessBarrierClass | null }[]> {
    return this.access.accessSummary(await this.workspaceOf(user.userId))
  }

  @Get(':id/access')
  async landscape(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<AccessLandscape> {
    const workspaceId = await this.workspaceOf(user.userId)
    // #3473 — les divisions que les contacts nomment ne deviennent des entités
    // qu'à la lecture de l'onglet Entités ; sans ce passage, « Par quelle entité
    // entrer » restait absent d'un compte dont personne ne l'avait ouvert.
    // Jamais bloquant : sans réconciliation, l'onglet se lit comme avant.
    try {
      await this.accountEntities.reconcileAccount(workspaceId, accountId)
    } catch (error) {
      this.logger.warn('Réconciliation des entités en échec (paysage d’accès)', { error, accountId })
    }
    return this.access.landscape(workspaceId, accountId)
  }

  /** Déclarer ce qu'on sait — c'est le geste que le §14 appelle « corriger ». */
  @Post(':id/access')
  @RequirePermission('records:write')
  async declare(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() dto: CreateAccessFactDto,
  ): Promise<AccessFact> {
    const label = user.email ? `déclaré par ${user.email}` : 'déclaré dans Bellum'
    return this.access.declare(await this.workspaceOf(user.userId), accountId, label, dto)
  }

  /**
   * Répondre à la question du moment — un clic (tome 2 §24).
   *
   * `records:write` comme la déclaration : c'est la même écriture, servie par
   * un raccourci. La réponse « pas abordé » est enregistrée elle aussi — savoir
   * qu'on a demandé et qu'il n'y avait rien à apprendre évite de redemander.
   */
  @Post(':id/access/answer')
  @RequirePermission('records:write')
  async answer(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() dto: AccessQuestionAnswerDto,
  ): Promise<{ recorded: boolean }> {
    const label = user.email ? `déclaré par ${user.email}` : 'déclaré dans Bellum'
    return this.access.answerQuestion(await this.workspaceOf(user.userId), accountId, label, dto)
  }
}
