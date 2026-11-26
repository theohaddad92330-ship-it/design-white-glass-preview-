import { MemoryPersonCacheStore, PersonContactCache, setPersonContactCacheStore } from './person-contact-cache'
import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import type { WorkspacePermission, WorkspaceRole } from '@bellum/contracts'
import { FindOperator, ILike, In, type DataSource } from 'typeorm'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ActivityParticipantEntity } from '../../database/entities/activity-participant.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { PersonalContactEntity } from '../../database/entities/personal-contact.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ContactMergeEntity } from '../../database/entities/contact-merge.entity'
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { EmailSuppressionEntity } from '../../database/entities/email-suppression.entity'
import { LinkedInInteractionEntity } from '../../database/entities/linkedin-interaction.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { OrgGraphCorrectionEntity } from '../../database/entities/org-graph-correction.entity'
import { PersonErasureEntity } from '../../database/entities/person-erasure.entity'
import { TaskEntity } from '../../database/entities/task.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { PERSON_ERASURE_HMAC_KEY_ENV } from '../../common/person-erasure-hmac'
import { SuppressionService } from '../mailer/suppression.service'
import { normalizeFullName } from './contact-identity'
import { erasedEmailFingerprint, personErasureFingerprints } from './person-erasure-fingerprint'
import { PersonErasureService } from './person-erasure.service'
import type { ContextPackOriginalEraser } from './person-erasure-context-pack-originals'
import { ContextPackOriginalsService } from '../universal-import/context-pack-originals.service'
import { sharedPersonFingerprints } from '../shared-base/shared-person-fingerprint'

const WS = 'ws-1'
// Une clé FIXE de test — jamais la valeur posée sur un serveur.
const TEST_KEY = 'test-only-person-erasure-key-0123456789abcdef'
const OWNER = 'user-owner'
const COLLEAGUE = 'user-colleague'

function contactRow(overrides: Partial<ContactEntity> = {}): ContactEntity {
  return {
    id: 'c-1',
    workspace_id: WS,
    user_id: OWNER,
    assigned_to: null,
    account_id: 'acc-1',
    full_name: 'Claire Perrin',
    email: 'claire.perrin@acme.fr',
    linkedin_url: 'https://www.linkedin.com/in/claire-perrin/',
    raw_data: { apolloId: 'AP-42' },
    ...overrides,
  } as ContactEntity
}

type Call = { op: 'delete' | 'update' | 'insert'; entity: unknown; criteria: unknown; values?: unknown }

/** Un compte, réduit aux colonnes qui portent le dossier. */
type AccountRow = {
  id: string
  workspace_id: string
  raw_analysis: Record<string, unknown>
  previous_raw_analysis: Record<string, unknown> | null
  org_declared_people: Record<string, unknown>[]
  org_rejected_items: Array<{ sourceId: string; reason: string }>
}

/** Une ligne `email_suppressions`, telle que la base la garde. */
type SuppressionRow = { id: string; workspace_id: string; email: string; reason: string; erased_at: Date | null }

/** Une ligne `org_graph_corrections`, réduite aux colonnes qui la désignent. */
type CorrectionRow = {
  id: string
  workspaceId: string
  accountId: string
  objectId: string
  oldValue: unknown
  newValue: unknown
}

/** Des critères TypeORM qui se LISENT vraiment : égalité, `In`, `Not(IsNull())`. */
function satisfies(value: unknown, condition: unknown): boolean {
  if (condition instanceof FindOperator) {
    if (condition.type === 'in') return (condition.value as unknown[]).includes(value)
    if (condition.type === 'isNull') return value === null || value === undefined
    if (condition.type === 'not') return !satisfies(value, condition.child ?? condition.value)
    throw new Error(`opérateur non simulé : ${condition.type}`)
  }
  return value === condition
}

function matching<T extends object>(rows: T[], where: unknown): T[] {
  const clauses = (Array.isArray(where) ? where : [where]) as Record<string, unknown>[]
  return rows.filter(row =>
    clauses.some(clause =>
      Object.entries(clause).every(([column, condition]) => satisfies(row[column as keyof T], condition)),
    ),
  )
}

