import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import { DirectDbService } from '../../database/direct-db.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { SupabaseAuthGateway } from '../auth/supabase-auth.gateway'
import { DEMO_OPERATOR_ALERT } from './demo-alert-token'
import { DemoPoolService, demoPoolEmail, type DemoSlot } from './demo-pool.service'
import { DemoResetService } from './demo-reset.service'
import { DemoSeedService } from './demo-seed.service'

type Row = Partial<WorkspaceEntity> & { id: string; owner_user_id: string; is_demo: boolean }

const MINUTE = 60_000
const ago = (minutes: number): Date => new Date(Date.now() - minutes * MINUTE)

/** Base en mémoire : la table `workspaces` suffit à raconter le pool. */
function fakeDb(rows: Row[]) {
  const rawSql: string[] = []
  const accountsByWorkspace: Record<string, number> = {}
  const savedMembers: unknown[] = []
  const savedSubscriptions: Record<string, unknown>[] = []
  const profiles: Row[] = []
  /** #3806 — salles dont le verrou de re-semis est tenu par un autre process (purge en cours). */
  const reseedingElsewhere = new Set<string>()

  const workspaceRepo = {
    find: jest.fn(async ({ where }: { where: { is_demo?: boolean } }) =>
      rows.filter(r => (where?.is_demo === undefined ? true : r.is_demo === where.is_demo)),
    ),
    // #4810 — `where.id` est honoré AUTANT que `where.owner_user_id` : la relecture du bail
    // (`findOne({ where: { id } })`, `demo-pool.service.ts`) rendait `null` ici, le marqueur
    // retombait donc sur son `new Date()` de secours et la garde du marqueur ne lisait plus
    // le chemin qu'elle prétend garder — vraie-fausse garde, et rouge une fois sur deux à la
    // milliseconde près (`Test (API)` shard 4/6, run 40938273742).
    findOne: jest.fn(
      async ({ where }: { where: { owner_user_id?: string; id?: string } }) =>
        rows.find(r => (where?.id !== undefined ? r.id === where.id : r.owner_user_id === where.owner_user_id)) ?? null,
    ),
    update: jest.fn(async ({ id }: { id: string }, patch: Partial<Row>) => {
      const row = rows.find(r => r.id === id)
      if (row) Object.assign(row, patch)
      return { affected: 1 }
    }),
    create: jest.fn((input: Partial<Row>) => ({ id: `ws-new-${rows.length + 1}`, ...input })),
    save: jest.fn(async (input: Row) => {
      rows.push(input)
      return input
    }),
  }

  const manager = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      rawSql.push([sql, ...((params as string[]) ?? [])].join(' | '))
      if (sql.includes('pg_try_advisory_xact_lock')) {
        const key = String(params?.[0] ?? '')
        return [{ locked: ![...reseedingElsewhere].some(id => key === `bellum:demo-reset:${id}`) }]
      }
      return []
    }),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === WorkspaceEntity) return workspaceRepo
      if (entity === AccountEntity) {
        return {
          count: jest.fn(
            async ({ where }: { where: { workspace_id: string } }) => accountsByWorkspace[where.workspace_id] ?? 0,
          ),
        }
      }
      if (entity === ProfileEntity) {
        return {
          findOne: jest.fn(
            async ({ where }: { where: { user_id: string } }) =>
              profiles.find(p => p.owner_user_id === where.user_id) ?? null,
          ),
          create: jest.fn((input: Record<string, unknown>) => input),
          save: jest.fn(async (input: Record<string, unknown>) => {
            profiles.push({ id: 'p', owner_user_id: String(input.user_id), is_demo: false })
            return input
          }),
        }
      }
      if (entity === SubscriptionEntity) {
        return {
          findOne: jest.fn(async ({ where }: { where: { user_id: string } }) =>
            where.user_id === 'demo-user-1' ? { user_id: 'demo-user-1', plan: 'business', accounts_limit: 120 } : null,
          ),
          create: jest.fn((input: Record<string, unknown>) => input),
          save: jest.fn(async (input: Record<string, unknown>) => {
            savedSubscriptions.push(input)
            return input
          }),
        }
      }
      if (entity === WorkspaceMemberEntity) {
        return {
          create: jest.fn((input: unknown) => input),
          save: jest.fn(async (input: unknown) => {
            savedMembers.push(input)
            return input
          }),
        }
      }
      throw new Error(`unexpected entity in test: ${String(entity)}`)
    }),
  }

  const prefsRepo = { upsert: jest.fn(async () => ({})) }
  const dataSource = {
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    getRepository: jest.fn((entity: unknown) => (entity === WorkspaceEntity ? workspaceRepo : prefsRepo)),
  }

  return {
    dataSource,
    rows,
    rawSql,
    accountsByWorkspace,
    savedMembers,
    savedSubscriptions,
    prefsRepo,
    reseedingElsewhere,
  }
}

function build(
  db: ReturnType<typeof fakeDb>,
  overrides: {
    poolSize?: number
    ttlMinutes?: number
    createUser?: jest.Mock
    findUserByEmail?: jest.Mock
    seedWorkspace?: jest.Mock
    repairIfIncomplete?: jest.Mock
    resetWorkspaceUnlessFresh?: jest.Mock
    /** #3578 — `(workspaceId) => la salle est-elle à jour ET entière ?` Par défaut : oui. */
    isRoomReady?: jest.Mock
    /** #3578.2 — `(ws, owner, previousLeaseAt)` : salle LIBRE prête ET intacte ? Par défaut : oui. */
    isRoomServable?: jest.Mock
    /** #3806 — `(ws, owner, previousLeaseAt)` : salle à l'ANCIENNE empreinte, semis fini et intacte ? Par défaut : non. */
    isStaleRoomServable?: jest.Mock
    /** Incident pool 04/10 — la connexion dédiée (élection du balayage). Absente : chemin d'avant. */
    direct?: { configured: boolean; isLeader: jest.Mock }
    /** #4035.3 — l'alerte opérateur (absente : le pool tourne comme avant). */
    alerts?: { dispatch: jest.Mock }
  } = {},
) {
  const seedWorkspace = overrides.seedWorkspace ?? jest.fn(async () => ({ seeded: true, accounts: 3 }))
  const repairIfIncomplete =
    overrides.repairIfIncomplete ?? jest.fn(async () => ({ purged: 0, seeded: false, accounts: 5, skipped: true }))
  const resetWorkspaceUnlessFresh =
    overrides.resetWorkspaceUnlessFresh ?? jest.fn(async () => ({ purged: 30, seeded: true, accounts: 3 }))
  const isRoomReady = overrides.isRoomReady ?? jest.fn(async () => true)
  // Par défaut : une salle libre est servable si elle est « prête » (donc oui, sauf test contraire).
  const isRoomServable =
    overrides.isRoomServable ?? jest.fn(async (workspaceId: string, owner: string) => isRoomReady(workspaceId, owner))
  const isStaleRoomServable = overrides.isStaleRoomServable ?? jest.fn(async () => false)
  const createUser = overrides.createUser ?? jest.fn(async () => ({ data: { user: { id: 'user-new' } }, error: null }))
  const gateway = {
    findUserById: jest.fn(async () => ({ id: 'demo-user-1', email: 'demo@bellum-ai.com' })),
    findUserByEmail: overrides.findUserByEmail ?? jest.fn(async () => undefined),
    client: { auth: { admin: { createUser } } },
  }
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'demoPoolSize') return overrides.poolSize ?? 8
      if (key === 'demoLeaseTtlMinutes') return overrides.ttlMinutes ?? 30
      return undefined
    }),
  }

  return Test.createTestingModule({
    providers: [
      DemoPoolService,
      ...(overrides.direct ? [{ provide: DirectDbService, useValue: overrides.direct }] : []),
      ...(overrides.alerts ? [{ provide: DEMO_OPERATOR_ALERT, useValue: overrides.alerts }] : []),
      { provide: ConfigService, useValue: config },
      { provide: getDataSourceToken(), useValue: db.dataSource },
      { provide: SupabaseAuthGateway, useValue: gateway },
      { provide: DemoSeedService, useValue: { seedWorkspace } },
      {
        provide: DemoResetService,
        useValue: {
          resetWorkspaceUnlessFresh,
          repairIfIncomplete,
          isRoomReady,
          isRoomServable,
          isStaleRoomServable,
          // INC-04-10 — le semis d'une salle neuve passe sous le verrou du reset ;
          // le double reproduit son contrat (semer, réparer si rien n'a été écrit).
          seedNewRoom: jest.fn(async (workspaceId: string, owner: string) => {
            const seeded = await seedWorkspace(workspaceId, owner)
            return seeded?.seeded ? seeded : repairIfIncomplete(workspaceId, owner)
          }),
        },
      },
    ],
  })
    .compile()
    .then(m => ({
      service: m.get(DemoPoolService),
      seedWorkspace,
      repairIfIncomplete,
      resetWorkspaceUnlessFresh,
      isRoomReady,
      isRoomServable,
      isStaleRoomServable,
      gateway,
      createUser,
    }))
}

