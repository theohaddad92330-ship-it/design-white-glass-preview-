import { DuplicatesSweeper } from './duplicates.sweeper'
import type { GovernanceService } from './governance.service'

/**
 * Ce qui remplit la liste des doublons.
 *
 * L'écran existait au complet ; son PRODUCTEUR n'était appelé de nulle part, si
 * bien que la liste restait vide pour toujours — ce qui se lit « aucun doublon »
 * et non « personne ne cherche ». Ces tests verrouillent le producteur, pas la
 * détection : celle-ci est déjà testée dans `crm-duplicates`.
 */

type QueryStub = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>

function contact(id: string, name: string, email: string | null, company: string | null) {
  return { id, name, email, company }
}

function build(options: {
  workspaces?: { workspace_id: string }[]
  contacts?: unknown[]
  accounts?: unknown[]
  demoWorkspace?: boolean
  /** `pair_key` déjà en base (en attente OU tranchées), par type d'entité. */
  knownKeys?: { account?: string[]; contact?: string[] }
}) {
  const query: QueryStub = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('is_demo FROM workspaces')) return [{ is_demo: options.demoWorkspace === true }]
    if (sql.includes('pair_key FROM duplicate_pairs')) {
      const kind = params?.[1] === 'account' ? 'account' : 'contact'
      return (options.knownKeys?.[kind] ?? []).map(pair_key => ({ pair_key }))
    }
    if (sql.includes('DISTINCT')) return options.workspaces ?? [{ workspace_id: 'ws-1' }]
    if (sql.includes('company_name AS name')) return options.accounts ?? []
    return options.contacts ?? []
  })
  const repo = { manager: { query } } as never
  const proposeDuplicates = jest.fn().mockImplementation(async (_ws: string, pairs: unknown[]) => pairs.length)
  const governance = { proposeDuplicates } as unknown as GovernanceService
  return { sweeper: new DuplicatesSweeper(repo, governance), proposeDuplicates, query }
}

