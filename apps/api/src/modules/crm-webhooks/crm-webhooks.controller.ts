import { Controller, HttpCode, Param, ParseEnumPipe, Post, Req, UseGuards, type RawBodyRequest } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import { CrmWebhookSignatureGuard } from './crm-webhook-signature.guard'
import { CRM_WEBHOOK_PROVIDERS, CrmWebhooksService } from './crm-webhooks.service'

/**
 * #4189.7 — `POST /webhooks/crm/:provider` (hubspot | salesforce). Publique (le CRM n'a pas de
 * jeton Bellum) : la SIGNATURE est la seule porte, vérifiée sur le corps brut par
 * `CrmWebhookSignatureGuard`. Débit limité
 * par adresse (`default-1m`). Sans secret configuré : 404.
 */
@Controller('webhooks/crm')
@UseGuards(CrmWebhookSignatureGuard)
export class CrmWebhooksController {
  constructor(private readonly webhooks: CrmWebhooksService) {}

  @Post(':provider')
  @HttpCode(200)
  @Throttle({ 'default-1m': { limit: 120, ttl: 60_000 } })
  async receive(
    @Param('provider', new ParseEnumPipe(CRM_WEBHOOK_PROVIDERS)) provider: (typeof CRM_WEBHOOK_PROVIDERS)[number],
    @Req() req: RawBodyRequest<Request>,
  ) {
    const headers: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(req.headers))
      headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value
    return this.webhooks.receive(provider, {
      rawBody: req.rawBody ?? Buffer.from(''),
      headers,
      method: req.method,
      uri: `${req.protocol}://${req.get('host') ?? ''}${req.originalUrl}`,
    })
  }
}