const flush = () => new Promise(resolve => setImmediate(resolve))

/** Les tests historiques attendent une salle : « en préparation » est un échec pour eux. */
async function acquireSlot(service: DemoPoolService, deviceId: string | null): Promise<DemoSlot | null> {
  const outcome = await service.acquire(deviceId)
  if (outcome && 'preparing' in outcome) throw new Error('expected a room, got « en préparation »')
  return outcome
}

const room = (index: number, over: Partial<Row> = {}): Row => ({
  id: `ws-${index}`,
  owner_user_id: `demo-user-${index}`,
  is_demo: true,
  demo_slot_index: index,
  demo_leased_at: null,
  demo_lease_device: null,
  created_at: new Date(2026, 0, index),
  ...over,
})

/** #4810 — la grâce du marqueur « servie en secours », que le pool transmet au re-semis : SON bail. */
const GRACE_DU_MARQUEUR = 30 * 60_000

describe('DemoPoolService (plusieurs prospects en démo en même temps)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('refuses nothing but returns null when the operator has not created the first space', async () => {
    const db = fakeDb([])
    const { service, resetWorkspaceUnlessFresh } = await build(db)

    expect(await acquireSlot(service, 'device-1')).toBeNull()
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalled()
  })

  it('adopts the operator-created space as room n°1 (no data migration needed)', async () => {
    const db = fakeDb([room(1, { demo_slot_index: null })])
    const { service } = await build(db)

    const slot = await acquireSlot(service, 'device-1')

    expect(slot?.slotIndex).toBe(1)
    expect(db.rows[0]?.demo_slot_index).toBe(1)
  })

  it('never touches a room under the visitor presenting — the free one is served as is', async () => {
    // Salle 1 occupée depuis 2 min, salle 2 libre : le nouveau venu prend la 2.
    const db = fakeDb([room(1, { demo_leased_at: ago(2), demo_lease_device: 'device-A' }), room(2)])
    const { service, resetWorkspaceUnlessFresh } = await build(db)

    const slot = await acquireSlot(service, 'device-B')

    expect(slot?.workspaceId).toBe('ws-2')
    // #3578.2 — le visiteur ne déclenche aucune remise à neuf dans sa requête.
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalled()
    // Le bail du premier visiteur est intact.
    expect(db.rows[0]?.demo_lease_device).toBe('device-A')
  })

  it('gives two simultaneous visitors two DIFFERENT rooms — and two different identities', async () => {
    const db = fakeDb([room(1), room(2)])
    const { service } = await build(db)

    const first = await acquireSlot(service, 'device-A')
    const second = await acquireSlot(service, 'device-B')

    expect(first?.workspaceId).not.toBe(second?.workspaceId)
    expect(first?.ownerUserId).not.toBe(second?.ownerUserId)
  })

  it('sends a browser back to ITS room, untouched, on a reload', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(3), demo_lease_device: 'device-A' }), room(2)])
    const { service, resetWorkspaceUnlessFresh, repairIfIncomplete } = await build(db)

    const slot = await acquireSlot(service, 'device-A')

    expect(slot?.workspaceId).toBe('ws-1')
    expect(slot?.reused).toBe(true)
    await flush()
    // Le point entier : un rechargement n'efface pas la démo en cours.
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalled()
    // On REGARDE quand même si la salle est complète — la réparation, elle, ne
    // s'exécute que si elle ne l'est pas (vérifié dans DemoResetService).
    expect(repairIfIncomplete).toHaveBeenCalledWith('ws-1', 'demo-user-1')
  })

  it('treats a browser whose lease has expired as a new visitor — its old room is reset OFF-request', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(90), demo_lease_device: 'device-A' })])
    const isRoomServable = jest.fn(async () => false) // visitée : à remettre à neuf
    const { service, resetWorkspaceUnlessFresh } = await build(db, { poolSize: 1, isRoomServable })

    const outcome = await service.acquire('device-A')

    expect(outcome).toMatchObject({ preparing: true })
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledWith(
      'ws-1',
      'demo-user-1',
      undefined,
      expect.any(Date),
      GRACE_DU_MARQUEUR,
    )
  })

  it('prefers a never-leased room, then the oldest lease', async () => {
    const db = fakeDb([
      room(1, { demo_leased_at: ago(90) }),
      room(2, { demo_leased_at: ago(200) }),
      room(3, { demo_leased_at: null }),
    ])
    const { service } = await build(db)

    expect((await acquireSlot(service, 'device-X'))?.workspaceId).toBe('ws-3')
  })

  it('provisions a NEW room (user + workspace) when every room is busy and the pool is not full', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    const { service, seedWorkspace, createUser, resetWorkspaceUnlessFresh } = await build(db, { poolSize: 4 })

    const outcome = await service.acquire('device-B')

    // #3578.2 — la salle est créée et réservée à son nom ; son semis part à part.
    expect(outcome).toMatchObject({ preparing: true })
    expect(db.rows[1]?.demo_slot_index).toBe(2)
    expect(createUser).toHaveBeenCalledWith({ email: 'demo+demo2@bellum-ai.com', email_confirm: true })
    // Une salle neuve est semée, jamais purgée (il n'y a rien à effacer).
    expect(seedWorkspace).toHaveBeenCalled()
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalled()
    // #4173 — voir le commentaire de « adopts the operator-created space ».
    expect(db.rows[1]?.chat_eval_sampling_enabled).toBe(false)
  })

  it('ne REGARDE même pas la complétude d’une salle vraiment neuve — le semis vient de l’écrire', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    const { service, repairIfIncomplete } = await build(db, { poolSize: 4 })

    await service.acquire('device-B')
    await flush()

    expect(repairIfIncomplete).not.toHaveBeenCalled()
  })

  it('vérifie une salle « provisionnée » que le semis a REFUSÉ de remplir', async () => {
    /**
     * Le troisième chemin, et le dernier angle mort de la même famille.
     * `provisionRoom` convertit un espace existant ; si celui-ci portait déjà
     * des dossiers, `seedWorkspace` sort sans rien écrire (il est idempotent
     * sur ce seul fait) et rien ne dit qu'il avait FINI la fois précédente. La
     * salle repartait alors en service estampillée « neuve », donc jamais
     * regardée — et son visiteur, dont le bail se renouvelle, la gardait.
     */
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    const { service, repairIfIncomplete } = await build(db, {
      poolSize: 4,
      seedWorkspace: jest.fn(async () => ({ seeded: false, accounts: 6 })),
    })

    const slot = await service.acquire('device-B')
    await flush()

    expect(slot).toMatchObject({ preparing: true })
    expect(repairIfIncomplete).toHaveBeenCalledWith('ws-new-2', 'user-new')
  })

  it('sert la salle TELLE QUELLE quand la réparation échoue — jamais une porte fermée', async () => {
    /**
     * Mesuré en production le 28/08, une heure après la mise en service de la
     * réparation : la salle était bien détectée incomplète, mais le RE-SEMIS
     * échouait sur `missions_opportunity_uniq` et l'exception remontait jusqu'à
     * `POST /demo/session` — 500 pour TOUS les prospects, sur la seule surface
     * publique du produit, à cause d'une salle imparfaite.
     *
     * Une salle tronquée est une visite pauvre ; une porte fermée est une visite
     * impossible. Le compromis se pose tout seul dès qu'on l'écrit.
     */
    const db = fakeDb([room(1, { demo_leased_at: ago(3), demo_lease_device: 'device-A' })])
    const boom = jest.fn(async () => {
      throw new Error('duplicate key value violates unique constraint "missions_opportunity_uniq"')
    })
    const { service } = await build(db, { repairIfIncomplete: boom })

    const slot = await acquireSlot(service, 'device-A')

    expect(boom).toHaveBeenCalled()
    expect(slot?.workspaceId).toBe('ws-1')
    expect(slot?.reused).toBe(true)
  })

  it('une REMISE À ZÉRO d’arrière-plan qui échoue ne fait jamais tomber la requête du visiteur', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(90), demo_lease_device: 'device-A' })])
    const boom = jest.fn(async () => {
      throw new Error('deadlock detected')
    })
    const isRoomServable = jest.fn(async () => false)
    const { service } = await build(db, { poolSize: 1, resetWorkspaceUnlessFresh: boom, isRoomServable })

    await expect(service.acquire('device-B')).resolves.toMatchObject({ preparing: true })
    expect(boom).toHaveBeenCalled()
  })

  it('reuses an existing auth account for a room instead of creating a second one', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    const findUserByEmail = jest.fn(async () => ({ id: 'user-existing' }))
    const { service, createUser } = await build(db, { poolSize: 4, findUserByEmail })

    const slot = await service.acquire('device-B')
    await flush()

    expect(slot).toMatchObject({ preparing: true })
    expect(db.rows[1]?.owner_user_id).toBe('user-existing')
    expect(createUser).not.toHaveBeenCalled()
  })

  it('never creates more rooms than DEMO_POOL_SIZE — a public endpoint cannot mint accounts endlessly', async () => {
    const db = fakeDb([
      room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' }),
      room(2, { demo_leased_at: ago(2), demo_lease_device: 'device-B' }),
    ])
    const { service, createUser } = await build(db, { poolSize: 2 })

    const slot = await acquireSlot(service, 'device-C')

    expect(createUser).not.toHaveBeenCalled()
    // Pool saturé : on reprend le bail le plus ancien (le n°2 ici), jamais on ne refuse.
    expect(slot?.recycledActive).toBe(true)
    expect(slot?.workspaceId).toBe('ws-2')
    expect(db.rows).toHaveLength(2)
  })

  // #3806 — mesuré en prod le 07/10 (~26 min) : un déploiement qui change
  // l'empreinte de semis périme TOUTES les salles d'un coup, encore sous bail
  // (< 30 min). Avant ce correctif : `readyOf` échouait pour chacune, la boucle
  // de recyclage ne planifiait RIEN (ni recyclage — aucune n'est `isRoomReady` —
  // ni re-semis), et `acquire()` rendait « en préparation » pour toujours, sans
  // qu'aucun travail de fond n'avance JAMAIS — jusqu'à l'expiration naturelle
  // d'un bail (jusqu'à 30 min, « 0 being re-seeded » dans le journal).
  it('#3806 — pool plein ET entièrement périmé : avance une salle de plus plutôt que de rester bloqué sans rien planifier', async () => {
    const db = fakeDb([
      room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' }),
      room(2, { demo_leased_at: ago(2), demo_lease_device: 'device-B' }),
    ])
    // Chaque salle existante est à la fois VIVANTE (bail < 30 min) et PÉRIMÉE
    // (empreinte différente) : exactement l'état mesuré après le déploiement.
    const isRoomReady = jest.fn(async () => false)
    const { service, createUser, resetWorkspaceUnlessFresh } = await build(db, { poolSize: 2, isRoomReady })

    const outcome = await service.acquire('device-C')

    expect(outcome).toMatchObject({ preparing: true })
    // Une salle SUPPLÉMENTAIRE est provisionnée — le pool dépasse son format
    // configuré plutôt que de rester sans aucune salle fraîche en vue.
    expect(createUser).toHaveBeenCalled()
    expect(db.rows).toHaveLength(3)
    // Ni l'une ni l'autre salle existante n'est touchée : un visiteur peut
    // encore y être (la règle « jamais pendant une présentation »).
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalled()
    expect(db.rows[0]?.demo_lease_device).toBe('device-A')
    expect(db.rows[1]?.demo_lease_device).toBe('device-B')
  })

  it('#3806 — la salle de plus est plafonnée à UNE seule : un second visiteur, pool encore saturé, retombe sur « en préparation » sans croissance sans borne', async () => {
    const db = fakeDb([
      room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' }),
      room(2, { demo_leased_at: ago(2), demo_lease_device: 'device-B' }),
      // La salle de plus déjà posée par la requête précédente — encore en
      // cours de semis, donc elle non plus n'est pas `isRoomReady`.
      room(3, { demo_leased_at: ago(1), demo_lease_device: 'device-C' }),
    ])
    const isRoomReady = jest.fn(async () => false)
    const { service, createUser } = await build(db, { poolSize: 2, isRoomReady })

    const outcome = await service.acquire('device-D')

    expect(outcome).toMatchObject({ preparing: true })
    expect(createUser).not.toHaveBeenCalled()
    expect(db.rows).toHaveLength(3)
  })

  it('falls back to an existing room when creating the auth account fails — the demo still opens', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    const createUser = jest.fn(async () => ({ data: { user: null }, error: { message: 'quota exceeded' } }))
    const { service } = await build(db, { poolSize: 4, createUser })

    const slot = await acquireSlot(service, 'device-B')

    expect(slot?.workspaceId).toBe('ws-1')
    expect(slot?.provisioned).toBe(false)
  })

  it('refuses to convert a workspace that already holds real dossiers into a demo room', async () => {
    // Un espace client basculé en démo = actions gratuites sur des données réelles.
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    db.rows.push({ id: 'ws-real', owner_user_id: 'user-new', is_demo: false })
    db.accountsByWorkspace['ws-real'] = 12
    const { service } = await build(db, { poolSize: 4 })

    const slot = await acquireSlot(service, 'device-B')

    // Le provisioning échoue → repli sur la salle existante, jamais de conversion.
    expect(slot?.workspaceId).toBe('ws-1')
    expect(db.rows.find(r => r.id === 'ws-real')?.is_demo).toBe(false)
  })

  // #2259.38 — audit du bail public (LAU-004) : un espace réel refusé ne doit
  // JAMAIS recevoir le prénom du persona. `seedWorkspace` est le SEUL endroit
  // qui écrit `DEMO_OWNER.first_name` (verrouillé côté `demo-seed.service.spec.ts`,
  // « rétablit le NOM du propriétaire ») — ce test verrouille l'étage du dessus :
  // il ne doit jamais être appelé sur l'espace réel refusé.
  it('#2259.38 — un espace réel refusé ne reçoit jamais le semis qui porte le prénom du persona', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    db.rows.push({ id: 'ws-real', owner_user_id: 'user-new', is_demo: false })
    db.accountsByWorkspace['ws-real'] = 12
    const { service, seedWorkspace } = await build(db, { poolSize: 4 })

    await service.acquire('device-B')
    await flush()

    expect(seedWorkspace).not.toHaveBeenCalledWith('ws-real', 'user-new')
  })

  // #2259.39 — même audit. Trouvé en traçant `provisionRoom` : `mirrorEntitlement`
  // (qui pose un abonnement CALQUÉ sur celui du persona — palier, plafond de
  // comptes) s'exécutait AVANT la vérification « cet espace porte déjà de vrais
  // dossiers », donc AVANT le refus. Un visiteur résolu vers un compte réel avec
  // dossiers recevait quand même cet abonnement-persona, silencieusement, alors
  // que la conversion elle-même était refusée juste après.
  it('#2259.39 — le refus d’un espace réel arrive AVANT toute écriture (aucun abonnement-persona posé en passant)', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    db.rows.push({ id: 'ws-real', owner_user_id: 'user-new', is_demo: false })
    db.accountsByWorkspace['ws-real'] = 3
    const { service } = await build(db, { poolSize: 4 })

    await service.acquire('device-B')
    await flush()

    expect(db.savedSubscriptions.some(s => s.user_id === 'user-new')).toBe(false)
  })

  it('takes a transaction-scoped advisory lock so two clicks in the same second cannot pick the same room', async () => {
    const db = fakeDb([room(1)])
    const { service } = await build(db)

    await acquireSlot(service, 'device-A')

    expect(db.rawSql[0]).toContain('pg_advisory_xact_lock')
    expect(db.rawSql[0]).toContain('bellum:demo-pool')
  })

  it('gives a new room the SAME displayed quotas as room n°1 — and never a Stripe id', async () => {
    // Sinon un prospect voit « 0 crédit » là où un autre en voit 120. Un id
    // Stripe recopié serait pire : les webhooks matchent dessus sans scope user.
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    const { service } = await build(db, { poolSize: 4 })

    await service.acquire('device-B')
    await flush()

    expect(db.savedSubscriptions[0]).toMatchObject({ plan: 'business', accounts_limit: 120 })
    expect(db.savedSubscriptions[0]?.stripe_subscription_id).toBeNull()
    expect(db.savedSubscriptions[0]?.stripe_customer_id).toBeNull()
  })

  it('opts a freshly provisioned room out of product e-mails (nobody reads that mailbox)', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    const { service } = await build(db, { poolSize: 4 })

    await service.acquire('device-B')
    await flush()

    expect(db.prefsRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ newsletter_changelog: false }),
      expect.objectContaining({ conflictPaths: ['user_id'] }),
    )
  })

  it('behaves exactly like the old single space when the pool is capped at 1', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    const { service, resetWorkspaceUnlessFresh, createUser } = await build(db, { poolSize: 1 })

    const slot = await acquireSlot(service, 'device-B')

    expect(createUser).not.toHaveBeenCalled()
    expect(slot?.workspaceId).toBe('ws-1')
    // #3578.2 — jamais de remise à neuf dans la requête du visiteur.
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalled()
  })
})