describe('balayeur de doublons', () => {
  afterEach(() => {
    delete process.env.DUPLICATES_SWEEP_DISABLED
  })

  it('ne propose rien quand l’interrupteur d’urgence est posé', async () => {
    process.env.DUPLICATES_SWEEP_DISABLED = 'true'
    const { sweeper, proposeDuplicates } = build({})
    await expect(sweeper.sweep()).resolves.toBe(0)
    expect(proposeDuplicates).not.toHaveBeenCalled()
  })

  it('propose une paire sur adresse identique', async () => {
    const { sweeper, proposeDuplicates } = build({
      contacts: [
        contact('a', 'Marie Dupont', 'marie@acme.example', 'ACME'),
        contact('b', 'M. Dupont', 'marie@acme.example', 'ACME'),
      ],
    })
    await expect(sweeper.sweep()).resolves.toBe(1)
    expect(proposeDuplicates).toHaveBeenCalledWith('ws-1', [
      expect.objectContaining({ entityType: 'contact', reason: 'same_email' }),
    ])
  })

  it('ne rapproche JAMAIS deux homonymes chez deux sociétés différentes', async () => {
    // La pire erreur possible dans un CRM commercial : la règle vit dans le
    // détecteur pur, et ce test vérifie que le balayeur ne la contourne pas.
    const { sweeper, proposeDuplicates } = build({
      contacts: [
        contact('a', 'Martin Dupont', 'martin@acme.example', 'ACME'),
        contact('b', 'Martin Dupont', 'martin@globex.example', 'Globex'),
      ],
    })
    await expect(sweeper.sweep()).resolves.toBe(0)
    expect(proposeDuplicates).not.toHaveBeenCalled()
  })

  it('ne compare rien en dessous de deux fiches', async () => {
    const { sweeper, proposeDuplicates } = build({
      contacts: [contact('a', 'Marie Dupont', 'marie@acme.example', 'ACME')],
    })
    await expect(sweeper.sweep()).resolves.toBe(0)
    expect(proposeDuplicates).not.toHaveBeenCalled()
  })

  it('écarte les fiches supprimées, masquées ou anonymisées', async () => {
    // Proposer de fusionner un contact anonymisé ferait ressortir à l'écran
    // quelqu'un qu'on venait justement d'effacer.
    const { sweeper, query } = build({})
    await sweeper.sweep()
    const contactSql = query.mock.calls.map(call => String(call[0])).find(sql => sql.includes('full_name'))
    expect(contactSql).toContain('deleted_at IS NULL')
    expect(contactSql).toContain('hidden = false')
    expect(contactSql).toContain('anonymized_at IS NULL')
  })

  it('ignore les espaces de démonstration', async () => {
    const { sweeper, query } = build({})
    await sweeper.sweep()
    const workspaceSql = String(query.mock.calls[0]![0])
    expect(workspaceSql).toContain('is_demo = false')
  })

  // #4471.7 — le coût mesuré sur le plus gros espace se lit au journal du cron : durée et fiches lues par espace.
  it('#4471.7 — journalise, par espace, la durée et le nombre de fiches lues', async () => {
    const { sweeper } = build({
      contacts: [
        contact('a', 'Marie Dupont', 'marie@acme.example', 'ACME'),
        contact('b', 'M. Dupont', 'marie@acme.example', 'ACME'),
      ],
    })
    const log = jest.spyOn((sweeper as unknown as { logger: { log: (...args: unknown[]) => void } }).logger, 'log')
    await sweeper.sweep()
    expect(log).toHaveBeenCalledWith(
      'Balayage des doublons — espace balayé',
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactsExamined: 2,
        durationMs: expect.any(Number),
      }),
    )
  })

  it('un espace en échec n’emporte pas les autres', async () => {
    const { sweeper, query, proposeDuplicates } = build({
      workspaces: [{ workspace_id: 'ws-1' }, { workspace_id: 'ws-2' }],
    })
    let call = 0
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('DISTINCT')) return [{ workspace_id: 'ws-1' }, { workspace_id: 'ws-2' }]
      call += 1
      if (call === 1) throw new Error('fiche illisible')
      return [
        contact('a', 'Marie Dupont', 'marie@acme.example', 'ACME'),
        contact('b', 'M. Dupont', 'marie@acme.example', 'ACME'),
      ]
    })
    await expect(sweeper.sweep()).resolves.toBe(1)
    expect(proposeDuplicates).toHaveBeenCalledTimes(1)
  })

  it('#3490 — propose DEUX comptes au nom quasi identique, sans jamais les fusionner', async () => {
    const { sweeper, proposeDuplicates } = build({
      accounts: [
        { id: 'a', name: 'Société Générale' },
        { id: 'b', name: 'Societe Generale' },
      ],
    })
    await expect(sweeper.sweep()).resolves.toBe(1)
    expect(proposeDuplicates).toHaveBeenCalledWith('ws-1', [
      expect.objectContaining({ entityType: 'account', leftId: 'a', rightId: 'b' }),
    ])
  })

  it('#3490 — SAIT DIRE NON : « ACME » et « ACME Services » ne sont pas proposés', async () => {
    const { sweeper, proposeDuplicates } = build({
      accounts: [
        { id: 'a', name: 'ACME' },
        { id: 'b', name: 'ACME Services' },
      ],
    })
    await expect(sweeper.sweep()).resolves.toBe(0)
    expect(proposeDuplicates).not.toHaveBeenCalled()
  })

  it('#3490 — la lecture des comptes exclut les dossiers déjà rattachés ou archivés', async () => {
    const { sweeper, query } = build({})
    await sweeper.sweep()
    const read = query.mock.calls.map(([sql]) => sql).find(sql => sql.includes('company_name AS name'))
    // Écartés du rapprochement par le drapeau `set_aside` (comptés dans le rapport).
    expect(read).toContain('merged_into_id IS NOT NULL')
    expect(read).toContain("= 'archived'")
    expect(read).toContain('AS set_aside')
  })

  it('#3490 (recette Y9) — une lecture de contacts en échec n’empêche JAMAIS les comptes d’être proposés', async () => {
    const { sweeper, query, proposeDuplicates } = build({
      accounts: [
        { id: 'a', name: 'Société Générale' },
        { id: 'b', name: 'Societe Generale' },
      ],
    })
    const original = query.getMockImplementation()!
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM contacts c') && sql.includes('c.hidden')) throw new Error('colonne illisible')
      return original(sql, params)
    })
    await expect(sweeper.sweep()).resolves.toBe(1)
    expect(proposeDuplicates).toHaveBeenCalledWith('ws-1', [
      expect.objectContaining({ entityType: 'account', leftId: 'a', rightId: 'b' }),
    ])
  })

  it('#3490 (recette Y9) — une panne à la lecture ne fige pas le balayage pour 5 minutes', async () => {
    const accounts = [
      { id: 'a', name: 'Société Générale' },
      { id: 'b', name: 'Societe Generale' },
    ]
    const made = build({ accounts })
    const original = made.query.getMockImplementation()!
    let down = true
    made.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (down && sql.includes('company_name AS name')) throw new Error('db down')
      return original(sql, params)
    })
    await made.sweeper.refreshWorkspace('ws-1')
    expect(made.proposeDuplicates).not.toHaveBeenCalled()
    down = false
    await made.sweeper.refreshWorkspace('ws-1')
    expect(made.proposeDuplicates).toHaveBeenCalledTimes(1)
  })

  describe('à la lecture de la liste (#3490)', () => {
    const sg = [
      { id: '0125b778', name: 'Société Générale' },
      { id: '8b25ec87', name: 'Societe Generale' },
    ]

    function buildForUser(accounts: unknown[], demoWorkspace = false) {
      const made = build({ accounts, demoWorkspace })
      const sweeper = new DuplicatesSweeper(
        { manager: { query: made.query } } as never,
        { proposeDuplicates: made.proposeDuplicates } as unknown as GovernanceService,
      )
      return { ...made, sweeper }
    }

    it('propose « Société Générale » / « Societe Generale » sans attendre le cron de 05:40', async () => {
      const { sweeper, proposeDuplicates } = buildForUser(sg)
      await sweeper.refreshWorkspace('ws-1')
      expect(proposeDuplicates).toHaveBeenCalledWith('ws-1', [
        expect.objectContaining({ entityType: 'account', leftId: '0125b778', rightId: '8b25ec87' }),
      ])
    })

    it('ne relance pas le balayage à chaque lecture (bornée dans le temps)', async () => {
      const { sweeper, query } = buildForUser(sg)
      await sweeper.refreshWorkspace('ws-1')
      const calls = query.mock.calls.length
      await sweeper.refreshWorkspace('ws-1')
      expect(query.mock.calls.length).toBe(calls)
    })

    // #3490 — « désarchiver la fiche SG » doit faire apparaître la paire TOUT DE
    // SUITE : la fenêtre de 5 minutes ne s'applique pas à un geste qui vient de
    // changer les comptes comparés.
    it('#3490 — `force` rebalaie malgré la fenêtre de 5 minutes', async () => {
      const { sweeper, query } = buildForUser(sg)
      await sweeper.refreshWorkspace('ws-1')
      const calls = query.mock.calls.length
      await sweeper.refreshWorkspace('ws-1', { force: true })
      expect(query.mock.calls.length).toBeGreaterThan(calls)
    })

    it('#3490 — `force` ne lève JAMAIS le garde-fou de la démonstration', async () => {
      const { sweeper, proposeDuplicates } = buildForUser(sg, true)
      await sweeper.refreshWorkspace('ws-1', { force: true })
      expect(proposeDuplicates).not.toHaveBeenCalled()
    })

    it('n’écrit jamais dans un espace de démonstration', async () => {
      const { sweeper, proposeDuplicates } = buildForUser(sg, true)
      await sweeper.refreshWorkspace('ws-1')
      expect(proposeDuplicates).not.toHaveBeenCalled()
    })

    it('une panne du balayage ne casse pas la lecture de la liste', async () => {
      const { sweeper, query } = buildForUser(sg)
      query.mockRejectedValue(new Error('db down'))
      await expect(sweeper.refreshWorkspace('ws-1')).resolves.toMatchObject({ failed: true })
    })

    // #3490 (recette Y13) — « Aucun doublon en attente » ne distinguait pas
    // « rien à signaler » de « personne n'a regardé ». Le balayage RAPPORTE.
    it('rapporte ce qu’il a examiné : comptes, contacts, paires, déjà connues', async () => {
      const made = build({ accounts: sg, knownKeys: { account: ['0125b778:8b25ec87'] } }) // déjà tranchée
      const sweeper = new DuplicatesSweeper(
        { manager: { query: made.query } } as never,
        { proposeDuplicates: made.proposeDuplicates } as unknown as GovernanceService,
      )
      const scan = await sweeper.refreshWorkspace('ws-1')
      expect(scan).toMatchObject({
        accountsExamined: 2,
        contactsExamined: 0,
        pairsDetected: 1,
        alreadyKnown: 1,
        failed: false,
      })
    })

    it('#3490 — un compte archivé ou rattaché est laissé de côté ET le rapport le dit', async () => {
      const made = build({
        accounts: [
          { id: '0125b778', name: 'Société Générale', set_aside: false },
          { id: '8b25ec87', name: 'Societe Generale', set_aside: true },
          { id: 'c', name: 'Orange', set_aside: false },
        ],
      })
      const sweeper = new DuplicatesSweeper(
        { manager: { query: made.query } } as never,
        { proposeDuplicates: made.proposeDuplicates } as unknown as GovernanceService,
      )
      const scan = await sweeper.refreshWorkspace('ws-1')
      expect(scan).toMatchObject({ accountsExamined: 2, accountsSetAside: 1, pairsDetected: 0 })
      expect(made.proposeDuplicates).not.toHaveBeenCalled()
    })

    it('#3490 (Y22) — le rapport NOMME les comptes écartés et la paire écartée, avec leur statut', async () => {
      const made = build({
        accounts: [
          { id: '0125b778', name: 'Société Générale', set_aside: false },
          { id: '8b25ec87', name: 'Societe Generale', set_aside: true },
          { id: '99', name: 'Ancienne Filiale', set_aside: true, merged: true },
        ],
      })
      const sweeper = new DuplicatesSweeper(
        { manager: { query: made.query } } as never,
        { proposeDuplicates: made.proposeDuplicates } as unknown as GovernanceService,
      )
      const scan = await sweeper.refreshWorkspace('ws-1')
      expect(scan?.setAsideAccounts).toEqual([
        { id: '8b25ec87', name: 'Societe Generale', status: 'archived' },
        { id: '99', name: 'Ancienne Filiale', status: 'merged' },
      ])
      expect(scan?.setAsidePairs).toEqual([
        {
          left: { id: '0125b778', name: 'Société Générale', status: 'active' },
          right: { id: '8b25ec87', name: 'Societe Generale', status: 'archived' },
        },
      ])
      // On PROPOSE, on ne fusionne jamais : une paire écartée n'est PAS écrite.
      expect(made.proposeDuplicates).not.toHaveBeenCalled()
    })

    it('#3490 — les deux graphies actives de Société Générale se PROPOSENT, variantes de saisie comprises', async () => {
      const made = build({
        accounts: [
          { id: '0125b778', name: 'Société Générale S.A.', set_aside: false },
          { id: '8b25ec87', name: 'Societe Generale', set_aside: false },
        ],
      })
      const sweeper = new DuplicatesSweeper(
        { manager: { query: made.query } } as never,
        { proposeDuplicates: made.proposeDuplicates } as unknown as GovernanceService,
      )
      const scan = await sweeper.refreshWorkspace('ws-1')
      expect(scan).toMatchObject({ accountsExamined: 2, accountsSetAside: 0, pairsDetected: 1 })
      expect(made.proposeDuplicates).toHaveBeenCalledTimes(1)
    })

    it('un périmètre illisible est NON MESURÉ (null), jamais 0', async () => {
      const made = build({ accounts: sg })
      made.query.mockImplementation(async (sql: string) => {
        if (sql.includes('is_demo FROM workspaces')) return [{ is_demo: false }]
        if (sql.includes('company_name AS name')) return sg
        if (sql.includes('pair_key FROM duplicate_pairs')) return []
        throw new Error('contacts illisibles')
      })
      const sweeper = new DuplicatesSweeper(
        { manager: { query: made.query } } as never,
        { proposeDuplicates: made.proposeDuplicates } as unknown as GovernanceService,
      )
      const scan = await sweeper.refreshWorkspace('ws-1')
      expect(scan).toMatchObject({ accountsExamined: 2, contactsExamined: null, failed: true })
    })

    it('dans la fenêtre de 5 minutes, rend le DERNIER rapport au lieu de rien', async () => {
      const { sweeper } = buildForUser(sg)
      const first = await sweeper.refreshWorkspace('ws-1')
      const second = await sweeper.refreshWorkspace('ws-1')
      expect(second).toEqual(first)
      expect(first).not.toBeNull()
    })

    // #3490 (recette Y18) — un balayage NON LANCÉ rendait `null` : l'écran n'avait
    // alors rien à nommer et écrivait « Aucun doublon en attente. » seul. Il rend
    // désormais un rapport qui dit POURQUOI rien n'a été examiné.
    it('un espace de démonstration rend un rapport « non balayé : demo », jamais null', async () => {
      const { sweeper } = buildForUser(sg, true)
      await expect(sweeper.refreshWorkspace('ws-1')).resolves.toMatchObject({
        skipped: 'demo',
        accountsExamined: null,
        contactsExamined: null,
        failed: false,
      })
    })

    it('l’interrupteur d’urgence rend un rapport « non balayé : disabled », jamais null', async () => {
      process.env.DUPLICATES_SWEEP_DISABLED = 'true'
      const { sweeper } = buildForUser(sg, false)
      await expect(sweeper.refreshWorkspace('ws-1')).resolves.toMatchObject({
        skipped: 'disabled',
        accountsExamined: null,
        failed: false,
      })
    })

    // #3490 — LA FAMINE. Le plafond de 25 paires s'appliquait AVANT de retirer ce
    // que la base connaît déjà : dès que les 25 premières paires détectées étaient
    // déjà en base (en attente ou tranchées), plus aucune paire neuve n'était
    // jamais proposée — « Aucun doublon en attente », à jamais.
    it('un plafond rempli par des paires DÉJÀ connues ne prive pas les paires neuves', async () => {
      const accounts = Array.from({ length: 30 }, (_v, i) => [
        { id: `a${String(i).padStart(2, '0')}`, name: `Société ${i}` },
        { id: `b${String(i).padStart(2, '0')}`, name: `Societe ${i}` },
      ]).flat()
      const known = Array.from(
        { length: 25 },
        (_v, i) => `a${String(i).padStart(2, '0')}:b${String(i).padStart(2, '0')}`,
      )
      const made = build({ accounts, knownKeys: { account: known } })
      const sweeper = new DuplicatesSweeper(
        { manager: { query: made.query } } as never,
        { proposeDuplicates: made.proposeDuplicates } as unknown as GovernanceService,
      )
      const scan = await sweeper.refreshWorkspace('ws-1')
      const proposedIds = made.proposeDuplicates.mock.calls[0]![1].map((p: { leftId: string }) => p.leftId)
      expect(proposedIds).toHaveLength(5)
      expect(proposedIds).toEqual(['a25', 'a26', 'a27', 'a28', 'a29'])
      expect(scan).toMatchObject({ pairsDetected: 30, alreadyKnown: 25 })
    })
  })
})

