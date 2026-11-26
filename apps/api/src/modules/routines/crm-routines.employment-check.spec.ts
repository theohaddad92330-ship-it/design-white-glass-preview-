import { CrmRoutinesService } from './crm-routines.service'

// #4016.L2 — relecture de l'employeur courant des champions.
describe('CrmRoutinesService — championsDueForEmploymentCheck / recordEmploymentCheck', () => {
  function serviceWith(result: unknown) {
    const query = jest.fn().mockResolvedValue(result)
    const service = new CrmRoutinesService({ manager: { query } } as never)
    return { service, query }
  }

  it('ne lit que les champions/sponsors porteurs d’un identifiant, jamais contrôlés depuis 30 jours, au plus N', async () => {
    const { service, query } = serviceWith([])
    await service.championsDueForEmploymentCheck('ws-1', 7)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/decision_role/)
    expect(sql).toContain("'champion'")
    expect(sql).toContain("'sponsor'")
    // #4016.2c — les non-champions sont relus aussi, mais APRÈS les champions.
    expect(sql).not.toMatch(/AND lower\(coalesce\(c\.decision_role, ''\)\) IN/)
    expect(sql).toContain('AS is_champion')
    expect(sql).toMatch(/ORDER BY\s+\(?\s*CASE/i)
    expect(sql).toContain("raw_data ->> 'apolloId'")
    expect(sql).toContain('employmentCheck')
    expect(sql).toContain('deleted_at IS NULL')
    expect(sql).toContain('excluded_at IS NULL')
    expect(params).toEqual(['ws-1', 30, 7])
  })

  it('une lecture cassée rend [] sans lever (la routine continue)', async () => {
    const query = jest.fn().mockRejectedValue(new Error('boom'))
    const service = new CrmRoutinesService({ manager: { query } } as never)
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
    await expect(service.championsDueForEmploymentCheck('ws-1', 5)).resolves.toEqual([])
  })

  it('consigne le contrôle daté et change l’employeur seulement s’il diffère', async () => {
    const { service, query } = serviceWith([])
    await service.recordEmploymentCheck(
      'ws-1',
      'c-1',
      { organization: 'Nouvelle SA', title: 'DSI' },
      new Date('2026-10-11T08:00:00Z'),
    )
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('employmentCheck')
    expect(sql).toContain('workspace_id')
    expect(params).toContain('c-1')
    expect(params).toContain('Nouvelle SA')
    expect(JSON.stringify(params)).toContain('2026-10-11T08:00:00.000Z')
  })

  it('un contrôle sans résultat ne touche pas l’employeur mais date le passage', async () => {
    const { service, query } = serviceWith([])
    await service.recordEmploymentCheck('ws-1', 'c-1', null, new Date('2026-10-11T08:00:00Z'))
    const [sql] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('employmentCheck')
    expect(sql).not.toContain("'{apolloDetails}'")
  })

  // #4055.8 — l'état daté de la relecture est écrit avec le passage.
  it('écrit l’état de la relecture : a quitté sur un autre employeur observé, non retrouvé sans résultat', async () => {
    const left = serviceWith([])
    await left.service.recordEmploymentCheck(
      'ws-1',
      'c-1',
      { organization: 'Capgemini', title: 'DSI' },
      new Date('2026-10-11T08:00:00Z'),
      'Orange',
    )
    expect(JSON.stringify(left.query.mock.calls[0]![1])).toContain('state\\":\\"left')
    const notFound = serviceWith([])
    await notFound.service.recordEmploymentCheck('ws-1', 'c-1', null, new Date('2026-10-11T08:00:00Z'), 'Orange')
    expect(JSON.stringify(notFound.query.mock.calls[0]![1])).toContain('state\\":\\"not_found')
  })

  it('la lecture des champions joint le compte pour comparer l’employeur observé', async () => {
    const { service, query } = serviceWith([])
    await service.championsDueForEmploymentCheck('ws-1', 3)
    expect(query.mock.calls[0]![0]).toContain('LEFT JOIN accounts a')
    expect(query.mock.calls[0]![0]).toContain('AS account_name')
  })

  // #4286.13 — l'ouverture d'une fiche relit UN contact, avec la même échéance de 30 jours.
  it('employmentCheckTargetFor : un seul contact, de cet espace, avec la même échéance que la routine', async () => {
    const target = { contact_id: 'c-1', full_name: 'A B', apollo_id: 'p1', organization: null, is_champion: false }
    const { service, query } = serviceWith([target])
    await expect(service.employmentCheckTargetFor('ws-1', 'c-1')).resolves.toEqual(target)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('c.workspace_id = $1')
    expect(sql).toContain('c.id = $3')
    expect(sql).toContain("raw_data ->> 'apolloId'")
    expect(sql).toContain("interval '1 day'")
    expect(params).toEqual(['ws-1', 30, 'c-1'])
  })

  it('employmentCheckTargetFor : plus dû ou lecture cassée → null, sans lever', async () => {
    await expect(serviceWith([]).service.employmentCheckTargetFor('ws-1', 'c-1')).resolves.toBeNull()
    const query = jest.fn().mockRejectedValue(new Error('boom'))
    const service = new CrmRoutinesService({ manager: { query } } as never)
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
    await expect(service.employmentCheckTargetFor('ws-1', 'c-1')).resolves.toBeNull()
  })

  // #4465 — la preuve de départ range la personne en « ancien » (historique) : jamais supprimée, jamais une ligne humaine.
  it('un départ prouvé range le contact en historique (journalisé), sans toucher les lignes manual/crm', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'c-1' }])
      .mockResolvedValue([])
    const service = new CrmRoutinesService({ manager: { query } } as never)
    await service.recordEmploymentCheck(
      'ws-1',
      'c-1',
      { organization: 'Capgemini', title: 'DSI' },
      new Date('2026-10-11T08:00:00Z'),
      'Orange',
    )
    expect(query).toHaveBeenCalledTimes(3)
    const [sql, params] = query.mock.calls[1] as [string, unknown[]]
    expect(sql).toContain("lifecycle_state = 'historique'")
    expect(sql).toContain("NOT IN ('manual', 'crm')")
    expect(sql).toContain("NOT IN ('historique', 'rejete')")
    expect(sql).not.toMatch(/DELETE\s+FROM/i)
    expect(params).toEqual(['c-1', 'ws-1'])
    expect(query.mock.calls[2]![0]).toContain('contact_lifecycle_transitions')
  })

  it('un contact déjà rangé, rejeté ou humain (aucune ligne touchée) n’écrit pas de journal', async () => {
    const { service, query } = serviceWith([])
    await service.recordEmploymentCheck(
      'ws-1',
      'c-1',
      { organization: 'Capgemini', title: 'DSI' },
      new Date('2026-10-11T08:00:00Z'),
      'Orange',
    )
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('un employeur confirmé ou non retrouvé ne range personne en historique', async () => {
    const confirmed = serviceWith([])
    await confirmed.service.recordEmploymentCheck(
      'ws-1',
      'c-1',
      { organization: 'Orange Business', title: 'DSI' },
      new Date('2026-10-11T08:00:00Z'),
      'Orange',
    )
    expect(confirmed.query).toHaveBeenCalledTimes(1)
    const notFound = serviceWith([])
    await notFound.service.recordEmploymentCheck('ws-1', 'c-1', null, new Date('2026-10-11T08:00:00Z'), 'Orange')
    expect(notFound.query).toHaveBeenCalledTimes(1)
  })
})
