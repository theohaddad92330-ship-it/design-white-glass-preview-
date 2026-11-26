import { ContactsService } from './contacts.service'

/**
 * #2120.48 — décision Louis 18/09/2026 : « Confronter avec mon CRM » lit le
 * DERNIER INSTANTANÉ déjà en base — aucun appel live, tous les fournisseurs
 * (`crm_connections` ne distingue jamais lequel). Une confrontation est une
 * LECTURE : elle propose des paires CRM↔Bellum, elle ne fusionne jamais.
 *
 * CE QUE CES TESTS SAVENT DIRE NON :
 *   1. aucun CRM branché (table `crm_connections` vide pour l'espace) → le
 *      résultat le DIT (`connected: false`), jamais un tableau vide qui se
 *      lirait « 0 écart » ;
 *   2. hors périmètre BU de l'appelant → réponse vide honnête, comme
 *      `findByAccount`, jamais un refus qui confirmerait que le compte existe ;
 *   3. aucun contact jamais rapproché (`crm_synced_at` NULL partout) →
 *      `snapshotAt: null`, jamais une date inventée ;
 *   4. le résultat ne contient QUE des paires CRM↔Bellum (jamais deux fiches
 *      du même côté) — délégué à `findConfrontationPairs`, déjà testé à part.
 */
