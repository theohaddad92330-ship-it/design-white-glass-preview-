import { createSmsSender } from './sms-sender'

/**
 * #1938.4 — décision Louis 13/09 batch 13 (port), branchement 13/09
 * (fournisseur MessageBird). Sans clé : port inerte, comme avant. Avec clé :
 * un vrai client MessageBird, vérifié contre le contrat HTTP de sa
 * documentation (POST /messages, AccessKey, recipients sans le `+`).
 */
describe('createSmsSender — sans clé, le port ne sait rien envoyer (#1938.4)', () => {
  it('sans clé : non configuré, sans un mot au journal', () => {
    const warn = jest.fn()
    const sender = createSmsSender({}, warn)
    expect(sender.configured).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('une clé vide ou faite d’espaces vaut absente', () => {
    const warn = jest.fn()
    expect(createSmsSender({ SMS_PROVIDER_API_KEY: '   ' }, warn).configured).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('un envoi sur un port non configuré est un défaut d’APPELANT : il refuse, sans aucun appel réseau', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    try {
      const sender = createSmsSender({}, jest.fn())
      await expect(sender.send({ to: '+33612345678', text: 'test' })).rejects.toThrow()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})

describe('createSmsSender — une clé posée branche MessageBird (#1938.4)', () => {
  const apiKey = 'sk_live_ne_doit_pas_sortir'

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('configured devient true', () => {
    const sender = createSmsSender({ SMS_PROVIDER_API_KEY: apiKey }, jest.fn())
    expect(sender.configured).toBe(true)
  })

  it('aucun avertissement au démarrage pour la clé posée — plus rien à signaler', () => {
    const warn = jest.fn()
    createSmsSender({ SMS_PROVIDER_API_KEY: apiKey }, warn)
    expect(warn).not.toHaveBeenCalled()
  })

  it('envoie sur un numéro autorisé : URL, méthode, en-tête et corps exacts', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'msg-1' }) } as Response)
    const sender = createSmsSender({ SMS_PROVIDER_API_KEY: apiKey }, jest.fn())

    await sender.send({ to: '+33612345678', text: 'Ton code : 123456' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://rest.messagebird.com/messages')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(`AccessKey ${apiKey}`)
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({
      originator: 'BellumAI',
      recipients: ['33612345678'],
      body: 'Ton code : 123456',
    })
  })

  it('un numéro hors des pays autorisés est rejeté SANS appeler le fournisseur', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const sender = createSmsSender({ SMS_PROVIDER_API_KEY: apiKey }, jest.fn())

    await expect(sender.send({ to: '+14155552671', text: 'test' })).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('une réponse fournisseur en erreur fait rejeter send(), sans exposer la clé ni le numéro', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ errors: [{ code: 9, description: 'not enough balance', parameter: null }] }),
    } as Response)
    const sender = createSmsSender({ SMS_PROVIDER_API_KEY: apiKey }, jest.fn())

    let caught: unknown
    try {
      await sender.send({ to: '+33612345678', text: 'test' })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    const message = (caught as Error).message
    expect(message).not.toContain(apiKey)
    expect(message).not.toContain('33612345678')
  })

  it('SMS_SENDER_ID valide est utilisé tel quel', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 201 } as Response)
    const sender = createSmsSender({ SMS_PROVIDER_API_KEY: apiKey, SMS_SENDER_ID: 'MonEsn' }, jest.fn())

    await sender.send({ to: '+33612345678', text: 'test' })

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).originator).toBe('MonEsn')
  })

  it('SMS_SENDER_ID invalide (trop long) retombe sur "BellumAI" et avertit une fois, sans lever', async () => {
    const warn = jest.fn()
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 201 } as Response)
    const sender = createSmsSender({ SMS_PROVIDER_API_KEY: apiKey, SMS_SENDER_ID: 'BienTropLongPourGSM' }, warn)

    expect(warn).toHaveBeenCalledTimes(1)
    await sender.send({ to: '+33612345678', text: 'test' })
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).originator).toBe('BellumAI')
  })

  it('SMS_SENDER_ID invalide (caractère hors GSM) retombe aussi sur "BellumAI"', () => {
    const warn = jest.fn()
    createSmsSender({ SMS_PROVIDER_API_KEY: apiKey, SMS_SENDER_ID: 'Bell-um' }, warn)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('la clé ne fuit jamais dans un avertissement', () => {
    const warn = jest.fn()
    createSmsSender({ SMS_PROVIDER_API_KEY: apiKey, SMS_SENDER_ID: 'Bell-um' }, warn)
    expect(JSON.stringify(warn.mock.calls)).not.toContain(apiKey)
  })

  it('SMS_ALLOWED_COUNTRY_CODES posée élargit la liste', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 201 } as Response)
    const sender = createSmsSender({ SMS_PROVIDER_API_KEY: apiKey, SMS_ALLOWED_COUNTRY_CODES: '33,32,41' }, jest.fn())

    await sender.send({ to: '+41791234567', text: 'test' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('createSmsSender — #4016 L12 : FR, BE, CH, LU lus de SMS_ALLOWED_COUNTRY_CODES', () => {
  const apiKey = 'sk_live_ne_doit_pas_sortir'

  it('« 33,32,41,352 » autorise la France, la Belgique, la Suisse et le Luxembourg — et rien d’autre', () => {
    const sender = createSmsSender(
      { SMS_PROVIDER_API_KEY: apiKey, SMS_ALLOWED_COUNTRY_CODES: '33,32,41,352' },
      jest.fn(),
    )
    for (const phone of ['+33612345678', '+32475123456', '+41791234567', '+352621123456']) {
      expect(sender.allowsCountry(phone)).toBe(true)
    }
    expect(sender.allowsCountry('+14155552671')).toBe(false)
  })

  it('sans la variable : la France seule', () => {
    const sender = createSmsSender({ SMS_PROVIDER_API_KEY: apiKey }, jest.fn())
    expect(sender.allowsCountry('+33612345678')).toBe(true)
    expect(sender.allowsCountry('+32475123456')).toBe(false)
  })

  it('un indicatif d’un seul chiffre est ignoré : « 3 » n’ouvre pas la moitié de l’Europe', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const sender = createSmsSender({ SMS_PROVIDER_API_KEY: apiKey, SMS_ALLOWED_COUNTRY_CODES: '3' }, jest.fn())
    expect(sender.allowsCountry('+39123456789')).toBe(false)
    await expect(sender.send({ to: '+39123456789', text: 'test' })).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('le port inerte ne laisse passer aucun pays', () => {
    expect(createSmsSender({}, jest.fn()).allowsCountry('+33612345678')).toBe(false)
  })
})
