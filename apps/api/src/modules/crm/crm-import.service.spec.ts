import { HttpException, Logger } from '@nestjs/common'
import type { IncomingRecord } from '@bellum/contracts'
import { CrmImportService, type CrmAccountSource, type CrmSource } from './crm-import.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const CONTACT = 'c0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'

function source(records: IncomingRecord[], truncated = false): CrmSource {
  return { provider: 'hubspot', listContacts: async () => ({ records, truncated }) }
}

function accountSource(records: IncomingRecord[], truncated = false): CrmAccountSource {
  return { provider: 'hubspot', listCompanies: async () => ({ records, truncated }) }
}

type StoredLink = { external_id: string; internal_id: string }

function makeService(overrides: Record<string, unknown> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  // Un vrai magasin quand le test en fournit un : ce que l'import y écrit, le
  // suivant le relit. C'est la seule façon de prouver qu'une déduplication
  // repose sur une table ÉCRITE et non sur un tableau posé par le test.
  const linkStore = (overrides['linkStore'] as StoredLink[] | undefined) ?? null
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('FROM contacts c')) return (overrides['emails'] as unknown[]) ?? []
      if (sql.includes('FROM accounts a')) return (overrides['analysedAccounts'] as unknown[]) ?? []
      if (sql.includes('INSERT INTO sync_links') && linkStore) {
        const [, , externalId, internalId] = params as [string, string, string, string]
        if (!linkStore.some(row => row.external_id === externalId)) {
          linkStore.push({ external_id: externalId, internal_id: internalId })
        }
      }
      return []
    }),
  }
  const links = {
    manager,
    find: jest.fn(async () => linkStore ?? (overrides['links'] as unknown[]) ?? []),
    update: jest.fn(async () => ({ affected: 1 })),
  }
  const runs = {
    manager,
    create: jest.fn((e: Record<string, unknown>) => e),
    save: jest.fn(async (e: Record<string, unknown>) => ({ id: 'run-1', ...e })),
    update: jest.fn(async () => ({ affected: 1 })),
  }
  const events = { insert: jest.fn(async () => undefined) }
  const contacts = {
    update: jest.fn(async (_where: unknown, _patch: Record<string, unknown>) => ({ affected: 1 })),
    create: jest.fn((e: Record<string, unknown>) => e),
    save: jest.fn(async (e: Record<string, unknown>) => ({
      id: (overrides['createdContactId'] as string) ?? CONTACT,
      ...e,
    })),
    // #4189 — la valeur ACTUELLE d'un contact, lue seulement quand un champ est protégé par `human`.
    findOne: jest.fn(async () => (overrides['contactRow'] as Record<string, unknown> | undefined) ?? null),
  }
  const accounts = {
    update: jest.fn(async (_where: unknown, _patch: Record<string, unknown>) => ({ affected: 1 })),
    create: jest.fn((e: Record<string, unknown>) => e),
    find: jest.fn(async () => (overrides['accountRows'] as unknown[] | undefined) ?? []),
    save: jest.fn(async (e: Record<string, unknown>) => ({
      id: (overrides['createdAccountId'] as string) ?? ACCOUNT,
      ...e,
    })),
    // La valeur ACTUELLE en base, telle que l'arbitre de provenance la lit
    // avant de trancher `unchanged`/`no_previous`/`lower_authority`. `null`
    // par défaut : la plupart des tests partent d'une fiche sans nom connu.
    findOne: jest.fn(async () => (overrides['accountRow'] as Record<string, unknown> | undefined) ?? null),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })) }
  const provenance = {
    currentSources: jest.fn(async () => (overrides['sources'] as Record<string, string>) ?? {}),
    commit: jest.fn(async () => undefined),
    markImported: jest.fn(async () => undefined),
  }

  const service = new CrmImportService(
    links as never,
    runs as never,
    events as never,
    contacts as never,
    accounts as never,
    workspaceContext as never,
    provenance as never,
  )
  return { service, links, runs, events, contacts, accounts, provenance, queries }
}

const MARIE: IncomingRecord = { externalId: 'hs-1', email: 'marie@acme.fr', name: 'Marie Dupont' }

describe('CrmImportService.importContacts — simulation', () => {
  it('n’ÉCRIT RIEN en simulation', async () => {
    const { service, contacts } = makeService()
    const outcome = await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: true,
      limit: 200,
    })
    expect(outcome.dryRun).toBe(true)
    expect(outcome.created).toBe(1)
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('JOURNALISE quand même — savoir qu’on a regardé fait partie de la reprise', async () => {
    const { service, events, runs } = makeService()
    await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: true,
      limit: 200,
    })
    expect(events.insert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ action: 'created' })]))
    expect(runs.save).toHaveBeenCalledWith(expect.objectContaining({ dry_run: true }))
  })

  it('BELLUM-API-9 — le journal d’un lot part en UN INSERT multi-lignes, une ligne par enregistrement', async () => {
    const { service, events } = makeService()
    await service.importContacts(
      USER,
      source([
        MARIE,
        { ...MARIE, externalId: 'hs-2', email: 'b@acme.fr' },
        { ...MARIE, externalId: 'hs-3', email: 'c@acme.fr' },
      ]),
      { provider: 'hubspot', entityType: 'contact', dryRun: true, limit: 200 },
    )
    expect(events.insert).toHaveBeenCalledTimes(1)
    expect((events.insert.mock.calls as unknown[][])[0]?.[0]).toHaveLength(3)
  })
})

