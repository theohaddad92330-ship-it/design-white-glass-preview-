import type {
  LinkedInFollowUp,
  LinkedInInteraction,
  LinkedInMandateView,
  LinkedInSendStatusView,
  LinkedInSendView,
  PostIdea,
} from '@bellum/contracts'
import { Body, Controller, Get, HttpCode, Logger, Param, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { MailboxService } from '../mailbox/mailbox.service'
import {
  FollowUpQueryDto,
  GrantMandateDto,
  PostIdeasDto,
  RecordInteractionDto,
  SendMessageDto,
} from './dto/linkedin.dto'
import { LinkedInMandateService } from './linkedin-mandate.service'
import { LinkedInService } from './linkedin.service'

/**
 * Le réseau professionnel, sans scraping.
 *
 * Aucune de ces routes n'appelle LinkedIn. Le commercial déclare, Bellum se
 * souvient — et c'est ce qui rend la relance possible sans exposer son compte.
 */
@Controller('linkedin')
@UseGuards(JwtGuard)
export class LinkedInController {
  private readonly logger = new Logger(LinkedInController.name)

  constructor(
    private readonly linkedin: LinkedInService,
    private readonly mailbox: MailboxService,
    private readonly mandates: LinkedInMandateService,
  ) {}

  @Post('interactions')
  @HttpCode(200)
  async record(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RecordInteractionDto,
  ): Promise<LinkedInInteraction> {
    const saved = await this.linkedin.record(user.userId, dto)
    // #4181.1 — une réponse reçue sur LinkedIn arrête aussi les relances prévues :
    // séquences, tâches de relance, brouillons « sans réponse » (point d'arrêt unique
    // de la messagerie). L'orchestration vit ici, dans le contrôleur (GA-07). Best-effort :
    // le fait déclaré est déjà enregistré, un échec d'arrêt ne le défait pas.
    if (dto.kind === 'reply_received') {
      try {
        await this.mailbox.onReplyReceived(user.userId, dto.contactId, {
          channel: 'linkedin',
          event: 'reply_received',
          accountId: null,
        })
      } catch (cause) {
        this.logger.warn('Arrêt des relances sur réponse LinkedIn en échec', {
          error: cause instanceof Error ? cause.message : String(cause),
          tags: { contactId: dto.contactId },
        })
      }
    }
    return saved
  }

  @Get('contacts/:contactId/interactions')
  list(@CurrentUser() user: CurrentUserPayload, @Param('contactId') contactId: string): Promise<LinkedInInteraction[]> {
    return this.linkedin.listForContact(user.userId, contactId)
  }

  /** Les connexions acceptées restées sans réponse (§5.10, trois jours). */
  @Get('follow-ups')
  followUps(@CurrentUser() user: CurrentUserPayload, @Query() query: FollowUpQueryDto): Promise<LinkedInFollowUp[]> {
    return this.linkedin.followUps(user.userId, query.afterDays)
  }

  /** Des sujets de publication — l'angle, pas le texte. */
  @Post('post-ideas')
  @HttpCode(200)
  postIdeas(@CurrentUser() user: CurrentUserPayload, @Body() dto: PostIdeasDto): Promise<PostIdea[]> {
    return this.linkedin.postIdeas(user.userId, dto.objective)
  }

  /** #4737 — le mandat d'envoi courant, ou null. */
  @Get('mandate')
  @PersonalScope()
  currentMandate(@CurrentUser() user: CurrentUserPayload): Promise<LinkedInMandateView | null> {
    return this.mandates.current(user.userId)
  }

  /** #4737 — l'état de l'écran : mandat, bornes, reste du jour, voie d'envoi ouverte ou non. */
  @Get('send-status')
  @PersonalScope()
  sendStatus(@CurrentUser() user: CurrentUserPayload): Promise<LinkedInSendStatusView> {
    return this.mandates.status(user.userId)
  }

  @Post('mandate')
  @PersonalScope()
  @HttpCode(200)
  grantMandate(@CurrentUser() user: CurrentUserPayload, @Body() dto: GrantMandateDto): Promise<LinkedInMandateView> {
    return this.mandates.grant(user.userId, dto)
  }

  @Post('mandate/:mandateId/revoke')
  @PersonalScope()
  @HttpCode(200)
  revokeMandate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('mandateId') mandateId: string,
  ): Promise<LinkedInMandateView> {
    return this.mandates.revoke(user.userId, mandateId)
  }

  /** Le geste d'envoi sous mandat. La réponse ne contient jamais le corps. */
  @Post('send')
  @PersonalScope()
  @HttpCode(200)
  send(@CurrentUser() user: CurrentUserPayload, @Body() dto: SendMessageDto): Promise<LinkedInSendView> {
    return this.mandates.send(user.userId, dto)
  }

  @Get('contacts/:contactId/sends')
  @PersonalScope()
  sends(@CurrentUser() user: CurrentUserPayload, @Param('contactId') contactId: string): Promise<LinkedInSendView[]> {
    return this.mandates.listSends(user.userId, contactId)
  }
}
