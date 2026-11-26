import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CreateFeedbackDto } from './dto/feedback.dto'
import { FeedbackService } from './feedback.service'

/**
 * Beta feedback surface (plan P2B). JWT-authenticated: the author is always the
 * token's user, never a body-supplied id.
 */
@Controller('feedback')
@UseGuards(JwtGuard)
export class FeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * La RÉFÉRENCE du ticket créé est rendue au client, et `null` quand il n'y en
   * a pas. L'écran annonçait « l'issue a bien été enregistrée » dans tous les
   * cas, y compris quand GitHub avait refusé : un bêta-testeur croyait son bug
   * remonté alors qu'il dormait en base.
   *
   * #1960.12 — le LIEN ne part plus : il pointait vers un ticket d'un dépôt
   * PRIVÉ, qu'un client final ne peut pas ouvrir, sous le nom d'un outil tiers.
   * Le numéro garde son nom de champ : le front déjà ouvert dans un onglet le lit
   * sous ce nom pendant le déploiement.
   */
  @Post()
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateFeedbackDto) {
    // #1960.10 — Salle de démonstration : le signalement est REFUSÉ, avant toute
    // écriture et tout appel au service de tickets — même doctrine que le dépôt
    // de document (`rag.controller.ts`). Le widget est monté pour toute session
    // connectée : sans ce refus, un visiteur qui essayait le bouton ouvrait un
    // ticket RÉEL, et sa ligne entrait dans la file de tri du back-office comme
    // un vrai retour. L'écran ne propose déjà pas l'envoi en démonstration ; ce
    // refus est la porte, l'écran n'en est que la politesse.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new BadRequestException(
        'Le signalement est désactivé dans l’espace de démonstration : il entrerait dans la file de l’équipe comme un vrai retour. Dans un espace réel, il part avec son contexte et se suit dans Réglages › Mes signalements.',
      )
    }
    const item = await this.feedback.create(user.userId, dto)
    return {
      id: item.id,
      created_at: item.created_at,
      github_issue_number: item.github_issue_number,
    }
  }

  /**
   * #1960.10 — « MES SIGNALEMENTS » : ses propres signalements et leur état.
   *
   * LISTE BLANCHE, et c'est la forme de ce que l'écran lit — rien d'autre
   * (#1960.12 : la ligne entière portait le lien du ticket, ceux de la capture
   * et des pièces jointes, la capture en base64 et les journaux).
   *
   * `reference` et non `github_issue_number` : ce GET n'avait aucun lecteur dans
   * l'application, et une réponse destinée à un client ne nomme pas l'outil
   * interne. `status` vaut `null` quand l'état n'a pas pu être lu — jamais un
   * état deviné.
   */
  @Get()
  async listMine(@CurrentUser() user: CurrentUserPayload, @Query('limit') limit?: string) {
    const reports = await this.feedback.listMineWithStatus(user.userId, limit ? Number(limit) : undefined)
    const items = reports.map(({ row, status }) => ({
      id: row.id,
      created_at: row.created_at,
      category: row.category,
      message: row.message,
      reference: row.github_issue_number,
      status,
    }))
    return { items }
  }
}
