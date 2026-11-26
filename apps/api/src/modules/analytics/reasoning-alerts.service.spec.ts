import { ObservabilityAlertsService } from './observability-alerts.service'

const NOW = new Date('2026-10-02T08:00:00.000Z')

const ACTIVE = {
  profile: { present: true, name: null },
  account: { present: false, name: null },
  contacts_count: 0,
  plan: { present: false },
  portfolio: { present: false, count: 0 },
  memory: { pinned_facts: 0, has_summary: false },
}
const layer = (status: string) => ({ status })
const LAYERS = [
  'workspace',
  'crm',
  'messaging',
  'agenda',
  'documents',
  'account_dossier',
  'dataforge',
  'market_memory',
  'current_public_sources',
  'bellum_method',
  'inference',
]
const receipt = (consulted: string[], overrides: Record<string, string> = {}) =>
  Object.fromEntries(
    LAYERS.map(l => [l, layer(overrides[l] ?? (consulted.includes(l) ? 'consulted' : 'not_requested'))]),
  )
const observability = (budget_exhausted: boolean, degraded_answer: boolean) => ({
  execution_plan: 'x',
  planned_steps: 1,
  completed_steps: 1,
  skipped_steps: 0,
  parallel_calls: 0,
  budget_exhausted,
  degraded_answer,
  job_created: false,
})
const ctx = (extra: Record<string, unknown>) => ({
  context: { active: ACTIVE, sources: [], not_consulted: [], ...extra },
})

function build(contexts: Array<{ context: unknown }>) {
  const query = jest.fn(async (sql: string) => (sql.includes('m.context') ? contexts : []))
  const service = new ObservabilityAlertsService({ query } as never)
  const error = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
  jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined)
  return { service, error }
}

const alerts = (error: jest.SpyInstance, key: string) =>
  error.mock.calls.filter(call => JSON.stringify(call[1]).includes(`"alert.key":"${key}"`))