describe('DemoPoolService.renewLease (#3511 — la salle tient tant que la personne navigue)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('re-stamps the lease of the room this device holds — activity keeps it past the TTL', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(29), demo_lease_device: 'device-A' }), room(2)])
    const { service, resetWorkspaceUnlessFresh } = await build(db)

    const slot = await service.renewLease('device-A')

    expect(slot?.ownerUserId).toBe('demo-user-1')
    expect(Date.now() - new Date(db.rows[0]!.demo_leased_at as Date).getTime()).toBeLessThan(5_000)
    // Jamais de remise à neuf sous les yeux de la personne.
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalled()
  })

  it('#3420/#3270 — le renouvellement SILENCIEUX re-vérifie le semis : une salle d’avant le déploiement est re-semée', async () => {
    // La recette garde sa session d'un déploiement à l'autre : `renew` n'est alors
    // JAMAIS suivi d'un `acquire`, donc sans cette vérification la salle gardait
    // pour toujours le jeu de données d'avant (messages, ESN rang 2 absents).
    const db = fakeDb([room(1, { demo_leased_at: ago(5), demo_lease_device: 'device-A' })])
    const { service, repairIfIncomplete } = await build(db)

    await service.renewLease('device-A')
    await flush()

    expect(repairIfIncomplete).toHaveBeenCalledWith('ws-1', 'demo-user-1')
  })

  it('R35 — le renouvellement ne ATTEND jamais la réparation : réponse immédiate même si le re-semis dure 90 s', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(5), demo_lease_device: 'device-A' })])
    const { service } = await build(db, { repairIfIncomplete: jest.fn(() => new Promise<never>(() => undefined)) })

    const outcome = await Promise.race([
      service.renewLease('device-A'),
      new Promise<'hung'>(resolve => setTimeout(() => resolve('hung'), 500)),
    ])

    expect(outcome).not.toBe('hung')
    expect((outcome as DemoSlot).workspaceId).toBe('ws-1')
  })

  it('R35 — une salle PÉRIMÉE mais entière sous bail est servie en secours (marquée) : jamais purgée sous son visiteur', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(5), demo_lease_device: 'device-A' })])
    const { service, repairIfIncomplete } = await build(db, { isStaleRoomServable: jest.fn(async () => true) })

    await service.renewLease('device-A')
    await flush()

    expect(repairIfIncomplete).not.toHaveBeenCalled()
    // #4810 — le marqueur porte la date du bail, jamais une date POSTÉRIEURE : comparé au bail par le
    // re-semis, un marqueur en retard d'une milliseconde sautait la purge pour toujours.
    expect(db.rows[0]?.demo_stale_served_at).toBeInstanceOf(Date)
    expect((db.rows[0]?.demo_stale_served_at as Date).getTime()).toBeLessThanOrEqual(
      new Date(db.rows[0]?.demo_leased_at as Date).getTime(),
    )
  })

  it('R35 — acquire (retour dans SA salle) ne attend pas non plus la vérification du semis', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(3), demo_lease_device: 'device-A' }), room(2)])
    const { service } = await build(db, { repairIfIncomplete: jest.fn(() => new Promise<never>(() => undefined)) })

    const outcome = await Promise.race([
      service.acquire('device-A'),
      new Promise<'hung'>(resolve => setTimeout(() => resolve('hung'), 500)),
    ])

    expect(outcome).not.toBe('hung')
  })

  it('#3420 — une réparation qui échoue ne refuse pas le renouvellement : la salle est servie telle quelle', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(5), demo_lease_device: 'device-A' })])
    const { service } = await build(db, { repairIfIncomplete: jest.fn().mockRejectedValue(new Error('boom')) })

    expect((await service.renewLease('device-A'))?.workspaceId).toBe('ws-1')
  })

  it('still renews a lapsed lease nobody else took (room not purged yet)', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(90), demo_lease_device: 'device-A' })])
    const { service } = await build(db)

    expect((await service.renewLease('device-A'))?.workspaceId).toBe('ws-1')
  })

  it('says NO when another visitor now holds the room — a real expiry stays an expiry', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-B' })])
    const { service } = await build(db)

    expect(await service.renewLease('device-A')).toBeNull()
    expect(db.rows[0]?.demo_lease_device).toBe('device-B')
  })
})

