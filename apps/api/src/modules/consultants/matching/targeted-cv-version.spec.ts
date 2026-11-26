import { MatchingService } from './matching.service'

/**
 * #2176.3 — la SOURCE « versions ciblées » : `cv_versions.need_id` existe
 * déjà (une version de CV se prépare depuis un besoin, #2187.n), mais rien ne
 * la relisait dans le matching. Ce test joue le vrai chargeur contre un
 * pilote qui rend les lignes `cv_versions`, comme `matching-date-columns.spec.ts`
 * le fait pour les colonnes `date`.
 */
describe('MatchingService — source « versions ciblées » (#2176.3)', () => {
  const needRow = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Développeur Java',
    skills: [{ term: 'Java', required: true, level: null }],
    seniority: 'senior',
    start_on: null,
    target_tjm_cents: null,
    location: null,
    contract_kind: null,
    languages: [],
    clearances: [],
    stack: [],
    status: 'to_match',
    account_id: null,
    account_name: null,
    account_sector: null,
    project_sectors: null,
  }

  const consultantRow = {
    id: '33333333-3333-4333-8333-333333333333',
    seniority: 'senior',
    availability: 'immediate',
    available_from: null,
    availability_checked_at: null,
    contract_type: 'cdi',
    tjm: null,
    sectors: [],
    zones: [],
    mobility_zones: null,
    remote_preference: null,
    refused_sectors: null,
    refused_technologies: null,
    references: null,
    languages: [],
    clearances: null,
    consent_given_at: null,
    consent_expires_at: null,
    consent_basis: null,
  }

  function serviceWithCvVersions(cvVersionRows: unknown[]) {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM project_needs n')) return [needRow]
      if (sql.includes('FROM cv_versions')) return cvVersionRows
      if (sql.includes('FROM consultants c')) return [consultantRow]
      return []
    })
    const runs = { manager: { query }, save: jest.fn(async () => undefined), create: (x: unknown) => x }
    const entries = { save: jest.fn(async () => undefined), create: (x: unknown) => x }
    const weightVersions = {
      createQueryBuilder: () => {
        throw new Error('pas de version de pondération dans ce test')
      },
    }
    const feedback = { manager: { query } }
    return new MatchingService(runs as never, entries as never, weightVersions as never, feedback as never)
  }

  it('attache la version ciblée la plus récente au candidat', async () => {
    const service = serviceWithCvVersions([
      {
        consultant_id: consultantRow.id,
        id: '22222222-2222-4222-8222-222222222222',
        generated_at: new Date('2026-09-20T00:00:00.000Z'),
        highlighted_skills: ['Java', 'Kafka'],
      },
    ])
    const need = await service.loadNeed(needRow.id, null)
    const [candidate] = await service.loadCandidates(null, 'user-1', need!)
    expect(candidate.targetedCvVersion).toEqual({
      versionId: '22222222-2222-4222-8222-222222222222',
      generatedAt: '2026-09-20T00:00:00.000Z',
      highlightedSkills: ['Java', 'Kafka'],
    })
  })

  it('rend `null` quand aucune version n’a été préparée pour ce besoin', async () => {
    const service = serviceWithCvVersions([])
    const need = await service.loadNeed(needRow.id, null)
    const [candidate] = await service.loadCandidates(null, 'user-1', need!)
    expect(candidate.targetedCvVersion).toBeNull()
  })
})
