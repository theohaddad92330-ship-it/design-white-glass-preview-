import type { MatchCandidate, MatchNeed } from '@bellum/contracts'
import { TerritoryPlanFactsService, TERRITORY_PLAN_MAX_TALENTS } from './territory-plan-facts.service'

/**
 * #2337 — les faits du terrain de jeu multi-talents.
 *
 * Chaque test sait dire NON : il échoue si le service écrit, s'il fusionne mal
 * deux besoins d'un même compte, s'il ignore en silence un talent inconnu, s'il
 * oublie le périmètre de BU, ou s'il transforme une note absente en 0.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const USER = '99999999-9999-4999-8999-999999999999'
const GRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const IAM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const GHOST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ACME = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const GLOBEX = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

function need(id: string, skill: string): MatchNeed {
  return {
    needId: id,
    role: `Besoin ${skill}`,
    accountName: null,
    accountSector: null,
    projectSectors: [],
    skills: [{ term: skill, label: skill.toUpperCase(), required: true, level: null }],
    minYears: null,
    seniorityBand: null,
    environment: [],
    languages: [],
    clearances: [],
    location: null,
    remote: null,
    startOn: null,
    targetRateCents: null,
    contractKind: null,
  }
}

function candidate(id: string, skill: string): MatchCandidate {
  return {
    consultantId: id,
    skills: [{ term: skill, label: skill.toUpperCase(), level: 'expert', source: 'mission', proof: 'mission 18 mois' }],
    yearsExperience: 8,
    seniorityBand: 'senior',
    sectors: [],
    environment: [],
    languages: [],
    clearances: [],
    zones: ['IDF'],
    remote: null,
    contractKind: 'employee',
    dailyRateCents: null,
    freeFrom: '2026-09-01',
    derivedAvailability: 'immediate',
    declaredAvailability: 'immediate',
    availabilityCheckedAt: '2026-09-20',
    consentState: 'valid',
    clientHistoryFlag: null,
    clientHistoryReason: null,
    clientHistoryAt: null,
    clientHistoryRecoverable: false,
    onMissionAtClient: false,
    activeSubmissionsElsewhere: 0,
    preferenceWarnings: [],
  }
}

type Row = Record<string, unknown>

function build(options: { needs?: Row[]; submissions?: Row[]; scope?: unknown; known?: string[] } = {}) {
  const known = options.known ?? [GRC, IAM]
  const needs: Record<string, MatchNeed> = { n1: need('n1', 'grc'), n2: need('n2', 'iam'), n3: need('n3', 'grc') }
  const skillOf: Record<string, string> = { [GRC]: 'grc', [IAM]: 'iam' }
  const matching = {
    identitiesFor: jest.fn(async (ids: string[]) => {
      const map = new Map<string, { fullName: string; title: string | null; dailyRateCents: null }>()
      for (const id of ids)
        if (known.includes(id)) map.set(id, { fullName: `Talent ${id.slice(0, 4)}`, title: null, dailyRateCents: null })
      return map
    }),
    weightsFor: jest.fn(async () => ({ weights: undefined, threshold: 60, versionId: null })),
    loadNeed: jest.fn(async (id: string) => needs[id] ?? null),
    loadCandidates: jest.fn(async (_ws: unknown, _u: unknown, _n: MatchNeed, only: string[]) =>
      only.map(id => candidate(id, skillOf[id] ?? 'x')),
    ),
  }
  const businessUnits = { scopeFor: jest.fn(async () => options.scope ?? null) }
  const queries: { sql: string; params: unknown[] }[] = []
  const dataSource = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params })
      if (sql.includes('FROM project_needs n')) return options.needs ?? []
      if (sql.includes('FROM submissions s')) return options.submissions ?? []
      return []
    }),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
  const service = new TerritoryPlanFactsService(matching as any, businessUnits as any, dataSource as any)
  return { service, matching, businessUnits, queries }
}

const NEED_ROWS: Row[] = [
  {
    id: 'n1',
    title: 'Expert GRC',
    location: 'Paris',
    account_id: ACME,
    account_name: 'Acme',
    owner_id: 'o1',
    owner_name: 'Léa Martin',
    contact_id: 'c1',
    fit_score: '18',
    fit_verdict: 'PRUDENT',
  },
  {
    id: 'n2',
    title: 'Ingénieur IAM',
    location: 'Paris',
    account_id: ACME,
    account_name: 'Acme',
    owner_id: 'o2',
    owner_name: 'Paul Roy',
    contact_id: 'c1',
    fit_score: '18',
    fit_verdict: 'PRUDENT',
  },
  {
    id: 'n3',
    title: 'Auditeur GRC',
    location: 'Lyon',
    account_id: GLOBEX,
    account_name: 'Globex',
    owner_id: null,
    owner_name: null,
    contact_id: null,
    fit_score: null,
    fit_verdict: null,
  },
]

describe('TerritoryPlanFactsService (#2337)', () => {
  it('fusionne les besoins d’un même compte et évalue CHAQUE talent sur chacun', async () => {
    const { service } = build({ needs: NEED_ROWS })
    const facts = await service.collect([GRC, IAM], WS, USER)

    expect(facts.accounts.map(account => account.accountName)).toEqual(['Acme', 'Globex'])
    const acme = facts.accounts[0]!
    expect(acme.needs.map(n => n.needId)).toEqual(['n1', 'n2'])
    expect(acme.needs[0]!.evaluations.map(e => e.consultantId)).toEqual([GRC, IAM])
    // Le moteur EXISTANT a tranché : le GRC couvre le besoin GRC, pas l'IAM.
    const onGrcNeed = Object.fromEntries(acme.needs[0]!.evaluations.map(e => [e.consultantId, e.matchedSkills]))
    expect(onGrcNeed[GRC]).toEqual(['GRC'])
    expect(onGrcNeed[IAM]).toEqual([])
    expect(acme.needs[0]!.ownerName).toBe('Léa Martin')
    expect(facts.evaluatedNeeds).toBe(3)
  })

  it('lit la note /25 EXISTANTE, et une note absente reste null — jamais 0', async () => {
    const { service } = build({ needs: NEED_ROWS })
    const facts = await service.collect([GRC], WS, USER)
    expect(facts.accounts[0]!.fitScore25).toBe(18)
    expect(facts.accounts[0]!.fitVerdict).toBe('PRUDENT')
    expect(facts.accounts[1]!.fitScore25).toBeNull()
    expect(facts.accounts[1]!.fitVerdict).toBeNull()
  })

  it('nomme les axes non évaluables du moteur au lieu de les taire', async () => {
    const { service } = build({ needs: NEED_ROWS })
    const facts = await service.collect([GRC], WS, USER)
    const evaluation = facts.accounts[0]!.needs[0]!.evaluations[0]!
    // Le besoin ne dit rien du tarif ni du secteur : ces axes sortent du calcul, nommés.
    expect(evaluation.notEvaluatedAxes).toEqual(expect.arrayContaining(['rate', 'sector']))
  })

  it('nomme un talent absent de l’espace plutôt que de l’ignorer', async () => {
    const { service, queries } = build({ needs: NEED_ROWS })
    const facts = await service.collect([GRC, GHOST], WS, USER)
    expect(facts.unknownTalentIds).toEqual([GHOST])
    expect(facts.talents.map(t => t.consultantId)).toEqual([GRC])

    const none = await build({ needs: NEED_ROWS, known: [] }).service.collect([GHOST], WS, USER)
    expect(none).toEqual({ talents: [], unknownTalentIds: [GHOST], accounts: [], evaluatedNeeds: 0, truncated: false })
    expect(queries.length).toBeGreaterThan(0)
  })

  it(`borne la demande à ${TERRITORY_PLAN_MAX_TALENTS} talents`, async () => {
    const { service, matching } = build({ needs: [] })
    const ids = [GRC, IAM, GHOST, ACME, GLOBEX]
    await service.collect(ids, WS, USER)
    expect(matching.identitiesFor.mock.calls[0]![0]).toHaveLength(TERRITORY_PLAN_MAX_TALENTS)
  })

  it('n’écrit RIEN : aucune requête d’écriture, aucun journal de matching', async () => {
    const { service, queries } = build({ needs: NEED_ROWS })
    await service.collect([GRC, IAM], WS, USER)
    for (const { sql } of queries) expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|UPSERT)\b/i)
  })

  it('borne les besoins au périmètre de BU du demandeur', async () => {
    const scoped = build({ needs: [], scope: { businessUnitIds: ['bu-1'], includeUnassigned: true } })
    await scoped.service.collect([GRC], WS, USER)
    const needsQuery = scoped.queries.find(q => q.sql.includes('FROM project_needs n'))!
    expect(needsQuery.sql).toContain('a.business_unit_id IN (SELECT unnest($3::uuid[]))')
    expect(needsQuery.params).toEqual([WS, USER, ['bu-1']])

    const open = build({ needs: [], scope: null })
    await open.service.collect([GRC], WS, USER)
    const openQuery = open.queries.find(q => q.sql.includes('FROM project_needs n'))!
    expect(openQuery.sql).not.toContain('business_unit_id')
    // Aucun `$3` orphelin : Postgres refuse un paramètre qu'il ne sait pas typer.
    expect(openQuery.params).toEqual([WS, USER])
  })

  it('sans espace (chemin hérité), ne lit QUE les comptes du demandeur', async () => {
    const { service, businessUnits, queries } = build({ needs: [] })
    await service.collect([GRC], null, USER)
    expect(businessUnits.scopeFor).not.toHaveBeenCalled()
    const needsQuery = queries.find(q => q.sql.includes('FROM project_needs n'))!
    expect(needsQuery.sql).toContain('$1::uuid IS NULL AND a.user_id = $2')
  })

  it('rattache « déjà présenté » au compte du positionnement', async () => {
    const { service } = build({ needs: NEED_ROWS, submissions: [{ account_id: ACME, consultant_id: IAM }] })
    const facts = await service.collect([GRC, IAM], WS, USER)
    expect(facts.accounts[0]!.presentedConsultantIds).toEqual([IAM])
    expect(facts.accounts[1]!.presentedConsultantIds).toEqual([])
  })

  it('un talent qu’aucun besoin n’a permis de lire garde son identité, disponibilité INCONNUE', async () => {
    const { service } = build({ needs: [] })
    const facts = await service.collect([GRC], WS, USER)
    expect(facts.talents).toEqual([
      {
        consultantId: GRC,
        fullName: 'Talent aaaa',
        title: null,
        zones: [],
        freeFrom: null,
        declaredAvailability: null,
      },
    ])
  })
})
