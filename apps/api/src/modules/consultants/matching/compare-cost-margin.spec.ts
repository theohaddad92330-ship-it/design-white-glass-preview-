import { MatchingService } from './matching.service'

/**
 * #2176.55 — coût et marge dans la comparaison, SELON LES DROITS.
 *
 * Le coût (coût chargé d'un salarié, TJM d'achat d'un freelance) et la marge
 * qui en découle ne voyagent QUE vers qui a `finance:read` : sans le droit, la
 * clé n'existe pas dans la réponse — ni zéro, ni `null` qui laisserait
 * deviner qu'une valeur existe.
 */
describe('MatchingService — coût/marge des identités selon finance:read (#2176.55)', () => {
  const needRow = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Développeur Java',
    skills: [{ term: 'Java', required: true, level: null }],
    seniority: 'senior',
    start_on: null,
    target_tjm_cents: '62000',
    location: 'Paris',
    contract_kind: 'regie',
    languages: [],
    clearances: [],
    stack: [],
    status: 'to_match',
    account_id: null,
    account_name: 'ACME',
    account_sector: 'Banque',
    project_sectors: null,
  }
  const salaried = {
    id: '33333333-3333-4333-8333-333333333333',
    full_name: 'Camille Fournier',
    title: 'Développeuse Java',
    seniority: 'senior',
    availability: 'immediate',
    available_from: null,
    availability_checked_at: null,
    contract_type: 'cdi',
    engagement_kind: 'salarie',
    tjm: 620,
    cost_rate_cents: '41000',
    purchase_tjm_cents: '99999',
    sectors: ['Banque'],
    zones: ['IDF'],
    location: 'Paris',
  }
  const freelance = {
    ...salaried,
    id: '44444444-4444-4444-8444-444444444444',
    full_name: 'Yanis Morel',
    contract_type: 'freelance',
    engagement_kind: 'freelance',
    tjm: 650,
    cost_rate_cents: null,
    purchase_tjm_cents: '52000',
  }
  const unknownCost = {
    ...salaried,
    id: '55555555-5555-4555-8555-555555555555',
    full_name: 'Inès Garnier',
    cost_rate_cents: null,
  }
  const rows = [salaried, freelance, unknownCost]

  const seenSql: string[] = []
  function service() {
    const query = jest.fn(async (sql: string) => {
      seenSql.push(sql)
      if (sql.includes('FROM project_needs n')) return [needRow]
      if (sql.includes('FROM consultants c')) return rows
      return []
    })
    const runs = { manager: { query }, save: jest.fn(), create: (x: unknown) => x }
    const entries = { save: jest.fn(), create: (x: unknown) => x }
    const weightVersions = {
      createQueryBuilder: () => {
        throw new Error('aucune pondération dans ce test')
      },
    }
    return new MatchingService(
      runs as never,
      entries as never,
      weightVersions as never,
      { manager: { query } } as never,
    )
  }
  const NOW = new Date('2026-09-18T09:00:00.000Z')

  it('AVEC finance:read — coût selon la nature (salarié : coût chargé, freelance : achat) et marge sur le TJM', async () => {
    const run = await service().matchNeed(needRow.id, null, 'user-1', { canReadFinance: true, now: NOW })
    const byId = new Map(run!.identities.map(identity => [identity.consultantId, identity]))
    expect(byId.get(salaried.id)?.finance).toEqual({ costCents: 41000, marginCents: 21000 })
    expect(byId.get(freelance.id)?.finance).toEqual({ costCents: 52000, marginCents: 13000 })
    // Coût inconnu : la marge n'est pas inventée.
    expect(byId.get(unknownCost.id)?.finance).toEqual({ costCents: null, marginCents: null })
  })

  it('SANS finance:read — `finance` vaut null (clé présente), et le coût n’est même pas lu en base', async () => {
    seenSql.length = 0
    const run = await service().matchNeed(needRow.id, null, 'user-1', { canReadFinance: false, now: NOW })
    for (const identity of run!.identities) expect(identity.finance).toBeNull()
    const identitySql = seenSql.filter(sql => sql.includes('c.full_name'))
    expect(identitySql.length).toBeGreaterThan(0)
    for (const sql of identitySql) {
      expect(sql).not.toContain('cost_rate_cents')
      expect(sql).not.toContain('purchase_tjm_cents')
    }
  })
})