describe('DemoPoolService — horloge avancée de 60 min (#3511)', () => {
  const MINUTE = 60_000
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-10-02T10:00:00Z'))
  })
  afterEach(() => jest.useRealTimers())

  it('un battement toutes les 10 min garde la salle 60 min : un 2e visiteur à la 55e minute n’y entre pas', async () => {
    const db = fakeDb([room(1), room(2)])
    const { service } = await build(db)
    const first = await acquireSlot(service, 'device-A')
    expect(first?.workspaceId).toBe('ws-1')

    for (let minute = 10; minute <= 60; minute += 10) {
      jest.setSystemTime(new Date(Date.parse('2026-10-02T10:00:00Z') + minute * MINUTE))
      expect((await service.renewLease('device-A'))?.workspaceId).toBe('ws-1')
      // À chaque palier, un autre visiteur arrive : il ne doit JAMAIS prendre la salle de A.
      // Une salle neuve en préparation (`preparing`) ne porte pas de workspaceId : jamais ws-1 non plus.
      const other = (await service.acquire(`device-B-${minute}`)) as { workspaceId?: string }
      expect(other?.workspaceId).not.toBe('ws-1')
      expect(db.rows[0]?.demo_lease_device).toBe('device-A')
    }
  })

  it('TÉMOIN — sans battement, le bail de 30 min est bien échu à la 31e minute : la salle est reprise par un autre', async () => {
    const db = fakeDb([room(1)])
    const { service } = await build(db)
    await acquireSlot(service, 'device-A')

    jest.setSystemTime(new Date(Date.parse('2026-10-02T10:00:00Z') + 31 * MINUTE))
    const other = await acquireSlot(service, 'device-B')

    expect(other?.workspaceId).toBe('ws-1')
    expect(db.rows[0]?.demo_lease_device).toBe('device-B')
    // La vraie expiration reste une expiration : A ne retrouve plus sa salle.
    expect(await service.renewLease('device-A')).toBeNull()
  })
})

describe('demoPoolEmail', () => {
  it('derives room addresses from the operator account by sub-addressing', () => {
    expect(demoPoolEmail('demo@bellum-ai.com', 3)).toBe('demo+demo3@bellum-ai.com')
  })

  it('never stacks tags when the operator address already carries one', () => {
    expect(demoPoolEmail('demo+theo@bellum-ai.com', 2)).toBe('demo+demo2@bellum-ai.com')
  })

  it('returns null on an address it cannot split — the caller falls back instead of inventing one', () => {
    expect(demoPoolEmail(undefined, 2)).toBeNull()
    expect(demoPoolEmail('not-an-email', 2)).toBeNull()
  })
})