describe('CrmImportService.importContacts — écriture', () => {
  it('MET À JOUR un contact déjà lié, jamais n’en recrée un', async () => {
    // C'est ce qui rend un import rejouable, et donc reprenable après coupure.
    const { service, contacts } = makeService({ links: [{ external_id: 'hs-1', internal_id: CONTACT }] })
    const outcome = await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: false,
      limit: 200,
    })
    expect(outcome.updated).toBe(1)
    expect(outcome.created).toBe(0)
    expect(contacts.update).toHaveBeenCalledWith({ id: CONTACT }, expect.objectContaining({ email: 'marie@acme.fr' }))
  })

  it('N’ÉCRASE PAS un champ corrigé à la main', async () => {
    // La provenance `human` gagne sur `connector` : c'est la seule raison pour
    // laquelle une cohabitation CRM/Bellum est tenable.
    const { service, contacts } = makeService({
      links: [{ external_id: 'hs-1', internal_id: CONTACT }],
      sources: { email: 'human' },
    })
    await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: false,
      limit: 200,
    })
    const patch = contacts.update.mock.calls[0]?.[1] ?? {}
    expect(patch).not.toHaveProperty('email')
    expect(patch).toHaveProperty('full_name')
  })

  it('#4479 — un nom déjà porté par une autre fiche du compte : le nom du CRM est écarté, le reste s’écrit, aucune erreur', async () => {
    const { service, contacts } = makeService({ links: [{ external_id: 'hs-1', internal_id: CONTACT }] })
    contacts.update.mockRejectedValueOnce({
      code: '23505',
      driverError: { code: '23505', constraint: 'idx_contacts_account_normalized_name' },
    })
    const outcome = await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: false,
      limit: 200,
    })
    expect(outcome.updated).toBe(1)
    expect(contacts.update).toHaveBeenCalledTimes(2)
    const retry = contacts.update.mock.calls[1]?.[1] ?? {}
    expect(retry).not.toHaveProperty('full_name')
    expect(retry).toHaveProperty('email', 'marie@acme.fr')
  })

  it('sait dire NON : une autre erreur de base remonte', async () => {
    const { service, contacts } = makeService({ links: [{ external_id: 'hs-1', internal_id: CONTACT }] })
    contacts.update.mockRejectedValueOnce({ code: '23503' })
    const outcome = await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: false,
      limit: 200,
    })
    expect(outcome.updated).toBe(0)
    expect(contacts.update).toHaveBeenCalledTimes(1)
  })

  it('n’appelle même PAS la base quand tout est protégé', async () => {
    const { service, contacts } = makeService({
      links: [{ external_id: 'hs-1', internal_id: CONTACT }],
      sources: { email: 'human', full_name: 'human' },
    })
    await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: false,
      limit: 200,
    })
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('POSE le lien à la première résolution — sinon chaque import recommence', async () => {
    // T-069 : `sync_links` n'était jamais inséré. La ligne 236 faisait un
    // `UPDATE` sur une ligne inexistante — un no-op silencieux — pendant que le
    // docblock de la classe promettait « `sync_links` empêche le doublon ».
    const { service, queries } = makeService({ emails: [{ email: 'marie@acme.fr', id: CONTACT }] })
    await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: false,
      limit: 200,
    })
    const insert = queries.find(q => q.sql.includes('INSERT INTO sync_links'))
    expect(insert).toBeDefined()
    expect(insert?.params).toEqual([WORKSPACE, 'hubspot', 'hs-1', CONTACT])
  })

  it('ne pose AUCUN lien en simulation — une simulation n’écrit pas', async () => {
    const { service, queries } = makeService({ emails: [{ email: 'marie@acme.fr', id: CONTACT }] })
    await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: true,
      limit: 200,
    })
    expect(queries.some(q => q.sql.includes('INSERT INTO sync_links'))).toBe(false)
  })

  it('#4586 — un contact sans nom ne prend JAMAIS son adresse pour nom', async () => {
    const { service, contacts } = makeService()
    const real = { provider: 'hubspot' as const, entityType: 'contact' as const, dryRun: false, limit: 200 }

    await service.importContacts(
      USER,
      source([
        { externalId: 'hs-n1', email: 'menette.sebastien@societe.example', name: null },
        { externalId: 'hs-n2', email: 'contact@societe.example', name: 'contact@societe.example' },
      ]),
      real,
    )

    const names = contacts.save.mock.calls.map(call => (call[0] as { full_name: string }).full_name)
    expect(names).toEqual(['Menette Sebastien', 'Contact à compléter'])
    expect(names.some(name => name.includes('@'))).toBe(false)
    expect(contacts.save.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ email: 'menette.sebastien@societe.example', raw_data: { nameDerivedFromEmail: true } }),
    )
  })

  it("#4599.2 — un e-mail gabarit du CRM n'est écrit nulle part : la fiche est créée sans adresse", async () => {
    const { service, contacts } = makeService()
    const real = { provider: 'hubspot' as const, entityType: 'contact' as const, dryRun: false, limit: 200 }

    await service.importContacts(
      USER,
      source([
        { externalId: 'hs-g1', email: 'prenom.nom@acme.fr', name: 'Claire Vasseur' },
        { externalId: 'hs-g2', email: 'prenom.nom@acme.fr', name: 'Paul Martin' },
      ]),
      real,
    )

    const saved = contacts.save.mock.calls.map(call => call[0] as { full_name: string; email: string | null })
    // Deux personnes, deux fiches : le gabarit commun ne les rapproche pas, et n'est écrit sur aucune.
    expect(saved.map(c => c.full_name)).toEqual(['Claire Vasseur', 'Paul Martin'])
    expect(saved.map(c => c.email)).toEqual([null, null])
  })

  it('J.5 — import RÉEL puis simulation : le contact créé est lié, la simulation dit « 0 à créer »', async () => {
    const stored: StoredLink[] = []
    const { service, contacts } = makeService({ linkStore: stored })
    const real = { provider: 'hubspot' as const, entityType: 'contact' as const, dryRun: false, limit: 200 }

    const first = await service.importContacts(USER, source([MARIE]), real)
    expect(first.created).toBe(1)
    expect(contacts.save).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: null,
        workspace_id: WORKSPACE,
        email: 'marie@acme.fr',
        full_name: 'Marie Dupont',
      }),
    )
    expect(stored).toEqual([{ external_id: 'hs-1', internal_id: CONTACT }])

    const simulation = await service.importContacts(USER, source([MARIE]), { ...real, dryRun: true })
    expect(simulation.created).toBe(0)
    expect(simulation.updated).toBe(1)
  })

  it('un SECOND import ne recrée rien — la preuve que la table est vraiment écrite', async () => {
    // La garde décisive du lot, et celle qui manquait. Le test « MET À JOUR un
    // contact déjà lié » ci-dessus pré-remplit `links` À LA MAIN : il était vert
    // pendant que rien, nulle part, ne remplissait cette table.
    const stored: StoredLink[] = []
    const { service } = makeService({ emails: [{ email: 'marie@acme.fr', id: CONTACT }], linkStore: stored })
    const input = { provider: 'hubspot' as const, entityType: 'contact' as const, dryRun: false, limit: 200 }

    const first = await service.importContacts(USER, source([MARIE]), input)
    expect(first.updated).toBe(1)
    expect(stored).toEqual([{ external_id: 'hs-1', internal_id: CONTACT }])

    const second = await service.importContacts(USER, source([MARIE]), input)
    expect(second.created).toBe(0)
    expect(second.updated).toBe(1)
    expect(second.skipped).toEqual([])
  })

  it('ÉCARTE un conflit d’adresse au lieu de fusionner', async () => {
    // Fusionner est irréversible côté CRM, et un faux positif détruit
    // l'historique d'un vrai client.
    //
    // Ce qui fait le conflit : la fiche `someone-else` porte DÉJÀ un autre
    // identifiant de ce CRM. Sans ce lien, la même situation est une première
    // résolution, et c'est le cas juste au-dessus.
    const { service, events } = makeService({
      emails: [{ email: 'marie@acme.fr', id: 'someone-else' }],
      links: [{ external_id: 'hs-legacy', internal_id: 'someone-else' }],
    })
    const outcome = await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: false,
      limit: 200,
    })
    expect(outcome.skipped).toEqual([{ ref: 'hs-1', reason: 'already_linked_elsewhere' }])
    expect(events.insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ action: 'conflict' })]),
    )
  })

  it('rapporte la TRONCATURE — « 200 importés » sur 3000 se lit comme une fin', async () => {
    const { service } = makeService()
    const outcome = await service.importContacts(USER, source([MARIE], true), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: false,
      limit: 200,
    })
    expect(outcome.truncated).toBe(true)
  })

  it('garde l’erreur du fournisseur TELLE QUELLE', async () => {
    // « L'import a échoué » n'aide personne ; « 401 invalid_grant » se répare.
    const failing: CrmSource = {
      provider: 'hubspot',
      listContacts: async () => {
        throw new Error('401 invalid_grant')
      },
    }
    const { service, runs } = makeService()
    const outcome = await service.importContacts(USER, failing, {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: false,
      limit: 200,
    })
    expect(outcome.unavailable).toBe('401 invalid_grant')
    expect(runs.update).toHaveBeenCalledWith('run-1', expect.objectContaining({ error: '401 invalid_grant' }))
  })
})

