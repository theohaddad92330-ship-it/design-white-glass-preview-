import { NotFoundException, ServiceUnavailableException, type ExecutionContext } from '@nestjs/common'
import { ContactPhoneRevealWebhookController } from './contact-phone-reveal-webhook.controller'
import { signPhoneRevealToken } from './phone-reveal-token'
import { PhoneRevealWebhookGuard, type PhoneRevealRequest } from './phone-reveal-webhook.guard'

/** E1 (#3698) — l'endpoint public du mobile Apollo : la porte, puis la délégation. */
describe('PhoneRevealWebhookGuard', () => {
  const SECRET = 'q'.repeat(40)
  const contactId = '11111111-1111-4111-8111-111111111111'
  const ctx = (request: PhoneRevealRequest) =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext
  const guard = (secret: string | undefined) => new PhoneRevealWebhookGuard({ get: () => secret } as never)

  it('laisse passer un jeton signé et pose le contact sur la requête', () => {
    const token = signPhoneRevealToken(
      { contactId, workspaceId: null, nonce: 'n', expiresAt: Date.now() + 60_000 },
      SECRET,
    )
    const request: PhoneRevealRequest = { params: { token } }
    expect(guard(SECRET).canActivate(ctx(request))).toBe(true)
    expect(request.phoneReveal).toEqual({ contactId, workspaceId: null, nonce: 'n' })
  })

  it('NON : jeton faux → 404, sans dire pourquoi', () => {
    expect(() => guard(SECRET).canActivate(ctx({ params: { token: 'abc.def' } }))).toThrow(NotFoundException)
  })

  it('NON : secret serveur absent → 503 (jamais une porte ouverte)', () => {
    const token = signPhoneRevealToken(
      { contactId, workspaceId: null, nonce: 'n', expiresAt: Date.now() + 60_000 },
      SECRET,
    )
    expect(() => guard('').canActivate(ctx({ params: { token } }))).toThrow(ServiceUnavailableException)
  })
})

describe('ContactPhoneRevealWebhookController', () => {
  it('délègue la livraison au service, pour le contact SIGNÉ (jamais celui du corps)', async () => {
    const applyWebhook = jest.fn().mockResolvedValue({ accepted: true, outcome: 'found' })
    const controller = new ContactPhoneRevealWebhookController({ applyWebhook } as never)
    const out = await controller.receive(
      { params: {}, phoneReveal: { contactId: 'signed', workspaceId: 'ws', nonce: 'n' } },
      { contact_id: 'autre', people: [] },
    )
    expect(out).toEqual({ received: true })
    expect(applyWebhook).toHaveBeenCalledWith(
      { contactId: 'signed', workspaceId: 'ws', nonce: 'n' },
      { contact_id: 'autre', people: [] },
    )
  })
})