describe('DemoPoolService — #3578 un visiteur n’attend jamais un re-semis', () => {
  beforeEach(() => jest.clearAllMocks())

  /** `isRoomReady` : seules les salles nommées sont à jour. */
  const readyOnly = (...ids: string[]) => jest.fn(async (workspaceId: string) => ids.includes(workspaceId))

  it('salle libre PÉRIMÉE + salle libre FRAÎCHE : sert la fraîche, re-sème la périmée en ARRIÈRE-PLAN', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) }), room(2, { demo_leased_at: ago(50) })])
    let finishReset: () => void = () => undefined
    const resetWorkspaceUnlessFresh = jest.fn(() => new Promise<void>(resolve => (finishReset = resolve)))
    const { service } = await build(db, { isRoomReady: readyOnly('ws-2'), resetWorkspaceUnlessFresh })

    const outcome = await service.acquire('device-1') // ne doit PAS attendre la remise à neuf

    expect(outcome).toMatchObject({ workspaceId: 'ws-2' })
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledWith(
      'ws-1',
      'demo-user-1',
      undefined,
      expect.any(Date),
      GRACE_DU_MARQUEUR,
    )
    finishReset()
  })

  it('aucune salle fraîche : renvoie « en préparation » sans attendre le semis, et lance la préparation', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) })])
    const resetWorkspaceUnlessFresh = jest.fn(() => new Promise<never>(() => undefined)) // ne finit jamais
    const repairIfIncomplete = jest.fn()
    const { service, seedWorkspace } = await build(db, {
      isRoomReady: readyOnly(),
      repairIfIncomplete,
      resetWorkspaceUnlessFresh,
    })

    const outcome = await service.acquire('device-1')

    expect(outcome).toEqual({ preparing: true, retryAfterSeconds: expect.any(Number) })
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledTimes(1)
    expect(repairIfIncomplete).not.toHaveBeenCalled()
    expect(seedWorkspace).not.toHaveBeenCalled()
    // La salle périmée n'est PAS louée au visiteur qui attend.
    expect(db.rows[0]?.demo_lease_device).toBeNull()
  })

  it('deux visiteurs pendant la préparation : UN seul re-semis de la même salle (verrou)', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) })])
    const resetWorkspaceUnlessFresh = jest.fn(() => new Promise<never>(() => undefined))
    const { service } = await build(db, { isRoomReady: readyOnly(), resetWorkspaceUnlessFresh })

    await service.acquire('device-1')
    await service.acquire('device-2')

    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledTimes(1)
  })

  it('le navigateur qui tient une salle périmée en reçoit une FRAÎCHE, et lâche l’ancienne', async () => {
    const db = fakeDb([
      room(1, { demo_leased_at: ago(2), demo_lease_device: 'device-A' }),
      room(2, { demo_leased_at: ago(50) }),
    ])
    const { service } = await build(db, { isRoomReady: readyOnly('ws-2') })

    const outcome = await service.acquire('device-A')

    expect(outcome).toMatchObject({ workspaceId: 'ws-2' })
    expect(db.rows[0]?.demo_lease_device).toBeNull()
    expect(db.rows[1]?.demo_lease_device).toBe('device-A')
  })

  it('la salle périmée que ce navigateur tient : préparée sur place, et l’état « en préparation » est rendu', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(2), demo_lease_device: 'device-A' })])
    const repairIfIncomplete = jest.fn(() => new Promise<never>(() => undefined))
    const { service } = await build(db, { isRoomReady: readyOnly(), repairIfIncomplete })

    expect(await service.acquire('device-A')).toMatchObject({ preparing: true })
    expect(repairIfIncomplete).toHaveBeenCalledWith('ws-1', 'demo-user-1')
  })

  it('une salle OCCUPÉE par quelqu’un d’autre n’est jamais purgée pour en préparer une', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(2), demo_lease_device: 'device-A' })])
    const repairIfIncomplete = jest.fn()
    const { service } = await build(db, { poolSize: 1, isRoomReady: readyOnly(), repairIfIncomplete })

    expect(await service.acquire('device-B')).toMatchObject({ preparing: true })
    expect(repairIfIncomplete).not.toHaveBeenCalled()
  })

  it('#3578.2 — le visiteur n’appelle JAMAIS reset ni seed : salle intacte servie, salle touchée remise à neuf à part', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(80) }), room(2, { demo_leased_at: ago(60) })])
    const lastLease = db.rows[0]?.demo_leased_at
    // ws-1 : un visiteur y a posé la main (non servable) ; ws-2 : semis postérieur à son bail (servable).
    const isRoomServable = jest.fn(async (workspaceId: string) => workspaceId === 'ws-2')
    const never = new Promise<never>(() => undefined)
    const resetWorkspaceUnlessFresh = jest.fn(() => never)
    const { service, seedWorkspace } = await build(db, { isRoomServable, resetWorkspaceUnlessFresh })

    const outcome = await service.acquire('device-1') // ne doit pas attendre le reset

    expect(outcome).toMatchObject({ workspaceId: 'ws-2' })
    // La remise à neuf de la salle libérée part À PART, bornée par son dernier bail…
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledWith(
      'ws-1',
      'demo-user-1',
      undefined,
      lastLease,
      GRACE_DU_MARQUEUR,
    )
    // …et la salle servie n'a vu ni reset ni semis.
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalledWith('ws-2', expect.anything(), undefined, expect.anything())
    expect(seedWorkspace).not.toHaveBeenCalled()
  })

  it('#3578.2 — une salle NEUVE n’est pas semée dans la requête : « en préparation », semis à part', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' })])
    const seedWorkspace = jest.fn(() => new Promise<never>(() => undefined)) // ne finit jamais
    const { service } = await build(db, { poolSize: 4, seedWorkspace })

    const outcome = await service.acquire('device-B') // ne doit PAS attendre le semis

    expect(outcome).toEqual({ preparing: true, retryAfterSeconds: expect.any(Number) })
    expect(seedWorkspace).toHaveBeenCalledTimes(1)
  })

  it('#3578.2 — pool saturé : la salle reprise à un visiteur est remise à neuf à part, le nouveau venu attend « en préparation »', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(5), demo_lease_device: 'device-A' })])
    const resetWorkspaceUnlessFresh = jest.fn(() => new Promise<never>(() => undefined))
    const isRoomServable = jest.fn(async () => false) // un visiteur l'a touchée
    const { service } = await build(db, { poolSize: 1, resetWorkspaceUnlessFresh, isRoomServable })

    const outcome = await service.acquire('device-B')

    expect(outcome).toMatchObject({ preparing: true })
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledWith(
      'ws-1',
      'demo-user-1',
      undefined,
      expect.any(Date),
      GRACE_DU_MARQUEUR,
    )
    // La salle lui est réservée : il la retrouvera à l'appel suivant.
    expect(db.rows[0]?.demo_lease_device).toBe('device-B')
  })

  it('#3747 — la lecture de fraîcheur qui échoue NE sert PAS la salle (jamais une salle partielle) : « en préparation »', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) })])
    const isRoomReady = jest.fn(async () => {
      throw new Error('connection reset')
    })
    const { service } = await build(db, { isRoomReady })

    expect(await service.acquire('device-1')).toMatchObject({ preparing: true })
  })

  it('Z1 04/10 — plusieurs salles périmées, des visiteurs en rafale : UN seul re-semis tourne à la fois', async () => {
    const db = fakeDb([
      room(1, { demo_leased_at: ago(60) }),
      room(2, { demo_leased_at: ago(60) }),
      room(3, { demo_leased_at: ago(60) }),
    ])
    const started: string[] = []
    const resetWorkspaceUnlessFresh = jest.fn((workspaceId: string) => {
      started.push(workspaceId)
      return new Promise<never>(() => undefined) // ne finit jamais : le re-semis dure ~70 s
    })
    const { service } = await build(db, { isRoomReady: readyOnly(), resetWorkspaceUnlessFresh })

    expect(await service.acquire('device-1')).toMatchObject({ preparing: true })
    expect(await service.acquire('device-2')).toMatchObject({ preparing: true })
    expect(await service.acquire('device-3')).toMatchObject({ preparing: true })

    // Avant : trois salles purgées en parallèle (jusqu'à huit en prod). Désormais : une.
    expect(started).toEqual(['ws-1'])
  })

  it('INC-04-10 — un balayage remet à neuf AU PLUS UNE salle (plafond de charge)', async () => {
    const db = fakeDb([
      room(1, { demo_leased_at: ago(60) }),
      room(2, { demo_leased_at: ago(60) }),
      room(3, { demo_leased_at: ago(2), demo_lease_device: 'device-A' }),
      room(4, { demo_leased_at: ago(60) }),
    ])
    const order: string[] = []
    const resetWorkspaceUnlessFresh = jest.fn(async (workspaceId: string) => {
      order.push(`start:${workspaceId}`)
      await flush()
      order.push(`end:${workspaceId}`)
    })
    const { service } = await build(db, { isRoomReady: readyOnly('ws-4'), resetWorkspaceUnlessFresh })

    await service.warmStaleRooms()

    // Ni la salle occupée (ws-3), ni la salle déjà à jour (ws-4) ; UNE seule par
    // balayage — ws-2 attend le suivant (INC-04-10 : deux re-semis de 258 tables
    // à la fois saturaient le pool partagé).
    expect(order).toEqual(['start:ws-1', 'end:ws-1'])
  })

  it('INC-04-10 — deux balayages qui se chevauchent → UN seul balayage', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) }), room(2, { demo_leased_at: ago(60) })])
    let release: () => void = () => undefined
    const resetWorkspaceUnlessFresh = jest.fn(
      () =>
        new Promise<void>(resolve => {
          release = resolve
        }),
    )
    // #3806 — ws-2 déjà prête : sans elle, le balayage ENCHAÎNERAIT sur ws-2 (règle « aucune salle neuve prête »).
    const { service } = await build(db, { isRoomReady: readyOnly('ws-2'), resetWorkspaceUnlessFresh })

    const first = service.warmStaleRooms()
    await flush()
    await flush()
    await service.warmStaleRooms() // le tick suivant tombe pendant le premier
    release()
    await first

    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledTimes(1)
    expect(db.dataSource.transaction).toHaveBeenCalledTimes(1)
  })

  it('un re-semis de démarrage qui échoue ne casse ni le démarrage ni les salles suivantes', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) }), room(2, { demo_leased_at: ago(60) })])
    const resetWorkspaceUnlessFresh = jest
      .fn()
      .mockRejectedValueOnce(new Error('missions_opportunity_uniq'))
      .mockResolvedValueOnce(undefined)
    const { service } = await build(db, { isRoomReady: readyOnly(), resetWorkspaceUnlessFresh })

    // INC-04-10 — la salle en échec ne bloque pas la suivante. #3806 — aucune salle neuve prête : la suivante
    // part dans le MÊME balayage (enchaînées, une à la fois), sans attendre les 120 s du tick suivant.
    await expect(service.warmStaleRooms()).resolves.toBeUndefined()
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledTimes(2)
    expect(resetWorkspaceUnlessFresh.mock.calls.map(c => c[0])).toEqual(['ws-1', 'ws-2'])
  })
})

