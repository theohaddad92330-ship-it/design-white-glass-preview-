import { Test } from '@nestjs/testing'
import { TelephonyService } from './telephony.service'
import { TelephonyWebhookController } from './telephony-webhook.controller'
import { signTelephonyWebhookBody } from './telephony-webhook-signature'

const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const USER = '11111111-1111-1111-1111-111111111111'
const SECRET = 'a'.repeat(64)

function req(body: Buffer) {
  return { rawBody: body } as never
}

describe('TelephonyWebhookController — #2403.12', () => {
  let controller: TelephonyWebhookController
  let telephony: { webhookSecretFor: jest.Mock; applyCallEvent: jest.Mock }

  beforeEach(async () => {
    telephony = {
      webhookSecretFor: jest.fn().mockResolvedValue(SECRET),
      applyCallEvent: jest.fn().mockResolvedValue(undefined),
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [TelephonyWebhookController],
      providers: [{ provide: TelephonyService, useValue: telephony }],
    }).compile()
    controller = moduleRef.get(TelephonyWebhookController)
  })

  it('un événement signé avec le bon secret applique l’état', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'call.started', userId: USER, callId: 'c1' }))
    const signature = signTelephonyWebhookBody(SECRET, body)

    const result = await controller.handleWebhook(req(body), WORKSPACE, signature)

    expect(result).toEqual({ received: true })
    expect(telephony.applyCallEvent).toHaveBeenCalledWith(WORKSPACE, {
      event: 'call.started',
      userId: USER,
      callId: 'c1',
    })
  })

  it('un identifiant d’espace qui n’est pas un UUID est refusé avant toute lecture du secret', async () => {
    const body = Buffer.from('{}')
    await expect(controller.handleWebhook(req(body), 'not-a-uuid', 't=1,v1=deadbeef')).rejects.toThrow()
    expect(telephony.webhookSecretFor).not.toHaveBeenCalled()
  })

  it('aucun secret configuré pour l’espace : 503, jamais un webhook non vérifiable accepté', async () => {
    telephony.webhookSecretFor.mockResolvedValue(null)
    const body = Buffer.from(JSON.stringify({ event: 'call.started', userId: USER, callId: 'c1' }))

    await expect(controller.handleWebhook(req(body), WORKSPACE, 't=1,v1=deadbeef')).rejects.toMatchObject({
      status: 503,
    })
    expect(telephony.applyCallEvent).not.toHaveBeenCalled()
  })

  it('signature invalide : 400, l’événement n’est jamais appliqué', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'call.started', userId: USER, callId: 'c1' }))

    await expect(controller.handleWebhook(req(body), WORKSPACE, 't=1,v1=deadbeef')).rejects.toMatchObject({
      status: 400,
    })
    expect(telephony.applyCallEvent).not.toHaveBeenCalled()
  })

  it('un corps qui ne respecte pas le contrat (champ en trop) est refusé — `.strict()` tenu par le type', async () => {
    const body = Buffer.from(
      JSON.stringify({ event: 'call.started', userId: USER, callId: 'c1', phoneNumber: '+33...' }),
    )
    const signature = signTelephonyWebhookBody(SECRET, body)

    await expect(controller.handleWebhook(req(body), WORKSPACE, signature)).rejects.toMatchObject({ status: 400 })
    expect(telephony.applyCallEvent).not.toHaveBeenCalled()
  })

  it('un JSON invalide est refusé sans lever une exception non gérée', async () => {
    const body = Buffer.from('{not json')
    const signature = signTelephonyWebhookBody(SECRET, body)

    await expect(controller.handleWebhook(req(body), WORKSPACE, signature)).rejects.toMatchObject({ status: 400 })
  })
})
