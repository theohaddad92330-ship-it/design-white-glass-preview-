import { SharedBaseAggregationService } from './shared-base-aggregation.service'

// P05.a (#3246, lot 09/10) — le job nocturne : il relit des comptages PAR
// ESPACE, n'écrit que des cellules à trois espaces, et réécrit le périmètre
// réel dans une transaction (idempotent).
describe('SharedBaseAggregationService.aggregate', () => {
  const grouped = (workspace_id: string, value: string, outcome: string) => ({
    workspace_id,
    value,
    naf_code: null,
    employees: null,
    outcome,
    count: '2',
  })

  const build = (rowsFor: (sql: string) => unknown[]) => {
    const reads = jest.fn(async (sql: string, _params?: unknown[]) => rowsFor(sql))
    const writes = jest.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[])
    const dataSource = {
      query: reads,
      transaction: jest.fn(async (work: (manager: { query: typeof writes }) => Promise<void>) =>
        work({ query: writes }),
      ),
    }
    return { service: new SharedBaseAggregationService(dataSource as never), reads, writes }
  }

  it('ne lit que les espaces RÉELS et n’écrit que les cellules à trois espaces', async () => {
    const { service, reads, writes } = build(sql =>
      sql.includes('action_plan_items') && sql.includes('cadence_step')
        ? [
            grouped('w1', 'relance', 'meeting_booked'),
            grouped('w2', 'relance', 'no_response'),
            grouped('w3', 'relance', 'meeting_booked'),
            grouped('w1', 'initial', 'meeting_booked'),
            grouped('w2', 'initial', 'meeting_booked'),
          ]
        : [],
    )
    const report = await service.aggregate()

    for (const [sql] of reads.mock.calls) expect(sql).toContain('w.is_demo = false')
    expect(report).toEqual({
      actionOutcomeCells: 1,
      caseOutcomeCells: 0,
      signalDealCells: 0,
      messageLearningCells: 0,
      marketPatternCells: 0,
    })
    expect(writes.mock.calls[0]).toEqual(['DELETE FROM shared_action_outcome_aggregates WHERE scope = $1', ['live']])
    const inserts = writes.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO shared_action'))
    expect(inserts).toHaveLength(1)
    expect((inserts[0] as unknown[])[1]).toEqual(['live', 'cadence', 'relance', 'all', 'all', 4, 6, 3])
    // Aucun identifiant d'espace ne voyage vers la table commune.
    expect(JSON.stringify(writes.mock.calls)).not.toMatch(/"w[123]"/)
  })

  // Le faux client ne valide aucun SQL : la table `projects` n'existe pas (les projets vivent dans
  // `opportunities`, dont la date de création est `first_detected_at`, jamais `created_at`).
  it('lit les affaires dans la table réelle `opportunities`, sur sa vraie colonne de date', async () => {
    const { service, reads } = build(() => [])
    await service.aggregate()
    const sqls = reads.mock.calls.map(([sql]) => sql)
    const deals = sqls.find(sql => sql.includes('signal_history')) ?? ''
    expect(deals).toContain('FROM opportunities p')
    expect(deals).toContain('p.first_detected_at')
    for (const sql of sqls) {
      expect(sql).not.toMatch(/\bprojects\b/)
      expect(sql).not.toContain('p.created_at')
    }
  })

  it('sait dire NON — deux espaces seulement : la table réelle est vidée, rien n’est écrit', async () => {
    const { service, writes } = build(sql =>
      sql.includes('action_plan_items')
        ? [grouped('w1', 'relance', 'meeting_booked'), grouped('w2', 'relance', 'meeting_booked')]
        : [],
    )
    expect(await service.aggregate()).toEqual({
      actionOutcomeCells: 0,
      caseOutcomeCells: 0,
      signalDealCells: 0,
      messageLearningCells: 0,
      marketPatternCells: 0,
    })
    expect(writes.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO'))).toHaveLength(0)
  })

  it('P05.b — les cas gagnés / perdus de trois espaces sortent par dimension, sans un nom', async () => {
    const cases = ['w1', 'w2', 'w3'].map(workspace_id => ({
      workspace_id,
      naf_code: '62.01Z',
      employees: null,
      group_role: null,
      outcome: workspace_id === 'w3' ? 'lost' : 'won',
      count: '1',
    }))
    const { service, reads, writes } = build(sql => (sql.includes('rex_entries') ? cases : []))
    expect(await service.aggregate()).toEqual({
      actionOutcomeCells: 0,
      caseOutcomeCells: 1,
      signalDealCells: 0,
      messageLearningCells: 0,
      marketPatternCells: 0,
    })
    const caseSql = String(reads.mock.calls.find(([sql]) => String(sql).includes('rex_entries'))?.[0])
    expect(caseSql).toContain("p.stage = 'lost'")
    expect(caseSql).not.toMatch(/loss_reason|company_name/)
    const insert = writes.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO shared_case'))
    expect(insert?.[1]).toEqual(['live', 'sector', 'naf_62', 2, 1, 3])
  })

  it('P05.c — un signal jugé sur la fenêtre de 90 jours, suivi d’une affaire ouverte, sans libellé ni nom', async () => {
    const signals = ['w1', 'w2', 'w3'].map(workspace_id => ({
      workspace_id,
      signal_type: 'budget',
      naf_code: null,
      signals: '3',
      followed: '1',
    }))
    const { service, reads, writes } = build(sql => (sql.includes('signal_history') ? signals : []))
    expect(await service.aggregate()).toEqual({
      actionOutcomeCells: 0,
      caseOutcomeCells: 0,
      signalDealCells: 1,
      messageLearningCells: 0,
      marketPatternCells: 0,
    })
    const call = reads.mock.calls.find(([sql]) => String(sql).includes('signal_history'))
    expect(call?.[1]).toEqual([90])
    expect(String(call?.[0])).not.toMatch(/s\.label|company_name/)
    const insert = writes.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO shared_signal'))
    expect(insert?.[1]).toEqual(['live', 'budget', 'all', 9, 3, 90, 3])
  })

  // #2877 (#2385.5 GLOBAL, Louis 11/10/2026) — les signaux d'apprentissage des
  // messages : des comptes par espace (transitions, versions `user_edit`,
  // déclarations de relecteur), jamais le corps d'un message.
  it('#2877 GLOBAL — mutualise les signaux d’apprentissage des messages sans jamais lire un corps', async () => {
    const signals = ['w1', 'w2', 'w3'].map(workspace_id => ({ workspace_id, signal: 'wrong_fact', count: '2' }))
    const { service, reads, writes } = build(sql => (sql.includes('outreach_message_quality_flags') ? signals : []))
    const report = await service.aggregate()
    expect(report).toEqual({
      actionOutcomeCells: 0,
      caseOutcomeCells: 0,
      signalDealCells: 0,
      messageLearningCells: 1,
      marketPatternCells: 0,
    })
    const learning = reads.mock.calls.map(([sql]) => String(sql)).filter(sql => sql.includes('outreach_'))
    expect(learning.length).toBeGreaterThan(0)
    for (const sql of learning) {
      expect(sql).toContain('w.is_demo = false')
      expect(sql).not.toMatch(/\bbody\b|\bsubject\b|\bcontent\b/)
    }
    const insert = writes.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO shared_message_learning'))
    expect(insert?.[1]).toEqual(['live', 'wrong_fact', 6, 3])
  })
})