describe('incident pool 04/10 — le balayage démo ne tourne que sur UN réplica (élection)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('connexion dédiée configurée et ce réplica ÉLU : il balaie', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) })])
    const isLeader = jest.fn(async () => true)
    const resetWorkspaceUnlessFresh = jest.fn(async () => undefined)
    const { service } = await build(db, {
      isRoomReady: jest.fn(async () => false),
      resetWorkspaceUnlessFresh,
      direct: { configured: true, isLeader },
    })

    await service.warmStaleRooms()

    expect(isLeader).toHaveBeenCalledWith('bellum:demo-sweep-leader')
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledTimes(1)
  })

  it('réplica NON élu : aucune lecture, aucun re-semis — l’élu s’en charge', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) })])
    const resetWorkspaceUnlessFresh = jest.fn(async () => undefined)
    const { service } = await build(db, {
      isRoomReady: jest.fn(async () => false),
      resetWorkspaceUnlessFresh,
      direct: { configured: true, isLeader: jest.fn(async () => false) },
    })

    await service.warmStaleRooms()

    expect(db.dataSource.transaction).not.toHaveBeenCalled()
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalled()
  })

  it('élection illisible (connexion directe en échec) : on ne balaie pas, l’erreur remonte au tick qui la journalise', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) })])
    const resetWorkspaceUnlessFresh = jest.fn(async () => undefined)
    const { service } = await build(db, {
      isRoomReady: jest.fn(async () => false),
      resetWorkspaceUnlessFresh,
      direct: { configured: true, isLeader: jest.fn(async () => Promise.reject(new Error('timeout'))) },
    })

    await expect(service.warmStaleRooms()).rejects.toThrow('timeout')
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalled()
  })

  it('connexion dédiée NON configurée : chemin d’avant, chaque réplica balaie (le verrou par salle sérialise)', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) })])
    const isLeader = jest.fn(async () => false)
    const resetWorkspaceUnlessFresh = jest.fn(async () => undefined)
    const { service } = await build(db, {
      isRoomReady: jest.fn(async () => false),
      resetWorkspaceUnlessFresh,
      direct: { configured: false, isLeader },
    })

    await service.warmStaleRooms()

    expect(isLeader).not.toHaveBeenCalled()
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledTimes(1)
  })
})

// #3747.2 — une salle n'est servie QUE semée en entier : si la lecture de son état échoue (pool saturé,
// timeout), le doute ne profite plus au visiteur — « en préparation », jamais une salle à moitié semée.
describe('#3747 — jamais une salle partielle', () => {
  beforeEach(() => jest.clearAllMocks())

  it('une lecture d’état qui échoue ne sert PAS la salle libre (« en préparation »)', async () => {
    const db = fakeDb([room(1)])
    const isRoomServable = jest.fn(async () => {
      throw new Error('Query read timeout')
    })
    const { service } = await build(db, { poolSize: 1, isRoomServable })

    const outcome = await service.acquire('device-A')

    expect(outcome).toMatchObject({ preparing: true })
    expect(db.rows[0]?.demo_lease_device).toBeNull()
  })

  it('une lecture qui répond « prête » sert toujours la salle (la garde sait dire OUI)', async () => {
    const db = fakeDb([room(1)])
    const { service } = await build(db, { poolSize: 1 })

    expect((await acquireSlot(service, 'device-A'))?.workspaceId).toBe('ws-1')
  })
})

