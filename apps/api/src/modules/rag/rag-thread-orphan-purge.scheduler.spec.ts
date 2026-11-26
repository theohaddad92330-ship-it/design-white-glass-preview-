import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RagThreadOrphanPurgeScheduler,
  THREAD_ORPHAN_BATCH,
  THREAD_ORPHAN_PURGE_SQL,
  ragThreadOrphanPurgeDisabled,
} from './rag-thread-orphan-purge.scheduler'

/**
 * #1954 — décision de Louis (13/09/2026) : un document « pour cette
 * conversation » dont le fil n'a AUCUN message est purgé après 24 h, chaque
 * nuit, avec un interrupteur ; JAMAIS un document de la base de l'ESN.
 *
 * Ce qui est testé d'abord n'est pas qu'elle efface — c'est ce qu'elle ne peut
 * PAS effacer.
 */

function make(query: jest.Mock) {
  const scheduler = new RagThreadOrphanPurgeScheduler({ manager: { query } } as never)
  const logs: string[] = []
  const errors: string[] = []
  jest.spyOn(scheduler['logger'], 'log').mockImplementation(message => {
    logs.push(String(message))
  })
  jest.spyOn(scheduler['logger'], 'error').mockImplementation(message => {
    errors.push(String(message))
  })
  return { scheduler, logs, errors }
}

const NOW = new Date('2026-09-13T02:00:00.000Z')

describe('la purge nocturne des pièces jointes sans conversation (#1954)', () => {
  afterEach(() => {
    delete process.env['RAG_THREAD_ORPHAN_PURGE_DISABLED']
    jest.restoreAllMocks()
  })

  it('n’envoie AUCUNE requête quand l’interrupteur est posé, et le dit', async () => {
    process.env['RAG_THREAD_ORPHAN_PURGE_DISABLED'] = 'true'
    const query = jest.fn()
    const { scheduler, logs } = make(query)

    await scheduler.sweep()

    expect(ragThreadOrphanPurgeDisabled()).toBe(true)
    expect(query).not.toHaveBeenCalled()
    expect(logs.join(' ')).toContain('coupée')
  })

  it('efface ce qui a PLUS de 24 h, par lot borné et paramétré', async () => {
    const query = jest.fn().mockResolvedValue([[], 0])
    const { scheduler } = make(query)

    await scheduler.purgeOrphans(NOW)

    expect(query).toHaveBeenCalledWith(THREAD_ORPHAN_PURGE_SQL, ['2026-09-12T02:00:00.000Z', THREAD_ORPHAN_BATCH])
  })

  it('compte ce qui est parti — un journal chiffré, jamais un identifiant ni un contenu', async () => {
    const query = jest.fn().mockResolvedValue([[{ id: 'doc-cv-secret' }, { id: 'doc-grille-secret' }], 2])
    const { scheduler, logs } = make(query)

    expect(await scheduler.purgeOrphans(NOW)).toBe(2)
    const journal = logs.join(' ')
    expect(journal).toContain('2 document(s)')
    expect(journal).not.toContain('secret')
  })

  it('écrit même à zéro — un silence ne se lit pas comme une panne', async () => {
    const { scheduler, logs } = make(jest.fn().mockResolvedValue([[], 0]))
    expect(await scheduler.purgeOrphans(NOW)).toBe(0)
    expect(logs.join(' ')).toContain('0 document(s)')
  })

  it('dit qu’un lot plein laisse un reste pour la nuit suivante', async () => {
    const rows = Array.from({ length: THREAD_ORPHAN_BATCH }, (_, index) => ({ id: `d-${index}` }))
    const { scheduler, logs } = make(jest.fn().mockResolvedValue([rows, THREAD_ORPHAN_BATCH]))
    expect(await scheduler.purgeOrphans(NOW)).toBe(THREAD_ORPHAN_BATCH)
    expect(logs.join(' ')).toContain('lot plein')
  })

  it('« non mesuré » n’est pas « 0 » : une réponse illisible rend null', async () => {
    const { scheduler, errors } = make(jest.fn().mockResolvedValue({ affected: 3 }))
    expect(await scheduler.purgeOrphans(NOW)).toBeNull()
    expect(errors.join(' ')).toContain('illisible')
  })

  it('tolérante : une requête qui échoue rend null et ne fait pas tomber le passage', async () => {
    const query = jest.fn().mockRejectedValue(new Error('base muette'))
    const { scheduler, errors } = make(query)
    await expect(scheduler.sweep()).resolves.toBeUndefined()
    expect(query).toHaveBeenCalledTimes(1)
    expect(errors.join(' ')).toContain('en échec')
  })
})

/**
 * Les quatre NON de la décision, tenus DANS la requête. Pas de base en mémoire
 * dans ce dépôt : la garde lit la requête RÉELLE (la constante que la méthode
 * envoie — le test ci-dessus le prouve), et chaque invariant a son témoin qui
 * sait dire NON sur une copie mutilée.
 */
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim()

