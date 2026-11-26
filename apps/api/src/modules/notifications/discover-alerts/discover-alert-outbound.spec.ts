import { createDiscoverAlertOutbound } from './discover-alert-outbound'
import { buildDiscoverAlertEmail, buildDiscoverAlertSms, buildDiscoverAlertTitle } from './discover-alert-message'

function doubles() {
  const mailer = { sendNotificationEmail: jest.fn(async () => undefined) }
  const smsSend = jest.fn(async () => undefined)
  return { mailer, smsSend }
}

function smsPort(configured: boolean, send: jest.Mock) {
  return { configured, send } as never
}

describe('sans clé — NO-OP STRICT, et zéro appel réseau', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('aucune clé de messagerie : le canal e-mail n’est PAS configuré', () => {
    const { mailer, smsSend } = doubles()
    const outbound = createDiscoverAlertOutbound({}, mailer as never, smsPort(false, smsSend))
    expect(outbound.configuredFor('email')).toBe(false)
  })

  it('aucune clé de SMS : le canal SMS n’est PAS configuré', () => {
    const { mailer, smsSend } = doubles()
    const outbound = createDiscoverAlertOutbound({}, mailer as never, smsPort(false, smsSend))
    expect(outbound.configuredFor('sms')).toBe(false)
  })

  it('un envoi tenté sans clé LÈVE, ne touche AUCUN transport et ne fait ZÉRO appel réseau', async () => {
    // La preuve est mesurée, pas déduite : le client HTTP global est espionné,
    // et on compte ses appels. « Une erreur attrapée » ne serait pas la même
    // chose — le paquet serait déjà parti.
    const networkCalls = jest.fn()
    globalThis.fetch = (async (...args: unknown[]) => {
      networkCalls(...args)
      throw new Error('aucun appel réseau ne devait avoir lieu')
    }) as unknown as typeof fetch

    const { mailer, smsSend } = doubles()
    const outbound = createDiscoverAlertOutbound({}, mailer as never, smsPort(false, smsSend))

    await expect(
      outbound.send({ channel: 'email', to: 'a@b.fr', subject: 's', heading: 'h', bodyLines: ['l'] }),
    ).rejects.toThrow(/jamais dû être tenté/)
    await expect(outbound.send({ channel: 'sms', to: '+33612345678', text: 't' })).rejects.toThrow(
      /jamais dû être tenté/,
    )

    expect(networkCalls).not.toHaveBeenCalled()
    expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
    expect(smsSend).not.toHaveBeenCalled()
  })

  it('un échec ne se déguise JAMAIS en succès', async () => {
    const { mailer, smsSend } = doubles()
    const outbound = createDiscoverAlertOutbound({}, mailer as never, smsPort(false, smsSend))
    await expect(outbound.send({ channel: 'sms', to: '+33612345678', text: 't' })).rejects.toBeInstanceOf(Error)
  })
})

describe('avec clé — le transport est bien atteint', () => {
  it('témoin du cas légitime : une clé de messagerie posée configure l’e-mail et l’envoie', async () => {
    const { mailer, smsSend } = doubles()
    const outbound = createDiscoverAlertOutbound({ RESEND_API_KEY: 're_xxx' }, mailer as never, smsPort(false, smsSend))
    expect(outbound.configuredFor('email')).toBe(true)
    await outbound.send({ channel: 'email', to: 'a@b.fr', subject: 's', heading: 'h', bodyLines: ['l'] })
    expect(mailer.sendNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.fr', subject: 's' }))
  })

  it('témoin du cas légitime : un port SMS branché configure le SMS et l’envoie', async () => {
    const { mailer, smsSend } = doubles()
    const outbound = createDiscoverAlertOutbound({}, mailer as never, smsPort(true, smsSend))
    expect(outbound.configuredFor('sms')).toBe(true)
    await outbound.send({ channel: 'sms', to: '+33612345678', text: 't' })
    expect(smsSend).toHaveBeenCalledWith({ to: '+33612345678', text: 't' })
  })

  it('une clé de messagerie vide ou blanche ne configure RIEN', () => {
    const { mailer, smsSend } = doubles()
    for (const key of ['', '   ']) {
      const outbound = createDiscoverAlertOutbound({ RESEND_API_KEY: key }, mailer as never, smsPort(false, smsSend))
      expect(outbound.configuredFor('email')).toBe(false)
    }
  })

  it('les deux canaux sont INDÉPENDANTS — une clé n’en allume pas deux', () => {
    const { mailer, smsSend } = doubles()
    const outbound = createDiscoverAlertOutbound({ RESEND_API_KEY: 're_x' }, mailer as never, smsPort(false, smsSend))
    expect(outbound.configuredFor('email')).toBe(true)
    expect(outbound.configuredFor('sms')).toBe(false)
  })
})

describe('ce que l’alerte DIT', () => {
  const subject = { name: 'Industrie Rhône-Alpes', objective: 'ouvrir trois comptes', frequency: 'weekly' as const }

  it('ne porte AUCUN résultat — elle renvoie à l’écran, elle ne rejoue rien', () => {
    const fr = buildDiscoverAlertEmail('fr', { ...subject, url: 'https://app/discover' })
    expect(fr.bodyLines.join(' ')).toContain('Rien n’a été rejoué')
    expect(fr.ctaUrl).toBe('https://app/discover')
  })

  it('existe en français ET en anglais, sans trou', () => {
    const fr = buildDiscoverAlertEmail('fr', { ...subject, url: null })
    const en = buildDiscoverAlertEmail('en', { ...subject, url: null })
    for (const content of [fr, en]) {
      expect(content.subject.length).toBeGreaterThan(10)
      expect(content.heading.length).toBeGreaterThan(5)
      expect(content.bodyLines.length).toBeGreaterThanOrEqual(2)
    }
    expect(fr.subject).not.toBe(en.subject)
  })

  it('n’invente pas d’objectif quand personne n’en a écrit', () => {
    const fr = buildDiscoverAlertEmail('fr', { ...subject, objective: null, url: null })
    expect(fr.bodyLines.some(line => line.includes('objectif'))).toBe(false)
  })

  it('ne nomme AUCUN fournisseur', () => {
    const text = [
      buildDiscoverAlertEmail('fr', { ...subject, url: null }),
      buildDiscoverAlertEmail('en', { ...subject, url: null }),
    ]
      .flatMap(content => [content.subject, content.heading, ...content.bodyLines])
      .join(' ')
      .toLowerCase()
    for (const vendor of ['resend', 'messagebird', 'bird', 'twilio', 'sendgrid', 'mailpit', 'anthropic', 'apollo']) {
      expect(text).not.toContain(vendor)
    }
  })

  it('un SMS tient sur un seul segment, même avec un nom à rallonge', () => {
    const long = buildDiscoverAlertSms('fr', 'x'.repeat(400))
    expect(long.length).toBeLessThanOrEqual(160)
    expect(buildDiscoverAlertTitle('en', 'Ops').length).toBeGreaterThan(5)
  })
})
