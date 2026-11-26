import { createHmac } from 'node:crypto'
import { verifyResendWebhookSignature } from './resend-webhook-signature'

/**
 * #2733 — la garde d'entrée du webhook Resend. Un secret au format Svix
 * (`whsec_<base64>`) construit ici EXACTEMENT comme Resend le ferait, pour
 * ne pas tester une supposition sur leur format.
 */
function makeSecret(): { secret: string; keyBytes: Buffer } {
  const keyBytes = Buffer.from('un-secret-webhook-de-32-octets!', 'utf8')
  return { secret: `whsec_${keyBytes.toString('base64')}`, keyBytes }
}

function sign(keyBytes: Buffer, svixId: string, svixTimestamp: string, rawBody: string): string {
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const digest = createHmac('sha256', keyBytes).update(signedContent).digest('base64')
  return `v1,${digest}`
}

describe('verifyResendWebhookSignature (#2733)', () => {
  const rawBody = Buffer.from(JSON.stringify({ type: 'email.bounced', data: { email_id: 're_abc123' } }))
  const svixId = 'msg_2abc'
  const svixTimestamp = String(Math.floor(Date.now() / 1000))

  it('accepte une signature correctement calculée', () => {
    const { secret, keyBytes } = makeSecret()
    const svixSignature = sign(keyBytes, svixId, svixTimestamp, rawBody.toString('utf8'))

    expect(verifyResendWebhookSignature({ rawBody, svixId, svixTimestamp, svixSignature, secret })).toBe(true)
  })

  it('refuse une signature calculée avec le MAUVAIS secret', () => {
    const { secret } = makeSecret()
    const wrongKeyBytes = Buffer.from('un-autre-secret-de-32-octets---', 'utf8')
    const svixSignature = sign(wrongKeyBytes, svixId, svixTimestamp, rawBody.toString('utf8'))

    expect(verifyResendWebhookSignature({ rawBody, svixId, svixTimestamp, svixSignature, secret })).toBe(false)
  })

  it('refuse un corps MODIFIÉ après signature (intégrité)', () => {
    const { secret, keyBytes } = makeSecret()
    const svixSignature = sign(keyBytes, svixId, svixTimestamp, rawBody.toString('utf8'))
    const tamperedBody = Buffer.from(JSON.stringify({ type: 'email.bounced', data: { email_id: 're_AUTRE' } }))

    expect(verifyResendWebhookSignature({ rawBody: tamperedBody, svixId, svixTimestamp, svixSignature, secret })).toBe(
      false,
    )
  })

  it('accepte quand PLUSIEURS signatures cohabitent (rotation de clé) et que la nôtre y est', () => {
    const { secret, keyBytes } = makeSecret()
    const ours = sign(keyBytes, svixId, svixTimestamp, rawBody.toString('utf8'))
    const other = 'v1,c2lnbmF0dXJlLWRhdXRyZS1jbGU='
    const svixSignature = `${other} ${ours}`

    expect(verifyResendWebhookSignature({ rawBody, svixId, svixTimestamp, svixSignature, secret })).toBe(true)
  })

  it('refuse un horodatage trop vieux — protection contre le rejeu', () => {
    const { secret, keyBytes } = makeSecret()
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 3600) // 1h
    const svixSignature = sign(keyBytes, svixId, oldTimestamp, rawBody.toString('utf8'))

    expect(verifyResendWebhookSignature({ rawBody, svixId, svixTimestamp: oldTimestamp, svixSignature, secret })).toBe(
      false,
    )
  })

  it('refuse un secret absent — jamais un succès sans preuve', () => {
    const { keyBytes } = makeSecret()
    const svixSignature = sign(keyBytes, svixId, svixTimestamp, rawBody.toString('utf8'))

    expect(verifyResendWebhookSignature({ rawBody, svixId, svixTimestamp, svixSignature, secret: '' })).toBe(false)
  })

  it('refuse un en-tête svix-signature absent ou vide', () => {
    const { secret } = makeSecret()

    expect(verifyResendWebhookSignature({ rawBody, svixId, svixTimestamp, svixSignature: '', secret })).toBe(false)
  })

  it('refuse un horodatage illisible plutôt que de planter', () => {
    const { secret, keyBytes } = makeSecret()
    const svixSignature = sign(keyBytes, svixId, 'pas-un-nombre', rawBody.toString('utf8'))

    expect(
      verifyResendWebhookSignature({ rawBody, svixId, svixTimestamp: 'pas-un-nombre', svixSignature, secret }),
    ).toBe(false)
  })
})
