import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Test } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import { DEMO_SEEDED_TABLES } from './demo-coverage'
import {
  DEMO_KEEP_TABLES,
  DEMO_PURGE_JOIN_TABLES,
  DEMO_PURGE_TABLES,
  DEMO_PURGE_USER_TABLES,
  DemoResetService,
  demoCompletenessProbes,
} from './demo-reset.service'
import { StorageClient } from '../storage/storage.client'
import { DemoSeedService } from './demo-seed.service'
import { DEMO_CONSULTANTS, DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_SEED_FINGERPRINT } from './demo-seed-fingerprint'
import { demoSeedFingerprintFor } from './demo-room-variant'

/** La salle telle qu'un test la DÉCRIT — jamais telle que le SQL la nomme. */
interface FakeRoom {
  /** Nombre de dossiers présents. */
  dossiers: number
  /** Date du plus récent, `null` = jamais semée. */
  newest: Date | null
  /** Les tables du semis qui ne contiennent RIEN dans cette salle. */
  empty?: readonly string[]
  /**
   * Le profil du PROPRIÉTAIRE de la salle a été anonymisé (RGPD) : ses champs
   * nominatifs valent `[supprimé]` et `anonymized_at` est posé. La salle porte
   * alors toutes ses tables et AUCUN nom — c'est ce qu'un prospect a lu au pied
   * de la barre latérale le 28/08 sur le lien public.
   */
  ownerAnonymized?: boolean
  /**
   * #2989 — la salle porte le compte du client d'exemple, mais sans
   * `business_unit_id` posé dessus : le semis a tourné AVANT le correctif
   * #3077, et rien depuis n'a rejoué cette colonne.
   */
  deliveryClientBuMissing?: boolean
  /**
   * #3135 — la salle porte l'empreinte d'un semis ANTÉRIEUR au process
   * courant (déploiement plus récent que la dernière fois qu'elle a été
   * semée). Par défaut la salle est À JOUR : la plupart des tests ne portent
   * pas sur cet angle, et une salle à jour est l'état normal d'une salle
   * juste semée par CE test.
   */
  staleSeedFingerprint?: boolean
  /** #3806 — empreinte remise à NULL : une purge a commencé, le semis n'a pas fini. */
  fingerprintCleared?: boolean
  /** #3806 — la salle a été servie en SECOURS à l'ancienne empreinte, à cette date (relu sous le verrou). */
  staleServedAt?: Date | null
  /** #4291 J — le numéro de la salle (au-delà de 1000 : variante forfait / conseil). Absent : salle staffing. */
  slotIndex?: number | null
  /** #4291 J — l'empreinte stampée, quand le test la fixe lui-même (prime sur les deux drapeaux ci-dessus). */
  stamp?: string
}

/**
 * Répond à la lecture de complétude en LISANT la requête qu'on lui passe.
 *
 * Le faux ne connaît ni le nom des colonnes ni le nombre de sondes : il repère
 * `COUNT(*) … AS x`, `MAX(created_at) … AS y` et chaque
 * `EXISTS (… FROM <table> …) AS "pN"`, puis remplit la ligne. Conséquence
 * voulue : un test décrit une SALLE (« complète, sauf le vivier ») et reste
 * juste quelle que soit la forme du critère — y compris l'ANCIENNE, qui ne
 * comptait que les dossiers sous l'alias `total`. C'est ce qui rend la
 * régression rejouable au lieu d'être racontée dans un commentaire.
 */
function roomRow(sql: string, room: FakeRoom): Record<string, unknown>[] {
  const empty = new Set(room.empty ?? [])
  const row: Record<string, unknown> = {}
  // `[\s\S]*?AS` : l'alias suit l'agrégat directement (`COUNT(*) AS total`) ou
  // ferme d'abord une sous-requête (`(SELECT COUNT(*) … ) AS dossiers`).
  for (const [, alias] of sql.matchAll(/COUNT\(\*\)[\s\S]*?AS\s+"?([a-z_]+)"?/gi)) row[alias] = String(room.dossiers)
  for (const [, alias] of sql.matchAll(/MAX\(created_at\)[\s\S]*?AS\s+"?([a-z_]+)"?/gi)) row[alias] = room.newest
  for (const [, table, alias] of sql.matchAll(/EXISTS \(SELECT 1 FROM ([a-z_]+) WHERE [\s\S]*?\) AS "([a-z0-9_]+)"/g)) {
    row[alias] = !empty.has(table)
  }
  // L'identité du propriétaire. Le faux ne connaît PAS l'alias : il le lit sur
  // la requête émise, exactement comme il lit les sondes de table. Un critère
  // qui n'interroge pas `profiles` ne pose donc aucune colonne, la ligne rendue
  // n'en porte pas la clé, et un test qui décrit une salle anonymisée rougit —
  // ce qui est précisément l'état d'AVANT ce correctif.
  for (const [, alias] of sql.matchAll(/FROM profiles\b[\s\S]*?\)\s+AS\s+"([a-z0-9_]+)"/g)) {
    row[alias] = !room.ownerAnonymized
  }
  // #2989 — la BU du client d'exemple : une colonne, pas une table, donc un
  // motif à part comme `profiles` ci-dessus plutôt qu'une sonde `EXISTS`.
  for (const [, alias] of sql.matchAll(
    /business_unit_id FROM accounts\b[\s\S]*?\)\s+IS NOT NULL AS\s+"([a-z0-9_]+)"/g,
  )) {
    row[alias] = !room.deliveryClientBuMissing
  }
  // #3135 — l'empreinte du semis. Le faux ne connaît pas la valeur courante
  // non plus : il la lit sur `DEMO_SEED_FINGERPRINT`, exactement comme le
  // service le ferait en comparant à sa propre constante.
  for (const [, alias] of sql.matchAll(/demo_seed_fingerprint FROM workspaces\b[\s\S]*?\)\s+AS\s+"([a-z0-9_]+)"/g)) {
    row[alias] =
      room.stamp ??
      (room.fingerprintCleared ? null : room.staleSeedFingerprint ? 'sha-anterieure' : DEMO_SEED_FINGERPRINT)
  }
  // #4291 J — le numéro de salle, qui dit la variante (et donc l'empreinte attendue).
  for (const [, alias] of sql.matchAll(/demo_slot_index FROM workspaces\b[\s\S]*?\)\s+AS\s+"([a-z0-9_]+)"/g)) {
    row[alias] = room.slotIndex ?? null
  }
  // #3806 — le marqueur « servie en secours », relu sous le verrou de re-semis.
  for (const [, alias] of sql.matchAll(/demo_stale_served_at FROM workspaces\b[\s\S]*?\)\s+AS\s+"([a-z0-9_]+)"/g)) {
    row[alias] = room.staleServedAt ?? null
  }
  return [row]
}

/** Une salle ENTIÈRE, telle que le semis la laisse. */
function full(newest: Date): FakeRoom {
  return { dossiers: DEMO_DOSSIERS.length, newest }
}

/**
 * INC-04-10 — la connexion qui tient le verrou de re-semis (`pg_try_advisory_xact_lock`)
 * le temps de la purge ET du semis. `granted: false` = un autre process le tient.
 */
function lockRunner(granted = true, sink: string[] = []) {
  return {
    connect: jest.fn(async () => undefined),
    startTransaction: jest.fn(async () => undefined),
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      sink.push([sql, ...(params as string[])].join(' | '))
      return [{ locked: granted }]
    }),
    commitTransaction: jest.fn(async () => undefined),
    rollbackTransaction: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
  }
}

/** Records, in order, every table the service deleted from. */
function fakeDataSource(
  room: FakeRoom = { dossiers: 3, newest: new Date('2020-01-01T00:00:00Z') },
  opts: { lockGranted?: boolean } = {},
) {
  const deleted: string[] = []
  const rawSql: string[] = []
  /** Le SQL de complétude tel que le service l'a VRAIMENT émis. */
  const readSql: string[] = []
  /** Les paramètres de cette même lecture — l'espace, et le propriétaire. */
  const readParams: unknown[][] = []
  /** SQL brut ET suppressions, dans l'ordre réel d'émission (contraintes de clé étrangère). */
  const events: string[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      rawSql.push([sql, ...((params as string[]) ?? [])].join(' | '))
      events.push(`sql:${sql}`)
      return []
    }),
    createQueryBuilder: () => {
      const qb = {
        delete: () => qb,
        from: (table: string) => {
          deleted.push(table)
          events.push(`delete:${table}`)
          return qb
        },
        where: () => qb,
        execute: async () => ({ affected: 1 }),
      }
      return qb
    },
  }
  const lockSql: string[] = []
  const runner = lockRunner(opts.lockGranted ?? true, lockSql)
  const dataSource = {
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    createQueryRunner: jest.fn(() => runner),
    // Lecture de complétude ET de fraîcheur. Par défaut : espace ancien et
    // tronqué (3 dossiers), donc la purge a lieu.
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      readSql.push(sql)
      readParams.push(params ?? [])
      return roomRow(sql, room)
    }),
  }
  return { dataSource, deleted, rawSql, readSql, readParams, events, lockSql, runner }
}