const ACME: IncomingRecord = { externalId: 'hs-co-1', email: null, name: 'Acme SAS' }

describe('CrmImportService.importAccounts (#2388.24) — simulation', () => {
  it('n’ÉCRIT RIEN en simulation', async () => {
    const { service, accounts } = makeService()
    const outcome = await service.importAccounts(USER, accountSource([ACME]), {
      provider: 'hubspot',
      entityType: 'account',
      dryRun: true,
      limit: 200,
    })
    expect(outcome.dryRun).toBe(true)
    expect(outcome.created).toBe(1)
    expect(accounts.save).not.toHaveBeenCalled()
  })
})

describe('CrmImportService.importAccounts (#2388.24) — écriture', () => {
  it('J.6 — une société liée dont le nom n’a pas bougé est « inchangée », pas « à mettre à jour »', async () => {
    const { service, accounts } = makeService({
      links: [{ external_id: 'hs-co-1', internal_id: ACCOUNT }],
      accountRows: [{ id: ACCOUNT, company_name: 'acme sas ' }],
    })
    const outcome = await service.importAccounts(USER, accountSource([ACME]), {
      provider: 'hubspot',
      entityType: 'account',
      dryRun: true,
      limit: 200,
    })
    expect(outcome.updated).toBe(0)
    expect(outcome.skipped).toEqual([{ ref: 'hs-co-1', reason: 'unchanged' }])
    expect(accounts.update).not.toHaveBeenCalled()
  })

  it('J.6 — un nom CHANGÉ côté CRM reste « à mettre à jour »', async () => {
    const { service } = makeService({
      links: [{ external_id: 'hs-co-1', internal_id: ACCOUNT }],
      accountRows: [{ id: ACCOUNT, company_name: 'Ancien nom' }],
    })
    const outcome = await service.importAccounts(USER, accountSource([ACME]), {
      provider: 'hubspot',
      entityType: 'account',
      dryRun: true,
      limit: 200,
    })
    expect(outcome.updated).toBe(1)
  })

  it('CRÉE un compte pour une société jamais vue, et pose le lien', async () => {
    const stored: StoredLink[] = []
    const { service, accounts } = makeService({ linkStore: stored })
    const outcome = await service.importAccounts(USER, accountSource([ACME]), {
      provider: 'hubspot',
      entityType: 'account',
      dryRun: false,
      limit: 200,
    })
    expect(outcome.created).toBe(1)
    expect(accounts.save).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'Acme SAS', user_id: USER }))
    expect(stored).toEqual([{ external_id: 'hs-co-1', internal_id: ACCOUNT }])
  })

  it('#4603.11 — sens inverse : la société déjà ANALYSÉE est reprise, le CRM ne crée pas une seconde fiche', async () => {
    const stored: StoredLink[] = []
    const { service, accounts } = makeService({
      linkStore: stored,
      analysedAccounts: [
        {
          id: ACCOUNT,
          company_name: 'Veepee',
          siren: '440297785',
          status: 'completed',
          has_runs: true,
          updated_at: null,
        },
      ],
    })
    const outcome = await service.importAccounts(
      USER,
      accountSource([{ externalId: 'hs-co-9', email: null, name: 'VEEPEE', siren: null }]),
      { provider: 'hubspot', entityType: 'account', dryRun: false, limit: 200 },
    )
    expect(accounts.save).not.toHaveBeenCalled()
    expect(outcome.created).toBe(0)
    expect(outcome.updated).toBe(1)
    // Le lien CRM est posé sur le compte analysé ; son nom (celui de l'analyse) n'est pas réécrit.
    expect(stored).toEqual([{ external_id: 'hs-co-9', internal_id: ACCOUNT }])
    expect(accounts.update).not.toHaveBeenCalled()
  })

  it("#4603.11 — la simulation dit la même chose : rien à créer, rien d'écrit", async () => {
    const { service, accounts } = makeService({
      analysedAccounts: [
        { id: ACCOUNT, company_name: 'Veepee', siren: null, status: 'completed', has_runs: true, updated_at: null },
      ],
    })
    const outcome = await service.importAccounts(
      USER,
      accountSource([{ externalId: 'x', email: null, name: 'Veepee' }]),
      {
        provider: 'hubspot',
        entityType: 'account',
        dryRun: true,
        limit: 200,
      },
    )
    expect(outcome.created).toBe(0)
    expect(outcome.updated).toBe(1)
    expect(accounts.save).not.toHaveBeenCalled()
  })

  it("#4603.11 sait dire NON : un compte JAMAIS analysé (autre fiche CRM, coquille) n'est pas repris — un homonyme reste créé", async () => {
    const { service, accounts } = makeService({
      analysedAccounts: [
        { id: ACCOUNT, company_name: 'Veepee', siren: null, status: 'imported', has_runs: false, updated_at: null },
      ],
    })
    const outcome = await service.importAccounts(
      USER,
      accountSource([{ externalId: 'x', email: null, name: 'Veepee' }]),
      {
        provider: 'hubspot',
        entityType: 'account',
        dryRun: false,
        limit: 200,
      },
    )
    expect(outcome.created).toBe(1)
    expect(accounts.save).toHaveBeenCalled()
  })

  it("#4603.11 sait dire NON : un SIREN différent n'est jamais repris sur le nom (ROCHE ≠ ROCHE BOBOIS)", async () => {
    const { service, accounts } = makeService({
      analysedAccounts: [
        {
          id: ACCOUNT,
          company_name: 'Roche',
          siren: '552032534',
          status: 'completed',
          has_runs: true,
          updated_at: null,
        },
      ],
    })
    await service.importAccounts(
      USER,
      accountSource([{ externalId: 'x', email: null, name: 'Roche', siren: '440297785' }]),
      { provider: 'hubspot', entityType: 'account', dryRun: false, limit: 200 },
    )
    expect(accounts.save).toHaveBeenCalled()
  })

  it('#4603 — la fiche créée porte son ORIGINE, son statut « importé » et le SIREN que le CRM porte', async () => {
    const { service, accounts } = makeService()
    await service.importAccounts(
      USER,
      accountSource([{ externalId: 'hs-co-9', email: null, name: 'Veepee', siren: '440 297 785' }]),
      { provider: 'hubspot', entityType: 'account', dryRun: false, limit: 200 },
    )
    // Sans ces trois champs, le statut prenait le défaut de colonne `analyzing` et aucune clé ne
    // permettait à l'analyse de retrouver le compte : elle en créait un second (deux « Veepee »).
    expect(accounts.save).toHaveBeenCalledWith(
      expect.objectContaining({ company_name: 'Veepee', origin: 'crm', status: 'imported', siren: '440297785' }),
    )
  })

  it('#4604 — la fiche créée commet la provenance `connector` de ce que le CRM a écrit (nom, SIREN)', async () => {
    const { service, provenance } = makeService()
    await service.importAccounts(
      USER,
      accountSource([{ externalId: 'hs-co-9', email: null, name: 'Veepee', siren: '440297785' }]),
      { provider: 'hubspot', entityType: 'account', dryRun: false, limit: 200 },
    )
    expect(provenance.commit).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      entityType: 'account',
      entityId: ACCOUNT,
      source: 'connector',
      actorId: null,
      changes: [
        { field: 'company_name', oldValue: null, newValue: 'Veepee' },
        { field: 'siren', oldValue: null, newValue: '440297785' },
      ],
    })
  })

  it('#4603 — un SIREN illisible côté CRM n’est PAS une clé : la fiche part sans SIREN, jamais un faux', async () => {
    const { service, accounts } = makeService()
    await service.importAccounts(
      USER,
      accountSource([{ externalId: 'hs-co-9', email: null, name: 'Veepee', siren: 'FR123' }]),
      { provider: 'hubspot', entityType: 'account', dryRun: false, limit: 200 },
    )
    expect(accounts.save).toHaveBeenCalledWith(expect.objectContaining({ origin: 'crm', siren: null }))
  })

  it('MET À JOUR un compte déjà lié, jamais n’en recrée un', async () => {
    const { service, accounts } = makeService({ links: [{ external_id: 'hs-co-1', internal_id: ACCOUNT }] })
    const outcome = await service.importAccounts(USER, accountSource([ACME]), {
      provider: 'hubspot',
      entityType: 'account',
      dryRun: false,
      limit: 200,
    })
    expect(outcome.updated).toBe(1)
    expect(outcome.created).toBe(0)
    expect(accounts.update).toHaveBeenCalledWith({ id: ACCOUNT }, { company_name: 'Acme SAS' })
  })

  it('N’ÉCRASE PAS un nom de société corrigé à la main', async () => {
    const { service, accounts } = makeService({
      links: [{ external_id: 'hs-co-1', internal_id: ACCOUNT }],
      sources: { company_name: 'human' },
      // La correction humaine porte une VALEUR, sans quoi l'arbitre la
      // traiterait comme un trou et laisserait n'importe quelle source le
      // combler — la provenance seule ne suffit pas à protéger un blanc.
      accountRow: { company_name: 'Acme Corrigé À La Main' },
    })
    await service.importAccounts(USER, accountSource([ACME]), {
      provider: 'hubspot',
      entityType: 'account',
      dryRun: false,
      limit: 200,
    })
    expect(accounts.update).not.toHaveBeenCalled()
  })

  it('un SECOND import met à jour au lieu de recréer — la preuve que le lien est vraiment posé', async () => {
    const stored: StoredLink[] = []
    const { service, accounts } = makeService({ linkStore: stored })
    const input = { provider: 'hubspot' as const, entityType: 'account' as const, dryRun: false, limit: 200 }

    const first = await service.importAccounts(USER, accountSource([ACME]), input)
    expect(first.created).toBe(1)

    const second = await service.importAccounts(USER, accountSource([ACME]), input)
    expect(second.created).toBe(0)
    expect(second.updated).toBe(1)
    expect(accounts.update).toHaveBeenCalledWith({ id: ACCOUNT }, { company_name: 'Acme SAS' })
  })

  it('rapporte la TRONCATURE', async () => {
    const { service } = makeService()
    const outcome = await service.importAccounts(USER, accountSource([ACME], true), {
      provider: 'hubspot',
      entityType: 'account',
      dryRun: false,
      limit: 200,
    })
    expect(outcome.truncated).toBe(true)
  })

  it('garde l’erreur du fournisseur TELLE QUELLE', async () => {
    const failing: CrmAccountSource = {
      provider: 'hubspot',
      listCompanies: async () => {
        throw new Error('401 invalid_grant')
      },
    }
    const { service, runs } = makeService()
    const outcome = await service.importAccounts(USER, failing, {
      provider: 'hubspot',
      entityType: 'account',
      dryRun: false,
      limit: 200,
    })
    expect(outcome.unavailable).toBe('401 invalid_grant')
    expect(runs.update).toHaveBeenCalledWith('run-1', expect.objectContaining({ error: '401 invalid_grant' }))
  })
})

