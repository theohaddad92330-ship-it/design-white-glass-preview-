import { OpenNeedsService } from './open-needs.service'

/**
 * #2558.1 — UN BESOIN EXISTE SANS PROJET : il reste JOIGNABLE.
 *
 * Le test central de ce lot n'est pas « la colonne existe » — c'est qu'un
 * besoin sans projet ne DISPARAÎT de nulle part. Le board « Besoins ouverts »
 * est la première lecture concernée : elle joignait `opportunities` en INNER
 * JOIN pour aller chercher le compte, et un `project_id` nul aurait fait
 * s'évanouir la ligne sans qu'aucun test ne le voie — le genre de défaut
 * invisible en CI, visible en réunion.
 *
 * Deux moitiés d'égale valeur : SANS projet la ligne est là, AVEC projet elle
 * est exactement celle d'avant.
 */
describe('OpenNeedsService — un besoin sans projet reste sur le board (#2558.1)', () => {
  const ACCOUNT = '33333333-3333-4333-8333-333333333333'
  const PROJECT = '22222222-2222-4222-8222-222222222222'

  const build = (rows: Record<string, unknown>[] = []) => {
    const calls: { method: string; args: unknown[] }[] = []
    const qb: Record<string, unknown> = {}
    const chain = (...names: string[]) => {
      for (const name of names) {
        qb[name] = jest.fn((...args: unknown[]) => {
          calls.push({ method: name, args })
          return qb
        })
      }
    }
    chain('innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'orderBy', 'addOrderBy', 'offset', 'limit', 'clone')
    qb['getCount'] = jest.fn().mockResolvedValue(rows.length)
    qb['getRawMany'] = jest.fn().mockResolvedValue(rows)
    // #2035.11 — vide = personne à charge, `sortByCommercialLoad` est un NO-OP.
    const needs = { createQueryBuilder: jest.fn(() => qb), manager: { query: jest.fn().mockResolvedValue([]) } }
    const commercialLoadSettings = { maxOpenNeedsFor: jest.fn().mockResolvedValue(15) }
    return { service: new OpenNeedsService(needs as never, commercialLoadSettings as never), calls }
  }

  const raw = (over: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Tech lead Java',
    urgency: null,
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: '0',
    project_id: PROJECT,
    project_label: 'Migration data lake',
    project_stage: 'qualified',
    account_id: ACCOUNT,
    account_name: 'EDF',
    entity_id: null,
    entity_name: null,
    ...over,
  })

  it('AUCUNE jointure obligatoire vers le projet — un INNER JOIN ferait disparaître la ligne', async () => {
    const { service, calls } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    const joinedTables = calls.filter(c => c.method === 'innerJoin').map(c => String(c.args[0]))
    expect(joinedTables).not.toContain('opportunities')
  })

  it('le COMPTE se rejoint par le besoin, plus par le projet — sinon le compte part avec le projet', async () => {
    const { service, calls } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    const accountJoin = calls.find(c => c.method === 'leftJoin' && c.args[1] === 'account')
    expect(accountJoin).toBeDefined()
    expect(String(accountJoin?.args[2])).toContain('need.account_id')
    expect(String(accountJoin?.args[2])).not.toContain('project.account_id')
  })

  it('filtrer par compte ne passe plus par le projet — un besoin sans projet resterait hors du filtre', async () => {
    const { service, calls } = build([])
    await service.list('w-1', { offset: 0, limit: 50, account_id: ACCOUNT })
    const clauses = calls.filter(c => c.method === 'andWhere').map(c => String(c.args[0]))
    expect(clauses.some(clause => clause.includes('need.account_id = :accountId'))).toBe(true)
    expect(clauses.some(clause => clause.includes('project.account_id = :accountId'))).toBe(false)
  })

  it('sans projet, la ligne SORT quand même, et les trois champs du projet sont nuls ENSEMBLE', async () => {
    const { service } = build([raw({ project_id: null, project_label: null, project_stage: null })])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    const row = result.data[0]
    expect(row).toBeDefined()
    expect(row?.project_id).toBeNull()
    // ⚠️ Jamais `''` : une étiquette vide se lit comme un projet sans nom, pas
    // comme une absence de projet (GA-18 / GA-19).
    expect(row?.project_label).toBeNull()
    expect(row?.project_stage).toBeNull()
    // …et le besoin reste JOIGNABLE : son compte est là.
    expect(row?.account_id).toBe(ACCOUNT)
  })

  it('AVEC projet, la ligne est exactement celle d’avant — la non-régression vaut autant', async () => {
    const { service } = build([raw()])
    const result = await service.list('w-1', { offset: 0, limit: 50 })
    const row = result.data[0]
    expect(row?.project_id).toBe(PROJECT)
    expect(row?.project_label).toBe('Migration data lake')
    expect(row?.project_stage).toBe('qualified')
    expect(row?.account_id).toBe(ACCOUNT)
  })

  it('le compte vient de la colonne du BESOIN — le sélecteur le nomme, il ne le déduit pas', async () => {
    const { service, calls } = build([])
    await service.list('w-1', { offset: 0, limit: 50 })
    const selected = calls.filter(c => c.method === 'select').flatMap(c => (c.args[0] as string[]) ?? [])
    expect(selected).toContain('need.account_id AS account_id')
  })
})