/**
 * #4016 L6 — ⚠️⚠️ RENVERSEMENT DATÉ de c37 (Louis 11/10/2026) : une paire à
 * confiance ≥ 0,99 est FUSIONNÉE par le balayeur, dans Bellum seulement,
 * réversible. En dessous, elle reste PROPOSÉE — et c'est ce que ces tests
 * tiennent autant que la fusion elle-même.
 */
describe('#4016 L6 — fusion automatique ≥ 0,99', () => {
  afterEach(() => {
    delete process.env.DUPLICATES_AUTO_MERGE_DISABLED
  })

  function dated(id: string, name: string, email: string | null, company: string | null, createdAt: string) {
    return { ...contact(id, name, email, company), created_at: createdAt }
  }

  function buildWithMerge(contacts: unknown[]) {
    const made = build({ contacts })
    const autoMergeContacts = jest.fn().mockImplementation(async (_ws: string, pairs: unknown[]) => pairs.length)
    const sweeper = new DuplicatesSweeper(
      { manager: { query: made.query } } as never,
      {
        proposeDuplicates: made.proposeDuplicates,
        autoMergeContacts,
      } as unknown as GovernanceService,
    )
    return { ...made, sweeper, autoMergeContacts }
  }

  it('même adresse ET même nom : la fiche la plus ANCIENNE absorbe l’autre, sans proposition', async () => {
    const { sweeper, autoMergeContacts, proposeDuplicates } = buildWithMerge([
      dated('new', 'Marie Dupont', 'marie@acme.example', 'ACME', '2026-09-01T00:00:00Z'),
      dated('old', 'Marie  Dupont', 'MARIE@acme.example', 'ACME', '2026-02-01T00:00:00Z'),
    ])
    const scan = await sweeper.refreshWorkspace('ws-1')
    expect(autoMergeContacts).toHaveBeenCalledWith('ws-1', [
      expect.objectContaining({ keptId: 'old', absorbedId: 'new', confidence: 0.99 }),
    ])
    expect(proposeDuplicates).not.toHaveBeenCalled()
    expect(scan).toMatchObject({ autoMerged: 1 })
  })

  it('une société absente d’un côté ne bloque pas la certitude', async () => {
    const { sweeper, autoMergeContacts } = buildWithMerge([
      dated('a', 'Marie Dupont', 'marie@acme.example', null, '2026-02-01T00:00:00Z'),
      dated('b', 'Marie Dupont', 'marie@acme.example', 'ACME', '2026-03-01T00:00:00Z'),
    ])
    await sweeper.refreshWorkspace('ws-1')
    expect(autoMergeContacts).toHaveBeenCalledTimes(1)
  })

  it('SAIT DIRE NON — même adresse, noms différents : 0,95, PROPOSÉE, jamais fusionnée', async () => {
    const { sweeper, autoMergeContacts, proposeDuplicates } = buildWithMerge([
      dated('a', 'Marie Dupont', 'marie@acme.example', 'ACME', '2026-02-01T00:00:00Z'),
      dated('b', 'M. Dupont', 'marie@acme.example', 'ACME', '2026-03-01T00:00:00Z'),
    ])
    await sweeper.refreshWorkspace('ws-1')
    expect(autoMergeContacts).not.toHaveBeenCalled()
    expect(proposeDuplicates).toHaveBeenCalledWith('ws-1', [expect.objectContaining({ confidence: 0.95 })])
  })

  it('SAIT DIRE NON — même nom à la même société SANS adresse commune : proposée (0,75)', async () => {
    const { sweeper, autoMergeContacts, proposeDuplicates } = buildWithMerge([
      dated('a', 'Marie Dupont', 'marie@acme.example', 'ACME', '2026-02-01T00:00:00Z'),
      dated('b', 'Marie Dupont', 'mdupont@acme.example', 'ACME', '2026-03-01T00:00:00Z'),
    ])
    await sweeper.refreshWorkspace('ws-1')
    expect(autoMergeContacts).not.toHaveBeenCalled()
    expect(proposeDuplicates).toHaveBeenCalledTimes(1)
  })

  it('SAIT DIRE NON — même adresse et même nom chez deux sociétés NOMMÉES différentes : proposée', async () => {
    const { sweeper, autoMergeContacts, proposeDuplicates } = buildWithMerge([
      dated('a', 'Marie Dupont', 'marie@acme.example', 'ACME', '2026-02-01T00:00:00Z'),
      dated('b', 'Marie Dupont', 'marie@acme.example', 'Globex', '2026-03-01T00:00:00Z'),
    ])
    await sweeper.refreshWorkspace('ws-1')
    expect(autoMergeContacts).not.toHaveBeenCalled()
    expect(proposeDuplicates).toHaveBeenCalledTimes(1)
  })

  it('l’interrupteur DUPLICATES_AUTO_MERGE_DISABLED rend la paire certaine à la PROPOSITION', async () => {
    process.env.DUPLICATES_AUTO_MERGE_DISABLED = 'true'
    const { sweeper, autoMergeContacts, proposeDuplicates } = buildWithMerge([
      dated('a', 'Marie Dupont', 'marie@acme.example', 'ACME', '2026-02-01T00:00:00Z'),
      dated('b', 'Marie Dupont', 'marie@acme.example', 'ACME', '2026-03-01T00:00:00Z'),
    ])
    await sweeper.refreshWorkspace('ws-1')
    expect(autoMergeContacts).not.toHaveBeenCalled()
    expect(proposeDuplicates).toHaveBeenCalledWith('ws-1', [expect.objectContaining({ confidence: 0.99 })])
  })

  it('la lecture des contacts rapporte leur date de création — c’est elle qui désigne la survivante', async () => {
    const { sweeper, query } = buildWithMerge([])
    await sweeper.refreshWorkspace('ws-1')
    const contactSql = query.mock.calls.map(call => String(call[0])).find(sql => sql.includes('full_name'))
    expect(contactSql).toMatch(/SELECT[\s\S]*c\.created_at[\s\S]*FROM contacts/)
  })
})