// #3806 — après le déploiement de #3801 (empreinte changée), TOUTES les salles étaient périmées : le pool ne
// servait que des salles à l'empreinte courante, n'en préparait qu'une par 120 s, et `/demo/acces` a répondu 503
// pendant 26 min. Désormais : une salle LIBRE à l'ancienne empreinte (semis fini, intacte) est servie en secours.
describe('#3806 — changement d’empreinte : jamais 503 tant qu’une salle ancienne est servable', () => {
  const readyOnly = (...ids: string[]) => jest.fn(async (workspaceId: string) => ids.includes(workspaceId))
  const staleOnly = (...ids: string[]) => jest.fn(async (workspaceId: string) => ids.includes(workspaceId))
  let warn: jest.SpyInstance
  let error: jest.SpyInstance
  beforeEach(() => {
    jest.clearAllMocks()
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    warn.mockRestore()
    error.mockRestore()
    jest.useRealTimers()
  })

  it('toutes périmées, aucune neuve : la salle ANCIENNE libre est servie (pas « en préparation »), une autre se prépare', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) }), room(2, { demo_leased_at: ago(60) })])
    const resetWorkspaceUnlessFresh = jest.fn(() => new Promise<never>(() => undefined))
    const { service, repairIfIncomplete } = await build(db, {
      isRoomReady: readyOnly(),
      isStaleRoomServable: staleOnly('ws-1', 'ws-2'),
      resetWorkspaceUnlessFresh,
    })

    const outcome = await service.acquire('device-A')

    expect(outcome).toMatchObject({ workspaceId: 'ws-1' })
    expect(db.rows[0]?.demo_lease_device).toBe('device-A')
    // Marquée : elle sera re-semée à la fin de son bail, pas sous les yeux du visiteur.
    expect(db.rows[0]?.demo_stale_served_at).toBeInstanceOf(Date)
    // Le visiteur n'a rien attendu : ni réparation de SA salle, ni semis dans sa requête.
    expect(repairIfIncomplete).not.toHaveBeenCalled()
    // …et une salle NEUVE se prépare en même temps : l'autre salle libre, jamais celle servie.
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledTimes(1)
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledWith(
      'ws-2',
      'demo-user-2',
      undefined,
      expect.any(Date),
      GRACE_DU_MARQUEUR,
    )
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /serving stale-fingerprint room while fresh ones seed.*0 ready.*1 (preparing|being prepared)/,
      ),
    )
  })

  it('une salle NEUVE prête : c’est elle qui est servie, jamais l’ancienne', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) }), room(2, { demo_leased_at: ago(60) })])
    const { service } = await build(db, {
      isRoomReady: readyOnly('ws-2'),
      isStaleRoomServable: staleOnly('ws-1'),
      resetWorkspaceUnlessFresh: jest.fn(() => new Promise<never>(() => undefined)),
    })

    expect(await service.acquire('device-A')).toMatchObject({ workspaceId: 'ws-2' })
    expect(db.rows[1]?.demo_stale_served_at ?? null).toBeNull()
    expect(db.rows[0]?.demo_lease_device).toBeNull()
  })

  it('aucune salle LIBRE du tout : « en préparation » (503) inchangé — une salle sous bail n’est jamais prise', async () => {
    const db = fakeDb([
      room(1, { demo_leased_at: ago(2), demo_lease_device: 'device-X' }),
      room(2, { demo_leased_at: ago(3), demo_lease_device: 'device-Y' }),
    ])
    const isStaleRoomServable = staleOnly('ws-1', 'ws-2')
    const { service } = await build(db, { poolSize: 2, isRoomReady: readyOnly(), isStaleRoomServable })

    expect(await service.acquire('device-A')).toMatchObject({ preparing: true })
    // Les deux salles sous bail ne sont jamais prises ; la seule nouveauté est la salle SUPPLÉMENTAIRE
    // que main provisionne quand le pool plein est périmé d'un coup (#3806, étape « une d'avance »),
    // louée au visiteur en attendant son semis.
    expect(db.rows.slice(0, 2).map(r => r.demo_lease_device)).toEqual(['device-X', 'device-Y'])
    expect(db.rows).toHaveLength(3)
    expect(db.rows[2]?.demo_lease_device).toBe('device-A')
  })

  it('une salle ancienne dont la purge tourne sur un AUTRE réplica (verrou de re-semis tenu) n’est pas servie', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) })])
    db.reseedingElsewhere.add('ws-1')
    const { service } = await build(db, {
      isRoomReady: readyOnly(),
      isStaleRoomServable: staleOnly('ws-1'),
      resetWorkspaceUnlessFresh: jest.fn(() => new Promise<never>(() => undefined)),
    })

    expect(await service.acquire('device-A')).toMatchObject({ preparing: true })
    expect(db.rows[0]?.demo_lease_device).toBeNull()
  })

  it('la salle ancienne servie n’est JAMAIS re-semée sous son visiteur : ni au battement, ni au rechargement', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) }), room(2, { demo_leased_at: ago(60) })])
    const repairIfIncomplete = jest.fn(async () => ({ purged: 30, seeded: true, accounts: 6 }))
    const { service } = await build(db, {
      isRoomReady: readyOnly(),
      isStaleRoomServable: staleOnly('ws-1'),
      repairIfIncomplete,
      resetWorkspaceUnlessFresh: jest.fn(() => new Promise<never>(() => undefined)),
    })
    await service.acquire('device-A')

    expect((await service.renewLease('device-A'))?.workspaceId).toBe('ws-1')
    expect(await service.acquire('device-A')).toMatchObject({ workspaceId: 'ws-1', reused: true })
    await flush()

    expect(repairIfIncomplete).not.toHaveBeenCalled()
    expect(db.rows[0]?.demo_stale_served_at).toBeInstanceOf(Date)
  })

  it('14/10 — la salle de secours périmée louée n’est pas gardée indéfiniment : dès qu’une salle neuve est prête, le visiteur y passe et l’ancienne est re-semée', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) }), room(2, { demo_leased_at: ago(60) })])
    const ready = new Set<string>()
    const resetWorkspaceUnlessFresh = jest.fn(async () => undefined)
    const { service } = await build(db, {
      isRoomReady: jest.fn(async (workspaceId: string) => ready.has(workspaceId)),
      isStaleRoomServable: staleOnly('ws-1'),
      resetWorkspaceUnlessFresh,
    })
    expect(await service.acquire('device-A')).toMatchObject({ workspaceId: 'ws-1' })
    await flush()
    // Pas encore de salle neuve : il garde sa salle de secours (rien n'est purgé sous lui).
    expect(await service.acquire('device-A')).toMatchObject({ workspaceId: 'ws-1', reused: true })
    resetWorkspaceUnlessFresh.mockClear()

    ready.add('ws-2')
    expect(await service.acquire('device-A')).toMatchObject({ workspaceId: 'ws-2' })
    await flush()

    expect(db.rows[1]?.demo_lease_device).toBe('device-A')
    expect(db.rows[0]?.demo_lease_device).toBeNull()
    expect(db.rows[0]?.demo_stale_served_at ?? null).toBeNull()
    // L'ancienne salle repart en re-semis (bail échu, marqueur effacé : la purge n'est plus sautée).
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledWith(
      'ws-1',
      'demo-user-1',
      undefined,
      expect.any(Date),
      GRACE_DU_MARQUEUR,
    )
  })

  it('le balayage remet à neuf une salle INSERVABLE avant la dernière salle ancienne servable', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(60) }), room(2, { demo_leased_at: ago(60) })])
    const order: string[] = []
    const ready = new Set<string>()
    const resetWorkspaceUnlessFresh = jest.fn(async (workspaceId: string) => {
      order.push(workspaceId)
      ready.add(workspaceId)
    })
    const { service } = await build(db, {
      isRoomReady: jest.fn(async (workspaceId: string) => ready.has(workspaceId)),
      isStaleRoomServable: staleOnly('ws-1'),
      resetWorkspaceUnlessFresh,
    })

    await service.warmStaleRooms()

    expect(order).toEqual(['ws-2'])
  })

  it('aucune salle neuve prête : le balayage ENCHAÎNE sans attendre 120 s, une salle à la fois, jusqu’à une prête', async () => {
    const db = fakeDb([
      room(1, { demo_leased_at: ago(60) }),
      room(2, { demo_leased_at: ago(60) }),
      room(3, { demo_leased_at: ago(2), demo_lease_device: 'device-X' }),
    ])
    const order: string[] = []
    const ready = new Set<string>()
    const resetWorkspaceUnlessFresh = jest
      .fn()
      .mockImplementationOnce(async (workspaceId: string) => {
        order.push(`start:${workspaceId}`)
        await flush()
        order.push(`end:${workspaceId}`)
        throw new Error('missions_opportunity_uniq') // la première échoue : elle ne bloque pas la suivante
      })
      .mockImplementation(async (workspaceId: string) => {
        order.push(`start:${workspaceId}`)
        await flush()
        ready.add(workspaceId)
        order.push(`end:${workspaceId}`)
      })
    const { service } = await build(db, {
      isRoomReady: jest.fn(async (workspaceId: string) => ready.has(workspaceId)),
      resetWorkspaceUnlessFresh,
    })

    await service.warmStaleRooms()

    // Séquentiel (jamais deux re-semis à la fois), la salle sous bail jamais touchée, et arrêt dès qu'une est prête.
    expect(order).toEqual(['start:ws-1', 'end:ws-1', 'start:ws-2', 'end:ws-2'])
  })

  it('« no fresh room ready » plus de 2 min : ERROR « demo pool exhausted for <n>s », une fois par minute', async () => {
    jest.useFakeTimers()
    const t0 = Date.parse('2026-10-07T07:51:00Z')
    jest.setSystemTime(t0)
    const db = fakeDb([room(1, { demo_leased_at: new Date(t0 - 60 * MINUTE) })])
    const { service } = await build(db, {
      poolSize: 1,
      isRoomReady: readyOnly(),
      resetWorkspaceUnlessFresh: jest.fn(() => new Promise<never>(() => undefined)),
    })
    const exhausted = (): unknown[] =>
      error.mock.calls.filter(([message]) => /demo pool exhausted for \d+s/.test(String(message)))

    await service.acquire('device-A')
    jest.setSystemTime(t0 + 90_000)
    await service.acquire('device-A')
    expect(exhausted()).toHaveLength(0) // 90 s : pas encore une alerte

    jest.setSystemTime(t0 + 121_000)
    await service.acquire('device-A')
    expect(exhausted()).toHaveLength(1)
    expect(error).toHaveBeenCalledWith('demo pool exhausted for 121s')

    jest.setSystemTime(t0 + 150_000)
    await service.acquire('device-A')
    expect(exhausted()).toHaveLength(1) // une fois par minute, pas à chaque appel

    jest.setSystemTime(t0 + 182_000)
    await service.acquire('device-A')
    expect(exhausted()).toHaveLength(2)
  })

  it('TÉMOIN — une salle neuve servie clôt l’épisode : plus d’alerte ensuite', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] }) // `flush` laisse finir le re-semis simulé
    const t0 = Date.parse('2026-10-07T07:51:00Z')
    jest.setSystemTime(t0)
    const db = fakeDb([room(1, { demo_leased_at: new Date(t0 - 60 * MINUTE) })])
    const ready = new Set<string>()
    const { service } = await build(db, {
      poolSize: 1,
      isRoomReady: jest.fn(async (workspaceId: string) => ready.has(workspaceId)),
      resetWorkspaceUnlessFresh: jest.fn(async (workspaceId: string) => {
        ready.add(workspaceId)
      }),
    })

    await service.acquire('device-A') // « en préparation » : l'épisode commence, le re-semis part
    await flush()
    jest.setSystemTime(t0 + 60_000)
    expect(await service.acquire('device-A')).toMatchObject({ workspaceId: 'ws-1' })
    ready.delete('ws-1')
    jest.setSystemTime(t0 + 150_000)
    await service.acquire('device-B')

    expect(error.mock.calls.filter(([m]) => /demo pool exhausted/.test(String(m)))).toHaveLength(0)
  })
  // #4035.3 — le 11/10, la salle est restée cassée ~8 h : le journal disait tout, personne ne le lisait.
  // Les deux ERROR de panne partent AUSSI par l'alerte opérateur existante (Slack si webhook, sinon e-mail).
  describe('alerte opérateur (#4035.3)', () => {
    it('un re-semis en arrière-plan qui échoue alerte l’opérateur (kind salle_demo_indisponible)', async () => {
      const db = fakeDb([room(1, { demo_leased_at: new Date(Date.now() - 60 * MINUTE) })])
      const alerts = { dispatch: jest.fn(async () => ({ action: 'send', reason: 'first_time', channel: 'email' })) }
      const { service } = await build(db, {
        poolSize: 1,
        isRoomReady: readyOnly(),
        resetWorkspaceUnlessFresh: jest.fn(async () => {
          throw new Error('opportunities_stage_check')
        }),
        alerts,
      })

      await service.acquire('device-A')
      await flush()

      expect(alerts.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'salle_demo_indisponible', resolved: false, subject: 'ws-1' }),
      )
      expect(alerts.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ detail: expect.stringContaining('opportunities_stage_check') }),
      )
    })

    it('« demo pool exhausted » alerte aussi, avec le même sujet que l’épisode', async () => {
      jest.useFakeTimers()
      const t0 = Date.parse('2026-10-07T07:51:00Z')
      jest.setSystemTime(t0)
      const db = fakeDb([room(1, { demo_leased_at: new Date(t0 - 60 * MINUTE) })])
      const alerts = { dispatch: jest.fn(async () => ({ action: 'send', reason: 'first_time', channel: 'email' })) }
      const { service } = await build(db, {
        poolSize: 1,
        isRoomReady: readyOnly(),
        resetWorkspaceUnlessFresh: jest.fn(() => new Promise<never>(() => undefined)),
        alerts,
      })
      await service.acquire('device-A')
      expect(alerts.dispatch).not.toHaveBeenCalled() // 0 s : pas encore une panne
      jest.setSystemTime(t0 + 121_000)
      await service.acquire('device-A')
      expect(alerts.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'salle_demo_indisponible', resolved: false, subject: 'pool-epuise' }),
      )
    })

    it('une alerte qui échoue n’empêche jamais le visiteur d’entrer ni le pool de continuer', async () => {
      const db = fakeDb([room(1, { demo_leased_at: new Date(Date.now() - 60 * MINUTE) })])
      const alerts = {
        dispatch: jest.fn(async () => {
          throw new Error('redis down')
        }),
      }
      const { service } = await build(db, {
        poolSize: 1,
        isRoomReady: readyOnly(),
        resetWorkspaceUnlessFresh: jest.fn(async () => {
          throw new Error('boom')
        }),
        alerts,
      })
      await expect(service.acquire('device-A')).resolves.toBeDefined()
      await flush()
      expect(alerts.dispatch).toHaveBeenCalled()
    })

    it('un re-semis qui réussit APRÈS un échec résout l’alerte de la salle ; sans échec avant, rien n’est envoyé', async () => {
      const db = fakeDb([room(1)])
      const alerts = { dispatch: jest.fn(async () => ({ action: 'skip', reason: 'x', channel: null })) }
      const { service } = await build(db, { poolSize: 1, alerts })
      const run = (work: () => Promise<unknown>): Promise<void> =>
        (service as unknown as { runOnce: (id: string, w: () => Promise<unknown>) => Promise<void> }).runOnce(
          'ws-1',
          work,
        )

      await run(async () => undefined)
      expect(alerts.dispatch).not.toHaveBeenCalled()

      await run(async () => {
        throw new Error('boom')
      })
      await run(async () => undefined)
      expect(alerts.dispatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'salle_demo_indisponible', resolved: true, subject: 'ws-1' }),
      )
    })
  })
})