function harness(
  opts: {
    contact?: ContactEntity | null
    isDemo?: boolean
    candidates?: ContactEntity[]
    merges?: Partial<ContactMergeEntity>[]
    losers?: ContactEntity[]
    /** #2297.51 — la table `email_suppressions`, partagée avec le contrôle d'envoi. */
    suppressions?: SuppressionRow[]
    /** #2297.51 — les dossiers des comptes (`raw_analysis` et ses voisins). */
    accounts?: AccountRow[]
    /** #2297.51 — le ledger de corrections d'organigramme (`org_graph_corrections`). */
    corrections?: CorrectionRow[]
    /** #3989 — les lignes de la base commune que la purge supprime (leurs ids). */
    sharedPurged?: string[]
    /** #3989 — les COPIES reçues par d'autres espaces depuis la base commune. */
    copies?: ContactEntity[]
    /** #4573 — le port qui efface les originaux des imports de pack de l'espace. */
    eraseContextPackOriginals?: ContextPackOriginalEraser
  } = {},
) {
  const calls: Call[] = []
  const suppressions = opts.suppressions ?? []
  const accounts = opts.accounts ?? []
  const corrections = opts.corrections ?? []
  const queries: Array<{ sql: string; params: unknown[] }> = []
  const copies = opts.copies ?? []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (/DELETE FROM shared_company_people/.test(sql)) {
        // TypeORM rend `[lignes, nombre]` pour un DELETE … RETURNING.
        const rows = (opts.sharedPurged ?? []).map(id => ({ id }))
        return [rows, rows.length]
      }
      return []
    }),
    find: jest.fn(async (entity: unknown, options: { where: unknown }) => {
      if (entity === ContactMergeEntity) return opts.merges ?? []
      if (entity === ContactEntity && (options.where as { source?: string }).source === 'shared_base') {
        // #3989 — la lecture des copies : source `shared_base`, HORS de l'espace qui
        // efface, dont `raw_data.sharedFactId` désigne une ligne commune purgée.
        const where = options.where as { workspace_id: FindOperator<string>; raw_data: FindOperator<unknown> }
        const factIds = (where.raw_data.objectLiteralParameters?.factIds as string[]) ?? []
        return copies.filter(
          row =>
            row.source === 'shared_base' &&
            row.workspace_id !== where.workspace_id.value &&
            factIds.includes(String(row.raw_data?.sharedFactId)),
        )
      }
      if (entity === ContactEntity) return Array.isArray(options.where) ? (opts.candidates ?? []) : (opts.losers ?? [])
      if (entity === EmailSuppressionEntity) return matching(suppressions, options.where).map(row => ({ ...row }))
      if (entity === AccountEntity) return structuredClone(matching(accounts, options.where))
      if (entity === OrgGraphCorrectionEntity) return matching(corrections, options.where).map(row => ({ ...row }))
      return []
    }),
    delete: jest.fn(async (entity: unknown, criteria: unknown) => {
      calls.push({ op: 'delete', entity, criteria })
      if (entity === EmailSuppressionEntity) {
        for (const row of matching(suppressions, criteria)) suppressions.splice(suppressions.indexOf(row), 1)
      }
      if (entity === OrgGraphCorrectionEntity) {
        for (const row of matching(corrections, criteria)) corrections.splice(corrections.indexOf(row), 1)
      }
      return { affected: 1 }
    }),
    update: jest.fn(async (entity: unknown, criteria: unknown, values: unknown) => {
      calls.push({ op: 'update', entity, criteria, values })
      if (entity === EmailSuppressionEntity) {
        for (const row of matching(suppressions, criteria)) Object.assign(row, values)
      }
      if (entity === AccountEntity) {
        for (const row of matching(accounts, criteria)) Object.assign(row, values)
      }
      return { affected: 0 }
    }),
    insert: jest.fn(async (entity: unknown, values: unknown) => {
      calls.push({ op: 'insert', entity, criteria: null, values })
      // #2297.51 — pour que `sendCheck` relise vraiment ce que le geste vient
      // de poser, comme la vraie table `email_suppressions` le ferait.
      if (entity === EmailSuppressionEntity) {
        const row = values as Omit<SuppressionRow, 'id'>
        suppressions.push({ id: `sup-created-${suppressions.length}`, ...row })
      }
      return {}
    }),
  }
  const contact = opts.contact === undefined ? contactRow() : opts.contact
  const repos = new Map<unknown, { findOne: jest.Mock }>([
    [ContactEntity, { findOne: jest.fn(async () => contact) }],
    [WorkspaceEntity, { findOne: jest.fn(async () => ({ id: WS, is_demo: opts.isDemo ?? false })) }],
  ])
  const dataSource = {
    transaction: jest.fn(async (run: (m: typeof manager) => Promise<unknown>) => run(manager)),
    getRepository: jest.fn((entity: unknown) => repos.get(entity)),
  } as unknown as DataSource
  return {
    service: new PersonErasureService(dataSource, opts.eraseContextPackOriginals),
    dataSource,
    calls,
    manager,
    queries,
  }
}

