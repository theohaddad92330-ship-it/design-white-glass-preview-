import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  type RawBodyRequest,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import { verifyResendWebhookSignature } from '../mailer/resend-webhook-signature'
import { ContactsService } from './contacts.service'

/** La seule forme de `data` qu'on lit — tout le reste du payload Resend est ignoré. */
type ResendBounceEvent = {
  type?: string
  data?: {
    email_id?: string
    bounce?: { type?: string; subType?: string; message?: string }
  }
}

/**
 * #2733 (SKAIZen Group, 22/09/2026) — « un e-mail vers une adresse
 * inexistante reste marqué envoyé ». Ce contrôleur est le SEUL endroit du
 * dépôt où un rebond Resend redescend sur un contact — avant ce lot, aucun
 * webhook fournisseur n'existait (vérifié à l'ouverture de l'issue).
 *
 * Public, non authentifié par `InternalSecretGuard` (Resend nous appelle,
 * pas l'inverse) — l'authentification est la SIGNATURE Svix elle-même,
 * même posture fail-closed que le webhook Stripe (`CreditsController`) :
 * secret absent → 503 (jamais vérifié), signature invalide → 400 (jamais
 * appliqué), et un type d'événement qu'on ne traite pas encore répond 200
 * SANS agir — un 4xx ferait retenter Resend indéfiniment ce qu'on ignore
 * sciemment.
 */
@Controller('webhooks/resend')
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name)

  constructor(
    private readonly contactsService: ContactsService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    const secret = this.configService.get<string>('resendWebhookSecret')
    if (!secret) {
      this.logger.error('RESEND_WEBHOOK_SECRET is not configured — rejecting unverifiable webhook', {
        tags: { 'resend.webhook': 'true', 'resend.error': 'webhook_secret_missing' },
      })
      throw new ServiceUnavailableException('Resend webhook is not configured')
    }

    const rawBody = req.rawBody || Buffer.from('')
    const verified = verifyResendWebhookSignature({
      rawBody,
      svixId: svixId || '',
      svixTimestamp: svixTimestamp || '',
      svixSignature: svixSignature || '',
      secret,
    })
    if (!verified) {
      // Jamais le secret ni la signature reçue dans le log — même défaut que
      // le webhook Stripe visait à éviter (une erreur qui les recopierait).
      this.logger.error('Resend webhook signature verification failed', {
        tags: { 'resend.webhook': 'true', 'resend.error': 'signature_verification' },
      })
      throw new BadRequestException('Invalid Resend webhook signature')
    }

    let event: ResendBounceEvent
    try {
      event = JSON.parse(rawBody.toString('utf8')) as ResendBounceEvent
    } catch (cause) {
      this.logger.error('Resend webhook payload is not valid JSON', {
        error: cause,
        tags: { 'resend.webhook': 'true', 'resend.error': 'invalid_json' },
      })
      throw new BadRequestException('Invalid Resend webhook payload')
    }

    // Resend envoie plusieurs types d'événements (`email.sent`,
    // `email.delivered`, `email.complained`…) — seul `email.bounced` corrige
    // l'affirmation « envoyé » que #2733 vise. Les autres répondent 200 sans
    // agir : un type qu'on ignore sciemment n'est pas une erreur.
    if (event.type !== 'email.bounced') {
      return { received: true }
    }

    const emailId = event.data?.email_id
    if (!emailId) {
      this.logger.warn('email.bounced webhook missing data.email_id — nothing to apply', {
        tags: { 'resend.webhook': 'true' },
      })
      return { received: true }
    }

    // Le TYPE tel que Resend le nomme, jamais reformulé (doctrine : une
    // catégorie qu'on invente n'est pas une catégorie qu'on a mesurée).
    const reason = event.data?.bounce?.type ?? null
    const applied = await this.contactsService.applyEmailBounce(emailId, reason)
    if (!applied) {
      // Pas une erreur : un identifiant inconnu (envoi antérieur à #2733,
      // contact supprimé depuis) n'est pas de notre fait.
      this.logger.warn(`No contact found for Resend message ${emailId} — bounce not applied`, {
        tags: { 'resend.webhook': 'true' },
      })
    }

    return { received: true }
  }
}
