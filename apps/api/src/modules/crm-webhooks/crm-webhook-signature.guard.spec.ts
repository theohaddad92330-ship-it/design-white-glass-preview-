import { createHmac } from 'node:crypto'
import { NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import { CrmWebhookSignatureGuard } from './crm-webhook-signature.guard'

/**
 * GA-05 — la porte du webhook CRM entrant (#4189.7) est un GUARD nommé, pas une vérification
 * enfouie dans le service : la route est publique (le CRM n'a pas de jeton Bellum), la
 * signature sur le corps brut est sa seule porte.
 */
const URI = 'https://api.example.test/webhooks/crm/hubspot'

function contextFor(provider: string, rawBody: Buffer, headers: Record<string, string>): ExecutionContext {
  const req = {
    params: { provider },
    rawBody,
    headers,
    method: 'POST',
    protocol: 'https',
    originalUrl: '/webhooks/crm/hubspot',
    get: (name: string) => (name === 'host' ? 'api.example.test' : undefined),
  }
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
}

describe('CrmWebhookSignatureGuard (#4189.7, GA-05)', () => {
  const guard = new CrmWebhookSignatureGuard()
  const secret = 'test-secret-hubspot'
  const rawBody = Buffer.from('[{"eventId":"e1","portalId":"42"}]')
  const timestamp = String(Date.now())
  const signature = createHmac('sha256', secret).update(`POST${URI}${rawBody.toString()}${timestamp}`).digest('base64')

  afterEach(() => {
    delete process.env.HUBSPOT_WEBHOOK_SECRET
  })

  it('sans secret configuré : la route n’existe pas (404), rien n’est lu', () => {
    expect(() => guard.canActivate(contextFor('hubspot', rawBody, {}))).toThrow(NotFoundException)
  })

  it('signature invalide : refusée (401)', () => {
    process.env.HUBSPOT_WEBHOOK_SECRET = secret
    const headers = { 'x-hubspot-request-timestamp': timestamp, 'x-hubspot-signature-v3': 'faux' }
    expect(() => guard.canActivate(contextFor('hubspot', rawBody, headers))).toThrow(UnauthorizedException)
  })

  it('signature valide sur le corps brut : passe', () => {
    process.env.HUBSPOT_WEBHOOK_SECRET = secret
    const headers = { 'x-hubspot-request-timestamp': timestamp, 'x-hubspot-signature-v3': signature }
    expect(guard.canActivate(contextFor('hubspot', rawBody, headers))).toBe(true)
  })

  it('fournisseur inconnu : 404, jamais un secret deviné', () => {
    expect(() => guard.canActivate(contextFor('pipedrive', rawBody, {}))).toThrow(NotFoundException)
  })
})
