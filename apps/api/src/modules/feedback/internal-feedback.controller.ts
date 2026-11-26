import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { createFeedbackSchema, type CreateFeedbackDto } from './dto/feedback.dto'
import { FeedbackService } from './feedback.service'

const commentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  /** Qui répond, côté back-office — signé dans le commentaire GitHub. */
  author: z.string().trim().max(120).nullish(),
})
class CommentDto extends createZodDto(commentSchema) {}

const stateSchema = z.object({ state: z.enum(['open', 'closed']) })
class IssueStateDto extends createZodDto(stateSchema) {}

/**
 * Un signalement d'opérateur — EXACTEMENT le même contenu qu'un retour de
 * bêta-testeur, moins le compte et l'utilisateur, plus le nom de l'opérateur.
 *
 * ⚠️ Il ÉTEND le schéma client au lieu d'en recopier une version étroite. La
 * première version n'acceptait que catégorie, message, page, navigateur et
 * logs : le back-office aurait capturé une zone, une capture d'écran, les
 * appels en échec et le fil des gestes… que la porte les aurait jetés en
 * silence. Une porte plus étroite que ce qu'on lui envoie est un chemin
 * d'écriture qui n'existe pas — le défaut n°1 de ce dépôt, dans l'autre sens.
 *
 * `accountId` reste dehors : le back-office ne travaille pas sur un dossier.
 */
const backofficeFeedbackSchema = createFeedbackSchema
  .omit({ accountId: true, userEmail: true })
  .extend({ operator: z.string().trim().max(120).nullish() })
class BackofficeFeedbackDto extends createZodDto(backofficeFeedbackSchema) {}

/**
 * Internal (dashboard-manager) view of beta feedback. Guarded by the shared
 * internal secret — the DM proxies this server-side so the secret never reaches
 * the browser, same pattern as `/internal/telemetry`.
 *
 * Le back-office lit la base ET l'état des issues, et peut RÉPONDRE : fermer,
 * rouvrir, commenter. GitHub reste la source de vérité de l'état — rien n'est
 * dupliqué en base, donc les deux ne peuvent pas diverger.
 */
@Controller('internal/feedback')
@UseGuards(InternalSecretGuard)
export class InternalFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    return this.feedback.listAllWithIssues(limit ? Number(limit) : undefined)
  }

  /**
   * UN SIGNALEMENT DEPUIS LE BACK-OFFICE.
   *
   * L'opérateur qui voit un défaut ici n'avait aucun moyen de le remonter sans
   * quitter l'écran : il devait rouvrir l'application cliente, refaire le geste
   * ailleurs, et le contexte était perdu.
   *
   * ⚠️ **Aucun `user_id` n'est inventé.** Un opérateur s'authentifie en Basic
   * Auth devant le back-office ; il n'a pas de profil Bellum. Lui en attribuer
   * un ferait porter le retour par quelqu'un qui ne l'a pas écrit — sur une
   * table qui sert d'historique, c'est une falsification. Son nom voyage à part,
   * dans `client_context.operator` et dans le corps de l'issue.
   *
   * ⚠️ Le nom vient de l'EN-TÊTE Basic Auth relue côté serveur par le
   * back-office, jamais d'un champ que le navigateur remplirait : ce qui est
   * saisi dans une page peut être n'importe quoi.
   */
  @Post()
  async createFromBackoffice(@Body() dto: BackofficeFeedbackDto) {
    const { operator, ...feedback } = dto
    const item = await this.feedback.create(null, feedback as CreateFeedbackDto, operator ?? 'backoffice')
    return {
      id: item.id,
      created_at: item.created_at,
      github_issue_number: item.github_issue_number,
      github_issue_url: item.github_issue_url,
    }
  }

  /**
   * LA CAPTURE D'UN SEUL RETOUR — la moitié qui rend la liste légère.
   *
   * Mesuré en production le 07/09/2026 : la liste rendait 32,6 Mo de captures
   * base64, 94 % du poids de la page, pour des images repliées que personne
   * n'ouvrait. Elles ne voyagent plus qu'à la demande.
   *
   * ⚠️ La route est déclarée AVANT `:issueNumber/comments` : `:id` est un UUID
   * et `:issueNumber` un entier, mais Nest apparie dans l'ordre de déclaration
   * et un chemin littéral capturé par le paramètre d'à côté est un défaut que
   * ce dépôt a déjà payé.
   */
  @Get(':id/screenshot')
  async screenshot(@Param('id', ParseUUIDPipe) id: string) {
    // `null` plutôt qu'un 404 : « ce retour n'a pas de capture » et « ce retour
    // n'existe pas » se ressemblent depuis l'écran, et l'écran a déjà lu
    // `has_screenshot`. Une absence nommée vaut mieux qu'une erreur devinée.
    return { screenshot_url: await this.feedback.screenshotFor(id) }
  }

  /**
   * #1792 — LES PIÈCES JOINTES D'UN SEUL RETOUR, à la demande — même route
   * qu'un segment littéral distinct de `screenshot` (voir la note ci-dessus
   * sur l'ordre de déclaration : un chemin littéral capturé par le paramètre
   * d'à côté est un défaut que ce dépôt a déjà payé, donc ce segment est
   * déclaré ici, avant `:issueNumber/comments`).
   */
  @Get(':id/attachments')
  async attachments(@Param('id', ParseUUIDPipe) id: string) {
    return { attachments: await this.feedback.attachmentsFor(id) }
  }

  @Get(':issueNumber/comments')
  async comments(@Param('issueNumber', ParseIntPipe) issueNumber: number) {
    const comments = await this.feedback.issueComments(issueNumber)
    // `available: false` ≠ « aucun commentaire » : l'écran doit pouvoir dire
    // qu'il n'a pas pu regarder plutôt que d'afficher un fil vide.
    return { comments: comments ?? [], available: comments !== null }
  }

  @Post(':issueNumber/comments')
  async comment(@Param('issueNumber', ParseIntPipe) issueNumber: number, @Body() dto: CommentDto) {
    const ok = await this.feedback.commentOnIssue(issueNumber, dto.body, dto.author ?? null)
    if (!ok) throw new BadRequestException('Le commentaire n’a pas pu être publié sur GitHub')
    return { ok }
  }

  @Post(':issueNumber/state')
  async setState(@Param('issueNumber', ParseIntPipe) issueNumber: number, @Body() dto: IssueStateDto) {
    const ok = await this.feedback.setIssueState(issueNumber, dto.state)
    if (!ok) throw new BadRequestException('L’état n’a pas pu être changé sur GitHub')
    return { ok, state: dto.state }
  }
}
