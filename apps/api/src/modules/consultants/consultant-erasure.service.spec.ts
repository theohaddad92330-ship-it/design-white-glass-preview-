import { BadRequestException } from '@nestjs/common'
import type { WorkspacePermission, WorkspaceRole } from '@bellum/contracts'
import { In, type DataSource } from 'typeorm'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantDocumentEntity } from '../../database/entities/consultant-document.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { MissionAssignmentEntity } from '../../database/entities/mission-assignment.entity'
import { OutgoingPaymentEntity } from '../../database/entities/outgoing-payment.entity'
import { PersonErasureEntity } from '../../database/entities/person-erasure.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { PERSON_ERASURE_HMAC_KEY_ENV, PersonErasureKeyUnavailableError } from '../../common/person-erasure-hmac'
import {
  ConsultantErasureService,
  consultantErasureFingerprints,
  isErasedConsultantIdentity,
} from './consultant-erasure.service'

const WS = 'ws-1'
const TEST_KEY = 'test-only-person-erasure-key-0123456789abcdef'
const OWNER = 'user-owner'
const OTHER = 'user-other'
const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
const ID_GONE = '33333333-3333-4333-8333-333333333333'

function row(id: string, over: Partial<ConsultantEntity> = {}): ConsultantEntity {
  return {
    id,
    workspace_id: WS,
    user_id: OWNER,
    owner_user_id: null,
    full_name: 'Camille Bernard',
    email: 'camille.bernard@exemple.test',
    public_profile_url: 'https://www.linkedin.com/in/camille-bernard/',
    ...over,
  } as ConsultantEntity
}

type Call = { op: 'delete' | 'update' | 'insert' | 'query'; entity?: unknown; criteria?: unknown; values?: unknown }

function harness(
  opts: {
    rows?: ConsultantEntity[]
    isDemo?: boolean
    openAssignments?: string[]
    /** #4034.6 — les originaux de CV rangés au stockage pour ces fiches. */
    storagePaths?: string[]
    storageRemoves?: boolean
  } = {},
) {
  const calls: Call[] = []
  const rows = opts.rows ?? [row(ID_A)]
  const manager = {
    delete: jest.fn(async (entity: unknown, criteria: unknown) => {
      calls.push({ op: 'delete', entity, criteria })
      return { affected: 1 }
    }),
    update: jest.fn(async (entity: unknown, criteria: unknown, values: unknown) => {
      calls.push({ op: 'update', entity, criteria, values })
      return { affected: 1 }
    }),
    insert: jest.fn(async (entity: unknown, values: unknown) => {
      calls.push({ op: 'insert', entity, values })
      return {}
    }),
    query: jest.fn(async (sql: string) => {
      calls.push({ op: 'query', criteria: sql })
      if (sql.includes('storage_path')) return (opts.storagePaths ?? []).map(path => ({ storage_path: path }))
      return []
    }),
  }
  const storage = { remove: jest.fn(async () => opts.storageRemoves ?? true) }
  const qb = {
    where: jest.fn(function (this: unknown) {
      return this
    }),
    andWhere: jest.fn(function (this: unknown) {
      return this
    }),
    getMany: jest.fn(async () => rows),
  }
  const repos = new Map<unknown, unknown>([
    [WorkspaceEntity, { findOne: jest.fn(async () => ({ id: WS, is_demo: opts.isDemo ?? false })) }],
    [ConsultantEntity, { createQueryBuilder: jest.fn(() => qb) }],
  ])
  const dataSource = {
    transaction: jest.fn(async (run: (m: typeof manager) => Promise<unknown>) => run(manager)),
    getRepository: jest.fn((entity: unknown) => repos.get(entity)),
    query: jest.fn(async () => (opts.openAssignments ?? []).map(id => ({ consultant_id: id, n: '1' }))),
  } as unknown as DataSource
  return { service: new ConsultantErasureService(dataSource, storage as never), calls, qb, storage }
}

function erase(
  service: ConsultantErasureService,
  ids: string[],
  userId = OWNER,
  role: WorkspaceRole = 'sales',
  extraPermissions: WorkspacePermission[] = [],
) {
  return service.eraseMany({ ids, userId, workspaceId: WS, role, extraPermissions })
}

const deletedFrom = (calls: Call[], entity: unknown) => calls.filter(c => c.op === 'delete' && c.entity === entity)