/**
 * #4291 (lot J) — LE SECOND ESPACE DÉMO, au profil forfait / conseil : MÊME pool, mêmes salles, mêmes baux. La
 * variante se lit sur le numéro de salle (au-delà de `DEMO_FORFAIT_SLOT_BASE`) ; aucune colonne, aucune FK neuve.
 */
describe('DemoPoolService — deux espaces démo, staffing et forfait / conseil (#4291 J)', () => {
  beforeEach(() => jest.clearAllMocks())

  const forfait = (n: number, over: Partial<Row> = {}): Row => room(1000 + n, { id: `ws-f${n}`, ...over })

  it('provisionne la PREMIÈRE salle forfait à côté des salles staffing, sans toucher à ces dernières', async () => {
    const db = fakeDb([room(1), room(2, { demo_leased_at: ago(2), demo_lease_device: 'device-A' })])
    const { service, createUser, seedWorkspace, resetWorkspaceUnlessFresh } = await build(db, { poolSize: 4 })

    const outcome = await service.acquire('device-B', 'forfait_conseil')
    await flush()

    // Salle neuve : son semis part en arrière-plan, le visiteur voit « en préparation » (même contrat que staffing).
    expect(outcome).toMatchObject({ preparing: true })
    const created = db.rows.find(r => r.demo_slot_index === 1001)
    expect(created).toMatchObject({ is_demo: true, name: 'Démo Bellum forfait 1', demo_lease_device: 'device-B' })
    // #4173 — les conversations d'une salle forfait n'entrent pas plus dans les évaluations.
    expect(created?.chat_eval_sampling_enabled).toBe(false)
    expect(createUser).toHaveBeenCalledWith({ email: 'demo+demo1001@bellum-ai.com', email_confirm: true })
    expect(seedWorkspace).toHaveBeenCalledWith(created?.id, 'user-new')
    // Les salles staffing : ni louées, ni remises à neuf.
    expect(db.rows[0]).toMatchObject({ demo_leased_at: null, demo_lease_device: null })
    expect(db.rows[1]?.demo_lease_device).toBe('device-A')
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalled()
  })

  it('sert une salle forfait libre au visiteur forfait — jamais une salle staffing', async () => {
    const db = fakeDb([room(1), room(2), forfait(1)])
    const { service } = await build(db)

    const slot = await service.acquire('device-B', 'forfait_conseil')

    expect(slot).toMatchObject({ workspaceId: 'ws-f1', slotIndex: 1001 })
  })

  it('la démo staffing ne sert JAMAIS une salle forfait, même libre et pool staffing saturé', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' }), forfait(1)])
    const { service } = await build(db, { poolSize: 1 })

    const outcome = await service.acquire('device-B')

    // Pool staffing saturé : la salle staffing est reprise (comportement d'avant), la salle forfait reste libre.
    if (outcome && !('preparing' in outcome)) expect(outcome.workspaceId).toBe('ws-1')
    expect(db.rows[1]).toMatchObject({ demo_leased_at: null, demo_lease_device: null })
  })

  it('numérote une salle staffing neuve sans compter les salles forfait (2, pas 1002)', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(1), demo_lease_device: 'device-A' }), forfait(1)])
    const { service } = await build(db, { poolSize: 4 })

    await service.acquire('device-B')

    expect(db.rows.some(r => r.demo_slot_index === 2 && r.name === 'Démo Bellum 2')).toBe(true)
    expect(db.rows.some(r => r.demo_slot_index === 1002)).toBe(false)
  })

  it('adopte un espace opérateur sans numéro comme salle STAFFING n°2, même en présence de salles forfait', async () => {
    const db = fakeDb([room(1), forfait(1), room(9, { id: 'ws-op', demo_slot_index: null })])
    const { service } = await build(db)

    await service.acquire('device-B')

    expect(db.rows.find(r => r.id === 'ws-op')?.demo_slot_index).toBe(2)
  })

  it('le navigateur qui passe d’une démo à l’autre lâche sa salle précédente : un appareil, une salle', async () => {
    const db = fakeDb([room(1, { demo_leased_at: ago(3), demo_lease_device: 'device-A' }), forfait(1)])
    const { service, resetWorkspaceUnlessFresh } = await build(db)

    const slot = await service.acquire('device-A', 'forfait_conseil')

    expect(slot).toMatchObject({ workspaceId: 'ws-f1' })
    // La salle staffing est rendue (bail échu) : le balayage la remettra à neuf, hors requête.
    expect(db.rows[0]?.demo_lease_device).toBeNull()
    expect(resetWorkspaceUnlessFresh).not.toHaveBeenCalledWith('ws-1', expect.anything(), undefined, expect.anything())
    // Le renouvellement silencieux ne trouve plus qu'UNE salle à cet appareil : la forfait.
    const renewed = await service.renewLease('device-A')
    expect(renewed?.workspaceId).toBe('ws-f1')
  })

  it('remettre à neuf une salle forfait ne touche que CETTE salle', async () => {
    const db = fakeDb([
      room(1, { demo_leased_at: ago(2), demo_lease_device: 'device-A' }),
      forfait(1, { demo_leased_at: ago(90) }),
    ])
    const isRoomServable = jest.fn(async (workspaceId: string) => workspaceId !== 'ws-f1')
    const { service, resetWorkspaceUnlessFresh } = await build(db, { poolSize: 1, isRoomServable })

    const outcome = await service.acquire('device-B', 'forfait_conseil')
    await flush()

    expect(outcome).toMatchObject({ preparing: true })
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledTimes(1)
    expect(resetWorkspaceUnlessFresh).toHaveBeenCalledWith(
      'ws-f1',
      'demo-user-1001',
      undefined,
      expect.any(Date),
      GRACE_DU_MARQUEUR,
    )
    expect(db.rows[0]?.demo_lease_device).toBe('device-A')
  })
})
