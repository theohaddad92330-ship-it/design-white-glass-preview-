import { MatchingService } from './matching.service'

/**
 * Le défaut de production du 01/09/2026 : `POST /needs/:id/match` et
 * `POST /consultants/:id/match-inverse` répondaient **500 sur tous les besoins**
 * dès qu'un besoin portait une date de démarrage.
 *
 * Cause : `pg` rend une colonne `date` sous forme d'objet `Date` en SQL brut,
 * alors que le chargeur l'annonce `string`. `axisAvailability` compose
 * `${need.startOn}T00:00:00Z` → `Invalid Date` → `RangeError: Invalid time
 * value`, remonté en 500 par le filtre global.
 *
 * Le test JOUE le vrai chargeur contre un pilote qui rend des `Date`, comme le
 * fait Postgres. Il sait dire NON : retirer `asDay` de `loadNeed` le fait
 * échouer avec l'erreur exacte de la production.
 */
describe('MatchingService — les colonnes `date` rendues en objets par pg', () => {
  const needRow = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Développeur Java',
    skills: [{ term: 'Java', required: true, level: null }],
    seniority: 'senior',
    // ⚠️ Des objets Date, exactement ce que rend `pg` sur une colonne `date`.
    start_on: new Date(2026, 8, 15),
    target_tjm_cents: '62000',
    location: 'Paris',
    contract_kind: 'regie',
    languages: [{ code: 'fr', level: 'natif' }],
    clearances: [],
    stack: [],
    status: 'to_match',
    account_id: '22222222-2222-4222-8222-222222222222',
    account_name: 'ACME',
    account_sector: 'Banque',
    project_sectors: null,
  }

  const consultantRow = {
    id: '33333333-3333-4333-8333-333333333333',
    full_name: 'Camille Fournier',
    title: 'Développeuse Java',
    seniority: 'senior',
    availability: 'immediate',
    available_from: new Date(2026, 8, 1),
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

  function serviceWithDates() {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM project_needs n')) return [needRow]
      if (sql.includes('FROM consultants c') && sql.includes('c.full_name')) return [consultantRow]
      if (sql.includes('FROM consultants c')) return [consultantRow]
      if (sql.includes('FROM consultant_skills')) {
        return [{ consultant_id: consultantRow.id, skill: 'java', raw_label: 'Java', level: 'confirme', source: 'cv' }]
      }
      if (sql.includes('FROM mission_assignments ma')) return []
      if (sql.includes('FROM mission_assignments')) {
        // Les bornes d'affectation sont elles aussi des colonnes `date`.
        return [
          {
            consultant_id: consultantRow.id,
            load_percent: 100,
            starts_on: new Date(2026, 5, 1),
            ends_on: new Date(2026, 7, 31),
          },
        ]
      }
      return []
    })
    const runs = { manager: { query }, save: jest.fn(async () => undefined), create: (x: unknown) => x }
    const entries = { save: jest.fn(async () => undefined), create: (x: unknown) => x }
    const weightVersions = {
      createQueryBuilder: () => {
        throw new Error('pas de version de pondération dans ce test')
      },
    }
    // #2178.33/.34 — même fallback générique que `query` ci-dessus : aucun
    // feedback dans ce test, `feedbackLearnings` reste `[]`.
    const feedback = { manager: { query } }
    return new MatchingService(runs as never, entries as never, weightVersions as never, feedback as never)
  }

  it('classe sans lever « Invalid time value » quand le besoin a une date de démarrage', async () => {
    const run = await serviceWithDates().matchNeed(needRow.id, null, 'user-1', { canReadFinance: true })
    expect(run).not.toBeNull()
    expect(run?.need.startOn).toBe('2026-09-15')
  })

  it('rend les dates du vivier en `YYYY-MM-DD`, jamais en objets', async () => {
    const service = serviceWithDates()
    const need = await service.loadNeed(needRow.id, null)
    const [candidate] = await service.loadCandidates(null, 'user-1', need!)
    expect(typeof candidate.freeFrom === 'string' || candidate.freeFrom === null).toBe(true)
    expect(candidate.freeFrom).not.toMatch(/GMT/)
  })
})