describe('CrmImportService.assertSource', () => {
  it('DIT qu’aucun CRM n’est branché plutôt que de rendre zéro ligne', async () => {
    // « Zéro contact » se lirait « ton CRM est vide ».
    const { service } = makeService()
    expect(() => service.assertSource(undefined)).toThrow(/Aucun CRM connecté/)
  })
})

// #4189 — la synchro incrémentale : « depuis » traverse jusqu'à la source, et un champ
// modifié des DEUX côtés ne passe jamais devant la correction humaine — il se COMPTE.
describe('CrmImportService — synchro incrémentale et conflits (#4189)', () => {
  const input = { provider: 'zoho', entityType: 'contact', dryRun: false, limit: 200 } as const

  it('transmet « depuis » à la source de contacts et à celle de sociétés', async () => {
    const { service } = makeService()
    const listContacts = jest.fn(async () => ({ records: [] as IncomingRecord[], truncated: false }))
    await service.importContacts(USER, { provider: 'zoho', listContacts }, input, { since: '2026-10-01T08:00:00.000Z' })
    expect(listContacts).toHaveBeenCalledWith(USER, 200, { since: '2026-10-01T08:00:00.000Z' })

    const listCompanies = jest.fn(async () => ({ records: [] as IncomingRecord[], truncated: false }))
    await service.importAccounts(
      USER,
      { provider: 'zoho', listCompanies },
      { ...input, entityType: 'account' },
      { since: '2026-10-01T08:00:00.000Z' },
    )
    expect(listCompanies).toHaveBeenCalledWith(USER, 200, { since: '2026-10-01T08:00:00.000Z' })
  })

  it('⚠️ un contact corrigé à la main ET modifié dans le CRM : la valeur humaine reste, le conflit est COMPTÉ et journalisé', async () => {
    const { service, contacts, events, runs } = makeService({
      links: [{ external_id: 'zo-1', internal_id: CONTACT }],
      sources: { email: 'human' },
      contactRow: { email: 'corrige@acme.fr', full_name: 'Marie Dupont' },
    })
    const outcome = await service.importContacts(
      USER,
      source([{ externalId: 'zo-1', email: 'autre@crm.fr', name: 'Marie Dupont' }]),
      input,
    )
    expect(contacts.update.mock.calls[0]?.[1] ?? {}).not.toHaveProperty('email')
    expect(outcome.conflicts).toBe(1)
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'conflict', fields: ['email'], external_id: 'zo-1', internal_id: CONTACT }),
    )
    expect(runs.update).toHaveBeenCalledWith('run-1', expect.objectContaining({ conflict_count: 1 }))
  })

  it('#4189 — le conflit PROPOSE : la valeur Bellum gardée ET celle du CRM, côte à côte (rien n’est écrasé)', async () => {
    const { service, events } = makeService({
      links: [{ external_id: 'zo-1', internal_id: CONTACT }],
      sources: { email: 'human' },
      contactRow: { email: 'corrige@acme.fr', full_name: 'Marie Dupont' },
    })
    await service.importContacts(
      USER,
      source([{ externalId: 'zo-1', email: 'autre@crm.fr', name: 'Marie Dupont' }]),
      input,
    )
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'conflict',
        proposal: { email: { bellum: 'corrige@acme.fr', crm: 'autre@crm.fr' } },
      }),
    )
  })

  it('Théo D settings-integrations.N3 — le conflit journalise le NOM de la fiche (l’onglet À relire la nomme)', async () => {
    const { service, events } = makeService({
      links: [{ external_id: 'zo-1', internal_id: CONTACT }],
      sources: { email: 'human' },
      contactRow: { email: 'corrige@acme.fr', full_name: 'Marie Dupont' },
    })
    await service.importContacts(
      USER,
      source([{ externalId: 'zo-1', email: 'autre@crm.fr', name: 'Marie Dupont' }]),
      input,
    )
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'conflict', entity_label: 'Marie Dupont' }),
    )
  })

  it('⚠️ SAIT DIRE NON — une valeur humaine IDENTIQUE à celle du CRM n’est pas un conflit', async () => {
    const { service, events } = makeService({
      links: [{ external_id: 'zo-1', internal_id: CONTACT }],
      sources: { email: 'human' },
      contactRow: { email: 'Marie@Acme.fr', full_name: 'Marie Dupont' },
    })
    const outcome = await service.importContacts(
      USER,
      source([{ externalId: 'zo-1', email: 'marie@acme.fr', name: 'Marie Dupont' }]),
      input,
    )
    expect(outcome.conflicts).toBe(0)
    expect(events.insert).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ action: 'conflict' })]),
    )
  })

  it('une simulation ne compte ni n’écrit aucun conflit', async () => {
    const { service, contacts } = makeService({
      links: [{ external_id: 'zo-1', internal_id: CONTACT }],
      sources: { email: 'human' },
      contactRow: { email: 'corrige@acme.fr' },
    })
    const outcome = await service.importContacts(
      USER,
      source([{ externalId: 'zo-1', email: 'autre@crm.fr', name: null }]),
      { ...input, dryRun: true },
    )
    expect(contacts.update).not.toHaveBeenCalled()
    expect(outcome.conflicts).toBe(0)
  })

  it('un nom de société corrigé à la main et modifié dans le CRM : conservé, et compté', async () => {
    const { service, accounts, events } = makeService({
      links: [{ external_id: 'zo-a1', internal_id: ACCOUNT }],
      sources: { company_name: 'human' },
      accountRow: { company_name: 'Société corrigée' },
    })
    const outcome = await service.importAccounts(
      USER,
      accountSource([{ externalId: 'zo-a1', email: null, name: 'Nom côté CRM' }]),
      { ...input, entityType: 'account' },
    )
    expect(accounts.update).not.toHaveBeenCalled()
    expect(outcome.conflicts).toBe(1)
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'conflict',
        fields: ['company_name'],
        proposal: { company_name: { bellum: 'Société corrigée', crm: 'Nom côté CRM' } },
      }),
    )
  })

  it('un SECOND passage de sociétés Zoho ne crée aucun doublon : le lien posé au premier est relu', async () => {
    const linkStore: Array<{ external_id: string; internal_id: string }> = []
    const { service, accounts } = makeService({ linkStore })
    const page = accountSource([{ externalId: 'zo-a1', email: null, name: 'TF1' }])
    await service.importAccounts(USER, page, { ...input, entityType: 'account' })
    await service.importAccounts(USER, page, { ...input, entityType: 'account' })
    expect(accounts.save).toHaveBeenCalledTimes(1)
    expect(linkStore).toEqual([{ external_id: 'zo-a1', internal_id: ACCOUNT }])
  })
})