describe('#4016 L6 — fusion automatique de deux comptes de même SIREN (15/10/2026)', () => {
  afterEach(() => {
    delete process.env.DUPLICATES_AUTO_MERGE_DISABLED
  })

  function buildAccounts(accounts: unknown[], knownKeys?: string[]) {
    const made = build({ accounts, knownKeys: { account: knownKeys } })
    const autoMergeAccounts = jest.fn().mockImplementation(async (_ws: string, pairs: unknown[]) => pairs.length)
    const sweeper = new DuplicatesSweeper(
      { manager: { query: made.query } } as never,
      { proposeDuplicates: made.proposeDuplicates, autoMergeAccounts } as unknown as GovernanceService,
    )
    return { ...made, sweeper, autoMergeAccounts }
  }

  const twin = (id: string, name: string, siren: string | null, createdAt: string) => ({
    id,
    name,
    siren,
    created_at: createdAt,
  })

  it('deux comptes au SIREN identique (noms différents) : le plus ancien absorbe, sans proposition', async () => {
    const { sweeper, autoMergeAccounts, proposeDuplicates } = buildAccounts([
      twin('new', 'SG Securities Services', '552 120 222', '2026-03-01T00:00:00Z'),
      twin('old', 'Société Générale', '552120222', '2026-01-01T00:00:00Z'),
    ])
    await sweeper.sweep()
    expect(autoMergeAccounts).toHaveBeenCalledWith('ws-1', [
      expect.objectContaining({ keptId: 'old', absorbedId: 'new', reason: expect.stringContaining('SIREN') }),
    ])
    expect(proposeDuplicates).not.toHaveBeenCalled()
  })

  it('SAIT DIRE NON — SIREN différents, ou absents, ou illisibles : jamais fusionnés', async () => {
    const { sweeper, autoMergeAccounts } = buildAccounts([
      twin('a', 'ACME Nord', '552120222', '2026-01-01T00:00:00Z'),
      twin('b', 'ACME Sud', '552120223', '2026-01-02T00:00:00Z'),
      twin('c', 'Globex', null, '2026-01-03T00:00:00Z'),
      twin('d', 'Initech', null, '2026-01-04T00:00:00Z'),
      twin('e', 'Hooli', '12345', '2026-01-05T00:00:00Z'),
      twin('f', 'Pied Piper', '12345', '2026-01-06T00:00:00Z'),
    ])
    await sweeper.sweep()
    expect(autoMergeAccounts).not.toHaveBeenCalled()
  })

  it('une paire déjà tranchée par un humain ne se refusionne pas (la correction humaine gagne)', async () => {
    const { duplicatePairKey } = await import('@bellum/contracts')
    const { sweeper, autoMergeAccounts } = buildAccounts(
      [
        twin('a', 'SG', '552120222', '2026-01-01T00:00:00Z'),
        twin('b', 'Société Générale', '552120222', '2026-02-01T00:00:00Z'),
      ],
      [duplicatePairKey('a', 'b')],
    )
    await sweeper.sweep()
    expect(autoMergeAccounts).not.toHaveBeenCalled()
  })

  it('l’interrupteur rend la paire de même SIREN à la PROPOSITION', async () => {
    process.env.DUPLICATES_AUTO_MERGE_DISABLED = 'true'
    const { sweeper, autoMergeAccounts, proposeDuplicates } = buildAccounts([
      twin('a', 'SG', '552120222', '2026-01-01T00:00:00Z'),
      twin('b', 'Société Générale', '552120222', '2026-02-01T00:00:00Z'),
    ])
    await sweeper.sweep()
    expect(autoMergeAccounts).not.toHaveBeenCalled()
    expect(proposeDuplicates).toHaveBeenCalledWith('ws-1', [expect.objectContaining({ entityType: 'account' })])
  })
})