describe('alertes de qualité du raisonnement (#3223.5, #3198)', () => {
  it('« réponses finales après budget épuisé » part quand trop de tours épuisés répondent sans se dire dégradés', async () => {
    const turns = [
      ...Array.from({ length: 12 }, () => ctx({ turn_observability: observability(true, false) })),
      ...Array.from({ length: 4 }, () => ctx({ turn_observability: observability(true, true) })),
    ]
    const { service, error } = build(turns)
    await service.check(NOW)
    expect(alerts(error, 'reasoning_after_budget')).toHaveLength(1)
  })

  it('reste muette quand la part est sous le seuil', async () => {
    const turns = [
      ...Array.from({ length: 2 }, () => ctx({ turn_observability: observability(true, false) })),
      ...Array.from({ length: 14 }, () => ctx({ turn_observability: observability(true, true) })),
    ]
    const { service, error } = build(turns)
    await service.check(NOW)
    expect(alerts(error, 'reasoning_after_budget')).toHaveLength(0)
  })

  it('« absence systématique de DataForge » part quand la couche est indisponible sur la plupart des tours', async () => {
    const turns = Array.from({ length: 14 }, () =>
      ctx({ knowledge_receipt: receipt(['crm'], { dataforge: 'unavailable' }) }),
    )
    const { service, error } = build(turns)
    await service.check(NOW)
    expect(alerts(error, 'reasoning_dataforge_absent')).toHaveLength(1)
  })

  it('« source interne jamais utilisée » part quand aucune couche interne n’est consultée sur presque tous les tours', async () => {
    const turns = Array.from({ length: 15 }, () => ctx({ knowledge_receipt: receipt(['current_public_sources']) }))
    const { service, error } = build(turns)
    await service.check(NOW)
    expect(alerts(error, 'reasoning_internal_unused')).toHaveLength(1)
  })

  it('une mesure impossible (trop peu de tours) ne déclenche rien — et ne se fait pas passer pour « tout va bien »', async () => {
    const turns = Array.from({ length: 3 }, () => ctx({ knowledge_receipt: receipt(['current_public_sources']) }))
    const { service, error } = build(turns)
    await service.check(NOW)
    for (const key of ['reasoning_after_budget', 'reasoning_dataforge_absent', 'reasoning_internal_unused'])
      expect(alerts(error, key)).toHaveLength(0)
  })

  it('« NO_GO sans alternatives » part quand la plupart des NO_GO ne proposent aucune suite (#3223.7)', async () => {
    const noGo = (called: string[]) =>
      ctx({
        reasoning_trace: {
          detected_intent: 'i',
          tools_planned: [],
          tools_called: called,
          verifier_status: 'pass',
          account_verdict: 'NO_GO_NOW',
        },
      })
    const turns = [
      ...Array.from({ length: 12 }, () => noGo(['get_account_suitability_verdict'])),
      ...Array.from({ length: 3 }, () => noGo(['get_account_suitability_verdict', 'suggest_account_alternatives'])),
    ]
    const { service, error } = build(turns)
    await service.check(NOW)
    expect(alerts(error, 'reasoning_nogo_no_alternative')).toHaveLength(1)
  })

  it('« NO_GO sans alternatives » reste muette quand les NO_GO ouvrent une suite', async () => {
    const noGo = ctx({
      reasoning_trace: {
        detected_intent: 'i',
        tools_planned: [],
        tools_called: ['suggest_account_alternatives'],
        verifier_status: 'pass',
        account_verdict: 'NO_GO_NOW',
      },
    })
    const { service, error } = build(Array.from({ length: 15 }, () => noGo))
    await service.check(NOW)
    expect(alerts(error, 'reasoning_nogo_no_alternative')).toHaveLength(0)
  })

  it('lit sur trois jours, pas un seul — « plusieurs jours » est la demande', async () => {
    const { service } = build([])
    const query = (service as unknown as { runs: { query: jest.Mock } }).runs.query
    await service.check(NOW)
    const call = query.mock.calls.find(c => String(c[0]).includes('m.context'))
    const since = (call?.[1] as [Date])[0]
    expect(NOW.getTime() - since.getTime()).toBe(3 * 86_400_000)
  })
})

describe('alertes « fausse réussite » et « mauvais zéro » (#2442.15, lot X17)', () => {
  const verified = (verifier_reasons: string[]) =>
    ctx({
      reasoning_trace: {
        detected_intent: 'x',
        tools_planned: [],
        tools_called: [],
        verifier_status: verifier_reasons.length ? 'repair' : 'pass',
        verifier_reasons,
      },
    })

  it('« fausse réussite » part quand trop de tours vérifiés déclarent une action sans preuve', async () => {
    const turns = [
      ...Array.from({ length: 3 }, () => verified(['action_declaree_sans_preuve'])),
      ...Array.from({ length: 27 }, () => verified([])),
    ]
    const { service, error } = build(turns)
    await service.check(NOW)
    expect(alerts(error, 'reasoning_false_success')).toHaveLength(1)
    expect(alerts(error, 'reasoning_wrong_zero')).toHaveLength(0)
  })

  it('« mauvais zéro » part quand un inconnu est converti en zéro sur trop de tours', async () => {
    const turns = [
      ...Array.from({ length: 3 }, () => verified(['inconnue_convertie_en_zero'])),
      ...Array.from({ length: 27 }, () => verified([])),
    ]
    const { service, error } = build(turns)
    await service.check(NOW)
    expect(alerts(error, 'reasoning_wrong_zero')).toHaveLength(1)
  })

  it('reste muette sous le seuil et quand l’échantillon est trop petit', async () => {
    const small = build(Array.from({ length: 5 }, () => verified(['action_declaree_sans_preuve'])))
    await small.service.check(NOW)
    expect(alerts(small.error, 'reasoning_false_success')).toHaveLength(0)

    const clean = build(Array.from({ length: 40 }, () => verified([])))
    await clean.service.check(NOW)
    expect(alerts(clean.error, 'reasoning_false_success')).toHaveLength(0)
    expect(alerts(clean.error, 'reasoning_wrong_zero')).toHaveLength(0)
  })
})