// #4286.15.c (Louis 22/10/2026) — `market_pattern` : les recrutements repérés sur la fenêtre, lus PAR
// ESPACE réel, deviennent des tendances communes ; l'intitulé et l'adresse ne voyagent jamais.
describe('SharedBaseAggregationService.aggregate — #4286.15.c market_pattern', () => {
  it('lit les recrutements RÉELS de la fenêtre et n’écrit que des cellules à trois espaces, sans intitulé', async () => {
    const hire = (workspace_id: string) => ({
      workspace_id,
      job_title: 'Data Engineer',
      naf_code: '64.19Z',
      employees: '1 000 à 1 999 salariés',
      address: '92400 Courbevoie',
    })
    const reads = jest.fn(async (sql: string, _params?: unknown[]) =>
      sql.includes('signal_type = $1') ? [hire('w1'), hire('w2'), hire('w3')] : [],
    )
    const writes = jest.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[])
    const dataSource = {
      query: reads,
      transaction: jest.fn(async (work: (manager: { query: typeof writes }) => Promise<void>) =>
        work({ query: writes }),
      ),
    }
    const report = await new SharedBaseAggregationService(dataSource as never).aggregate()

    const read = reads.mock.calls.find(([sql]) => sql.includes('signal_type = $1'))
    expect(read?.[0]).toContain('w.is_demo = false')
    expect(read?.[1]).toEqual(['recrutement', 180])
    expect(report.marketPatternCells).toBe(8)
    expect(writes.mock.calls).toContainEqual([
      'DELETE FROM shared_market_pattern_aggregates WHERE scope = $1',
      ['live'],
    ])
    const inserts = writes.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO shared_market_pattern_aggregates'),
    )
    expect(inserts).toHaveLength(8)
    expect(inserts.map(([, params]) => params)).toContainEqual([
      'live',
      'data',
      'naf_64',
      'eti',
      'ile_de_france',
      3,
      180,
      3,
    ])
    expect(JSON.stringify(writes.mock.calls)).not.toMatch(/Engineer|Courbevoie|"w[123]"/)
  })
})
