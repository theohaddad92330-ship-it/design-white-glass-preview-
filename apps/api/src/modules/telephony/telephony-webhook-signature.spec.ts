import { createHmac } from 'node:crypto'
import { signTelephonyWebhookBody, verifyTelephonyWebhookSignature } from './telephony-webhook-signature'

const SECRET = 'a'.repeat(64)

function sign(secret: string, timestamp: number, rawBody: Buffer): string {
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex')
  return `t=${timestamp},v1=${digest}`
}

describe('verifyTelephonyWebhookSignature — #2403.12, la signature générique du webhook d’appel', () => {
  it('une signature calculée avec le bon secret, sur les mêmes octets, est acceptée', () => {
    const rawBody = Buffer.from(JSON.stringify({ event: 'call.started', userId: 'u1', callId: 'c1' }))
    const now = 1_700_000_000
    const header = sign(SECRET, now, rawBody)

    expect(verifyTelephonyWebhookSignature({ rawBody, header, secret: SECRET, now: now * 1000 })).toBe(true)
  })

  it('un secret différent est refusé', () => {
    const rawBody = Buffer.from('{}')
    const now = 1_700_000_000
    const header = sign('b'.repeat(64), now, rawBody)

    expect(verifyTelephonyWebhookSignature({ rawBody, header, secret: SECRET, now: now * 1000 })).toBe(false)
  })

  it('un octet rejoué (corps modifié après signature) est refusé', () => {
    const now = 1_700_000_000
    const header = sign(SECRET, now, Buffer.from('{"a":1}'))

    expect(
      verifyTelephonyWebhookSignature({ rawBody: Buffer.from('{"a":2}'), header, secret: SECRET, now: now * 1000 }),
    ).toBe(false)
  })

  it('un horodatage hors tolérance (rejeu) est refusé même avec la bonne signature', () => {
    const rawBody = Buffer.from('{}')
    const now = 1_700_000_000
    const header = sign(SECRET, now, rawBody)
    const tenMinutesLater = (now + 600) * 1000

    expect(verifyTelephonyWebhookSignature({ rawBody, header, secret: SECRET, now: tenMinutesLater })).toBe(false)
  })

  it('un en-tête absent ou malformé est refusé sans lever', () => {
    const rawBody = Buffer.from('{}')
    expect(verifyTelephonyWebhookSignature({ rawBody, header: '', secret: SECRET })).toBe(false)
    expect(verifyTelephonyWebhookSignature({ rawBody, header: 'n’importe quoi', secret: SECRET })).toBe(false)
    expect(verifyTelephonyWebhookSignature({ rawBody, header: 't=abc,v1=zz', secret: SECRET })).toBe(false)
  })

  it('un secret vide est refusé — jamais un webhook non vérifiable accepté par défaut', () => {
    const rawBody = Buffer.from('{}')
    const now = 1_700_000_000
    const header = sign(SECRET, now, rawBody)
    expect(verifyTelephonyWebhookSignature({ rawBody, header, secret: '', now: now * 1000 })).toBe(false)
  })

  it('signTelephonyWebhookBody produit un en-tête que verifyTelephonyWebhookSignature accepte (aller-retour)', () => {
    const rawBody = Buffer.from(JSON.stringify({ event: 'call.ended', userId: 'u2', callId: 'c2' }))
    const header = signTelephonyWebhookBody(SECRET, rawBody)
    expect(verifyTelephonyWebhookSignature({ rawBody, header, secret: SECRET })).toBe(true)
  })
})
