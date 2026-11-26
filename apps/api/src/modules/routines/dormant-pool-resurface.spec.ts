import { routineKeySchema } from '@bellum/contracts'
import { findRoutine } from './routine-catalog'
import { RoutineExecutors } from './routine-executors'
import { familyOfRoutine } from './routine-role-order'
import { TalentRoutinesService } from './talent-routines.service'

/**
 * #2843 / #2398.2 — la routine RECRUTEUR « vivier dormant » : un candidat dont
 * le dernier contact date de plus de `DORMANT_POOL_DAYS` jours ressurgit. Elle
 * NOTIFIE, elle ne contacte personne (Laura prépare, le recruteur écrit).
 *
 * Trois niveaux, comme `availability-reconfirm.spec.ts` : la LECTURE écarte ce
 * qu'elle doit écarter, l'EXÉCUTEUR atteint la méthode et nomme quelqu'un, et
 * le catalogue la CLASSE (famille `recruiter`).
 */
function executorsWith(read: unknown): RoutineExecutors {
  const talentRoutines = { dormantPool: jest.fn().mockResolvedValue(read) } as unknown as TalentRoutinesService
  return new RoutineExecutors(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    talentRoutines,
    null as never,
    null as never,
  )
}

const NOW = new Date('2026-10-01T09:00:00.000Z')

describe('dormant_pool_resurface — la lecture', () => {
  async function sqlOf(): Promise<{ sql: string; params: unknown[] }> {
    const query = jest.fn().mockResolvedValue([])
    await new TalentRoutinesService({ manager: { query } } as never).dormantPool('ws-1')
    const calls = query.mock.calls as [string, unknown[]][]
    expect(calls).toHaveLength(1) // la garde LIT : sans ça, tout passerait sur du vide
    return { sql: calls[0]?.[0] as string, params: calls[0]?.[1] as unknown[] }
  }

  it('ne remonte JAMAIS un candidat jamais contacté, archivé, ni un consultant en poste', async () => {
    const { sql } = await sqlOf()
    expect(sql).toContain('FROM consultants')
    expect(sql).toContain('last_contact_at IS NOT NULL') // null = jamais contacté ≠ dormant
    expect(sql).toContain('archived_at IS NULL')
    expect(sql).toContain("kind = 'candidate'")
    expect(sql).toContain('workspace_id = $1')
  })

  it('le seuil voyage en paramètre, jamais recopié dans le SQL', async () => {
    const { sql, params } = await sqlOf()
    expect(params[0]).toBe('ws-1')
    expect(typeof params[1]).toBe('number')
    expect(sql).not.toMatch(/\b90\b/)
  })

  it('une lecture qui casse se DIT (`measured: false`), jamais un faux zéro', async () => {
    const query = jest.fn().mockRejectedValue(new Error('boom'))
    const out = await new TalentRoutinesService({ manager: { query } } as never).dormantPool('ws-1')
    expect(out).toEqual({ measured: false, rows: [] })
  })
})

describe('dormant_pool_resurface — l’exécuteur', () => {
  it('lecture non mesurée : elle se tait ET le dit', async () => {
    const out = await executorsWith({ measured: false, rows: [] }).run('dormant_pool_resurface', 'u1', NOW, 'w1')
    expect(out.notified).toBe(false)
    expect(out.outcome).toContain('rien n’a été mesuré')
  })

  it('vivier à jour : elle se tait, comme un fait mesuré', async () => {
    const out = await executorsWith({ measured: true, rows: [] }).run('dormant_pool_resurface', 'u1', NOW, 'w1')
    expect(out.notified).toBe(false)
    expect(out.outcome).toBe('Aucun candidat dormant.')
  })

  it('des candidats dormants : elle notifie et NOMME le plus ancien, sans rien envoyer', async () => {
    const out = await executorsWith({
      measured: true,
      rows: [
        { id: 'c1', full_name: 'Camille Durand', days: 140 },
        { id: 'c2', full_name: 'Sam Roche', days: 100 },
      ],
    }).run('dormant_pool_resurface', 'u1', NOW, 'w1')
    expect(out.notified).toBe(true)
    expect(out.notification?.title).toContain('2')
    expect(out.notification?.body).toContain('Camille Durand')
    expect(out.notification?.body).toContain('140')
    expect(out.notification?.link).toBe('/consultants/c1')
  })
})

describe('dormant_pool_resurface — le catalogue', () => {
  it('est une clé du contrat, au catalogue, en famille recruteur, et PRÉPARE sans envoyer', () => {
    expect(routineKeySchema.options).toContain('dormant_pool_resurface')
    const def = findRoutine('dormant_pool_resurface')
    expect(def).toBeDefined()
    expect(def?.automationLevel).toBe('n1_prepare')
    expect(familyOfRoutine('dormant_pool_resurface')).toBe('recruiter')
  })
})
