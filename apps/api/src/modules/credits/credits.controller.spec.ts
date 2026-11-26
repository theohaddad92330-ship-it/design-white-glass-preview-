import 'reflect-metadata'
import { BadRequestException, Logger, ServiceUnavailableException, type RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import type Stripe from 'stripe'
import { CreditsController } from './credits.controller'
import type { CreditsService } from './credits.service'
import type { StripeService } from '../stripe/stripe.service'

/**
 * Stripe webhook hardening (fix/stripe-webhook-hardening):
 *  - valid event   → 200 + processed
 *  - duplicate     → 200 (service dedup swallows it; not double-applied)
 *  - bad signature → 400 + NOT processed + no secret/message leak
 *  - missing secret while Stripe configured → 503 + never verified or processed
 *
 * These assert the controller's HTTP contract. The "not double-applied" guarantee
 * itself lives in credits.service.spec.ts ("skips a redelivered event (idempotency)").
 */
describe('CreditsController — Stripe webhook', () => {
  let controller: CreditsController
  let handleWebhookEvent: jest.Mock
  let parseWebhookEvent: jest.Mock
  let isWebhookConfigured: jest.Mock
  let errorLog: jest.SpyInstance

  const makeReq = (body = '{}'): RawBodyRequest<Request> =>
    ({ rawBody: Buffer.from(body) }) as unknown as RawBodyRequest<Request>

  beforeEach(() => {
    // Silence + allow assertions on the controller's error logging.
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    handleWebhookEvent = jest.fn().mockResolvedValue(undefined)
    parseWebhookEvent = jest.fn()
    isWebhookConfigured = jest.fn().mockReturnValue(true)
    const creditsService = { handleWebhookEvent } as unknown as CreditsService
    const stripeService = { parseWebhookEvent, isWebhookConfigured } as unknown as StripeService
    controller = new CreditsController(creditsService, stripeService)
  })

  afterEach(() => jest.restoreAllMocks())

  it('(a) valid event → 200 and the event is processed', async () => {
    const event = { id: 'evt_1', type: 'checkout.session.completed' } as Stripe.Event
    parseWebhookEvent.mockReturnValue(event)

    const res = await controller.handleWebhook(makeReq(), 'sig_ok')

    expect(res).toEqual({ received: true })
    expect(handleWebhookEvent).toHaveBeenCalledWith(event)
    // @HttpCode(200) forces the success status to 200 (a POST would otherwise default to 201).
    expect(Reflect.getMetadata('__httpCode__', CreditsController.prototype.handleWebhook)).toBe(200)
  })

  it('(b) duplicate valid event → still 200 (dedup handled in the service, no throw)', async () => {
    const event = { id: 'evt_dup', type: 'checkout.session.completed' } as Stripe.Event
    parseWebhookEvent.mockReturnValue(event)
    // Redelivery: the service records the event id ON CONFLICT DO NOTHING and returns
    // without re-applying the grant. The controller must keep answering 200 ("handled").
    handleWebhookEvent.mockResolvedValue(undefined)

    const first = await controller.handleWebhook(makeReq(), 'sig_ok')
    const second = await controller.handleWebhook(makeReq(), 'sig_ok')

    expect(first).toEqual({ received: true })
    expect(second).toEqual({ received: true })
    expect(handleWebhookEvent).toHaveBeenCalledTimes(2)
  })

  it('(c) bad signature → 400, event NOT processed, no secret/message leak', async () => {
    const secret = 'whsec_leaky_secret_value'
    parseWebhookEvent.mockImplementation(() => {
      throw new Error(`No signatures found matching the expected signature; secret=${secret}`)
    })

    let caught: unknown
    try {
      await controller.handleWebhook(makeReq(), 'sig_bad')
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(BadRequestException)
    expect((caught as BadRequestException).getStatus()).toBe(400)
    // Generic reason only — the raw Stripe error (which can carry secret material) is not echoed.
    const body = (caught as BadRequestException).getResponse() as { message: string }
    expect(body.message).toBe('Invalid Stripe webhook signature')
    expect(JSON.stringify(body)).not.toContain(secret)
    // Not processed.
    expect(handleWebhookEvent).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
  })

  it('(d) Stripe configured but webhook secret missing → 503, never verified or processed', async () => {
    isWebhookConfigured.mockReturnValue(false)

    let caught: unknown
    try {
      await controller.handleWebhook(makeReq(), 'sig_any')
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException)
    expect((caught as ServiceUnavailableException).getStatus()).toBe(503)
    // Fail-closed: never attempt verification with an empty secret, and never process.
    expect(parseWebhookEvent).not.toHaveBeenCalled()
    expect(handleWebhookEvent).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalled()
  })
})
