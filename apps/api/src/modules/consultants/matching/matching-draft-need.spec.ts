import { MatchingService } from './matching.service'

/**
 * #AM.59 (#4059) — comparer des profils à un besoin COLLÉ, SANS créer le besoin dans le pipe : le calcul se fait en
 * mémoire sur le texte du besoin, rien n'est écrit (ni besoin, ni run, ni lignes de run). « Créer le besoin » reste
 * un geste séparé.
 */
describe('MatchingService.matchDraftNeed — #AM.59', () => {
  const consultantRow = {
    id: '33333333-3333-4333-8333-333333333333',
    full_name: 'Camille Fournier',
    title: 'Développeuse Java',
    seniority: 'senior',
    availability: 'immediate',
    available_from: null,
    availability_checked_at: null,
    contract_type: 'cdi',
    tjm: 620,
    sectors: ['Banque'],
    zones: ['IDF'],
    mobility_zones: null,
    remote_preference: null,
    refused_sectors: null,
    refused_technologies: null,
    references: null,
    languages: [{ code: 'fr', level: 'natif' }],
    clearances: null,
    consent_given_at: null,
    consent_expires_at: null,
    consent_basis: null,
  }
  const writes: string[] = []
  const saved: unknown[] = []

  function service() {
    const query = jest.fn(async (sql: string) => {
      if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) writes.push(sql)
      if (sql.includes('FROM consultants c')) return [consultantRow]
      if (sql.includes('FROM consultant_skills')) {
        return [{ consultant_id: consultantRow.id, skill: 'java', raw_label: 'Java', level: 'confirme', source: 'cv' }]
      }
      return []
    })
    const runs = {
      manager: { query },
      save: jest.fn(async (row: unknown) => void saved.push(row)),
      create: (x: unknown) => x,
    }
    const entries = { save: jest.fn(async (rows: unknown[]) => void saved.push(...rows)), create: (x: unknown) => x }
    const weightVersions = {
      createQueryBuilder: () => {
        throw new Error('pas de pondération dans ce test')
      },
    }
    return new MatchingService(
      runs as never,
      entries as never,
      weightVersions as never,
      { manager: { query } } as never,
    )
  }

  const DRAFT = { role: 'Développeur Java senior', skills: [{ term: 'Java', required: true }], location: 'Paris' }
  const NOW = new Date('2026-10-23T09:00:00.000Z')

  it('classe le vivier contre le besoin du texte, sans aucune écriture', async () => {
    writes.length = 0
    saved.length = 0
    const run = await service().matchDraftNeed(DRAFT, null, 'user-1', { canReadFinance: false, now: NOW })
    expect(run.need.role).toBe('Développeur Java senior')
    expect(run.need.needId).toBeNull() // le besoin n'existe pas dans le pipe
    expect(run.evaluatedCount).toBe(1)
    expect([...run.recommended, ...run.borderline, ...run.excluded, ...run.notEvaluable].length).toBe(1)
    expect(saved).toEqual([]) // ni run, ni lignes de run
    expect(writes).toEqual([]) // aucune requête d'écriture
  })

  it('NON : une exigence que le texte ne porte pas n’est pas inventée (aucun TJM, aucune date)', async () => {
    const run = await service().matchDraftNeed(DRAFT, null, 'user-1', { canReadFinance: false, now: NOW })
    expect(run.need.targetRateCents).toBeNull()
    expect(run.need.startOn).toBeNull()
    expect(run.need.contractKind).toBeNull()
  })
})
