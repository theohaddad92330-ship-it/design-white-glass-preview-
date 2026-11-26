import {
  LinkedInTimeoutError,
  UnipileHttpTransport,
  UnipileLinkedInSender,
  type LinkedInTransport,
} from './linkedin-sender'

const input = { userId: 'u1', recipientRef: 'https://www.linkedin.com/in/demo-prenom/', body: 'corps-de-test' }
const KEY = 'cle-fournisseur-de-test'
const DSN = 'api1.example.invalid:13111'
const open = { apiKey: KEY, dsn: DSN, accountRefOf: async () => 'compte-1' }

function throwingTransport(): LinkedInTransport & { send: jest.Mock } {
  return {
    send: jest.fn(() => {
      throw new Error('appel réseau interdit')
    }),
  }
}

describe('UnipileLinkedInSender — no-op strict', () => {
  it('sans clé fournisseur : zéro appel réseau, voie non ouverte', async () => {
    const transport = throwingTransport()
    const sender = new UnipileLinkedInSender({ ...open, apiKey: undefined, transport })
    await expect(sender.send(input)).resolves.toEqual({ kind: 'not_open' })
    expect(transport.send).not.toHaveBeenCalled()
  })

  it('clé vide ou blanche, adresse du fournisseur absente ou suspecte : même chose', async () => {
    const transport = throwingTransport()
    const configs = [
      { ...open, apiKey: '' },
      { ...open, apiKey: '   ' },
      { ...open, dsn: undefined },
      { ...open, dsn: 'evil.example/path' },
      { ...open, dsn: 'user@evil.example' },
    ]
    for (const cfg of configs) {
      const sender = new UnipileLinkedInSender({ ...cfg, transport })
      await expect(sender.send(input)).resolves.toEqual({ kind: 'not_open' })
      expect(sender.isOpen()).toBe(false)
    }
    expect(transport.send).not.toHaveBeenCalled()
  })

  it('clé posée mais aucun transport : voie non ouverte, rien n’est deviné', async () => {
    const sender = new UnipileLinkedInSender({ ...open, transport: null })
    await expect(sender.send(input)).resolves.toEqual({ kind: 'not_open' })
  })

  it('clé posée mais compte LinkedIn du client non relié au fournisseur : non ouvert, zéro appel', async () => {
    const transport = throwingTransport()
    const sender = new UnipileLinkedInSender({ ...open, accountRefOf: async () => null, transport })
    await expect(sender.send(input)).resolves.toEqual({ kind: 'not_open' })
    await expect(sender.isOpenFor('u1')).resolves.toBe(false)
    expect(transport.send).not.toHaveBeenCalled()
  })

  it('sans résolveur de compte : non ouvert (aucun compte relié ne se devine)', async () => {
    const transport = throwingTransport()
    const sender = new UnipileLinkedInSender({ apiKey: KEY, dsn: DSN, transport })
    await expect(sender.send(input)).resolves.toEqual({ kind: 'not_open' })
    expect(transport.send).not.toHaveBeenCalled()
  })

  it('isOpen() / isOpenFor() disent la vérité sans rien appeler', async () => {
    const transport = throwingTransport()
    expect(new UnipileLinkedInSender({ ...open, apiKey: undefined, transport }).isOpen()).toBe(false)
    const sender = new UnipileLinkedInSender({ ...open, transport })
    expect(sender.isOpen()).toBe(true)
    await expect(sender.isOpenFor('u1')).resolves.toBe(true)
    expect(transport.send).not.toHaveBeenCalled()
  })
})