// #4051 — « Importé le <date> depuis <outil> » : la trace d'un import RÉEL, sur chaque fiche touchée.
describe('CrmImportService — la trace d’import sur la fiche (#4051)', () => {
  it('un import réel pose UNE trace par fiche touchée, sous le nom de l’outil branché', async () => {
    const { service, provenance } = makeService({ links: [{ external_id: 'hs-1', internal_id: CONTACT }] })
    await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: false,
      limit: 200,
    })
    expect(provenance.markImported).toHaveBeenCalledTimes(1)
    expect(provenance.markImported).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      entityType: 'contact',
      entityIds: [CONTACT],
      sourceKind: 'tool',
      sourceLabel: 'HubSpot',
    })
  })

  it('⚠️ SAIT DIRE NON — une simulation ne laisse aucune trace', async () => {
    const { service, provenance } = makeService({ links: [{ external_id: 'hs-1', internal_id: CONTACT }] })
    await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: true,
      limit: 200,
    })
    expect(provenance.markImported).not.toHaveBeenCalled()
  })

  it('⚠️ SAIT DIRE NON — une trace qui échoue ne fait jamais échouer l’import', async () => {
    const { service, provenance } = makeService({ links: [{ external_id: 'hs-1', internal_id: CONTACT }] })
    provenance.markImported.mockRejectedValueOnce(new Error('base indisponible'))
    const outcome = await service.importContacts(USER, source([MARIE]), {
      provider: 'hubspot',
      entityType: 'contact',
      dryRun: false,
      limit: 200,
    })
    expect(outcome.updated).toBe(1)
    expect(outcome.unavailable ?? null).toBeNull()
  })

  it('les sociétés aussi : une trace par société touchée', async () => {
    const { service, provenance } = makeService({ createdAccountId: ACCOUNT })
    await service.importAccounts(USER, accountSource([{ externalId: 'co-1', email: null, name: 'Acme' }]), {
      provider: 'hubspot',
      entityType: 'account',
      dryRun: false,
      limit: 200,
    })
    expect(provenance.markImported).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'account', entityIds: [ACCOUNT], sourceLabel: 'HubSpot' }),
    )
  })

  // #4446 — « Import CRM interrompu » partait vers Sentry SANS message (un `Error` sérialisé = `{}`),
  // et une autorisation expirée — un geste utilisateur attendu — y comptait comme une panne.
  describe('Import CRM interrompu — message et niveau de log (#4446)', () => {
    afterEach(() => jest.restoreAllMocks())
    const run = (listContacts: () => Promise<never>, service: CrmImportService) =>
      service.importContacts(USER, { provider: 'hubspot', listContacts } as never, {
        provider: 'hubspot',
        entityType: 'contact',
        dryRun: false,
        limit: 200,
      })

    it('journalise le message et le code fournisseur, pas un objet vide', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation()
      const { service } = makeService()
      await run(() => Promise.reject(new Error('HubSpot 500 internal')), service)
      expect(error).toHaveBeenCalledWith(
        'Import CRM interrompu: HubSpot 500 internal',
        expect.objectContaining({ message: 'HubSpot 500 internal', code: 'provider_unavailable' }),
      )
      expect(warn).not.toHaveBeenCalled()
      jest.restoreAllMocks()
    })

    it.each([
      ['invalid_grant', new Error('HubSpot token refresh failed: refresh token invalid (HTTP 400) — invalid_grant')],
      ['401', new Error('HubSpot 401 Unauthorized')],
      [
        'connecteur « autorisation a expiré »',
        new HttpException(
          { code: 'authorization_expired', message: 'Ton CRM est bien connecté, mais son autorisation a expiré.' },
          401,
        ),
      ],
    ])('une autorisation expirée (%s) est un warn attendu, pas une exception Sentry', async (_label, cause) => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation()
      const { service } = makeService()
      const outcome = await run(() => Promise.reject(cause), service)
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/^Import CRM interrompu: .+/),
        expect.objectContaining({ code: 'authorization_expired' }),
      )
      expect(error).not.toHaveBeenCalled()
      expect(outcome.unavailable).toBeTruthy()
      jest.restoreAllMocks()
    })
  })

  // IA-R (Sentry, 657 événements) — un 404 Odoo « res.partner.search_read : l'instance n'expose pas … » n'est pas
  // une panne de NOTRE côté : c'est un ÉTAT du connecteur, dit à l'utilisateur sur /integrations, en WARN.
  describe('Odoo n’expose pas les contacts — un état de connecteur, pas une exception', () => {
    afterEach(() => jest.restoreAllMocks())
    const odoo404 = new Error(
      'Le service a répondu 404 à res.partner.search_read : l’instance n’expose pas cet appel à ce compte — vérifie l’adresse branchée et le droit d’écriture de la clé, ou rebranche l’instance.',
    )

    it('journalise en WARN (jamais logger.error) et dit un message clair à l’utilisateur', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation()
      const { service } = makeService()
      const outcome = await service.importContacts(
        USER,
        { provider: 'odoo', listContacts: () => Promise.reject(odoo404) } as never,
        { provider: 'odoo', entityType: 'contact', dryRun: false, limit: 200 },
      )
      expect(error).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/^Import CRM interrompu: /),
        expect.objectContaining({ code: 'provider_endpoint_missing' }),
      )
      expect(outcome.unavailable).toBe(
        'Ton instance Odoo n’expose pas les contacts : vérifie l’adresse branchée et le droit de lecture de la clé, ou rebranche l’instance.',
      )
    })

    it('un 404 d’un autre appel, ou une autre panne, reste une erreur', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation()
      const { service } = makeService()
      await service.importContacts(
        USER,
        { provider: 'odoo', listContacts: () => Promise.reject(new Error('Odoo 500')) } as never,
        {
          provider: 'odoo',
          entityType: 'contact',
          dryRun: false,
          limit: 200,
        },
      )
      expect(error).toHaveBeenCalled()
    })
  })

  describe('Import de sociétés interrompu — niveau de log', () => {
    const run = (src: CrmAccountSource, service: CrmImportService) =>
      service.importAccounts(USER, src, { provider: 'hubspot', entityType: 'account', dryRun: false, limit: 200 })

    it('le CRM source qui refuse est un warn (dit à l’écran), pas une panne', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation()
      const { service } = makeService()
      await run({ provider: 'hubspot', listCompanies: async () => Promise.reject(new Error('HubSpot 429')) }, service)
      expect(warn).toHaveBeenCalledWith('Import de sociétés interrompu', expect.anything())
      expect(error).not.toHaveBeenCalled()
      jest.restoreAllMocks()
    })

    it('une panne de NOTRE côté reste error', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation()
      const { service, provenance } = makeService({ createdAccountId: ACCOUNT })
      provenance.markImported.mockRejectedValue(new Error('x'))
      const src = accountSource([{ externalId: 'co-1', email: null, name: 'Acme' }])
      // Une base qui casse APRÈS la lecture du CRM : on force via l'index des comptes.
      jest.spyOn(service as never, 'buildAccountIndex' as never).mockRejectedValue(new Error('db down') as never)
      await run(src, service)
      expect(error).toHaveBeenCalledWith('Import de sociétés interrompu', expect.anything())
      expect(warn).not.toHaveBeenCalledWith('Import de sociétés interrompu', expect.anything())
      jest.restoreAllMocks()
    })
  })
})