const INVARIANTS: ReadonlyArray<{ readonly name: string; readonly holds: (sql: string) => boolean }> = [
  {
    name: 'un document de la base de l’ESN n’est JAMAIS touché (portée conversation, dehors ET dedans, sans OR)',
    holds: sql =>
      /^DELETE FROM rag_documents WHERE scope = 'conversation' AND id IN \(/.test(sql) &&
      sql.includes("WHERE d.scope = 'conversation'") &&
      !/\bOR\b/i.test(sql),
  },
  {
    name: 'un fil qui a au moins un message garde ses documents',
    holds: sql => sql.includes('AND NOT EXISTS ( SELECT 1 FROM chat_messages m WHERE'),
  },
  {
    name: 'un autre espace portant la même clé de fil n’influence rien',
    holds: sql =>
      sql.includes('m.workspace_id = d.workspace_id AND m.conversation_id = d.conversation_id') &&
      sql.includes('d.conversation_id IS NOT NULL'),
  },
  {
    name: 'un document de moins de 24 h reste (date paramétrée, jamais concaténée)',
    holds: sql => sql.includes('d.created_at < $1') && !sql.includes('${'),
  },
  {
    name: 'bornée par lot',
    holds: sql => sql.includes('ORDER BY d.created_at LIMIT $2'),
  },
  {
    name: 'jamais une salle de démonstration (convention des balayages, `w.is_demo = false`)',
    holds: sql => sql.includes('JOIN workspaces w ON w.id = d.workspace_id AND w.is_demo = false'),
  },
]

describe('NON — ce que la requête ne peut pas atteindre (#1954)', () => {
  const sql = normalize(THREAD_ORPHAN_PURGE_SQL)

  it('lit une requête RÉELLE — sinon la garde ne garde rien', () => {
    expect(sql.length).toBeGreaterThan(200)
    expect(sql).toContain('RETURNING id')
  })

  for (const invariant of INVARIANTS) {
    it(invariant.name, () => {
      expect(invariant.holds(sql)).toBe(true)
    })
  }

  it('sait dire NON : chaque invariant tombe sur une copie mutilée de la requête', () => {
    const mutations: ReadonlyArray<[string, string, string]> = [
      [INVARIANTS[0]!.name, "WHERE d.scope = 'conversation'", "WHERE d.scope IN ('conversation', 'workspace')"],
      [INVARIANTS[1]!.name, 'AND NOT EXISTS (', 'AND EXISTS ('],
      [INVARIANTS[2]!.name, 'm.workspace_id = d.workspace_id AND ', ''],
      [INVARIANTS[3]!.name, 'd.created_at < $1', 'd.created_at <= now()'],
      [INVARIANTS[4]!.name, 'LIMIT $2', ''],
      [INVARIANTS[5]!.name, ' AND w.is_demo = false', ''],
    ]
    for (const [name, from, to] of mutations) {
      const invariant = INVARIANTS.find(candidate => candidate.name === name)!
      expect(sql).toContain(from)
      expect(`${name} → ${invariant.holds(normalize(sql.replace(from, to)))}`).toBe(`${name} → false`)
    }
  })
})

/**
 * Atteignabilité : les tests ci-dessus appellent la méthode DIRECTEMENT, et
 * resteraient verts si personne ne l'appelait jamais — le défaut n°1 de ce dépôt.
 */
describe('la purge est RÉELLEMENT appelée par un planificateur (#1954)', () => {
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
  const scheduler = strip(readFileSync(join(__dirname, 'rag-thread-orphan-purge.scheduler.ts'), 'utf8'))
  const ragModule = strip(readFileSync(join(__dirname, 'rag.module.ts'), 'utf8'))
  const appModule = strip(readFileSync(join(__dirname, '..', '..', 'app.module.ts'), 'utf8'))

  it('lit trois fichiers non vides', () => {
    expect(scheduler).toContain('export class RagThreadOrphanPurgeScheduler')
    expect(ragModule).toContain('@Module(')
    expect(appModule).toContain('@Module(')
  })

  it('un @Cron nocturne porte la méthode qui appelle la purge', () => {
    const cronAt = scheduler.indexOf('@Cron(')
    expect(cronAt).toBeGreaterThan(-1)
    expect(scheduler.match(/@Cron\(/g)?.length ?? 0).toBe(1)
    const afterCron = scheduler.slice(cronAt)
    const sweepAt = afterCron.indexOf('async sweep(')
    expect(sweepAt).toBeGreaterThan(-1)
    expect(afterCron.slice(0, sweepAt)).not.toContain('async ')
    expect(afterCron.slice(sweepAt)).toContain('this.purgeOrphans(')
    // Tous les jours (jour du mois, mois et jour de semaine en « * »).
    expect(afterCron).toMatch(/^@Cron\('\d{1,2} \d{1,2} \* \* \*'/)
  })

  it('le planificateur est fourni par RagModule, lui-même monté par AppModule', () => {
    const providers = ragModule.slice(
      ragModule.indexOf('providers:'),
      ragModule.indexOf(']', ragModule.indexOf('providers:')),
    )
    expect(providers).toContain('RagThreadOrphanPurgeScheduler')
    expect(appModule).toMatch(/\bRagModule,/)
  })
})
