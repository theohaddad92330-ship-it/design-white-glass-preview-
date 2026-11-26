import { callStateEventSchema } from '@bellum/contracts'
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  type RawBodyRequest,
} from '@nestjs/common'
import type { Request } from 'express'
import { TelephonyService } from './telephony.service'
import { verifyTelephonyWebhookSignature } from './telephony-webhook-signature'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * #2403.12 — LA SOURCE « APPEL EN COURS », ENTRANTE.
 *
 * Public, non authentifié par `JwtGuard` NI par `InternalSecretGuard` (l'outil
 * de téléphonie/automatisation de l'ESN nous appelle, pas l'inverse) —
 * l'authentification est la SIGNATURE elle-même, même posture fail-closed que
 * le webhook Resend (`ResendWebhookController`) et Stripe : secret absent →
 * 503 (jamais vérifié), signature invalide → 400 (jamais appliqué). L'espace
 * se désigne par l'URL (`:workspaceId`), jamais par un identifiant du corps —
 * un corps ne peut donc jamais faire écrire l'état d'un AUTRE espace que celui
 * dont on a vérifié le secret.
 */
@Controller('webhooks/telephony')
export class TelephonyWebhookController {
  private readonly logger = new Logger(TelephonyWebhookController.name)

  constructor(private readonly telephony: TelephonyService) {}

  @Post(':workspaceId')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Param('workspaceId') workspaceId: string,
    @Headers('x-bellum-signature') signature: string,
  ) {
    if (!UUID.test(workspaceId)) {
      // Ni 404 ni 400 bavard : un identifiant qui n'est pas un UUID ne
      // désigne aucun espace, on ne dit pas pourquoi précisément.
      throw new BadRequestException('Invalid workspace')
    }

    const secret = await this.telephony.webhookSecretFor(workspaceId)
    if (!secret) {
      this.logger.error('Telephony call-state webhook secret is not configured for this workspace — rejecting', {
        tags: { 'telephony.webhook': 'true', 'telephony.error': 'webhook_secret_missing' },
      })
      throw new ServiceUnavailableException('Telephony webhook is not configured')
    }

    const rawBody = req.rawBody || Buffer.from('')
    const verified = verifyTelephonyWebhookSignature({ rawBody, header: signature || '', secret })
    if (!verified) {
      // Jamais le secret ni la signature reçue dans le log.
      this.logger.error('Telephony call-state webhook signature verification failed', {
        tags: { 'telephony.webhook': 'true', 'telephony.error': 'signature_verification' },
      })
      throw new BadRequestException('Invalid telephony webhook signature')
    }

    let payload: unknown
    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch (cause) {
      this.logger.error('Telephony call-state webhook payload is not valid JSON', {
        error: cause,
        tags: { 'telephony.webhook': 'true', 'telephony.error': 'invalid_json' },
      })
      throw new BadRequestException('Invalid telephony webhook payload')
    }

    const parsed = callStateEventSchema.safeParse(payload)
    if (!parsed.success) {
      throw new BadRequestException('Invalid telephony webhook payload')
    }

    await this.telephony.applyCallEvent(workspaceId, parsed.data)
    return { received: true }
  }
}