describe('UnipileLinkedInSender — voie ouverte (transport de test)', () => {
  it('un envoi réussi porte sa preuve et reçoit le profil lu dans l’adresse, jamais l’adresse brute', async () => {
    const transport = { send: jest.fn().mockResolvedValue({ messageRef: 'ref-1' }) }
    const out = await new UnipileLinkedInSender({ ...open, transport }).send(input)
    expect(out).toEqual({ kind: 'sent', proof: 'ref-1' })
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ accountRef: 'compte-1', publicIdentifier: 'demo-prenom', body: 'corps-de-test' }),
    )
  })

  it('une adresse de contact illisible : échec clair, aucun appel', async () => {
    const transport = throwingTransport()
    const out = await new UnipileLinkedInSender({ ...open, transport }).send({ ...input, recipientRef: '' })
    expect(out.kind).toBe('failed')
    expect(transport.send).not.toHaveBeenCalled()
  })

  it('un timeout est « unknown », jamais un échec ni un succès', async () => {
    const transport = { send: jest.fn().mockRejectedValue(new LinkedInTimeoutError()) }
    await expect(new UnipileLinkedInSender({ ...open, transport }).send(input)).resolves.toEqual({ kind: 'unknown' })
  })

  it('un refus du fournisseur est une erreur claire, sans la clé ni le corps', async () => {
    const transport = { send: jest.fn().mockRejectedValue(new Error(`403 ${KEY} corps-de-test`)) }
    const out = await new UnipileLinkedInSender({ ...open, transport }).send(input)
    expect(out.kind).toBe('failed')
    expect(JSON.stringify(out)).not.toContain(KEY)
    expect(JSON.stringify(out)).not.toContain('corps-de-test')
  })
})

describe('UnipileHttpTransport — le contrat documenté (fetch simulé)', () => {
  const args = { apiKey: KEY, dsn: DSN, accountRef: 'compte-1', publicIdentifier: 'demo-prenom', body: 'corps-de-test' }
  const json = (status: number, data: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  })

  it('résout le profil (GET /users/{id}) puis démarre le chat (POST /chats), clé en en-tête X-API-KEY', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json(200, { provider_id: 'ACoAAA-id' }))
      .mockResolvedValueOnce(json(201, { object: 'ChatStarted', chat_id: 'c1', message_id: 'm1' }))
    const out = await new UnipileHttpTransport(fetchImpl as never).send(args)
    expect(out).toEqual({ messageRef: 'm1' })
    const [lookupUrl, lookupInit] = fetchImpl.mock.calls[0]
    expect(lookupUrl).toBe(`https://${DSN}/api/v1/users/demo-prenom?account_id=compte-1`)
    expect(lookupInit.headers['X-API-KEY']).toBe(KEY)
    const [chatUrl, chatInit] = fetchImpl.mock.calls[1]
    expect(chatUrl).toBe(`https://${DSN}/api/v1/chats`)
    expect(chatInit.method).toBe('POST')
    expect(chatInit.headers['X-API-KEY']).toBe(KEY)
    const form = chatInit.body as FormData
    expect(form.get('account_id')).toBe('compte-1')
    expect(form.get('attendees_ids')).toBe('ACoAAA-id')
    expect(form.get('text')).toBe('corps-de-test')
  })

  it('res.ok est vérifié : un 4xx du fournisseur est une erreur, jamais un succès supposé', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(json(404, {}))
    await expect(new UnipileHttpTransport(fetchImpl as never).send(args)).rejects.toThrow()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('un refus à l’envoi (relation absente, 422) est une erreur, pas un timeout', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json(200, { provider_id: 'ACoAAA-id' }))
      .mockResolvedValueOnce(json(422, {}))
    const err = await new UnipileHttpTransport(fetchImpl as never).send(args).catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(LinkedInTimeoutError)
  })

  it('une coupure pendant le POST est « timeout » (le message est peut-être parti) ; pendant la lecture du profil, non', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'TimeoutError' })
    const duringPost = jest
      .fn()
      .mockResolvedValueOnce(json(200, { provider_id: 'ACoAAA-id' }))
      .mockRejectedValueOnce(abort)
    await expect(new UnipileHttpTransport(duringPost as never).send(args)).rejects.toBeInstanceOf(LinkedInTimeoutError)
    const duringLookup = jest.fn().mockRejectedValueOnce(abort)
    const err = await new UnipileHttpTransport(duringLookup as never).send(args).catch(e => e)
    expect(err).not.toBeInstanceOf(LinkedInTimeoutError)
  })

  it('un 201 sans identifiant de message est un envoi non prouvé : timeout, jamais « sent »', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json(200, { provider_id: 'ACoAAA-id' }))
      .mockResolvedValueOnce(json(201, { object: 'ChatStarted' }))
    await expect(new UnipileHttpTransport(fetchImpl as never).send(args)).rejects.toBeInstanceOf(LinkedInTimeoutError)
  })
})
