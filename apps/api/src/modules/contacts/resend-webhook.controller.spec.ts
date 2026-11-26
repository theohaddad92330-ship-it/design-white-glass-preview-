import 'reflect-metadata'
import { BadRequestException, Logger, ServiceUnavailableException, type RawBodyRequest } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import { createHmac } from 'node:crypto'
import { ResendWebhookController } from './resend-webhook.controller'
import type { ContactsService } from './contacts.service'

/**
 * #2733 (SKAIZen Group, 22/09/2026) — le webhook Resend qui fait redescendre
 * un rebond sur le contact. Même contrat HTTP que le webhook Stripe
 * (`credits.controller.spec.ts`), copié à l'identique :
 *  - événement `email.bounced` vérifié → 200, `applyEmailBounce` appelé
 *  - un type d'événement qu'on ne traite pas → 200 SANS appeler le service
 *    (Resend ne doit pas re-livrer indéfiniment ce qu'on ignore sciemment)
 *  - signature invalide → 400, JAMAIS appliqué, aucune fuite de secret
 *  - secret absent → 503, jamais vérifié, jamais appliqué (fail-closed)
 */
describe('ResendWebhookController — webhook Resend (#2733)', () => {
  let controller: ResendWebhookController
  let applyEmailBounce: jest.Mock
  let errorLog: jest.SpyInstance
  const secretBytes = Buffer.from('un-secret-webhook-de-32-octets!', 'utf8')
  const secret = `whsec_${secretBytes.toString('base64')}`

  const sign = (svixId: string, svixTimestamp: string, rawBody: string): string => {
    const digest = createHmac('sha256', secretBytes).update(`${svixId}.${svixTimestamp}.${rawBody}`).digest('base64')
    return `v1,${digest}`
  }

  const makeReq = (bodyObject: unknown): { req: RawBodyRequest<Request>; headers: Record<string, string> } => {
    const rawBody = Buffer.from(JSON.stringify(bodyObject))
    const svixId = 'msg_1'
    const svixTimestamp = String(Math.floor(Date.now() / 1000))
    return {
      req: { rawBody } as unknown as RawBodyRequest<Request>,
      headers: { svixId, svixTimestamp, svixSignature: sign(svixId, svixTimestamp, rawBody.toString('utf8')) },
    }
  }

  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    applyEmailBounce = jest.fn().mockResolvedValue({ contactId: 'c1' })
    const contactsService = { applyEmailBounce } as unknown as ContactsService
    const configService = { get: jest.fn().mockReturnValue(secret) } as unknown as ConfigService
    controller = new ResendWebhookController(contactsService, configService)
  })

  afterEach(() => jest.restoreAllMocks())

  it('email.bounced vérifié → 200, le rebond est appliqué avec email_id + type', async () => {
    const { req, headers } = makeReq({
      type: 'email.bounced',
      data: { email_id: 're_abc123', bounce: { type: 'Permanent', subType: 'Suppressed' } },
    })

    const res = await controller.handleWebhook(req, headers.svixId, headers.svixTimestamp, headers.svixSignature)

    expect(res).toEqual({ received: true })
    expect(applyEmailBounce).toHaveBeenCalledWith('re_abc123', 'Permanent')
  })

  it('un type d’événement non traité → 200, SANS appeler applyEmailBounce', async () => {
    const { req, headers } = makeReq({ type: 'email.delivered', data: { email_id: 're_abc123' } })

    const res = await controller.handleWebhook(req, headers.svixId, headers.svixTimestamp, headers.svixSignature)

    expect(res).toEqual({ received: true })
    expect(applyEmailBounce).not.toHaveBeenCalled()
  })

  it('email.bounced sans data.email_id → 200, rien à appliquer (pas une erreur de notre côté)', async () => {
    const { req, headers } = makeReq({ type: 'email.bounced', data: {} })

    const res = await controller.handleWebhook(req, headers.svixId, headers.svixTimestamp, headers.svixSignature)

    expect(res).toEqual({ received: true })
    expect(applyEmailBounce).not.toHaveBeenCalled()
  })

  it('signature invalide → 400, jamais appliqué, aucune fuite du secret', async () => {
    const { req, headers } = makeReq({ type: 'email.bounced', data: { email_id: 're_abc123' } })

    let caught: unknown
    try {
      await controller.handleWebhook(req, headers.svixId, headers.svixTimestamp, 'v1,signature-fausse')
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(BadRequestException)
    expect((caught as BadRequestException).getStatus()).toBe(400)
    const body = (caught as BadRequestException).getResponse() as { message: string }
    expect(JSON.stringify(body)).not.toContain(secret)
    expect(applyEmailBounce).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
  })

  it('secret non configuré → 503, jamais vérifié, jamais appliqué (fail-closed)', async () => {
    const contactsService = { applyEmailBounce } as unknown as ContactsService
    const configService = { get: jest.fn().mockReturnValue('') } as unknown as ConfigService
    controller = new ResendWebhookController(contactsService, configService)
    const { req, headers } = makeReq({ type: 'email.bounced', data: { email_id: 're_abc123' } })

    let caught: unknown
    try {
      await controller.handleWebhook(req, headers.svixId, headers.svixTimestamp, headers.svixSignature)
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException)
    expect((caught as ServiceUnavailableException).getStatus()).toBe(503)
    expect(applyEmailBounce).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
  })
})
