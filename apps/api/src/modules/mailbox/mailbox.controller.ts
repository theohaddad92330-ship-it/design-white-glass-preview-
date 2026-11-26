import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Optional,
  Param,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { HttpError, HttpTimeoutError } from '@bellum/errors'
import type {
  MailAttachment,
  MailBatchResult,
  MailDraftResult,
  MailReplyDraftResult,
  MailSearchResponse,
  MailThreadMark,
  MailboxSender,
  MailboxStatus,
  OutOfOfficeRequest,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import {
  LinkMailThreadAccountDto,
  MailAttachmentsQueryDto,
  MailBatchDto,
  MailDraftDto,
  MailReplyDraftDto,
  MailSearchQueryDto,
  OutOfOfficeDto,
  SetMailThreadMarkDto,
  UpdateSignatureDto,
} from './dto/mailbox.dto'
import { ActivitiesService } from '../activities/activities.service'
import { demoMailReplyDraft } from '../demo/demo-briefing'
import { IaClient } from '../ia/ia.client'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { MailboxService } from './mailbox.service'

/** L'erreur et ses `cause` (bornée, sans cycle) : `HttpClient` en imbrique deux sur un appel à tentative unique. */
function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = []
  let current: unknown = error
  while (current && !chain.includes(current)) {
    chain.push(current)
    current = (current as { cause?: unknown }).cause
  }
  return chain
}

/**
 * « Ta messagerie » — une seule surface, quel que soit l'éditeur derrière.
 *
 * Le préfixe de route dit la capacité (`/mailbox`) et non le fournisseur : les
 * routes `/google/*` et `/microsoft/*` restent en place pour la connexion
 * OAuth, qui est le seul endroit où l'utilisateur doit savoir ce qu'il branche.
 */
@Controller('mailbox')
@UseGuards(JwtGuard)
export class MailboxController {
  private readonly logger = new Logger(MailboxController.name)

  constructor(
    private readonly mailbox: MailboxService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly ia: IaClient,
    // `@Optional()` : perdre le journal ne doit jamais empêcher de préparer un
    // brouillon. Même arbitrage que la trace des portes de décision.
    @Optional() private readonly activities?: ActivitiesService,
  ) {}

  /**
   * #4546.5 — SES boîtes, parmi lesquelles l'expéditeur se choisit.
   * #4682.1 — `@PersonalScope` au niveau de la MÉTHODE, jamais de la classe (le décorateur l'interdit : il blanchirait
   * les autres routes) : la route ne lit que `user.userId`, aucun collègue ne voit rien par elle.
   */
  @Get('senders')
  @PersonalScope()
  senders(@CurrentUser() user: CurrentUserPayload): Promise<MailboxSender[]> {
    return this.mailbox.listSenders(user.userId)
  }

  @Get('status')
  status(@CurrentUser() user: CurrentUserPayload): Promise<MailboxStatus> {
    return this.mailbox.status(user.userId)
  }

  /** Recherche par intention métier (non-lus, sans réponse, budget, TJM, CV…). */
  @Get('search')
  search(@CurrentUser() user: CurrentUserPayload, @Query() query: MailSearchQueryDto): Promise<MailSearchResponse> {
    return this.mailbox.search(user.userId, query)
  }

  @Get('attachments')
  attachments(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: MailAttachmentsQueryDto,
  ): Promise<MailAttachment[]> {
    return this.mailbox.listAttachments(user.userId, query.messageId)
  }

  /**
   * Dépose un BROUILLON réel dans la boîte. Rien n'est envoyé ici.
   *
   * Le geste laisse désormais une TRACE (PDF 6 §5.2 règle f). Elle manquait :
   * `activities` était remplie par la synchronisation de lecture — on y
   * retrouvait les messages qu'on avait relus, jamais ceux qu'on avait
   * préparés. « Ai-je déjà relancé ce client, et par quel canal » n'avait donc
   * aucune réponse.
   *
   * Écrite ICI et non dans le service : le journal est une préoccupation
   * transverse au geste utilisateur, et c'est le contrôleur qui est la couche
   * où un geste traverse légitimement deux domaines (règle §3.2).
   *
   * Best-effort : perdre une ligne de journal ne doit jamais faire échouer le
   * dépôt d'un brouillon qui, lui, a réussi.
   */
  @Post('drafts')
  async createDraft(@CurrentUser() user: CurrentUserPayload, @Body() dto: MailDraftDto): Promise<MailDraftResult> {
    const result = await this.mailbox.createDraft(user.userId, dto)
    await this.traceDraft(user.userId, dto, result)
    return result
  }

