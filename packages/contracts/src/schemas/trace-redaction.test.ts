import { describe, expect, it } from 'vitest'
import { scrubSentryBreadcrumb, scrubSentryEvent } from './trace-redaction.js'

// #4113 — le masquage ne vaut QUE pour ce qui part vers Sentry (web + api).
// Un test prouve aussi qu'on ne masque PAS hors trace : le texte d'origine
// reste en clair, l'écran et les réponses d'API ne passent jamais ici.
// `maskTraceText` n'est pas exportée (knip) : on la traverse par `scrubSentryEvent`.
const maskTraceText = (text: string): string => scrubSentryEvent({ message: text }).message

describe('maskTraceText', () => {
  it('masque e-mail, téléphone FR/international et Bearer', () => {
    const out = maskTraceText(
      'Contact marie.durand@acme.fr au 06 12 34 56 78 ou +33 6 12 34 56 78, Authorization: Bearer abcdefghij123456',
    )
    expect(out).not.toContain('marie.durand@acme.fr')
    expect(out).not.toContain('06 12 34 56 78')
    expect(out).not.toContain('+33 6 12')
    expect(out).not.toContain('abcdefghij123456')
  })

  it('laisse passer SIREN, CA, effectif, code postal (principe 2)', () => {
    const text = 'SIREN 552100554, CA 1250000000, effectif 12000, code postal 75008'
    expect(maskTraceText(text)).toBe(text)
  })
})

describe('scrubSentryEvent', () => {
  it('masque message, extra, contexts, request et breadcrumbs', () => {
    const event = {
      message: 'échec pour jean@acme.fr',
      exception: { values: [{ type: 'Error', value: 'tel 0612345678 injoignable' }] },
      extra: { note: 'écrire à a.b@c.io', nested: { phone: '+33 6 11 22 33 44' } },
      contexts: { draft: { to: 'x@y.com' } },
      request: {
        data: { email: 'z@z.fr' },
        headers: { authorization: 'Bearer abcdefghij123456', accept: 'json' },
        cookies: { sid: 'abc' },
        query_string: 'q=jean@acme.fr',
      },
      breadcrumbs: [{ message: 'sent to q@q.fr', data: { url: '/x?mail=m@m.fr' } }],
    }
    const out = JSON.stringify(scrubSentryEvent(event))
    for (const leak of [
      'jean@acme.fr',
      '0612345678',
      'a.b@c.io',
      '+33 6 11',
      'x@y.com',
      'z@z.fr',
      'abcdefghij123456',
      'q@q.fr',
      'm@m.fr',
    ]) {
      expect(out).not.toContain(leak)
    }
    expect(out).toContain('json')
  })

  it('ne mute pas son entrée : le texte hors trace reste en clair', () => {
    const original = { message: 'jean@acme.fr' }
    scrubSentryEvent(original)
    expect(original.message).toBe('jean@acme.fr')
  })
})

describe('scrubSentryBreadcrumb', () => {
  it('masque message et data', () => {
    const out = scrubSentryBreadcrumb({ message: 'a@b.fr', data: { t: '06 12 34 56 78' } })
    expect(JSON.stringify(out)).not.toMatch(/a@b\.fr|06 12 34 56 78/)
  })
})