const seedWorkspace = jest.fn(async () => ({ seeded: true, accounts: 3 }))

async function build(dataSource: unknown, storage?: { remove: jest.Mock }) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      DemoResetService,
      { provide: getDataSourceToken(), useValue: dataSource },
      { provide: DemoSeedService, useValue: { seedWorkspace } },
      ...(storage ? [{ provide: StorageClient, useValue: storage }] : []),
    ],
  }).compile()
  return moduleRef.get(DemoResetService)
}

describe('DemoResetService (shared demo link — reset on every connection)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('purges join-scoped, then user-scoped, then workspace-scoped tables, and re-seeds', async () => {
    const { dataSource, deleted } = fakeDataSource()
    const service = await build(dataSource)

    const outcome = await service.resetWorkspace('ws-demo', 'demo-user')

    expect(deleted).toEqual([
      ...DEMO_PURGE_JOIN_TABLES.map(t => t.table),
      ...DEMO_PURGE_USER_TABLES,
      ...DEMO_PURGE_TABLES,
    ])
    expect(seedWorkspace).toHaveBeenCalledWith('ws-demo', 'demo-user')
    expect(outcome.seeded).toBe(true)
    expect(outcome.accounts).toBe(3)
  })

  // #4573.10 — la purge efface les LIGNES ; les ORIGINAUX déposés par un visiteur (pack de contexte, CV) partent du
  // seau avant, tant que les lignes en portent encore le chemin. Les objets du semis (`storage_objects`) restent :
  // leurs chemins sont stables et le semis suivant les réécrit.
  describe('#4573.10 — les originaux du visiteur partent du seau à la remise à zéro', () => {
    const PATHS = ['ws-demo/context-pack/imp-1/pack.pdf', 'ws-demo/consultants/c-1/cv.pdf']
    const withOriginals = (rows: { p: string }[]) => {
      const fake = fakeDataSource()
      const base = fake.dataSource.query
      fake.dataSource.query = jest.fn(async (sql: string, params?: unknown[]) =>
        /original_storage_path/.test(sql) ? rows : base(sql, params),
      ) as typeof base
      return fake
    }

    it('retire du seau les chemins des originaux de l’espace AVANT la première suppression', async () => {
      const storage = { remove: jest.fn(async () => true) }
      const { dataSource, rawSql } = withOriginals(PATHS.map(p => ({ p })))
      const order: string[] = []
      storage.remove.mockImplementation(async () => {
        order.push(`remove:${rawSql.length}`)
        return true
      })
      await (await build(dataSource, storage)).resetWorkspace('ws-demo', 'demo-user')
      expect(storage.remove).toHaveBeenCalledWith(PATHS)
      expect(order).toEqual(['remove:0'])
    })

    it('sait dire NON : aucun original, aucun appel au seau', async () => {
      const storage = { remove: jest.fn(async () => true) }
      const { dataSource } = withOriginals([])
      await (await build(dataSource, storage)).resetWorkspace('ws-demo', 'demo-user')
      expect(storage.remove).not.toHaveBeenCalled()
    })

    it('un seau qui refuse n’empêche pas la remise à zéro de la salle', async () => {
      const storage = { remove: jest.fn(async () => false) }
      const { dataSource } = withOriginals(PATHS.map(p => ({ p })))
      const outcome = await (await build(dataSource, storage)).resetWorkspace('ws-demo', 'demo-user')
      expect(outcome.seeded).toBe(true)
    })

    it('sans stockage branché, la salle se remet à zéro comme avant', async () => {
      const { dataSource } = withOriginals(PATHS.map(p => ({ p })))
      const outcome = await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')
      expect(outcome.seeded).toBe(true)
    })
  })

  it('deletes accounts LAST — contacts, angles and plans reference it', async () => {
    const { dataSource, deleted } = fakeDataSource()
    await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

    expect(deleted[deleted.length - 1]).toBe('accounts')
    for (const child of ['contacts', 'attack_angles', 'action_plans', 'action_plan_items', 'contact_merges']) {
      expect(deleted.indexOf(child)).toBeLessThan(deleted.indexOf('accounts'))
    }
  })

  it('deletes rows that hang off a contact/sequence before their parent row', async () => {
    const { dataSource, deleted } = fakeDataSource()
    await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

    expect(deleted.indexOf('contact_lifecycle_transitions')).toBeLessThan(deleted.indexOf('contacts'))
    expect(deleted.indexOf('outreach_sequence_steps')).toBeLessThan(deleted.indexOf('outreach_sequences'))
    expect(deleted.indexOf('integration_deliveries')).toBeLessThan(deleted.indexOf('integrations'))
  })

  it('détache les missions de leur BU AVANT de purger business_units — FK sans ON DELETE (recette Y22, 03/10)', async () => {
    // Prod 03/10 : « reset failed — the room is served AS IS » sur
    // missions_business_unit_id_fkey ; la salle démo restait périmée depuis le semis #3413.
    const { dataSource, events } = fakeDataSource()
    await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

    const detach = events.findIndex(e => /UPDATE missions SET business_unit_id = NULL/.test(e))
    expect(detach).toBeGreaterThanOrEqual(0)
    expect(detach).toBeLessThan(events.indexOf('delete:business_units'))
  })

  it('détache les missions de leur candidature AVANT de purger submissions — FK sans ON DELETE (lot X80)', async () => {
    // `missions.submission_id REFERENCES submissions(id)` (migration 1796321999852) sans ON DELETE :
    // une mission créée depuis une candidature, dans la salle, ferait échouer le reset.
    const { dataSource, events } = fakeDataSource()
    await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

    const detach = events.findIndex(e => /UPDATE missions SET submission_id = NULL/.test(e))
    expect(detach).toBeGreaterThanOrEqual(0)
    expect(detach).toBeLessThan(events.indexOf('delete:submissions'))
  })

  it('takes a NON-blocking, transaction-scoped advisory lock per room, released after the seed', async () => {
    // INC-04-10 — le verrou BLOQUANT tenait une connexion Supavisor jusqu'à 184 s
    // puis laissait le second process purger à son tour. Il est désormais
    // `try`, par salle, et couvre la purge ET le semis.
    const { dataSource, rawSql, lockSql, runner } = fakeDataSource()
    await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

    expect(lockSql[0]).toContain('pg_try_advisory_xact_lock')
    expect(lockSql[0]).toContain('ws-demo')
    expect(rawSql.some(sql => /pg_advisory_xact_lock\(/.test(sql))).toBe(false)
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1)
    expect(runner.release).toHaveBeenCalledTimes(1)
    // Libéré APRÈS le semis : sinon un second process purgerait sous le semis
    // en cours — la violation attack_angles_account_id_fkey du 04/10.
    expect(runner.commitTransaction.mock.invocationCallOrder[0]).toBeGreaterThan(
      seedWorkspace.mock.invocationCallOrder[0] ?? Infinity,
    )
  })

  describe('INC-04-10 — deux re-semis de la même salle ne se chevauchent jamais', () => {
    it('lock NOT obtained → no purge, no seed (another process is on it)', async () => {
      const { dataSource, deleted, runner } = fakeDataSource(undefined, { lockGranted: false })
      const outcome = await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

      expect(deleted).toEqual([])
      expect(seedWorkspace).not.toHaveBeenCalled()
      expect(outcome.skipped).toBe(true)
      expect(runner.release).toHaveBeenCalledTimes(1)
    })

    it('resetWorkspaceUnlessFresh: lock NOT obtained → no purge', async () => {
      const { dataSource, deleted } = fakeDataSource(undefined, { lockGranted: false })
      await (await build(dataSource)).resetWorkspaceUnlessFresh('ws-demo', 'demo-user')

      expect(deleted).toEqual([])
      expect(seedWorkspace).not.toHaveBeenCalled()
    })

    it('reads the room AFTER the lock: a room re-seeded meanwhile by the other process is NOT purged', async () => {
      // Le premier process a fini pendant que celui-ci arrivait : la décision
      // « périmée » prise AVANT le verrou serait fausse. Relue sous verrou, la
      // salle est fraîche et à jour.
      const { dataSource, deleted, runner, readSql } = fakeDataSource(full(new Date()))
      const order: string[] = []
      runner.query.mockImplementation(async () => {
        order.push('lock')
        return [{ locked: true }]
      })
      const read = dataSource.query.getMockImplementation()
      dataSource.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        order.push('read')
        return (await read?.(sql, params)) ?? []
      })
      await (await build(dataSource)).resetWorkspaceUnlessFresh('ws-demo', 'demo-user')

      expect(deleted).toEqual([])
      expect(seedWorkspace).not.toHaveBeenCalled()
      expect(readSql.length).toBeGreaterThan(0)
      expect(order[0]).toBe('lock')
    })

    it('repairIfIncomplete: lock NOT obtained → no purge', async () => {
      const { dataSource, deleted } = fakeDataSource(undefined, { lockGranted: false })
      await (await build(dataSource)).repairIfIncomplete('ws-demo', 'demo-user')

      expect(deleted).toEqual([])
      expect(seedWorkspace).not.toHaveBeenCalled()
    })

    it('two simultaneous resets of the same room → ONE purge', async () => {
      // Le verrou Postgres réel, simulé : le premier l'obtient, le second non
      // tant que le premier n'a pas validé sa transaction.
      let held = false
      const { dataSource, deleted } = fakeDataSource()
      const makeRunner = () => {
        let mine = false
        return {
          ...lockRunner(),
          query: jest.fn(async () => {
            if (held) return [{ locked: false }]
            held = true
            mine = true
            return [{ locked: true }]
          }),
          commitTransaction: jest.fn(async () => {
            if (mine) held = false
          }),
          rollbackTransaction: jest.fn(async () => {
            if (mine) held = false
          }),
        }
      }
      dataSource.createQueryRunner.mockImplementation(makeRunner as never)
      const service = await build(dataSource)

      await Promise.all([
        service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user'),
        service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user'),
      ])

      expect(deleted.filter(t => t === 'accounts')).toHaveLength(1)
      expect(seedWorkspace).toHaveBeenCalledTimes(1)
    })
  })

  it('purges the OAuth connections a visitor could have made on the shared space', async () => {
    // A prospect clicking « connecter mon CRM » on the shared demo would leave
    // THEIR tokens (and reachable data) behind for the next visitor.
    const { dataSource, deleted } = fakeDataSource()
    await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

    for (const table of ['crm_connections', 'google_connections', 'microsoft_connections', 'notion_connections']) {
      expect(deleted).toContain(table)
    }
  })

  it('purges what would otherwise lock the shared demo account out or leak outward', async () => {
    const { dataSource, deleted } = fakeDataSource()
    await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

    // A visitor enabling 2FA on the shared account would lock out every other
    // visitor — and Théo mid-call.
    expect(deleted).toContain('user_mfa')
    // A visitor pointing an outbound webhook at their own Slack.
    expect(deleted).toContain('integrations')
    // A visitor pairing the demo account with their AI assistant (MCP OAuth).
    expect(deleted).toContain('oauth_refresh_tokens')
    // A visitor minting an API key against the shared space.
    expect(deleted).toContain('api_keys')
  })

  it('never deletes an opt-out: email_suppressions survives the reset', async () => {
    // Resurrecting a suppression would mean e-mailing someone who asked not to
    // be — the one row a reset must respect (#394 / RFC 8058).
    const { dataSource, deleted } = fakeDataSource()
    await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

    expect(deleted).not.toContain('email_suppressions')
    expect(DEMO_KEEP_TABLES).toContain('email_suppressions')
  })

  // #4158.13 — l'espace de démonstration compte des collègues fictifs. Le reset
  // doit passer avec eux : leurs appartenances (`workspace_members`) et leurs
  // profils survivent (identité, pas du contenu de visiteur), et tout ce que le
  // semis leur a rattaché PART — activité (`user_actions`, par espace), actions
  // déléguées (`action_plan_items`, par créateur) et comptes repris — AVANT les
  // comptes, sinon la clé étrangère des comptes ferait échouer la purge.
  it('#4158.13 — resets cleanly with fictional colleagues: their memberships stay, what the seed attached to them goes', async () => {
    const { dataSource, deleted } = fakeDataSource()
    await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

    expect(deleted).not.toContain('workspace_members')
    expect(deleted).not.toContain('profiles')
    for (const table of ['user_actions', 'action_plan_items', 'contacts', 'accounts']) {
      expect(deleted).toContain(table)
    }
    // Les enfants avant le parent.
    expect(deleted.indexOf('action_plan_items')).toBeLessThan(deleted.indexOf('accounts'))
    expect(deleted.indexOf('user_actions')).toBeLessThan(deleted.indexOf('accounts'))
    expect(DEMO_KEEP_TABLES).toContain('workspace_members')
  })

  it('keeps the workspace structure so the space stays reachable after a reset', async () => {
    const { dataSource, deleted } = fakeDataSource()
    await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

    expect(deleted).not.toContain('workspace_members')
    expect(deleted).not.toContain('workspaces')
    // Purging this would re-trigger the onboarding questionnaire on every visit.
    expect(deleted).not.toContain('user_onboarding_state')
  })

  /**
   * #1928 — UN VISITEUR N'HÉRITE PAS DE LA FAÇON DONT LE PRÉCÉDENT VOULAIT QUE
   * LAURA LUI RÉPONDE.
   *
   * Les quatre réglages de réponse vivent dans le sac `user_preferences` du
   * PROPRIÉTAIRE de la salle — le même compte pour tous les visiteurs. La table
   * est gardée à dessein (identité, pas contenu) : on ne supprime donc pas la
   * rangée, on retire CES quatre clés, et rien d'autre.
   *
   * Le faux ci-dessous tient le sac en mémoire et n'applique QUE la forme
   * « `preferences - $n::text[]` bornée par `user_id` ». Toute autre écriture
   * sur la table est relevée — un « on vide le sac » passerait sinon au vert.
   */
  describe('#1928 — les réglages de réponse ne passent pas au visiteur suivant', () => {
    const REPLY_KEYS = ['replyLength', 'replyTone', 'replyFormat', 'replySources']

    function withPreferences(bags: Record<string, Record<string, unknown>>) {
      const fake = fakeDataSource()
      const other: string[] = []
      const understood =
        /^\s*UPDATE user_preferences SET preferences = preferences - \$(\d)::text\[\] WHERE user_id = \$(\d)\s*$/
      fake.dataSource.transaction.mockImplementation(async (cb: (m: unknown) => Promise<unknown>) => {
        const manager = {
          query: async (sql: string, params: unknown[] = []) => {
            if (!/user_preferences/.test(sql)) return []
            const form = understood.exec(sql)
            if (!form) {
              other.push(sql)
              return []
            }
            const keys = params[Number(form[1]) - 1] as string[]
            const bag = bags[params[Number(form[2]) - 1] as string]
            if (bag) for (const key of keys) delete bag[key]
            return []
          },
          createQueryBuilder: () => {
            const qb = {
              delete: () => qb,
              from: (table: string) => {
                fake.deleted.push(table)
                return qb
              },
              where: () => qb,
              execute: async () => ({ affected: 1 }),
            }
            return qb
          },
        }
        return cb(manager)
      })
      return { ...fake, other }
    }

    it('retire les quatre clés du sac du propriétaire de la salle', async () => {
      const bags = {
        'demo-user': { replyLength: 'short', replyTone: 'teaching', replyFormat: 'lists', replySources: 'detailed' },
      }
      const { dataSource } = withPreferences(bags)
      await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

      for (const key of REPLY_KEYS) expect(bags['demo-user']).not.toHaveProperty(key)
    })

    // #2896 / #2449.34 — le niveau d'action réglé est un choix du visiteur, comme
    // ses réglages de réponse : le suivant ne doit pas trouver Laura bridée à
    // « répondre seulement » sans l'avoir demandé.
    it('retire aussi le niveau d’action réglé par le visiteur (#2449.34)', async () => {
      const bags = { 'demo-user': { copilotActionLevel: 'respond_only', tone: 'direct' } }
      const { dataSource } = withPreferences(bags)
      await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

      expect(bags['demo-user']).toEqual({ tone: 'direct' })
    })

    it('laisse INTACTES les autres clés du sac, et la rangée elle-même (témoin)', async () => {
      const bags = {
        'demo-user': { replyLength: 'short', tone: 'direct', sectors: ['Banque'] },
        'someone-else': { replyLength: 'detailed', replyTone: 'direct' },
      }
      const { dataSource, deleted, other } = withPreferences(bags)
      await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

      expect(bags['demo-user']).toEqual({ tone: 'direct', sectors: ['Banque'] })
      // Borné au propriétaire : le sac d'un autre utilisateur ne bouge pas.
      expect(bags['someone-else']).toEqual({ replyLength: 'detailed', replyTone: 'direct' })
      // Aucune suppression de la rangée, aucune autre écriture sur la table.
      expect(deleted).not.toContain('user_preferences')
      expect(other).toEqual([])
    })
  })

  /**
   * Le nom de table d'une entité, quelle que soit la FORME de son décorateur.
   *
   * `@Entity({ name: 'x' })` et `@Entity('x')` sont équivalents pour TypeORM, et
   * la garde ne lisait que le premier : neuf tables portant `workspace_id`
   * échappaient donc silencieusement au classement purge/keep — dont huit livrées
   * la veille. Une garde borgne ressemble en tout point à une garde verte.
   */
  /**
   * ⚠️ Le nom de table se lit d'ABORD dans `@Entity('…')`.
   *
   * L'ordre inverse — qui était celui d'origine — prenait le premier
   * `name: '…'` du fichier, c'est-à-dire le nom d'une COLONNE dès qu'une entité
   * commence par `@Column({ name: 'workspace_id' })`. La table classée n'était
   * alors pas celle qu'on croyait, et l'entité passait pour non classée.
   * `@Entity` est la seule source qui fasse foi.
   */
  function tableNameOf(source: string): string | null {
    return /@Entity\('([^']+)'\)/.exec(source)?.[1] ?? /name: '([^']+)'/.exec(source)?.[1] ?? null
  }

  /** Les commentaires ne sont pas du code : une entité qui EXPLIQUE qu'elle n'a
   *  pas de `workspace_id` n'en a toujours pas. Même leçon que GA-12. */
  function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  }

  /**
   * La garde qui manquait : une table purgée PORTE-T-ELLE vraiment la colonne ?
   *
   * La garde d'à côté vérifie les ENTITÉS — donc rien pour une table sans
   * fichier d'entité, et il y en a huit. `shortlist_entries` et
   * `match_run_entries` (20/08) sont entrées dans la liste plate, qui efface
   * par `WHERE workspace_id = $1` ; elles pendent de leur parent et n'ont pas
   * cette colonne. Résultat : **toute ouverture du lien de démonstration
   * publique répondait 500 depuis trois jours**, et aucun des 5 700 tests de
   * l'API ne le voyait — la purge n'est jouée qu'en base réelle.
   *
   * La source de vérité pour une table sans entité, ce sont les MIGRATIONS.
   */
  describe('une table purgée par workspace_id porte vraiment cette colonne', () => {
    const MIGRATIONS = join(__dirname, '..', '..', 'migrations')

    /** Le SQL de toutes les migrations, `up()` seulement, concaténé. */
    function migrationSql(): string {
      return readdirSync(MIGRATIONS)
        .filter(name => name.endsWith('.ts'))
        .sort()
        .map(name => readFileSync(join(MIGRATIONS, name), 'utf8').split('public async down')[0] ?? '')
        .join('\n')
    }

    /**
     * Les tables qu'une migration altère EN BOUCLE.
     *
     * Le passage au multi-espace (07/2026) n'écrit pas `ALTER TABLE accounts` :
     * il boucle sur un tableau de noms et interpole. Une garde qui ne lirait
     * que la forme littérale déclarerait sept tables sans colonne alors
     * qu'elles l'ont — et une garde qui se trompe finit désactivée.
     */
    function loopedTables(sql: string): Set<string> {
      const covered = new Set<string>()
      for (const match of sql.matchAll(/ALTER TABLE \$\{(\w+)\}[\s\S]{0,400}?workspace_id/g)) {
        const variable = match[1] as string
        // La boucle la plus PROCHE en amont, jamais la première du fichier :
        // plusieurs migrations bouclent sur `table`, et prendre la première
        // ferait dire à la garde que les tables du multi-espace sont
        // `workspaces` — c'est-à-dire n'importe quoi, mais au vert.
        const before = sql.slice(0, match.index ?? 0)
        const loops = [...before.matchAll(new RegExp(`for \\(const ${variable} of (\\[[\\s\\S]*?\\]|\\w+)\\)`, 'g'))]
        const source = loops.at(-1)?.[1] ?? ''
        const inline = source.startsWith('[')
          ? source
          : (new RegExp(`const ${source}[^=]*= \\[([\\s\\S]*?)\\]`).exec(sql)?.[1] ?? '')
        for (const [, name] of inline.matchAll(/'([a-z_]+)'/g)) covered.add(name)
      }
      return covered
    }

    function declaresWorkspaceColumn(sql: string, table: string, looped: Set<string>): boolean {
      const created = [
        ...sql.matchAll(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ${table} \\(([\\s\\S]*?)\\n\\s*\\)`, 'g')),
      ]
      if (created.some(match => (match[1] ?? '').includes('workspace_id'))) return true
      // Une colonne ajoutée après coup compte aussi — c'est le cas des tables
      // d'avant le multi-espace.
      if (new RegExp(`ALTER TABLE ${table}[\\s\\S]{0,400}?workspace_id`).test(sql)) return true
      return looped.has(table)
    }

    it('chaque table de DEMO_PURGE_TABLES a un workspace_id quelque part dans les migrations', () => {
      const sql = migrationSql()
      const looped = loopedTables(sql)
      const withoutColumn = DEMO_PURGE_TABLES.filter(table => !declaresWorkspaceColumn(sql, table, looped))
      expect(withoutColumn).toEqual([])
    })

    it('lit bien les migrations — une lecture vide passerait au vert pour toujours', () => {
      expect(migrationSql()).toContain('CREATE TABLE')
      const sql = migrationSql()
      expect(declaresWorkspaceColumn(sql, 'accounts', loopedTables(sql))).toBe(true)
      // Et la garde sait encore dire NON : une table inventée n'a pas la colonne.
      expect(declaresWorkspaceColumn(sql, 'table_qui_nexiste_pas', loopedTables(sql))).toBe(false)
    })
  })

  describe('leak guard — every workspace-scoped table is classified', () => {
    it('classifies each entity carrying workspace_id as purge OR keep', () => {
      // The point of this test: when someone adds a NEW workspace-scoped table,
      // it must be a DECISION whether a demo reset wipes it. Without this, a
      // future table silently leaks one visitor's data to the next.
      const entitiesDir = join(__dirname, '..', '..', 'database', 'entities')
      const classified = new Set<string>([...DEMO_PURGE_TABLES, ...DEMO_KEEP_TABLES])

      const unclassified: string[] = []
      for (const file of readdirSync(entitiesDir).filter(f => f.endsWith('.entity.ts'))) {
        const source = readFileSync(join(entitiesDir, file), 'utf8')
        if (!/\bworkspace_id\b/.test(withoutComments(source))) continue
        const table = tableNameOf(source)
        if (!table) continue
        if (!classified.has(table)) unclassified.push(`${table} (${file})`)
      }

      expect(unclassified).toEqual([])
    })

    it('never lists the same table as both purged and kept', () => {
      const purged = new Set<string>([
        ...DEMO_PURGE_TABLES,
        ...DEMO_PURGE_USER_TABLES,
        ...DEMO_PURGE_JOIN_TABLES.map(t => t.table),
      ])
      expect([...DEMO_KEEP_TABLES].filter(t => purged.has(t))).toEqual([])
    })

    it('chaque table de DEMO_PURGE_TABLES porte bien un workspace_id', () => {
      // Le pendant du garde ci-dessus, dans l'autre sens. Celui-là demandait
      // « cette table est-elle classée ? » ; il ne demandait pas « la purge
      // SAIT-elle l'effacer ? ». La passe workspace-scoped efface avec un
      // `WHERE workspace_id = $1` en dur : une table sans cette colonne fait
      // échouer la transaction entière, donc la remise à neuf, donc le lien de
      // démonstration — c'est arrivé en production avec les relevés et les
      // affectations de mission, qui pendent d'une mission et pas d'un espace.
      // Une table enfant se déclare dans DEMO_PURGE_JOIN_TABLES.
      const entitiesDir = join(__dirname, '..', '..', 'database', 'entities')
      const withWorkspaceId = new Set<string>()
      for (const file of readdirSync(entitiesDir).filter(f => f.endsWith('.entity.ts'))) {
        const source = readFileSync(join(entitiesDir, file), 'utf8')
        if (!/\bworkspace_id\b/.test(source)) continue
        const table = tableNameOf(source)
        if (table) withWorkspaceId.add(table)
      }

      // Seules les tables qui ONT une entité sont vérifiables ici : quelques
      // tables purgées n'en ont pas (SQL brut). On ne peut donc pas exiger
      // l'appartenance — on peut exiger l'inverse, qui est le vrai piège :
      // une table dont l'entité existe et NE porte PAS `workspace_id`.
      const entityTables = new Set<string>()
      for (const file of readdirSync(entitiesDir).filter(f => f.endsWith('.entity.ts'))) {
        const table = /name: '([^']+)'/.exec(readFileSync(join(entitiesDir, file), 'utf8'))?.[1]
        if (table) entityTables.add(table)
      }

      const undeletable = [...DEMO_PURGE_TABLES].filter(t => entityTables.has(t) && !withWorkspaceId.has(t))
      expect(undeletable).toEqual([])
    })
  })

  describe('resetWorkspaceUnlessFresh — the public link is clicked more than once', () => {
    it('skips the purge when the space was just reset — a refresh must not wipe a live demo', async () => {
      // La salle est COMPLÈTE : c'est ce qui la rend sautable. Le compte est lu
      // sur le jeu de données, pas figé à un nombre — ajouter un sixième
      // dossier ne doit pas rendre ce test faux en silence.
      const { dataSource, deleted } = fakeDataSource(full(new Date()))
      const service = await build(dataSource)

      const outcome = await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user')

      expect(outcome.skipped).toBe(true)
      expect(outcome.accounts).toBe(DEMO_DOSSIERS.length)
      expect(deleted).toEqual([])
      expect(seedWorkspace).not.toHaveBeenCalled()
    })

    it('#3578 — saute la purge d’une salle re-semée APRÈS son dernier bail, même hors fenêtre de 90 s', async () => {
      // Re-semée en arrière-plan il y a 10 min ; le dernier visiteur est parti il y a 40 min :
      // personne n'y a touché, la purger ferait attendre ~70 s le visiteur suivant.
      const { dataSource, deleted } = fakeDataSource(full(new Date(Date.now() - 10 * 60_000)))
      const service = await build(dataSource)

      const outcome = await service.resetWorkspaceUnlessFresh(
        'ws-demo',
        'demo-user',
        undefined,
        new Date(Date.now() - 40 * 60_000),
      )

      expect(outcome.skipped).toBe(true)
      expect(deleted).toEqual([])
      expect(seedWorkspace).not.toHaveBeenCalled()
    })

    it('#3578 — SAIT DIRE NON : un visiteur est passé APRÈS le semis, la purge reprend', async () => {
      const { dataSource, deleted } = fakeDataSource(full(new Date(Date.now() - 40 * 60_000)))
      const service = await build(dataSource)

      const outcome = await service.resetWorkspaceUnlessFresh(
        'ws-demo',
        'demo-user',
        undefined,
        new Date(Date.now() - 10 * 60_000),
      )

      expect(outcome.skipped).toBeUndefined()
      expect(deleted.length).toBeGreaterThan(0)
    })

    it('#3578.2 — isRoomServable : intacte depuis son semis = servable ; touchée après = NON ; jamais louée = oui', async () => {
      const seededAt = new Date(Date.now() - 10 * 60_000)
      const service = await build(fakeDataSource(full(seededAt)).dataSource)

      // Dernier bail AVANT le semis : personne n'y a touché.
      expect(await service.isRoomServable('ws-demo', 'demo-user', new Date(Date.now() - 40 * 60_000))).toBe(true)
      // Dernier bail APRÈS le semis : un visiteur l'a eue — à remettre à neuf, pas à servir.
      expect(await service.isRoomServable('ws-demo', 'demo-user', new Date(Date.now() - 2 * 60_000))).toBe(false)
      // Jamais louée : l'état « prêt » suffit.
      expect(await service.isRoomServable('ws-demo', 'demo-user', null)).toBe(true)
    })

    it('#3806 — isStaleRoomServable : semis ANCIEN mais fini et intact = servable en secours ; purge en cours / touchée / à jour = NON', async () => {
      const seededAt = new Date(Date.now() - 10 * 60_000)
      const before = new Date(Date.now() - 40 * 60_000)
      const stale = await build(fakeDataSource({ ...full(seededAt), staleSeedFingerprint: true }).dataSource)
      expect(await stale.isStaleRoomServable('ws-demo', 'demo-user', before)).toBe(true)
      expect(await stale.isStaleRoomServable('ws-demo', 'demo-user', null)).toBe(true)
      // Touchée par un visiteur depuis son semis : jamais servie à un autre.
      expect(await stale.isStaleRoomServable('ws-demo', 'demo-user', new Date(Date.now() - 2 * 60_000))).toBe(false)
      // Empreinte à NULL : une purge a commencé (ou le semis n'a pas fini) — jamais une salle en cours de semis.
      const seeding = await build(fakeDataSource({ ...full(seededAt), fingerprintCleared: true }).dataSource)
      expect(await seeding.isStaleRoomServable('ws-demo', 'demo-user', before)).toBe(false)
      // À l'empreinte courante : ce n'est pas un secours, `isRoomServable` la sert déjà.
      const fresh = await build(fakeDataSource(full(seededAt)).dataSource)
      expect(await fresh.isStaleRoomServable('ws-demo', 'demo-user', before)).toBe(false)
      // Aucun dossier : pas une salle « finie ».
      const empty = await build(fakeDataSource({ dossiers: 0, newest: null, staleSeedFingerprint: true }).dataSource)
      expect(await empty.isStaleRoomServable('ws-demo', 'demo-user', null)).toBe(false)
    })

    it('#3806 — une salle SERVIE EN SECOURS depuis la décision du balayage n’est pas purgée (lue sous le verrou)', async () => {
      const previousLeaseAt = new Date(Date.now() - 40 * 60_000)
      const { dataSource, deleted } = fakeDataSource({
        ...full(new Date(Date.now() - 50 * 60_000)),
        staleSeedFingerprint: true,
        staleServedAt: new Date(Date.now() - 5_000), // un autre réplica vient de la servir à un visiteur
      })
      const service = await build(dataSource)

      const outcome = await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user', undefined, previousLeaseAt)

      expect(outcome.skipped).toBe(true)
      expect(deleted).toEqual([])
      expect(seedWorkspace).not.toHaveBeenCalled()
    })

    it('#3806 — TÉMOIN : servie en secours AVANT son dernier bail (bail fini) → la salle périmée est bien purgée', async () => {
      const previousLeaseAt = new Date(Date.now() - 40 * 60_000)
      const { dataSource, deleted } = fakeDataSource({
        ...full(new Date(Date.now() - 50 * 60_000)),
        staleSeedFingerprint: true,
        staleServedAt: new Date(previousLeaseAt.getTime() - 20 * 60_000),
      })
      const service = await build(dataSource)

      await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user', undefined, previousLeaseAt)

      expect(deleted.length).toBeGreaterThan(0)
    })

    it('#4810 — marqueur de secours POSTÉRIEUR au bail mais VIEUX (bail échu) → la salle est purgée et re-semée', async () => {
      // Panne du 29/10/2026 : `settleWithoutWaiting` posait le marqueur APRÈS la transaction de bail, donc
      // quelques centaines de ms plus tard que `demo_leased_at`. Le critère « marqueur postérieur au bail »
      // restait donc vrai POUR TOUJOURS : la salle n'était plus jamais purgée (« skipping the purge » en
      // boucle), donc jamais re-semée, donc jamais fraîche — et plus servable en secours non plus, son semis
      // étant antérieur à son bail. Les cinq salles staffing du pool y sont passées : « Préparation de ta
      // démo… » sans fin pendant plus d'une heure, sans une seule erreur au journal.
      const previousLeaseAt = new Date(Date.now() - 40 * 60_000)
      const { dataSource, deleted } = fakeDataSource({
        ...full(new Date(Date.now() - 50 * 60_000)),
        staleSeedFingerprint: true,
        staleServedAt: new Date(previousLeaseAt.getTime() + 300), // le décalage exact de la panne
      })
      const service = await build(dataSource)

      const outcome = await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user', undefined, previousLeaseAt)

      expect(outcome.skipped).toBeUndefined()
      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalled()
    })

    it('#4810 — le marqueur protège un bail VIVANT, pas une salle libre : la grâce est celle du bail', async () => {
      // Le marqueur ne dit qu'une chose : « quelqu'un est DEDANS en ce moment ». Passé le bail, il ne protège
      // plus rien — sinon il condamne la salle.
      const grace = 30 * 60_000
      const withMarkerAgedMs = async (ageMs: number) => {
        const { dataSource, deleted } = fakeDataSource({
          ...full(new Date(Date.now() - 50 * 60_000)),
          staleSeedFingerprint: true,
          staleServedAt: new Date(Date.now() - ageMs),
        })
        const service = await build(dataSource)
        const outcome = await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user', undefined, null, grace)
        return { skipped: outcome.skipped === true, deleted: deleted.length }
      }

      // Dans le bail : un visiteur la présente, on n'y touche pas.
      expect(await withMarkerAgedMs(5_000)).toEqual({ skipped: true, deleted: 0 })
      // Bail échu : elle repart en re-semis.
      const expired = await withMarkerAgedMs(grace + 60_000)
      expect(expired.skipped).toBe(false)
      expect(expired.deleted).toBeGreaterThan(0)
    })

    it('purges again once the window has passed — a visitor never inherits another session', async () => {
      const { dataSource, deleted } = fakeDataSource(full(new Date(Date.now() - 10 * 60_000)))
      const service = await build(dataSource)

      const outcome = await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user')

      expect(outcome.skipped).toBeUndefined()
      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalled()
    })

    it('purge une salle INCOMPLÈTE, si récente soit-elle', async () => {
      /**
       * Le défaut vécu en production, sur le lien public : une salle ne
       * contenait qu'UN dossier — « Société Générale » — et zéro contact, là où
       * le jeu de démonstration en compte cinq et 255. Elle est restée dans cet
       * état parce que la fraîcheur se lisait « il existe des dossiers et ils
       * sont récents », jamais « la salle est complète ».
       *
       * Un semis interrompu produit exactement cette signature : quelques
       * lignes écrites, récentes, et un espace qui se présente comme neuf. Le
       * prospect voit alors une démonstration à moitié vide, ce qui est pire
       * qu'un écran d'erreur — il en conclut que le produit est vide.
       */
      const { dataSource, deleted } = fakeDataSource({ dossiers: 1, newest: new Date() })
      const service = await build(dataSource)

      const outcome = await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user')

      expect(outcome.skipped).toBeUndefined()
      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalled()
    })

    it('répare une salle tronquée que le MÊME visiteur reprend', async () => {
      /**
       * La suite du défaut ci-dessus. Le critère de complétude ne s'appliquait
       * qu'au visiteur SUIVANT : une salle n'est remise à neuf que lorsqu'elle
       * est LIBRE. Or le bail se renouvelle à chaque appel, si bien qu'un
       * navigateur qui revient rouvre indéfiniment SA salle — tronquée comprise.
       * Elle ne redevenait donc jamais libre, et personne ne la réparait.
       */
      const { dataSource, deleted } = fakeDataSource({ dossiers: 1, newest: new Date() })
      const service = await build(dataSource)

      const outcome = await service.repairIfIncomplete('ws-demo', 'demo-user')

      expect(outcome.skipped).toBeUndefined()
      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalled()
    })

    it('ne touche JAMAIS à une salle complète que son visiteur occupe', async () => {
      /**
       * L'autre moitié de la règle, et la plus importante : une salle complète
       * appartient à celui qui la montre. La purger sous ses yeux — parce qu'il
       * a rechargé la page en pleine démonstration — est exactement l'accident
       * que le pool de salles existe pour éviter.
       */
      const { dataSource, deleted } = fakeDataSource(full(new Date()))
      const service = await build(dataSource)

      const outcome = await service.repairIfIncomplete('ws-demo', 'demo-user')

      expect(outcome.skipped).toBe(true)
      expect(deleted).toHaveLength(0)
      expect(seedWorkspace).not.toHaveBeenCalled()
    })

    it('purges when the space holds no dossier at all (never seeded)', async () => {
      const { dataSource, deleted } = fakeDataSource({ dossiers: 0, newest: null })
      const service = await build(dataSource)

      await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user')

      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalled()
    })
  })

  /**
   * #3135 — LE DÉFAUT DU 27/09, MESURÉ EN PRODUCTION.
   *
   * L'API portait déjà les nouveautés seedées (plan SNCF > 3 actions,
   * talent « Interruption à confirmer », séquence terminée, carte « Prioriser
   * ma semaine »), mais une salle ouverte après ce déploiement n'en montrait
   * aucune : elle était COMPLÈTE (six dossiers, toutes ses tables) donc ni
   * `resetWorkspaceUnlessFresh` ni `repairIfIncomplete` ne la touchaient — ni
   * l'un ni l'autre ne savaient qu'« complète » pouvait vouloir dire « semée
   * par une version antérieure ».
   */
  describe('#4291 J — chaque variante de salle a SON empreinte', () => {
    const forfaitStamp = demoSeedFingerprintFor('forfait_conseil')

    it('une salle forfait stampée à l’empreinte forfait est à jour', async () => {
      const { dataSource } = fakeDataSource({ ...full(new Date()), slotIndex: 1001, stamp: forfaitStamp })
      expect(await (await build(dataSource)).isRoomReady('ws-f1', 'demo-user')).toBe(true)
    })

    it('une salle forfait semée comme une salle staffing est PÉRIMÉE (re-semée en forfait)', async () => {
      const { dataSource } = fakeDataSource({ ...full(new Date()), slotIndex: 1001, stamp: DEMO_SEED_FINGERPRINT })
      expect(await (await build(dataSource)).isRoomReady('ws-f1', 'demo-user')).toBe(false)
    })

    it('une salle staffing stampée forfait est périmée ; stampée staffing, à jour (rien ne change pour elle)', async () => {
      const wrong = fakeDataSource({ ...full(new Date()), slotIndex: 2, stamp: forfaitStamp })
      expect(await (await build(wrong.dataSource)).isRoomReady('ws-2', 'demo-user')).toBe(false)
      const right = fakeDataSource({ ...full(new Date()), slotIndex: 2 })
      expect(await (await build(right.dataSource)).isRoomReady('ws-2', 'demo-user')).toBe(true)
    })
  })

  describe('#3135 — une empreinte de semis périmée purge une salle par ailleurs COMPLÈTE', () => {
    it('repairIfIncomplete re-sème une salle complète et fraîche dont l’empreinte est périmée', async () => {
      const { dataSource, deleted } = fakeDataSource({ ...full(new Date()), staleSeedFingerprint: true })
      const service = await build(dataSource)

      const outcome = await service.repairIfIncomplete('ws-demo', 'demo-user')

      expect(outcome.skipped).toBeUndefined()
      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalledWith('ws-demo', 'demo-user')
    })

    it('resetWorkspaceUnlessFresh ignore la fenêtre « fraîche » quand l’empreinte est périmée', async () => {
      // La fenêtre protège une salle qui vient d'être remise à neuf
      // CORRECTEMENT — jamais une salle qui vient d'être reposée telle
      // quelle par l'ANCIEN process. La respecter ici referait le même bug
      // une couche plus bas.
      const { dataSource, deleted } = fakeDataSource({ ...full(new Date()), staleSeedFingerprint: true })
      const service = await build(dataSource)

      const outcome = await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user')

      expect(outcome.skipped).toBeUndefined()
      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalled()
    })

    it('une salle À JOUR reste intacte — pas de double purge (repairIfIncomplete sait dire NON)', async () => {
      const { dataSource, deleted } = fakeDataSource(full(new Date()))
      const service = await build(dataSource)

      const outcome = await service.repairIfIncomplete('ws-demo', 'demo-user')

      expect(outcome.skipped).toBe(true)
      expect(deleted).toHaveLength(0)
      expect(seedWorkspace).not.toHaveBeenCalled()
    })

    it('une salle À JOUR reste intacte — pas de double purge (resetWorkspaceUnlessFresh sait dire NON)', async () => {
      const { dataSource, deleted } = fakeDataSource(full(new Date()))
      const service = await build(dataSource)

      const outcome = await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user')

      expect(outcome.skipped).toBe(true)
      expect(deleted).toHaveLength(0)
      expect(seedWorkspace).not.toHaveBeenCalled()
    })
  })

  /**
   * LE DÉFAUT DU 28/08, MESURÉ EN PRODUCTION SUR LE LIEN PUBLIC.
   *
   * Une salle portait ses six dossiers, ses vingt-cinq contacts et ses
   * soixante-quatorze projets — mais **zéro consultant** (le jeu en compte
   * dix-sept) et **une** mission sur cinq. L'écran Vivier affichait « Ton vivier
   * est vide » à un prospect, et une bulle de Laura le lui confirmait.
   *
   * Elle ne s'est jamais réparée parce que la complétude se jugeait sur UNE
   * SEULE TABLE : `accounts`. Une salle qui a ses comptes était déclarée
   * complète, même vidée de tout le reste. Et comme le bail se renouvelle à
   * chaque appel, elle ne redevenait jamais libre : personne ne la réparait,
   * jamais.
   *
   * Aucune garde ne pouvait le voir — `demo-coverage.spec.ts` vérifie le JEU DE
   * DONNÉES, pas la SALLE. C'est la version « complétude » du défaut connu du
   * dépôt : une garde qui ne lit qu'un tiers de son corpus passe au vert.
   */
  describe('la complétude d’une salle porte sur TOUTES les tables du semis', () => {
    it('répare une salle qui a ses dossiers mais dont le VIVIER est vide', async () => {
      const { dataSource, deleted } = fakeDataSource({
        dossiers: DEMO_DOSSIERS.length,
        newest: new Date(),
        empty: ['consultants'],
      })
      const service = await build(dataSource)

      const outcome = await service.repairIfIncomplete('ws-demo', 'demo-user')

      expect(outcome.skipped).toBeUndefined()
      expect(outcome.missing).toEqual(['consultants'])
      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalledWith('ws-demo', 'demo-user')
    })

    it('re-semé aussi la salle LIBRE que le critère « fraîche » laissait passer', async () => {
      // `resetWorkspaceUnlessFresh` portait le MÊME angle mort : sa fenêtre de
      // 90 s sautait la purge d'une salle « complète et récente », complétude
      // lue sur les seuls dossiers. Un semis interrompu dix secondes plus tôt
      // était donc loué tel quel au visiteur suivant — qui le gardait ensuite
      // pour toujours, son bail se renouvelant.
      const { dataSource, deleted } = fakeDataSource({
        dossiers: DEMO_DOSSIERS.length,
        newest: new Date(),
        empty: ['missions'],
      })
      const service = await build(dataSource)

      const outcome = await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user')

      expect(outcome.skipped).toBeUndefined()
      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalled()
    })

    it('NOMME chaque table manquante — un « incomplète » sans nom ne se diagnostique pas', async () => {
      const { dataSource } = fakeDataSource({
        dossiers: DEMO_DOSSIERS.length,
        newest: new Date(),
        empty: ['consultants', 'missions', 'submissions'],
      })
      const service = await build(dataSource)

      const outcome = await service.repairIfIncomplete('ws-demo', 'demo-user')

      // Trié : l'ordre est celui des sondes, qui suit la couverture — le
      // vérifier ferait échouer ce test le jour où quelqu'un range la liste.
      expect([...(outcome.missing ?? [])].sort()).toEqual(['consultants', 'missions', 'submissions'])
    })

    it('compte encore les DOSSIERS — six tables pleines et un seul dossier reste une salle tronquée', async () => {
      // La sonde par table dit « au moins une ligne » ; elle ne dirait rien
      // d'une salle qui n'aurait qu'un dossier sur six, avec ses contacts.
      // L'ancre garde donc son comptage.
      const { dataSource } = fakeDataSource({ dossiers: 1, newest: new Date() })
      const service = await build(dataSource)

      const outcome = await service.repairIfIncomplete('ws-demo', 'demo-user')

      expect(outcome.missing).toEqual(['accounts'])
    })

    /**
     * #2989 (26/09/2026, recette écran) — même angle mort que le vivier
     * ci-dessus, mais sur une COLONNE plutôt qu'une table : une salle semée
     * avant #3077 porte déjà `accounts` et `business_units` (posés par un
     * autre semis), donc les deux sondes de table restent vertes — et
     * `business_unit_id` reste NULL pour toujours sur son client d'exemple, le
     * filtre BU de `/missions/planification` n'ayant plus jamais l'occasion
     * d'être réparé.
     */
    it('répare une salle COMPLÈTE par table mais dont le client d’exemple n’a pas de BU (#2989)', async () => {
      const { dataSource, deleted } = fakeDataSource({
        dossiers: DEMO_DOSSIERS.length,
        newest: new Date(),
        deliveryClientBuMissing: true,
      })
      const service = await build(dataSource)

      const outcome = await service.repairIfIncomplete('ws-demo', 'demo-user')

      expect(outcome.missing).toEqual(['accounts.business_unit_id'])
      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalledWith('ws-demo', 'demo-user')
    })

    it('ne coûte QU’UNE requête — elle tourne à chaque prise de bail', async () => {
      // Le chemin le plus sollicité de la démonstration : une sonde par table
      // en autant d'allers-retours coûterait vingt-sept fois la latence réseau.
      // Tout tient dans une seule requête, dont le service ne lit qu'une ligne.
      const { dataSource } = fakeDataSource(full(new Date()))
      const service = await build(dataSource)

      await service.repairIfIncomplete('ws-demo', 'demo-user')

      expect(dataSource.query).toHaveBeenCalledTimes(1)
    })

    /**
     * ⚠️ Le doute profite à la salle.
     *
     * Se tromper en déclarant COMPLÈTE une salle tronquée laisse, au pire, une
     * démonstration pauvre une visite de plus — l'état d'avant ce correctif. Se
     * tromper dans l'autre sens purge une salle pleine sous les yeux de celui
     * qui la présente. Les deux erreurs n'ont pas le même prix, donc la sonde
     * n'est lue « vide » que sur un `false` FRANC.
     */
    it('ne purge pas sur une sonde ILLISIBLE — seul un faux franc vaut « table vide »', async () => {
      const { dataSource, deleted } = fakeDataSource(full(new Date()))
      dataSource.query = jest.fn(async (sql: string) => {
        const [row] = roomRow(sql, full(new Date()))
        // Un pilote qui rendrait `null` là où on attend un booléen.
        return [Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [key, key === 'p3' ? null : value]))]
      })
      const service = await build(dataSource)

      const outcome = await service.repairIfIncomplete('ws-demo', 'demo-user')

      expect(outcome.skipped).toBe(true)
      expect(deleted).toHaveLength(0)
    })
  })

  /**
   * LE DÉFAUT DU 28/08 — UNE SALLE SANS IDENTITÉ, SERVIE À UN PROSPECT.
   *
   * Le pied de la barre latérale affichait « [supprimé] [supprimé] » sur le lien
   * public. `[supprimé]` est le marqueur d'anonymisation RGPD
   * (`PrivacyDeletionService`) : un visiteur avait ouvert Réglages ›
   * Confidentialité et supprimé le compte PROPRIÉTAIRE de la salle, qui n'est
   * pas le sien mais celui du pool. La suppression a fait exactement son
   * travail — ce n'est pas elle qu'on corrige.
   *
   * Ce qui manquait, c'est que la salle continuait d'être déclarée COMPLÈTE :
   * `profiles` n'est purgée par aucune des trois listes (c'est l'identité, pas
   * du contenu), donc le critère de complétude ne la regardait pas, et un nom
   * effacé ne revenait jamais. Toutes les tables pleines, aucun nom.
   */
  describe('l’identité du propriétaire fait partie de la complétude d’une salle', () => {
    /** Une salle entière, sauf son propriétaire — anonymisé. */
    function anonymised(): FakeRoom {
      return { ...full(new Date()), ownerAnonymized: true }
    }

    it('répare une salle que le visiteur occupe et dont le PROFIL est anonymisé', async () => {
      const { dataSource, deleted } = fakeDataSource(anonymised())
      const service = await build(dataSource)

      const outcome = await service.repairIfIncomplete('ws-demo', 'demo-user')

      expect(outcome.skipped).toBeUndefined()
      expect(outcome.missing).toContain('profiles')
      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalledWith('ws-demo', 'demo-user')
    })

    it('re-sème aussi la salle LIBRE et récente dont le nom a été effacé', async () => {
      // Sans ça, la fenêtre de 90 s rendrait la salle anonymisée au visiteur
      // suivant telle quelle — le même angle mort que pour les tables vides.
      const { dataSource, deleted } = fakeDataSource(anonymised())
      const service = await build(dataSource)

      const outcome = await service.resetWorkspaceUnlessFresh('ws-demo', 'demo-user')

      expect(outcome.skipped).toBeUndefined()
      expect(deleted.length).toBeGreaterThan(0)
      expect(seedWorkspace).toHaveBeenCalled()
    })

    it('⚠️ le doute profite à la salle — une identité ILLISIBLE ne purge rien', async () => {
      // Même arbitrage que pour les sondes de table : purger une salle pleine
      // sous les yeux de celui qui la présente coûte infiniment plus cher que
      // de la laisser une visite de plus dans l'état d'avant.
      const { dataSource, deleted } = fakeDataSource(full(new Date()))
      dataSource.query = jest.fn(async (sql: string) => {
        const [row] = roomRow(sql, anonymised())
        const alias = /FROM profiles\b[\s\S]*?\)\s+AS\s+"([a-z0-9_]+)"/.exec(sql)?.[1]
        // Un pilote qui rendrait `null` là où on attend un booléen.
        return [{ ...row, ...(alias ? { [alias]: null } : {}) }]
      })
      const service = await build(dataSource)

      const outcome = await service.repairIfIncomplete('ws-demo', 'demo-user')

      expect(outcome.skipped).toBe(true)
      expect(deleted).toHaveLength(0)
    })
  })

  /**
   * GA-54 — une salle servie porte une IDENTITÉ, pas seulement des tables pleines.
   *
   * La garde ne cherche pas un mot dans le fichier : elle lit le SQL que le
   * service a VRAIMENT émis, commentaires retirés, et vérifie qu'il interroge
   * `profiles` POUR LE PROPRIÉTAIRE de la salle — donc avec le second
   * paramètre, celui que `readRoom` reçoit en plus de l'espace.
   */
  describe('GA-54 — le critère de complétude lit l’identité du propriétaire', () => {
    /** Un nom de table cité en commentaire n'est pas une table lue. */
    function withoutSqlComments(sql: string): string {
      return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
    }

    /** Ce SQL lit-il le profil du propriétaire de la salle ? */
    function readsOwnerIdentity(sql: string): boolean {
      const stripped = withoutSqlComments(sql)
      return /\bFROM\s+profiles\b/.test(stripped) && /\buser_id\s*=\s*\$2\b/.test(stripped)
    }

    it('sait dire NON — le critère d’avant, qui ne lisait que des tables, rougit', () => {
      // Le critère EXACT d'avant ce correctif : les tables, et rien d'autre.
      const tablesOnly = [
        'SELECT (SELECT COUNT(*) FROM accounts WHERE workspace_id = $1) AS dossiers,',
        '       EXISTS (SELECT 1 FROM consultants WHERE workspace_id = $1) AS "p0"',
      ].join('\n')
      expect(readsOwnerIdentity(tablesOnly)).toBe(false)

      // Et il ne se laisse pas payer en COMMENTAIRE — la façon dont neuf gardes
      // de ce dépôt sont devenues borgnes.
      const pretending = `-- FROM profiles WHERE user_id = $2 : promis, on regarde l'identité
         /* FROM profiles WHERE user_id = $2 */ ${tablesOnly}`
      expect(readsOwnerIdentity(pretending)).toBe(false)

      // Lire `profiles` sans le RESTREINDRE au propriétaire ne compte pas non
      // plus : la salle lirait le nom de n'importe qui.
      expect(readsOwnerIdentity('SELECT 1 FROM profiles WHERE user_id = $1')).toBe(false)
    })

    it('lit un corpus NON VIDE — sinon la garde compare deux fois rien', async () => {
      const { dataSource, readSql, readParams } = fakeDataSource(full(new Date()))
      await (await build(dataSource)).repairIfIncomplete('ws-demo', 'demo-user')

      expect(readSql).toHaveLength(1)
      expect((readSql[0] as string).length).toBeGreaterThan(200)
      // Le propriétaire voyage bien jusqu'à la requête : sans lui, `$2` serait
      // un paramètre non fourni et Postgres refuserait la lecture entière.
      // #2989 — `$3` (le nom du client d'exemple) voyage de la même façon.
      expect(readParams[0]).toEqual(['ws-demo', 'demo-user', DEMO_DELIVERY_CLIENT.account.company_name])
    })

    it('le SQL réellement émis lit le profil DU propriétaire de la salle', async () => {
      const repair = fakeDataSource(full(new Date()))
      await (await build(repair.dataSource)).repairIfIncomplete('ws-demo', 'demo-user')
      expect(readsOwnerIdentity(repair.readSql[0] as string)).toBe(true)

      // Les deux chemins du pool posent la MÊME question — un réglage vit à un
      // seul endroit, et l'identité n'y fait pas exception.
      const reset = fakeDataSource(full(new Date()))
      await (await build(reset.dataSource)).resetWorkspaceUnlessFresh('ws-demo', 'demo-user')
      expect(reset.readSql[0]).toBe(repair.readSql[0])
    })
  })

  /**
   * LA GARDE : un critère de complétude ne retombe pas sur une seule table.
   *
   * Elle ne cherche pas un MOT dans le fichier — neuf gardes borgnes en trois
   * jours dans ce dépôt, dont plusieurs qui trouvaient leur preuve dans un
   * commentaire. Elle lit le SQL que le service a VRAIMENT émis pendant l'appel,
   * commentaires retirés, et vérifie qu'il interroge chaque table que
   * `DEMO_SEEDED_TABLES` déclare remplie.
   */
  describe('garde — le critère de complétude interroge toutes les tables seedées', () => {
    /** Les tables du semis, dédoublonnées, telles que la couverture les déclare. */
    const seededTables = [...new Set<string>(DEMO_SEEDED_TABLES)]

    /** Le SQL, commentaires retirés : un nom de table cité en commentaire ne
     *  compte pas — c'est exactement ainsi qu'une garde devient borgne. */
    function withoutSqlComments(sql: string): string {
      return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
    }

    /** Les tables déclarées seedées que ce SQL n'interroge PAS. */
    function tablesNotQueriedBy(sql: string): string[] {
      const stripped = withoutSqlComments(sql)
      // `\b` après le nom : sans lui, `FROM submission_feedback` compterait
      // pour `submissions`… et l'inverse (`FROM submissions` pour
      // `submission_feedback`) ne se voit qu'avec le nom EXACT.
      return seededTables.filter(table => !new RegExp(`\\bFROM\\s+${table}\\b`).test(stripped))
    }

    it('lit un corpus NON VIDE — sans ça, la garde compare deux fois rien', () => {
      // Bornes basses volontairement en dessous du réel : elles disent « il y a
      // un corpus », pas « il en a exactement 27 ».
      expect(seededTables.length).toBeGreaterThanOrEqual(20)
      expect(demoCompletenessProbes().length).toBeGreaterThanOrEqual(20)
      // Et le jeu de données derrière : une salle complète, ce sont des ENTITÉS.
      expect(DEMO_DOSSIERS.length).toBeGreaterThanOrEqual(3)
      expect(DEMO_CONSULTANTS.length).toBeGreaterThanOrEqual(5)
    })

    it('sait dire NON — un critère qui ne compte que les comptes rougit, en nommant l’oubli', () => {
      // Le critère EXACT d'avant le 28/08, tel qu'il était écrit.
      const oneTable = 'SELECT COUNT(*) AS total FROM accounts WHERE workspace_id = $1'
      const forgotten = tablesNotQueriedBy(oneTable)

      expect(forgotten).toContain('consultants')
      expect(forgotten).toContain('missions')
      expect(forgotten.length).toBeGreaterThanOrEqual(seededTables.length - 1)
    })

    it('ne se laisse pas payer en COMMENTAIRES — un nom cité n’est pas une table lue', () => {
      const pretending = `-- consultants, missions, contacts : tout est là, promis
         /* consultants */ SELECT COUNT(*) AS total FROM accounts WHERE workspace_id = $1`

      expect(tablesNotQueriedBy(pretending)).toContain('consultants')
    })

    it('le SQL réellement émis interroge CHAQUE table que le semis remplit', async () => {
      const { dataSource, readSql } = fakeDataSource(full(new Date()))
      const service = await build(dataSource)

      await service.repairIfIncomplete('ws-demo', 'demo-user')

      // Une seule lecture, et c'est elle qui décide.
      expect(readSql).toHaveLength(1)
      expect(tablesNotQueriedBy(readSql[0] as string)).toEqual([])
    })

    it('les deux chemins du pool partagent le MÊME critère — sinon l’un des deux dérive', async () => {
      // `repairIfIncomplete` (salle reprise) et `resetWorkspaceUnlessFresh`
      // (salle libre) portaient le même angle mort. Ils doivent maintenant
      // poser exactement la même question : un réglage vit à un seul endroit.
      const repair = fakeDataSource(full(new Date()))
      await (await build(repair.dataSource)).repairIfIncomplete('ws-demo', 'demo-user')

      const reset = fakeDataSource(full(new Date()))
      await (await build(reset.dataSource)).resetWorkspaceUnlessFresh('ws-demo', 'demo-user')

      expect(reset.readSql[0]).toBe(repair.readSql[0])
    })

    it('la sonde de chaque table la restreint à UNE salle — sinon elle lit celle du voisin', () => {
      // Une sonde sans `workspace_id` NI `user_id` répondrait « pleine » dès
      // qu'un AUTRE espace (ou un autre utilisateur) a des lignes : la salle
      // tronquée passerait pour complète. #2151.70 — une table scopée
      // `user_id` (`notifications`, `user_favorites`,
      // `profile_context_revisions`) se restreint par son PROPRIÉTAIRE
      // (`$2`) : la salle n'a qu'un seul occupant, donc c'est tout aussi
      // exclusif que `workspace_id = $1`.
      for (const probe of demoCompletenessProbes()) {
        const scoped = probe.where.includes('workspace_id = $1') || probe.where.includes('user_id = $2')
        expect(scoped).toBe(true)
        expect(probe.table).toMatch(/^[a-z][a-z0-9_]*$/)
      }
    })

    it('sait dire NON — une sonde ni `workspace_id` ni `user_id` serait signalée', () => {
      // La preuve que le prédicat MORD, isolé de la fonction réelle : une
      // sonde qui ne restreindrait à rien (le défaut qu'il empêche) échoue.
      const unscoped = { table: 'orphan_table', where: 'id IS NOT NULL' }
      const scoped = unscoped.where.includes('workspace_id = $1') || unscoped.where.includes('user_id = $2')
      expect(scoped).toBe(false)
    })
  })

  it('propagates a purge failure instead of silently re-seeding a half-wiped demo', async () => {
    const service = await build({
      transaction: jest.fn(async () => {
        throw new Error('relation "opportunities" does not exist')
      }),
      createQueryRunner: jest.fn(() => lockRunner()),
    })

    await expect(service.resetWorkspace('ws-demo', 'demo-user')).rejects.toThrow(/does not exist/)
    expect(seedWorkspace).not.toHaveBeenCalled()
  })
})

describe('ordre de purge — submissions avant project_needs (reset démo du 29/09)', () => {
  it('efface les candidatures AVANT les besoins : need_id SET NULL créerait des doublons sur submissions_unique', () => {
    const order = DEMO_PURGE_TABLES as readonly string[]
    expect(order.indexOf('submissions')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('project_needs')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('submissions')).toBeLessThan(order.indexOf('project_needs'))
  })
})

// #3747 — re-semis en « read-only transaction » et salle servie à moitié semée.
describe('#3747 — un re-semis ne détruit pas une salle qu’il ne pourra pas réécrire', () => {
  beforeEach(() => jest.clearAllMocks())

  it('connexion en lecture seule : ERREUR NOMMÉE avant toute purge, la salle reste intacte', async () => {
    const { dataSource, deleted, events } = fakeDataSource()
    const baseQuery = dataSource.query
    dataSource.query = jest.fn(async (sql: string, params?: unknown[]) =>
      /transaction_read_only/.test(sql) ? [{ read_only: 'on', in_recovery: false }] : baseQuery(sql, params),
    )
    const service = await build(dataSource)

    await expect(service.resetWorkspace('ws-demo', 'demo-user')).rejects.toThrow(/read-only/i)
    expect(deleted).toHaveLength(0)
    expect(events.filter(e => e.startsWith('sql:'))).toHaveLength(0)
    expect(seedWorkspace).not.toHaveBeenCalled()
  })

  it('réplica en recovery : même refus, avant toute purge', async () => {
    const { dataSource, deleted } = fakeDataSource()
    const baseQuery = dataSource.query
    dataSource.query = jest.fn(async (sql: string, params?: unknown[]) =>
      /transaction_read_only/.test(sql) ? [{ read_only: 'off', in_recovery: true }] : baseQuery(sql, params),
    )
    await expect((await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')).rejects.toThrow(/read-only/i)
    expect(deleted).toHaveLength(0)
  })

  it('connexion en écriture : la purge et le semis ont lieu (la garde sait dire OUI)', async () => {
    const { dataSource, deleted } = fakeDataSource()
    const outcome = await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')
    expect(deleted.length).toBeGreaterThan(0)
    expect(outcome.seeded).toBe(true)
  })

  it('la purge EFFACE l’empreinte du semis avant de supprimer quoi que ce soit : une salle en cours de semis n’est jamais « à jour »', async () => {
    const { dataSource, events } = fakeDataSource()
    await (await build(dataSource)).resetWorkspace('ws-demo', 'demo-user')

    const clear = events.findIndex(e => /UPDATE workspaces SET demo_seed_fingerprint = NULL/.test(e))
    expect(clear).toBeGreaterThanOrEqual(0)
    expect(clear).toBeLessThan(events.findIndex(e => e.startsWith('delete:')))
  })
})