describe('#4471 — le balayage voit TOUT l’espace, page par page', () => {
  const TOTAL = 12_000

  /** 12 000 fiches, la plus récente d'abord ; seules la 1re et la dernière (la plus ancienne) se doublonnent. */
  function build12k() {
    const all = Array.from({ length: TOTAL }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      name: i === 0 ? 'Marie Dupont' : i === TOTAL - 1 ? 'M. Dupont' : `Personne ${i}`,
      email: i === 0 || i === TOTAL - 1 ? 'marie@acme.example' : `p${i}@acme.example`,
      company: 'ACME',
      created_at: new Date(Date.UTC(2026, 0, 1) - i * 60_000),
    }))
    const pageSizes: number[] = []
    const query: QueryStub = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('is_demo FROM workspaces')) return [{ is_demo: false }]
      if (sql.includes('pair_key FROM duplicate_pairs')) return []
      if (sql.includes('DISTINCT')) return [{ workspace_id: 'ws-1' }]
      if (sql.includes('company_name AS name')) return []
      const [, cursorAt, cursorId, size] = params as [string, Date | null, string | null, number]
      const start = cursorId ? all.findIndex(row => row.id === cursorId) + 1 : 0
      void cursorAt
      const page = all.slice(start, start + size)
      pageSizes.push(page.length)
      return page
    })
    const proposeDuplicates = jest.fn().mockImplementation(async (_ws: string, pairs: unknown[]) => pairs.length)
    const sweeper = new DuplicatesSweeper(
      { manager: { query } } as never,
      { proposeDuplicates, autoMergeContacts: jest.fn().mockResolvedValue(0) } as unknown as GovernanceService,
    )
    return { sweeper, query, proposeDuplicates, pageSizes }
  }

  it('propose une paire dont une moitié est au-delà des 5 000 premières fiches', async () => {
    const { sweeper, proposeDuplicates } = build12k()
    await expect(sweeper.sweep()).resolves.toBe(1)
    expect(proposeDuplicates).toHaveBeenCalledWith('ws-1', [
      expect.objectContaining({ entityType: 'contact', reason: 'same_email' }),
    ])
  })

  it('chaque requête reste bornée à une page, et l’espace entier est examiné', async () => {
    const { sweeper, pageSizes } = build12k()
    const report = await sweeper.refreshWorkspace('ws-1', { force: true })
    expect(Math.max(...pageSizes)).toBeLessThanOrEqual(5000)
    expect(pageSizes).toEqual([5000, 5000, 2000])
    expect(report?.contactsExamined).toBe(TOTAL)
  })

  it('sait dire NON : un espace plus petit qu’une page se lit en UNE requête', async () => {
    const { sweeper, query } = build({ contacts: [contact('a', 'Marie Dupont', 'marie@acme.example', 'ACME')] })
    await sweeper.sweep()
    const reads = query.mock.calls.filter(([sql]) => String(sql).includes('full_name'))
    expect(reads).toHaveLength(1)
  })
})

