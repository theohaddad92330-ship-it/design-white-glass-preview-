import { Injectable, NotFoundException, type CanActivate, type ExecutionContext } from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { assertCrmWebhookSignature, CRM_WEBHOOK_PROVIDERS, type CrmWebhookProvider } from './crm-webhooks.service'

/**
 * #4189.7 — la porte de `POST /webhooks/crm/:provider`. L'appelant (HubSpot, Salesforce) n'est ni
 * un utilisateur ni un service à nous : il ne porte ni JWT ni secret interne. Sa seule
 * authentification est la SIGNATURE du corps brut, vérifiée ici AVANT la route — 404 sans secret
 * configuré (no-op strict), 401 si la signature ne tient pas. Même famille que
 * `PhoneRevealWebhookGuard` (GA-05, ALTERNATIVE_GUARDS).
 */
@Injectable()
export class CrmWebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>()
    const provider = String(req.params?.['provider'] ?? '')
    if (!(CRM_WEBHOOK_PROVIDERS as readonly string[]).includes(provider)) throw new NotFoundException()
    const headers: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(req.headers ?? {}))
      headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value
    assertCrmWebhookSignature(provider as CrmWebhookProvider, {
      rawBody: req.rawBody ?? Buffer.from(''),
      headers,
      method: req.method,
      uri: `${req.protocol}://${req.get('host') ?? ''}${req.originalUrl}`,
    })
    return true
  }
}
