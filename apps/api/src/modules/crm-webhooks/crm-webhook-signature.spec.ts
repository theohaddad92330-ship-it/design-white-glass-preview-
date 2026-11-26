import { createHmac } from 'node:crypto'
import { verifyHubspotSignatureV3, verifySharedSecretSignature } from './crm-webhook-signature'

const NOW = Date.UTC(2026, 9, 15, 20, 0, 0)
const BODY = Buffer.from('[{"eventId":42,"portalId":7,"subscriptionType":"contact.propertyChange"}]')

// #4189.7 (Louis 15/10/2026) — signature vérifiée sur le corps BRUT, rejet si invalide ou rejouée.
describe('#4189.7 — HubSpot, signature v3', () => {
  const uri = 'https://api.bellum.test/webhooks/crm/hubspot'
  const sign = (body: Buffer, timestamp: string, secret = 's3cret') =>
    createHmac('sha256', secret)
      .update(`POST${uri}${body.toString('utf8')}${timestamp}`)
      .digest('base64')

  it('accepte une signature juste, dans la fenêtre', () => {
    const ts = String(NOW - 1000)
    expect(
      verifyHubspotSignatureV3({
        secret: 's3cret',
        method: 'post',
        uri,
        rawBody: BODY,
        timestamp: ts,
        signature: sign(BODY, ts),
        now: NOW,
      }),
    ).toBe(true)
  })

  it('sait dire NON — corps altéré, mauvais secret, horodatage rejoué, en-têtes absents', () => {
    const ts = String(NOW - 1000)
    const good = sign(BODY, ts)
    const base = { secret: 's3cret', method: 'POST', uri, rawBody: BODY, timestamp: ts, signature: good, now: NOW }
    expect(verifyHubspotSignatureV3({ ...base, rawBody: Buffer.from(`${BODY.toString()} `) })).toBe(false)
    expect(verifyHubspotSignatureV3({ ...base, signature: sign(BODY, ts, 'autre') })).toBe(false)
    const old = String(NOW - 6 * 60_000)
    expect(verifyHubspotSignatureV3({ ...base, timestamp: old, signature: sign(BODY, old) })).toBe(false)
    expect(verifyHubspotSignatureV3({ ...base, signature: undefined })).toBe(false)
    expect(verifyHubspotSignatureV3({ ...base, secret: '' })).toBe(false)
  })
})

describe('#4189.7 — Salesforce, secret partagé (HMAC hexadécimal de « horodatage.corps »)', () => {
  const sign = (ts: string, secret = 'sf-secret') =>
    createHmac('sha256', secret).update(`${ts}.${BODY.toString()}`).digest('hex')
  const ts = String(Math.floor(NOW / 1000) - 10)

  it('accepte une signature juste', () => {
    expect(
      verifySharedSecretSignature({ secret: 'sf-secret', rawBody: BODY, timestamp: ts, signature: sign(ts), now: NOW }),
    ).toBe(true)
  })

  it('sait dire NON — signature d’un autre secret, rejeu, signature tronquée', () => {
    const base = { secret: 'sf-secret', rawBody: BODY, timestamp: ts, signature: sign(ts), now: NOW }
    expect(verifySharedSecretSignature({ ...base, signature: sign(ts, 'x') })).toBe(false)
    const old = String(Math.floor(NOW / 1000) - 600)
    expect(verifySharedSecretSignature({ ...base, timestamp: old, signature: sign(old) })).toBe(false)
    expect(verifySharedSecretSignature({ ...base, signature: sign(ts).slice(0, 10) })).toBe(false)
  })
})