describe('#4471 — borne de temps par espace, reprise au passage suivant', () => {
  const TOTAL = 12_000
  const all = Array.from({ length: TOTAL }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: `Personne ${i}`,
    email: `p${i}@acme.example`,
    company: 'ACME',
    created_at: new Date(Date.UTC(2026, 0, 1) - i * 60_000),
  }))

  function build(clock: { t: number }) {
    const cursors: (string | null)[] = []
    const query: QueryStub = jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('is_demo FROM workspaces')) return [{ is_demo: false }]
      if (sql.includes('pair_key FROM duplicate_pairs')) return []
      if (sql.includes('DISTINCT')) return [{ workspace_id: 'ws-1' }]
      if (sql.includes('company_name AS name')) return []
      const [, , cursorId, size] = params as [string, Date | null, string | null, number]
      cursors.push(cursorId)
      clock.t += 50_000 // chaque page « coûte » 50 s : la 2e dépasse la borne de 90 s
      const start = cursorId ? all.findIndex(row => row.id === cursorId) + 1 : 0
      return all.slice(start, start + size)
    })
    const sweeper = new DuplicatesSweeper(
      { manager: { query } } as never,
      {
        proposeDuplicates: jest.fn().mockResolvedValue(0),
        autoMergeContacts: jest.fn(),
      } as unknown as GovernanceService,
    )
    ;(sweeper as unknown as { now: () => number }).now = () => clock.t
    return { sweeper, cursors }
  }

  it('coupe la lecture à la borne de temps, le dit, et reprend où elle s’est arrêtée', async () => {
    const clock = { t: 0 }
    const { sweeper, cursors } = build(clock)
    const warn = jest
      .spyOn((sweeper as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation()

    const first = await sweeper.refreshWorkspace('ws-1', { force: true })
    expect(first?.contactsExamined).toBeLessThan(TOTAL) // coupé après 2 pages
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lue(s)'), expect.anything())
    const firstReads = cursors.length

    const second = await sweeper.refreshWorkspace('ws-1', { force: true })
    // La reprise ne repart pas de la tête : sa première page lit APRÈS la dernière ligne déjà vue.
    expect(cursors[firstReads]).not.toBeNull()
    expect(second?.contactsExamined).toBeGreaterThan(0)
  })

  it('sait dire NON : sous la borne, tout l’espace est lu et rien n’est mémorisé', async () => {
    const clock = { t: 0 }
    const { sweeper, cursors } = build(clock)
    ;(sweeper as unknown as { readBudgetMs: number }).readBudgetMs = 10 * 60_000
    const report = await sweeper.refreshWorkspace('ws-1', { force: true })
    expect(report?.contactsExamined).toBe(TOTAL)
    await sweeper.refreshWorkspace('ws-1', { force: true })
    expect(cursors.filter(c => c === null)).toHaveLength(2) // chaque passage repart de la tête
  })
})