  /**
   * #4405.1 — « Préparer la réponse » : le mail DÉJÀ rédigé, prêt à l'envoi.
   *
   * Lit le fil avec le jeton de CET utilisateur (c96 : le corps ne sort que par
   * `readOwnThread`), le remet à l'IA, rend objet + corps. N'écrit rien et
   * n'envoie rien (c82) : le dépôt et l'envoi restent les deux gestes existants
   * de la boîte de dialogue, derrière un clic. Un échec est une erreur claire —
   * l'écran garde alors un brouillon vide à rédiger, jamais un texte deviné.
   */
  @Post('reply-draft')
  @WorkspaceRead()
  @HttpCode(200)
  async draftReply(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: MailReplyDraftDto,
  ): Promise<MailReplyDraftResult> {
    // Salle de démonstration : réponse scriptée pour chaque fil de la boîte de démo, jamais un appel modèle.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      const scripted = demoMailReplyDraft(dto.threadId)
      if (scripted) return scripted
      throw new NotFoundException('Fil introuvable dans la fenêtre lue.')
    }
    // #4405.1 — sans interlocuteur (fil de groupe), la lecture n'est pas filtrée par participant.
    const thread = await this.mailbox.readOwnThread(user.userId, {
      threadId: dto.threadId,
      ...(dto.counterpart ? { counterpart: dto.counterpart } : {}),
    })
    if (!thread) throw new NotFoundException('Fil introuvable dans la fenêtre lue.')
    try {
      return await this.ia.draftMailReply({
        ...(dto.counterpart ? { counterpart: dto.counterpart } : {}),
        subject: thread.subject,
        messages: thread.messages,
        locale: dto.locale,
      })
    } catch (error) {
      // Jamais le contenu du fil dans le journal : la classe de l'erreur seulement.
      this.logger.error('Réponse de mail non générée', { error, user: { id: user.userId } })
      // #4405.1 — la vraie raison (statut du fournisseur, délai…), bornée, jamais le fil.
      this.logger.warn(
        `Réponse de mail non générée — raison: ${causeChain(error)
          .map(c => (c as Error)?.message ?? c)
          .join(' <- ')
          .slice(0, 200)}`,
      )
      const unavailable = causeChain(error).some(
        cause => cause instanceof HttpTimeoutError || (cause instanceof HttpError && cause.status === 503),
      )
      if (unavailable) throw new ServiceUnavailableException('mail_reply_unavailable')
      throw new BadGatewayException('mail_reply_failed')
    }
  }

  private async traceDraft(userId: string, dto: MailDraftDto, result: MailDraftResult): Promise<void> {
    if (!this.activities) return
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      await this.activities.ingest(workspaceId, userId, [
        {
          kind: 'email',
          source: 'mailbox',
          direction: 'outbound',
          subject: dto.subject,
          // Le corps ne part PAS au journal : la timeline dit qu'un message a
          // été préparé, pas ce qu'il contient.
          body: null,
          occurredAt: new Date().toISOString(),
          durationSeconds: null,
          accountId: null,
          contactId: null,
          projectId: null,
          linkReason: 'contact_email',
          // L'identifiant rendu par le fournisseur APRÈS le dépôt — c'est
          // exactement ce que la règle (f) demande, et il n'était persisté
          // nulle part.
          externalId: result.draftId ?? null,
          externalUrl: null,
          channel: 'mail_draft',
          // `drafted` et non `sent` : rien n'est parti. Les confondre ferait
          // croire qu'un client a reçu un message qui attend encore.
          verdict: 'drafted',
          participants: [],
        },
      ])
    } catch (error) {
      this.logger.warn(`Draft activity not recorded: ${(error as Error).message}`)
    }
  }

  /**
   * Un LOT : brouillons, ou envoi après approbation (arbitrage Louis du 03/08).
   * Idempotent par `batchId` — approuver deux fois n'envoie pas deux fois.
   */
  @Post('batch')
  sendBatch(@CurrentUser() user: CurrentUserPayload, @Body() dto: MailBatchDto): Promise<MailBatchResult> {
    return this.mailbox.sendBatch(user.userId, dto)
  }

  @Get('out-of-office')
  getOutOfOffice(@CurrentUser() user: CurrentUserPayload): Promise<OutOfOfficeRequest | null> {
    return this.mailbox.getOutOfOffice(user.userId)
  }

  @Put('out-of-office')
  setOutOfOffice(@CurrentUser() user: CurrentUserPayload, @Body() dto: OutOfOfficeDto): Promise<OutOfOfficeRequest> {
    return this.mailbox.setOutOfOffice(user.userId, dto)
  }

  /** La signature réelle qui sera apposée aux brouillons (null = aucune). */
  @Get('signature')
  async signature(@CurrentUser() user: CurrentUserPayload): Promise<{ signature: string | null }> {
    return { signature: await this.mailbox.resolveSignature(user.userId) }
  }

  /**
   * Saisir sa signature dans Bellum.
   *
   * L'écriture manquait : la colonne était lue et jamais remplie, si bien que
   * la première branche du repli — celle qui donne la priorité à ce que
   * l'utilisateur a écrit ici — ne pouvait jamais être vraie.
   */
  @Put('signature')
  async saveSignature(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: UpdateSignatureDto,
  ): Promise<{ signature: string | null }> {
    return this.mailbox.setSignature(user.userId, body.signature)
  }

  /** #2104.7 / #2104.8 — marquer un fil traité, ou le signaler non pertinent. */
  @Put('threads/:threadId/mark')
  setThreadMark(
    @CurrentUser() user: CurrentUserPayload,
    @Param('threadId') threadId: string,
    @Body() body: SetMailThreadMarkDto,
  ): Promise<{ mark: MailThreadMark | null }> {
    return this.mailbox.setThreadMark(user.userId, threadId, body.mark)
  }

  /** #2104.6 — rattacher un fil à un compte à la main. */
  @Put('threads/:threadId/account')
  linkThreadAccount(
    @CurrentUser() user: CurrentUserPayload,
    @Param('threadId') threadId: string,
    @Body() body: LinkMailThreadAccountDto,
  ): Promise<{ accountId: string }> {
    return this.mailbox.linkThreadAccount(user.userId, threadId, body.accountId)
  }
}