describe('alerte « Market Memory appelée mais non citée » (#3223, lot E12)', () => {
  const turn = (verifier_reasons: string[]) =>
    ctx({
      reasoning_trace: {
        detected_intent: 'x',
        tools_planned: [],
        tools_called: ['search_market_memory'],
        verifier_status: 'pass',
        verifier_reasons,
      },
    })

  it('part quand la mémoire marché lue n’est citée que dans une minorité de tours', async () => {
    const turns = [
      ...Array.from({ length: 20 }, () => turn(['memoire_marche_non_citee'])),
      ...Array.from({ length: 10 }, () => turn(['memoire_marche_citee'])),
    ]
    const { service, error } = build(turns)
    await service.check(NOW)
    expect(alerts(error, 'reasoning_market_memory_uncited')).toHaveLength(1)
  })

  it('reste muette quand elle est citée, et sans tour décidable (aucun code = hors dénominateur)', async () => {
    const cited = build(Array.from({ length: 30 }, () => turn(['memoire_marche_citee'])))
    await cited.service.check(NOW)
    expect(alerts(cited.error, 'reasoning_market_memory_uncited')).toHaveLength(0)

    const none = build(Array.from({ length: 30 }, () => turn([])))
    await none.service.check(NOW)
    expect(alerts(none.error, 'reasoning_market_memory_uncited')).toHaveLength(0)
  })
})

describe('alertes « correction sans changement de résultat » et « GO sur grand compte sans accès » (#3223, lot R17)', () => {
  const correctionTurn = (correction_without_result_change: boolean) =>
    ctx({
      reasoning_trace: {
        detected_intent: 'x',
        tools_planned: [],
        tools_called: [],
        verifier_status: 'pass',
        correction_without_result_change,
      },
    })
  const verdictTurn = (account_verdict: string, large_account_without_access?: boolean) =>
    ctx({
      reasoning_trace: {
        detected_intent: 'x',
        tools_planned: [],
        tools_called: [],
        verifier_status: 'pass',
        account_verdict,
        large_account_without_access,
      },
    })

  it('part quand une majorité de corrections suivies d’un rerun ne changent pas le verdict', async () => {
    const turns = [
      ...Array.from({ length: 20 }, () => correctionTurn(true)),
      ...Array.from({ length: 10 }, () => correctionTurn(false)),
    ]
    const { service, error } = build(turns)
    await service.check(NOW)
    expect(alerts(error, 'reasoning_correction_without_result_change')).toHaveLength(1)
  })

  it('reste muette quand les corrections suivies d’un rerun changent toutes le verdict', async () => {
    const clean = build(Array.from({ length: 30 }, () => correctionTurn(false)))
    await clean.service.check(NOW)
    expect(alerts(clean.error, 'reasoning_correction_without_result_change')).toHaveLength(0)
  })

  it('part quand une part importante des GO_AFTER_PROOF portent sur un grand compte sans accès connu', async () => {
    const turns = [
      ...Array.from({ length: 10 }, () => verdictTurn('GO_AFTER_PROOF', true)),
      ...Array.from({ length: 20 }, () => verdictTurn('GO_AFTER_PROOF')),
    ]
    const { service, error } = build(turns)
    await service.check(NOW)
    expect(alerts(error, 'reasoning_go_large_account_without_access')).toHaveLength(1)
  })

  it('reste muette hors des verdicts GO_AFTER_PROOF (aucun tour décidable)', async () => {
    const clean = build(Array.from({ length: 30 }, () => verdictTurn('GO_NOW')))
    await clean.service.check(NOW)
    expect(alerts(clean.error, 'reasoning_go_large_account_without_access')).toHaveLength(0)
  })
})