describe('#2120.48 — ContactsService.crmConfrontation', () => {
  const ACCOUNT = 'acc-1'
  const USER = 'u-1'
  const WORKSPACE = 'ws-1'

  function build(options: {
    connection?: { id: string } | null
    rows?: Array<{
      id: string
      full_name: string | null
      email: string | null
      source: string | null
      crm_synced_at: Date | null
    }>
    inScope?: boolean
    /** #4680 — la date posée par `record_import_marks` ; `null` = aucune trace. */
    importedAt?: Date | null
  }) {
    const query = jest.fn().mockResolvedValue([{ imported_at: options.importedAt ?? null }])
    const contacts = { find: jest.fn().mockResolvedValue(options.rows ?? []), manager: { query } }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }) }
    const accounts = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(options.inScope === false ? 0 : 1),
      })),
    }
    const crmConnections = {
      findOne: jest.fn().mockResolvedValue(options.connection === undefined ? { id: 'conn-1' } : options.connection),
    }
    // Les dix-sept autres dépendances ne sont pas touchées par ce chemin : il
    // lit les connexions CRM et les contacts du compte, il n'écrit rien.
    const service = new ContactsService(
      contacts as never,
      {} as never,
      {} as never,
      {} as never,
      workspaceContext as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      accounts as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      crmConnections as never,
    )
    return { service, contacts, crmConnections, query }
  }

  it('SAIT DIRE NON — aucun CRM branché : `connected: false`, jamais un tableau vide muet', async () => {
    const { service } = build({ connection: null })
    const result = await service.crmConfrontation(ACCOUNT, USER, null)
    expect(result).toEqual({ connected: false, snapshotAt: null, pairs: [] })
  })

  it('SAIT DIRE NON — compte hors périmètre BU : réponse vide honnête, jamais un refus', async () => {
    const { service, contacts } = build({ inScope: false })
    const result = await service.crmConfrontation(ACCOUNT, USER, { businessUnitIds: ['bu-2'], includeUnassigned: true })
    expect(result).toEqual({ connected: false, snapshotAt: null, pairs: [] })
    expect(contacts.find).not.toHaveBeenCalled()
  })

  it('CRM branché, jamais rapproché : `snapshotAt: null` — jamais une date devinée', async () => {
    const { service } = build({
      rows: [{ id: 'c-1', full_name: 'Sandrine Pata', email: null, source: 'ai_generated', crm_synced_at: null }],
    })
    const result = await service.crmConfrontation(ACCOUNT, USER, null)
    expect(result.connected).toBe(true)
    expect(result.snapshotAt).toBeNull()
  })

  it("l'instantané est le PLUS RÉCENT `crm_synced_at` du compte", async () => {
    const older = new Date('2026-09-01T00:00:00.000Z')
    const newer = new Date('2026-09-17T00:00:00.000Z')
    const { service } = build({
      rows: [
        { id: 'c-1', full_name: 'A', email: null, source: 'crm', crm_synced_at: older },
        { id: 'c-2', full_name: 'B', email: null, source: 'ai_generated', crm_synced_at: newer },
      ],
    })
    const result = await service.crmConfrontation(ACCOUNT, USER, null)
    expect(result.snapshotAt).toBe(newer.toISOString())
  })

  it('propose une paire CRM↔Bellum sur la même adresse, jamais une fusion', async () => {
    const { service } = build({
      rows: [
        {
          id: 'crm-1',
          full_name: 'S. Pata',
          email: 'sandrine.pata@example.com',
          source: 'crm',
          crm_synced_at: new Date(),
        },
        {
          id: 'b-1',
          full_name: 'Sandrine Pata',
          email: 'sandrine.pata@example.com',
          source: 'ai_generated',
          crm_synced_at: null,
        },
      ],
    })
    const result = await service.crmConfrontation(ACCOUNT, USER, null)
    expect(result.pairs).toEqual([
      {
        crmContact: { id: 'crm-1', fullName: 'S. Pata', email: 'sandrine.pata@example.com' },
        bellumContact: { id: 'b-1', fullName: 'Sandrine Pata', email: 'sandrine.pata@example.com' },
        reason: 'same_email',
        confidence: 0.95,
      },
    ])
  })

  it('SAIT DIRE NON — deux fiches CRM ne sont jamais rapprochées entre elles', async () => {
    const { service } = build({
      rows: [
        { id: 'crm-1', full_name: 'Sandrine Pata', email: 'x@example.com', source: 'crm', crm_synced_at: new Date() },
        { id: 'crm-2', full_name: 'Sandrine Pata', email: 'x@example.com', source: 'crm', crm_synced_at: new Date() },
      ],
    })
    const result = await service.crmConfrontation(ACCOUNT, USER, null)
    expect(result.pairs).toEqual([])
  })

  // ── #4680 — un instantané IMPORTÉ en base est confronté, sans connecteur live ─────────────────────
  describe('#4680 — sans connecteur, avec des contacts importés', () => {
    const imported = (id: string, name: string, email: string | null) => ({
      id,
      full_name: name,
      email,
      source: 'import',
      crm_synced_at: null,
    })
    const found = (id: string, name: string, email: string | null) => ({
      id,
      full_name: name,
      email,
      source: 'apollo',
      crm_synced_at: null,
    })

    it("confronte l'instantané importé et DIT sa date (celle de l'import)", async () => {
      const importedAt = new Date('2026-10-20T08:00:00.000Z')
      const { service } = build({
        connection: null,
        importedAt,
        rows: [
          imported('i-1', 'Didier Montandon', 'd@vicat.example'),
          found('b-1', 'Didier Montandon', 'd@vicat.example'),
        ],
      })
      const result = await service.crmConfrontation(ACCOUNT, USER, null)
      expect(result.connected).toBe(false)
      expect(result.imported).toBe(true)
      expect(result.snapshotAt).toBe(importedAt.toISOString())
      expect(result.pairs).toHaveLength(1)
      expect(result.pairs[0]?.crmContact.id).toBe('i-1')
    })

    it('SAIT DIRE NON — import sans trace de date : `snapshotAt: null`, jamais une date devinée', async () => {
      const { service } = build({ connection: null, importedAt: null, rows: [imported('i-1', 'Didier', null)] })
      const result = await service.crmConfrontation(ACCOUNT, USER, null)
      expect(result.imported).toBe(true)
      expect(result.snapshotAt).toBeNull()
    })

    it('SAIT DIRE NON — ni connecteur ni contact importé : la réponse vide d’avant, mot pour mot', async () => {
      const { service, query } = build({ connection: null, rows: [found('b-1', 'Inconnu', null)] })
      const result = await service.crmConfrontation(ACCOUNT, USER, null)
      expect(result).toEqual({ connected: false, snapshotAt: null, pairs: [] })
      expect(query).not.toHaveBeenCalled()
    })

    it('un compte importé jamais rapproché ne dit pas « 0 écart » : `imported` est vrai, les paires sont vides', async () => {
      const { service } = build({ connection: null, rows: [imported('i-1', 'Didier', null)] })
      const result = await service.crmConfrontation(ACCOUNT, USER, null)
      expect(result.imported).toBe(true)
      expect(result.pairs).toEqual([])
    })

    it('avec un connecteur, un contact importé est aussi du côté CRM', async () => {
      const { service } = build({
        rows: [imported('i-1', 'Sandrine Pata', 'sp@example.com'), found('b-1', 'S. Pata', 'sp@example.com')],
      })
      const result = await service.crmConfrontation(ACCOUNT, USER, null)
      expect(result.connected).toBe(true)
      expect(result.pairs[0]?.crmContact.id).toBe('i-1')
    })
  })
})
