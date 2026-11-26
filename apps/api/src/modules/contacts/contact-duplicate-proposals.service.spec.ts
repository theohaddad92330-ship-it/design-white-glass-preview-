import { ContactsService } from './contacts.service'

/** #4114 — la lecture PROPOSE et n'écrit jamais ; hors périmètre, réponse vide. */
describe('#4114 — ContactsService.duplicateProposals', () => {
  function build(inScope = true, extraRows: Record<string, unknown>[] = []) {
    const rows = [
      { id: 'b', account_id: 'acc', full_name: 'JF Martin', email: null, phone: null, linkedin_url: null, title: null },
      {
        id: 'a',
        account_id: 'acc',
        full_name: 'Jean-François Martin',
        email: 'jf@acme.fr',
        phone: '+33102030405',
        linkedin_url: null,
        title: 'DSI',
      },
      ...extraRows,
    ]
    // Seule `find` existe : tout `save`/`update`/`delete` lèverait un TypeError.
    const contacts = { find: jest.fn().mockResolvedValue(rows) }
    const accounts = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(inScope ? 1 : 0),
      })),
    }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws' }) }
    const args: unknown[] = new Array(20).fill({})
    args[0] = contacts
    args[4] = workspaceContext
    args[9] = accounts
    for (let i = 15; i < 20; i++) args[i] = undefined
    const service = new ContactsService(...(args as ConstructorParameters<typeof ContactsService>))
    return { service, contacts }
  }

  it('propose la paire, coordonnées en clair, sans rien écrire', async () => {
    const { service, contacts } = build()
    const { pairs } = await service.duplicateProposals('acc', 'u', null)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.left.email).toBe('jf@acme.fr')
    expect(pairs[0]?.left.phone).toBe('+33102030405')
    expect(pairs[0]?.reasons.length).toBeGreaterThan(0)
    expect(Object.keys(contacts)).toEqual(['find'])
  })

  it('hors périmètre BU : réponse vide, aucune lecture de contacts', async () => {
    const { service, contacts } = build(false)
    expect(await service.duplicateProposals('acc', 'u', { businessUnitIds: ['x'], includeUnassigned: true })).toEqual({
      pairs: [],
      shared_email_groups: [],
    })
    expect(contacts.find).not.toHaveBeenCalled()
  })

  it('#4600 — huit fiches, une adresse non vérifiée : UN bloc nommé avec sa raison, aucune paire de fusion', async () => {
    const names = [
      'Alice Bernard',
      'Hugo Lambert',
      'Zoé Petit',
      'Marc Roux',
      'Lina Fabre',
      'Omar Benali',
      'Sara Collin',
      'Paul Meyer',
    ]
    const extra = names.map((full_name, i) => ({
      id: `s${i}`,
      account_id: 'acc',
      full_name,
      email: 'partage.interne@exemple-societe.test',
      email_verified: false,
      phone: null,
      linkedin_url: null,
      title: null,
    }))
    const { service } = build(true, extra)
    const out = await service.duplicateProposals('acc', 'u', null)
    expect(out.pairs.every(pair => !pair.reasons.includes('même e-mail'))).toBe(true)
    expect(out.shared_email_groups).toHaveLength(1)
    expect(out.shared_email_groups[0]).toEqual(
      expect.objectContaining({ email: 'partage.interne@exemple-societe.test', reason: 'unverified' }),
    )
    expect(out.shared_email_groups[0]?.contacts).toHaveLength(8)
  })
})

/** #4114.4 — DROITS : la liste des paires suit la fiche contact (même borne d'ESPACE sur la lecture des contacts). */
describe('#4114.4 — ContactsService.duplicateProposals — borne d’espace', () => {
  it('lit les contacts bornés au workspace_id de l’appelant (un autre espace ne ramène aucune ligne)', async () => {
    const find = jest.fn().mockResolvedValue([])
    const args: unknown[] = new Array(20).fill({})
    args[0] = { find }
    args[4] = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-appelant' }) }
    for (let i = 15; i < 20; i++) args[i] = undefined
    const service = new ContactsService(...(args as ConstructorParameters<typeof ContactsService>))
    const out = await service.duplicateProposals('acc', 'u', null)
    expect(out.pairs).toEqual([])
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ account_id: 'acc', workspace_id: 'ws-appelant' }) }),
    )
  })
})