function erase(
  service: PersonErasureService,
  userId: string,
  role: WorkspaceRole,
  extraPermissions: WorkspacePermission[] = [],
) {
  return service.erase({ contactId: 'c-1', userId, workspaceId: WS, role, extraPermissions })
}

const deletedFrom = (calls: Call[], entity: unknown) => calls.filter(c => c.op === 'delete' && c.entity === entity)

describe('PersonErasureService — #2297 effacer une personne (RGPD art. 17)', () => {
  const savedKey = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  beforeEach(() => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
  })
  afterAll(() => {
    if (savedKey === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = savedKey
  })

  it('#2927 — supprime aussi les copies PERSONNELLES de la personne (même e-mail), de tout propriétaire', async () => {
    const { service, calls } = harness({ contact: contactRow({ email: 'Claire@exemple.test' }) })
    await erase(service, OWNER, 'sales')
    const personal = deletedFrom(calls, PersonalContactEntity)
    expect(personal.length).toBeGreaterThan(0)
    expect(JSON.stringify(personal[0]?.criteria)).toContain('workspace_id')
    expect(JSON.stringify(personal[0]?.criteria)).not.toContain('"user_id"')
  })

  it('CACHE-API — une personne effacée est purgée des caches de coordonnées, cache commun v2 comme v1 restant', async () => {
    const store = new MemoryPersonCacheStore()
    setPersonContactCacheStore(store)
    try {
      const cache = new PersonContactCache(store)
      const who = {
        firstName: 'Claire',
        lastName: 'Perrin',
        organizationName: 'Acme',
        linkedinUrl: 'https://linkedin.com/in/claire-perrin',
      }
      await cache.remember(who, { provider: 'fullenrich', email: 'claire@acme.fr' }, ['email'])
      const keys = PersonContactCache.iaKeys(who)
      await store.set(keys[0] as string, '{}', 100)
      const { service } = harness()
      await erase(service, OWNER, 'sales')
      expect(await cache.lookup(who, ['email'])).toEqual({ settled: false })
      expect(await store.get(keys[0] as string)).toBeNull()
    } finally {
      setPersonContactCacheStore(null)
    }
  })

  it('le porteur de la fiche efface : la fiche est SUPPRIMÉE, pas anonymisée', async () => {
    const { service, calls } = harness()
    const result = await erase(service, OWNER, 'sales')

    expect(result.erased).toBe(true)
    expect(deletedFrom(calls, ContactEntity)).toEqual([
      { op: 'delete', entity: ContactEntity, criteria: { id: In(['c-1']) } },
    ])
    // Rien n'est « scrubé » : aucune écriture sur la fiche elle-même.
    expect(calls.filter(c => c.op === 'update' && c.entity === ContactEntity)).toEqual([])
  })

  it('supprime ce qui la NOMME : activités, journal réseau, arrêt, tâches, plan, fusions', async () => {
    const { service, calls } = harness()
    await erase(service, OWNER, 'sales')

    for (const entity of [
      ActivityEntity,
      ActivityParticipantEntity,
      LinkedInInteractionEntity,
      ContactStopEntity,
      TaskEntity,
      ActionPlanItemEntity,
    ]) {
      expect(deletedFrom(calls, entity)).toEqual([{ op: 'delete', entity, criteria: { contact_id: In(['c-1']) } }])
    }
    expect(deletedFrom(calls, ContactMergeEntity).map(c => c.criteria)).toEqual([
      { winner_id: In(['c-1']) },
      { loser_id: In(['c-1']) },
    ])
  })

  it('supprime la mémoire de Laura qui la cite — par lien ET par son nom complet', async () => {
    const { service, calls } = harness()
    await erase(service, OWNER, 'sales')

    expect(deletedFrom(calls, MemoryPinnedFactEntity).map(c => c.criteria)).toEqual([
      { contact_id: In(['c-1']) },
      { workspace_id: WS, fact: ILike('%Claire Perrin%') },
    ])
  })

  it('sait dire NON : un prénom seul ne vide pas la mémoire de toutes les Claire de l’espace', async () => {
    const { service, calls } = harness({ contact: contactRow({ full_name: 'Claire' }) })
    await erase(service, OWNER, 'sales')

    expect(deletedFrom(calls, MemoryPinnedFactEntity).map(c => c.criteria)).toEqual([{ contact_id: In(['c-1']) }])
  })

  it('laisse une trace SANS donnée personnelle : qui, quand, empreintes', async () => {
    const { service, calls } = harness()
    await erase(service, OWNER, 'sales')

    // #2297.51 — depuis que l'opposition est TOUJOURS posée, une seconde
    // écriture (`EmailSuppressionEntity`) accompagne celle-ci ; ce test ne
    // vise que la trace `person_erasures`.
    const inserts = calls.filter(c => c.op === 'insert' && c.entity === PersonErasureEntity)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]?.entity).toBe(PersonErasureEntity)
    const trace = inserts[0]?.values as { workspace_id: string; erased_by: string; fingerprints: string[] }
    expect(trace.workspace_id).toBe(WS)
    expect(trace.erased_by).toBe(OWNER)
    expect(trace.fingerprints).toEqual(
      expect.arrayContaining(
        personErasureFingerprints(WS, {
          fullName: 'Claire Perrin',
          email: 'claire.perrin@acme.fr',
          linkedinUrl: 'https://www.linkedin.com/in/claire-perrin/',
          apolloId: 'AP-42',
          accountId: 'acc-1',
        }),
      ),
    )
    const serialized = JSON.stringify(trace).toLowerCase()
    for (const clear of ['claire', 'perrin', 'acme', 'linkedin', 'ap-42', 'c-1']) {
      expect(serialized).not.toContain(clear)
    }
  })

  it('efface la PERSONNE, pas seulement la fiche : ses doublons fusionnés et sa fiche sur un autre compte', async () => {
    const elsewhere = contactRow({ id: 'c-2', account_id: 'acc-2', linkedin_url: null, raw_data: null })
    const homonym = contactRow({
      id: 'c-3',
      account_id: 'acc-3',
      email: 'claire@autre.fr',
      linkedin_url: null,
      raw_data: null,
    })
    const loser = contactRow({ id: 'c-0', full_name: 'PERRIN Claire', email: null, linkedin_url: null, raw_data: null })
    const { service, calls } = harness({
      candidates: [elsewhere, homonym],
      merges: [{ winner_id: 'c-1', loser_id: 'c-0' }],
      losers: [loser],
    })
    await erase(service, OWNER, 'sales')

    // c-2 partage son adresse : c'est elle. c-3 n'est qu'une homonyme ailleurs.
    expect(deletedFrom(calls, ContactEntity)).toEqual([
      { op: 'delete', entity: ContactEntity, criteria: { id: In(['c-1', 'c-0', 'c-2']) } },
    ])
  })

  it('un administrateur efface la fiche d’un collègue', async () => {
    const { service, calls } = harness({ contact: contactRow({ user_id: COLLEAGUE }) })
    await erase(service, OWNER, 'admin')
    expect(deletedFrom(calls, ContactEntity)).toHaveLength(1)
  })

  it('sait dire NON : un commercial sur la fiche d’un collègue — rien n’est touché', async () => {
    const { service, dataSource } = harness({ contact: contactRow({ user_id: COLLEAGUE }) })
    await expect(erase(service, OWNER, 'sales')).rejects.toBeInstanceOf(ForbiddenException)
    expect(dataSource.transaction).not.toHaveBeenCalled()
  })

  it('sait dire NON : une fiche hors de l’espace actif est introuvable', async () => {
    const { service, dataSource } = harness({ contact: null })
    await expect(erase(service, OWNER, 'owner')).rejects.toBeInstanceOf(NotFoundException)
    expect(dataSource.transaction).not.toHaveBeenCalled()
  })

  it('ne s’exerce pas en démonstration (décision Louis 19/09/2026) — refusé avant toute écriture', async () => {
    const { service, dataSource } = harness({ isDemo: true })
    await expect(erase(service, OWNER, 'owner')).rejects.toBeInstanceOf(BadRequestException)
    expect(dataSource.transaction).not.toHaveBeenCalled()
  })

  // #2297.51 — sans sa clé, l'effacement ne se replie sur rien : il répond
  // « indisponible » et n'écrit pas une ligne. Même patron qu'un secret interne
  // absent en production.
  it('#2297.51 — sans clé d’empreinte : 503, et RIEN n’est écrit (ni suppression, ni trace)', async () => {
    delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    const { service, dataSource, calls } = harness()
    await expect(erase(service, OWNER, 'owner')).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(dataSource.transaction).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('#2297.51 — une clé trop courte ne vaut pas mieux : 503, rien d’écrit', async () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = 'too-short'
    const { service, dataSource } = harness()
    await expect(erase(service, OWNER, 'owner')).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(dataSource.transaction).not.toHaveBeenCalled()
  })

  // #3989 (Louis 11/10/2026) — « purge dans la table commune ET dans tous les
  // espaces qui l'ont reçue par elle ; l'empreinte empêche la recollecte ».
  describe('#3989 — l’effacement se propage à la base commune et aux copies des autres espaces', () => {
    const sharedPrints = () =>
      sharedPersonFingerprints({
        fullName: 'Claire Perrin',
        email: 'claire.perrin@acme.fr',
        linkedinUrl: 'https://www.linkedin.com/in/claire-perrin/',
        apolloId: 'AP-42',
        companyKey: null,
      })

    it('purge la base commune par empreinte et pose l’empreinte qui bloque la recollecte', async () => {
      const { service, queries } = harness()
      await erase(service, OWNER, 'sales')
      const purge = queries.find(q => /DELETE FROM shared_company_people/.test(q.sql))
      expect(purge?.params[0]).toEqual(expect.arrayContaining(sharedPrints()))
      const trace = queries.find(q => /INSERT INTO shared_person_erasures/.test(q.sql))
      expect(trace?.params[0]).toEqual(purge?.params[0])
      expect(JSON.stringify(trace?.params).toLowerCase()).not.toContain('perrin')
    })

    it('efface les COPIES reçues par un autre espace, et y pose sa trace (aucun membre de cet espace n’a effacé)', async () => {
      const copy = contactRow({
        id: 'copy-1',
        workspace_id: 'ws-2',
        account_id: 'acc-ws2',
        source: 'shared_base',
        raw_data: { sharedFactId: 'f-1' },
      })
      const { service, calls } = harness({ sharedPurged: ['f-1'], copies: [copy] })
      await erase(service, OWNER, 'sales')
      expect(deletedFrom(calls, ContactEntity).map(c => c.criteria)).toEqual([
        { id: In(['c-1']) },
        { id: In(['copy-1']) },
      ])
      const traces = calls
        .filter(c => c.op === 'insert' && c.entity === PersonErasureEntity)
        .map(c => c.values as { workspace_id: string; erased_by: string | null })
      expect(traces.map(t => [t.workspace_id, t.erased_by])).toEqual([
        [WS, OWNER],
        ['ws-2', null],
      ])
    })

    it('efface une copie reçue même quand la personne est effacée DEPUIS une copie', async () => {
      const own = contactRow({ source: 'shared_base', raw_data: { sharedFactId: 'f-9' } })
      const other = contactRow({
        id: 'copy-9',
        workspace_id: 'ws-3',
        source: 'shared_base',
        raw_data: { sharedFactId: 'f-9' },
      })
      const { service, calls } = harness({ contact: own, copies: [other] })
      await erase(service, OWNER, 'sales')
      expect(deletedFrom(calls, ContactEntity).map(c => c.criteria)).toEqual([
        { id: In(['c-1']) },
        { id: In(['copy-9']) },
      ])
    })

    it('sait dire NON — la fiche que l’autre espace a collectée LUI-MÊME n’est pas une copie et reste', async () => {
      const ownCollect = contactRow({ id: 'theirs', workspace_id: 'ws-2', source: 'pappers', raw_data: null })
      const { service, calls } = harness({ sharedPurged: ['f-1'], copies: [ownCollect] })
      await erase(service, OWNER, 'sales')
      expect(deletedFrom(calls, ContactEntity).map(c => c.criteria)).toEqual([{ id: In(['c-1']) }])
    })
  })

  describe('#2297.51 — son opposition RESTE, mais plus aucune adresse en clair', () => {
    let sequence = 0
    const optOut = (email: string, overrides: Partial<SuppressionRow> = {}): SuppressionRow => ({
      id: `sup-${(sequence += 1)}`,
      workspace_id: WS,
      email,
      reason: 'unsubscribe',
      erased_at: null,
      ...overrides,
    })

    /** Le VRAI contrôle d'envoi, lu sur la même table que l'effacement vient d'écrire. */
    function sendCheck(rows: SuppressionRow[]): SuppressionService {
      const repository = {
        count: jest.fn(async ({ where }: { where: unknown }) => matching(rows, where).length),
      }
      return new SuppressionService(repository as never, { find: jest.fn(async () => []) } as never)
    }

    it('la ligne est CONSERVÉE, son adresse remplacée par son empreinte — et un envoi vers elle est REFUSÉ', async () => {
      const suppressions = [
        optOut('claire.perrin@acme.fr', { id: 'sup-claire' }),
        optOut('jean.dupont@acme.fr', { id: 'sup-tiers' }),
      ]
      const { service } = harness({ suppressions })

      await erase(service, OWNER, 'sales')

      // La même ligne (même id, même raison), l'adresse devenue empreinte.
      const kept = suppressions.find(row => row.id === 'sup-claire')
      expect(kept?.email).toBe(erasedEmailFingerprint(WS, 'claire.perrin@acme.fr'))
      expect(kept?.reason).toBe('unsubscribe')
      expect(kept?.erased_at).toBeInstanceOf(Date)
      expect(JSON.stringify(suppressions.map(row => row.email))).not.toContain('claire')
      // L'opposition d'un tiers n'est pas touchée.
      expect(suppressions.find(row => row.id === 'sup-tiers')?.email).toBe('jean.dupont@acme.fr')

      // Ce test ROUGIT si le contrôle d'envoi ne lit que l'adresse en clair.
      expect(await sendCheck(suppressions).isSuppressed(WS, 'Claire.Perrin@acme.fr')).toBe(true)
      expect(await sendCheck(suppressions).isSuppressed(WS, 'jean.dupont@acme.fr')).toBe(true)
      expect(await sendCheck(suppressions).isSuppressed(WS, 'marc.dubois@acme.fr')).toBe(false)
    })

    it('les adresses de TOUTES ses fiches passent en empreinte (doublon sur un autre compte)', async () => {
      const elsewhere = contactRow({ id: 'c-2', account_id: 'acc-2', email: 'CLAIRE.PERRIN@acme.fr' })
      const secondAddress = contactRow({ id: 'c-4', account_id: 'acc-2', email: 'c.perrin@perso.fr' })
      const suppressions = [optOut('claire.perrin@acme.fr'), optOut('c.perrin@perso.fr')]
      const { service } = harness({ suppressions, candidates: [elsewhere, secondAddress] })

      await erase(service, OWNER, 'sales')

      expect(suppressions.map(row => row.email).sort()).toEqual(
        [erasedEmailFingerprint(WS, 'claire.perrin@acme.fr'), erasedEmailFingerprint(WS, 'c.perrin@perso.fr')].sort(),
      )
    })

    it('une empreinte déjà posée n’est pas dupliquée : la ligne en clair restante part', async () => {
      const print = erasedEmailFingerprint(WS, 'claire.perrin@acme.fr') as string
      const suppressions = [
        optOut(print, { id: 'sup-old', erased_at: new Date('2026-09-01T00:00:00Z') }),
        optOut('claire.perrin@acme.fr'),
      ]
      const { service } = harness({ suppressions })

      await erase(service, OWNER, 'sales')

      expect(suppressions.map(row => row.id)).toEqual(['sup-old'])
      expect(JSON.stringify(suppressions)).not.toContain('claire')
    })

    // #2297.51 — décision Louis 19/09/2026, « Oui, en créer une » : l'opposition
    // est TOUJOURS posée, même si la personne ne s'était jamais désabonnée —
    // sinon son adresse resterait écrivable après son propre effacement.
    it('sans opposition PRÉALABLE, l’effacement en POSE une, en empreinte — et un envoi vers elle est REFUSÉ', async () => {
      const suppressions: SuppressionRow[] = []
      const { service } = harness({ suppressions })

      await erase(service, OWNER, 'sales')

      expect(suppressions).toHaveLength(1)
      const created = suppressions[0]
      expect(created?.email).toBe(erasedEmailFingerprint(WS, 'claire.perrin@acme.fr'))
      expect(created?.erased_at).toBeInstanceOf(Date)
      expect(created?.reason).not.toBe('')
      expect(JSON.stringify(suppressions)).not.toContain('claire')

      // Ce test ROUGIT si l'effacement n'a rien posé : le contrôle d'envoi
      // laisserait alors repartir un message vers elle.
      expect(await sendCheck(suppressions).isSuppressed(WS, 'Claire.Perrin@acme.fr')).toBe(true)
    })

    it('une adresse posée sur UNE de ses fiches suffit — les autres fiches sans adresse ne créent rien en double', async () => {
      const secondFiche = contactRow({
        id: 'c-2',
        account_id: 'acc-2',
        email: null,
        linkedin_url: null,
        raw_data: null,
      })
      const suppressions: SuppressionRow[] = []
      const { service } = harness({ suppressions, candidates: [secondFiche] })

      await erase(service, OWNER, 'sales')

      expect(suppressions).toHaveLength(1)
    })

    it('sait dire NON : aucune adresse connue — rien n’est créé, aucun désabonnement inventé', async () => {
      const suppressions: SuppressionRow[] = []
      const { service } = harness({ suppressions, contact: contactRow({ email: null }) })

      await erase(service, OWNER, 'sales')

      expect(suppressions).toEqual([])
    })
  })

  describe('#2297.51 — l’organigramme et tout le dossier du compte, purgés TOUT DE SUITE', () => {
    const account = (id: string, overrides: Partial<AccountRow> = {}): AccountRow => ({
      id,
      workspace_id: WS,
      raw_analysis: {
        summary: 'Claire Perrin (DSI) pilote la refonte ; Jean Dupont suit.',
        executives: [{ first_name: 'Claire', last_name: 'PERRIN', role: 'DG déléguée' }],
        org: {
          stakeholderMap: [{ fullName: 'Claire Perrin', stance: 'supporter' }, { fullName: 'Jean Dupont' }],
          orgGraph: {
            people: [
              { id: 'p-1', fullName: 'Claire Perrin' },
              { id: 'p-2', fullName: 'Jean Dupont' },
            ],
            hierarchyEdges: [{ fromId: 'p-1', toId: 'p-2', type: 'manages' }],
            buyingCommittee: [{ personId: 'p-1' }, { personId: 'p-2' }],
          },
        },
      },
      previous_raw_analysis: { org: { stakeholderMap: [{ fullName: 'PERRIN Claire' }] } },
      org_declared_people: [
        { fullName: 'Claire Perrin', declaredAt: '2026-09-01' },
        { fullName: 'Jean Dupont', managerName: 'Claire Perrin', declaredAt: '2026-09-01' },
      ],
      org_rejected_items: [{ sourceId: 'p-1', reason: 'doublon' }],
      ...overrides,
    })
    const names = (row: AccountRow | undefined): string => ` ${normalizeFullName(JSON.stringify(row))} `

    it('après effacement, son nom n’apparaît plus NULLE PART dans le dossier du compte — sans relancer d’analyse', async () => {
      const accounts = [account('acc-1')]
      expect(names(accounts[0])).toContain(' claire perrin ')
      const { service, dataSource } = harness({ accounts })

      await erase(service, OWNER, 'sales')

      const purged = accounts[0]
      expect(names(purged)).not.toContain(' claire perrin ')
      expect(names(purged)).not.toContain(' perrin claire ')
      expect(JSON.stringify(purged)).not.toContain('"p-1"')
      // Le reste du dossier est là : Jean Dupont, son nœud, sa place au comité.
      expect(names(purged)).toContain(' jean dupont ')
      expect(purged?.org_declared_people).toEqual([{ fullName: 'Jean Dupont', declaredAt: '2026-09-01' }])
      expect(purged?.org_rejected_items).toEqual([])
      // Une seule transaction : aucune écriture hors du geste, aucune analyse relancée.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1)
    })

    it('purge TOUS les comptes où elle figure, et verrouille leur ligne le temps du geste', async () => {
      const elsewhere = contactRow({ id: 'c-2', account_id: 'acc-2', linkedin_url: null, raw_data: null })
      const accounts = [account('acc-1'), account('acc-2')]
      const { service, manager } = harness({ accounts, candidates: [elsewhere] })

      await erase(service, OWNER, 'sales')

      for (const row of accounts) expect(names(row)).not.toContain(' claire perrin ')
      expect(manager.find).toHaveBeenCalledWith(
        AccountEntity,
        expect.objectContaining({
          where: { id: In(['acc-1', 'acc-2']), workspace_id: WS },
          lock: { mode: 'pessimistic_write' },
        }),
      )
    })

    it('sait dire NON : le dossier d’un compte où elle n’a pas de fiche n’est pas touché (son homonyme non plus)', async () => {
      const untouched = account('acc-3')
      const accounts = [account('acc-1'), untouched]
      const snapshot = JSON.stringify(untouched)
      const { service, calls } = harness({ accounts })

      await erase(service, OWNER, 'sales')

      expect(JSON.stringify(accounts[1])).toBe(snapshot)
      expect(calls.filter(c => c.op === 'update' && c.entity === AccountEntity).map(c => c.criteria)).toEqual([
        { id: 'acc-1' },
      ])
    })

    describe('#2297.51 — org_graph_corrections EST PURGÉE, dans la même transaction', () => {
      const correction = (overrides: Partial<CorrectionRow>): CorrectionRow => ({
        id: 'corr-x',
        workspaceId: WS,
        accountId: 'acc-1',
        objectId: 'p-9',
        oldValue: null,
        newValue: null,
        ...overrides,
      })

      it('une correction posée SUR son nœud (objectId) part', async () => {
        const accounts = [account('acc-1')]
        const corrections = [correction({ id: 'corr-her', objectId: 'p-1', oldValue: 'DSI', newValue: 'DAF' })]
        const { service } = harness({ accounts, corrections })

        await erase(service, OWNER, 'sales')

        expect(corrections).toEqual([])
      })

      it('sait dire NON : une correction sur le nœud d’un AUTRE reste', async () => {
        const accounts = [account('acc-1')]
        const corrections = [
          correction({ id: 'corr-other', objectId: 'p-2', oldValue: 'RSSI', newValue: 'RSSI adjoint' }),
        ]
        const { service } = harness({ accounts, corrections })

        await erase(service, OWNER, 'sales')

        expect(corrections.map(row => row.id)).toEqual(['corr-other'])
      })

      it('un N+1 (reportsTo) qui la désigne DEPUIS la fiche d’un autre part aussi', async () => {
        const accounts = [account('acc-1')]
        const corrections = [correction({ id: 'corr-reports-to-her', objectId: 'p-2', newValue: 'p-1' })]
        const { service } = harness({ accounts, corrections })

        await erase(service, OWNER, 'sales')

        expect(corrections).toEqual([])
      })

      it('sait dire NON : une correction d’un compte où elle n’a pas de fiche n’est jamais interrogée', async () => {
        const accounts = [account('acc-1')]
        // Même objectId que son nœud sur acc-1, mais sur un AUTRE compte : hors
        // périmètre, jamais lu (elle n'a pas de fiche là-bas).
        const corrections = [correction({ id: 'corr-elsewhere', accountId: 'acc-9', objectId: 'p-1' })]
        const { service } = harness({ accounts, corrections })

        await erase(service, OWNER, 'sales')

        expect(corrections.map(row => row.id)).toEqual(['corr-elsewhere'])
      })
    })
  })
})