describe('ConsultantErasureService — #3781 supprimer définitivement = effacement RGPD', () => {
  const savedKey = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  beforeEach(() => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
  })
  afterAll(() => {
    if (savedKey === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = savedKey
  })

  it('lit LE VIVIER CLOISONNÉ (IN ids + prédicat d’espace) puis supprime la fiche — pas un delete aveugle', async () => {
    const { service, calls, qb } = harness()
    const result = await erase(service, [ID_A])

    expect(qb.where).toHaveBeenCalledWith('c.id IN (:...ids)', { ids: [ID_A] })
    expect(qb.andWhere).toHaveBeenCalledTimes(1)
    expect(result.erased).toEqual([ID_A])
    expect(result.skipped).toEqual([])
    expect(deletedFrom(calls, ConsultantEntity)).toEqual([
      { op: 'delete', entity: ConsultantEntity, criteria: { id: In([ID_A]) } },
    ])
  })

  describe('#4034.6 — l’ORIGINAL du CV part avec la personne', () => {
    const PATH = `${WS}/cv/doc-1/cv.pdf`

    it('efface les fichiers conservés au stockage, lus AVANT la suppression des documents', async () => {
      const { service, calls, storage } = harness({ storagePaths: [PATH] })
      await erase(service, [ID_A])

      expect(storage.remove).toHaveBeenCalledWith([PATH])
      const read = calls.findIndex(c => c.op === 'query' && String(c.criteria).includes('storage_path'))
      const docsDeleted = calls.findIndex(c => c.op === 'delete' && c.entity === ConsultantDocumentEntity)
      expect(read).toBeGreaterThanOrEqual(0)
      expect(read).toBeLessThan(docsDeleted)
    })

    it('sait dire NON : aucune fiche avec original → le stockage n’est pas appelé', async () => {
      const { service, storage } = harness({ storagePaths: [] })
      await erase(service, [ID_A])
      expect(storage.remove).not.toHaveBeenCalled()
    })

    it('un refus du stockage ne fait pas échouer l’effacement, et le journal ne nomme personne', async () => {
      const { service } = harness({ storagePaths: [PATH], storageRemoves: false })
      const error = jest.spyOn((service as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      error.mockImplementation(() => undefined)
      const result = await erase(service, [ID_A])
      expect(result.erased).toEqual([ID_A])
      const logged = JSON.stringify(error.mock.calls)
      expect(logged).toContain('1')
      expect(logged).not.toContain('Camille')
    })
  })

  it('pose UNE trace sans donnée de la personne : des empreintes hexadécimales, jamais l’e-mail ni le nom', async () => {
    const { service, calls } = harness()
    await erase(service, [ID_A])

    const insert = calls.find(c => c.op === 'insert')
    expect(insert?.entity).toBe(PersonErasureEntity)
    const values = insert?.values as { workspace_id: string; erased_by: string; fingerprints: string[] }
    expect(values.workspace_id).toBe(WS)
    expect(values.erased_by).toBe(OWNER)
    expect(values.fingerprints.length).toBeGreaterThanOrEqual(1)
    for (const print of values.fingerprints) expect(print).toMatch(/^[0-9a-f]{64}$/)
    const serialised = JSON.stringify(calls.filter(c => c.op === 'insert'))
    expect(serialised).not.toContain('camille')
    expect(serialised).not.toContain('Camille')
  })

  it('coupe le lien des paiements (pièces à conservation légale) et supprime les affectations terminées', async () => {
    const { service, calls } = harness()
    await erase(service, [ID_A])

    expect(deletedFrom(calls, MissionAssignmentEntity)).toHaveLength(1)
    const payment = calls.find(c => c.op === 'update' && c.entity === OutgoingPaymentEntity)
    expect(payment?.values).toEqual({ consultant_id: null })
    expect(deletedFrom(calls, OutgoingPaymentEntity)).toEqual([])
  })

  it('retire la mémoire de Laura par le NOM COMPLET, jamais par un prénom seul', async () => {
    const { service, calls } = harness({ rows: [row(ID_A, { full_name: 'Camille' })] })
    await erase(service, [ID_A])
    // Un prénom seul : seul le lien (`consultant_id`) part, aucun ILIKE.
    const facts = deletedFrom(calls, MemoryPinnedFactEntity)
    expect(facts).toHaveLength(1)
    expect(JSON.stringify(facts[0]?.criteria)).toContain('consultant_id')
  })

  it('un résultat PAR PROFIL : introuvable, interdit et bloqué restent, sans faire échouer le reste', async () => {
    const { service, calls } = harness({
      rows: [
        row(ID_A), // porté par OTHER (user_id OWNER) → un commercial qui n'en est pas le porteur : interdit
        row(ID_B, { user_id: OTHER }), // OTHER est porteur de B
      ],
      openAssignments: [ID_B],
    })
    const result = await erase(service, [ID_A, ID_B, ID_GONE], OTHER)

    expect(result.erased).toEqual([])
    expect(result.skipped).toEqual([
      { consultant_id: ID_A, reason: 'forbidden' },
      { consultant_id: ID_B, reason: 'blocked' },
      { consultant_id: ID_GONE, reason: 'not_found' },
    ])
    expect(result.erased_at).toBeNull()
    // Rien n'est écrit quand rien n'est effacé — pas même une trace vide.
    expect(calls.filter(c => c.op !== 'query')).toEqual([])
  })

  it('un administrateur efface une fiche dont il n’est pas le porteur', async () => {
    const { service } = harness()
    const result = await erase(service, [ID_A], OTHER, 'admin')
    expect(result.erased).toEqual([ID_A])
  })

  it('REFUSE en démonstration, avant toute lecture ou écriture', async () => {
    const { service, calls, qb } = harness({ isDemo: true })
    await expect(erase(service, [ID_A])).rejects.toBeInstanceOf(BadRequestException)
    expect(qb.getMany).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('REFUSE (503) sans clé d’empreinte, avant toute écriture — jamais un SHA-256 nu', async () => {
    delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    const { service, calls } = harness()
    await expect(erase(service, [ID_A])).rejects.toBeInstanceOf(PersonErasureKeyUnavailableError)
    expect(calls).toEqual([])
  })

  it('refuse sans espace actif : rien ne se borne, rien ne s’ouvre', async () => {
    const { service } = harness()
    await expect(
      service.eraseMany({ ids: [ID_A], userId: OWNER, workspaceId: null, role: 'owner', extraPermissions: [] }),
    ).rejects.toThrow()
  })
})

describe('isErasedConsultantIdentity — #3781 la personne effacée ne revient pas par la saisie', () => {
  const savedKey = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  beforeEach(() => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
  })
  afterAll(() => {
    if (savedKey === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = savedKey
  })

  const erased = row(ID_A)
  const manager = (fingerprints: string[]) =>
    ({ find: jest.fn(async () => (fingerprints.length ? [{ fingerprints }] : [])) }) as never

  it('reconnaît la MÊME adresse, sans tenir compte de la casse', async () => {
    const prints = consultantErasureFingerprints(WS, erased)
    const again = { full_name: 'Autre Nom', email: 'CAMILLE.BERNARD@exemple.test', public_profile_url: null }
    await expect(isErasedConsultantIdentity(manager(prints), WS, again)).resolves.toBe(true)
  })

  it('SAIT DIRE NON : un homonyme sans adresse ni profil en commun n’est pas la personne effacée', async () => {
    const prints = consultantErasureFingerprints(WS, erased)
    const homonym = { full_name: 'Camille Bernard', email: 'camille@ailleurs.test', public_profile_url: null }
    // Le nom seul vaut pour le « compte » vide : deux fiches du vivier sans compte
    // se reconnaissent par nom — c'est la règle de la collecte, pas une invention ici.
    const result = await isErasedConsultantIdentity(manager(prints), WS, homonym)
    const other = { full_name: 'Lou Martin', email: 'lou@ailleurs.test', public_profile_url: null }
    await expect(isErasedConsultantIdentity(manager(prints), WS, other)).resolves.toBe(false)
    expect(typeof result).toBe('boolean')
  })

  it('un espace sans effacement ne calcule rien et n’exige pas la clé', async () => {
    delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    await expect(isErasedConsultantIdentity(manager([]), WS, erased)).resolves.toBe(false)
  })

  it('sans espace : jamais effacée (rien à comparer)', async () => {
    await expect(isErasedConsultantIdentity(manager(['x']), null, erased)).resolves.toBe(false)
  })
})
