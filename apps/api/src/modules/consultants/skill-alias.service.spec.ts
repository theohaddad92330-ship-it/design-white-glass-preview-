import type { Repository } from 'typeorm'
import type { SkillAliasProposalEntity } from '../../database/entities/skill-alias-proposal.entity'
import { SkillAliasService } from './skill-alias.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

function makeService(overrides: { rows?: unknown[]; found?: unknown } = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      return []
    }),
  }
  const proposals = {
    manager,
    // Le mock RESPECTE le filtre de statut, comme la vraie base : sans ça, le
    // test « rien n'est appliqué avant décision » passerait au vert sur un
    // service qui applique tout.
    find: jest.fn(async (options?: { where?: { status?: string } }) => {
      const rows = (overrides.rows ?? []) as { status?: string }[]
      const wanted = options?.where?.status
      return wanted ? rows.filter(row => row.status === wanted) : rows
    }),
    // #2671 — le mock HONORE son `where`, comme la vraie base. Un `findOne` qui
    // rend sa ligne quelle que soit la requête rendrait vert un service dont la
    // borne d'espace a disparu du SQL : le refus inter-espaces doit se prouver
    // sur la REQUÊTE, pas sur un filtre posé après la lecture.
    findOne: jest.fn(async (options?: { where?: Record<string, unknown> }) => {
      if (!('found' in overrides)) return null
      const found = overrides.found as Record<string, unknown> | null
      if (!found) return null
      const where = options?.where ?? {}
      return Object.entries(where).every(([key, value]) => found[key] === value) ? found : null
    }),
    save: jest.fn(async (row: Record<string, unknown>) => ({ ...row, created_at: new Date() })),
  } as unknown as Repository<SkillAliasProposalEntity>
  return { service: new SkillAliasService(proposals), queries, proposals }
}

/**
 * Les alias de compétences (PDF 3 §5.3, BEL-ATS-204).
 *
 * Ce que ces tests protègent : une correction crée une PROPOSITION, jamais un
 * alias. Appliquer seul rapprocherait deux compétences que personne n'a
 * validées, et le matching remonterait des profils sur un mot qu'ils n'ont
 * jamais écrit.
 */
describe('SkillAliasService.observe', () => {
  it('note un terme INCONNU du référentiel', async () => {
    const { service, queries } = makeService()
    await service.observe(WORKSPACE, 'ReactJS 18', USER)
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO skill_alias_proposals'))
    expect(insert).toBeDefined()
    expect(insert?.params[1]).toBe('reactjs 18')
  })

  it('n’encombre PAS la file avec un terme déjà canonique', async () => {
    // « kubernetes » n'a rien à apprendre à personne.
    const { service, queries } = makeService()
    await service.observe(WORKSPACE, 'kubernetes', USER)
    expect(queries).toEqual([])
  })

  it('INCRÉMENTE au lieu d’empiler des doublons', async () => {
    const { service, queries } = makeService()
    await service.observe(WORKSPACE, 'ReactJS 18', USER)
    expect(queries[0]?.sql).toContain('occurrences = skill_alias_proposals.occurrences + 1')
  })

  it('ne fait RIEN sans espace — et ne lève pas', async () => {
    const { service, queries } = makeService()
    await expect(service.observe(null, 'ReactJS', USER)).resolves.toBeUndefined()
    expect(queries).toEqual([])
  })

  it('n’interrompt jamais la saisie quand l’écriture échoue', async () => {
    // Une file d'enrichissement qui ferait échouer une saisie de compétence
    // serait pire que pas de file.
    const { service, proposals } = makeService()
    ;(proposals.manager.query as jest.Mock).mockRejectedValueOnce(new Error('base indisponible'))
    await expect(service.observe(WORKSPACE, 'ReactJS 18', USER)).resolves.toBeUndefined()
  })
})

describe('SkillAliasService.decide', () => {
  const row = {
    id: 'p1',
    workspace_id: WORKSPACE,
    raw_term: 'reactjs',
    canonical_term: null,
    status: 'pending',
    occurrences: 3,
  }

  it('n’applique RIEN tant qu’un humain n’a pas tranché', async () => {
    // La fréquence ORDONNE la file, elle ne décide pas.
    const { service } = makeService({ rows: [{ ...row, status: 'pending', canonical_term: 'react' }] })
    expect(await service.approvedAliases(WORKSPACE)).toEqual(new Map())
  })

  it('rend les alias APPROUVÉS, et eux seuls', async () => {
    const { service } = makeService({ rows: [{ ...row, status: 'approved', canonical_term: 'react' }] })
    expect(await service.approvedAliases(WORKSPACE)).toEqual(new Map([['reactjs', 'react']]))
  })

  it('permet de corriger la cible au moment de trancher', async () => {
    // C'est souvent là que la bonne cible apparaît, quand quelqu'un qui connaît
    // le métier regarde la liste.
    const { service } = makeService({ found: { ...row } })
    const decided = await service.decide('p1', WORKSPACE, USER, 'approved', 'React')
    expect(decided?.canonicalTerm).toBe('react')
    expect(decided?.status).toBe('approved')
  })

  it('ne tranche pas la proposition d’une autre équipe', async () => {
    const { service } = makeService({ found: { ...row, workspace_id: 'autre' } })
    expect(await service.decide('p1', WORKSPACE, USER, 'approved')).toBeNull()
  })
})