// #4573 — un original suit le sort de la donnée : l'effacement d'une personne (c67) emporte les originaux de pack.
describe('PersonErasureService — les originaux des imports de pack (#4573)', () => {
  const savedKey = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  beforeEach(() => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
  })
  afterAll(() => {
    if (savedKey === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = savedKey
  })

  /** Le VRAI service des originaux, sur un seau et un dépôt doubles : on lit l'objet, pas seulement la ligne. */
  function originalsOf(workspaceId: string) {
    const path = `${workspaceId}/context-pack/imp-1/Playbook.pdf`
    const objects = new Map<string, Buffer>([[path, Buffer.from('%PDF')]])
    const row = {
      id: 'imp-1',
      workspace_id: workspaceId,
      original_status: 'kept',
      original_storage_path: path as string | null,
    }
    const repo = {
      find: jest.fn(async ({ where }: { where: { workspace_id: string } }) =>
        where.workspace_id === row.workspace_id ? [row] : [],
      ),
      update: jest.fn(async (_where: unknown, patch: Partial<typeof row>) => void Object.assign(row, patch)),
    }
    const storage = {
      remove: jest.fn(async (paths: string[]) => {
        for (const p of paths) objects.delete(p)
        return true
      }),
    }
    const service = new ContextPackOriginalsService(repo as never, storage as never)
    return { objects, path, row, eraser: (ws: string) => service.eraseWorkspaceOriginals(ws) }
  }

  it('l’OBJET du seau disparaît avec l’effacement, la ligne d’historique reste et dit « effacé »', async () => {
    const originals = originalsOf(WS)
    const { service } = harness({ eraseContextPackOriginals: originals.eraser })
    await expect(erase(service, OWNER, 'sales')).resolves.toMatchObject({ erased: true })
    expect(originals.objects.has(originals.path)).toBe(false)
    expect(originals.row).toMatchObject({ original_status: 'erased', original_storage_path: null })
  })

  it('sait dire NON : un effacement refusé (droit) ne touche à aucun original', async () => {
    const originals = originalsOf(WS)
    const { service } = harness({ eraseContextPackOriginals: originals.eraser })
    await expect(erase(service, 'u-other', 'sales')).rejects.toBeInstanceOf(ForbiddenException)
    expect(originals.objects.has(originals.path)).toBe(true)
  })

  it('un seau en panne ne défait pas l’effacement déjà écrit : le chemin reste pour le prochain', async () => {
    const eraser = jest.fn(async () => {
      throw new Error('store down')
    })
    const { service } = harness({ eraseContextPackOriginals: eraser })
    await expect(erase(service, OWNER, 'sales')).resolves.toMatchObject({ erased: true })
    expect(eraser).toHaveBeenCalledWith(WS)
  })
})
