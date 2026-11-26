import {
  REASONING_QUALITY_MIN_SAMPLE,
  REASONING_QUALITY_NOT_MEASURED,
  buildReasoningQualityReport,
  reasoningTurnFromContext,
  type ReasoningTurnSample,
} from './reasoning-quality'

const consulted = { status: 'consulted' as const }
const notRequested = { status: 'not_requested' as const }
const unavailable = { status: 'unavailable' as const }

/** Un reçu de connaissance où seules les couches nommées ont été consultées. */
function receipt(
  called: readonly string[],
  overrides: Record<string, { status: 'consulted' | 'unavailable' | 'not_requested' | 'forbidden_by_mode' }> = {},
): ReasoningTurnSample['receipt'] {
  const layers = [
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
  return Object.fromEntries(layers.map(l => [l, overrides[l] ?? (called.includes(l) ? consulted : notRequested)]))
}

function many(n: number, turn: ReasoningTurnSample): ReasoningTurnSample[] {
  return Array.from({ length: n }, () => turn)
}

describe('buildReasoningQualityReport (#3223.2)', () => {
  it('sans aucun tour, tout est « non mesuré » — jamais un taux à 0 (GA-18)', () => {
    const report = buildReasoningQualityReport([], 30)
    expect(report.turns).toBe(0)
    for (const m of Object.values(report.metrics)) {
      expect(m.state).toBe('unmeasured')
      expect('value' in m).toBe(false)
    }
  })

  it('en dessous du seuil d’échantillon, la mesure est refusée et dit pourquoi', () => {
    const turns = many(REASONING_QUALITY_MIN_SAMPLE - 1, { receipt: receipt(['market_memory']) })
    const report = buildReasoningQualityReport(turns, 30)
    expect(report.metrics.marketMemoryRate).toMatchObject({ state: 'unmeasured', reason: 'sample_too_small' })
  })

  it('taux Market Memory : part des tours avec reçu où la couche a été consultée', () => {
    const turns = [
      ...many(3, { receipt: receipt(['market_memory', 'crm']) }),
      ...many(7, { receipt: receipt(['crm']) }),
    ]
    const report = buildReasoningQualityReport(turns, 30)
    expect(report.metrics.marketMemoryRate).toMatchObject({ state: 'measured', value: 30, sample: 10 })
  })

  it('un tour sans reçu sort du dénominateur et se compte à part', () => {
    const turns = [...many(10, { receipt: receipt(['market_memory']) }), ...many(5, {})]
    const report = buildReasoningQualityReport(turns, 30)
    expect(report.metrics.marketMemoryRate).toMatchObject({ state: 'measured', value: 100, sample: 10, excluded: 5 })
  })

  it('public-only : sources publiques consultées ET aucune couche interne consultée', () => {
    const turns = [
      ...many(2, { receipt: receipt(['current_public_sources']) }),
      ...many(3, { receipt: receipt(['current_public_sources', 'crm']) }),
      ...many(5, { receipt: receipt(['crm']) }),
    ]
    const report = buildReasoningQualityReport(turns, 30)
    expect(report.metrics.publicOnlyRate).toMatchObject({ state: 'measured', value: 20, sample: 10 })
  })

  it('source route utilisée : une part par couche, dans l’ordre du contrat', () => {
    const turns = [...many(5, { receipt: receipt(['crm', 'workspace']) }), ...many(5, { receipt: receipt(['crm']) })]
    const report = buildReasoningQualityReport(turns, 30)
    const crm = report.sourceRoute.find(r => r.layer === 'crm')
    const workspace = report.sourceRoute.find(r => r.layer === 'workspace')
    expect(crm?.measure).toMatchObject({ state: 'measured', value: 100 })
    expect(workspace?.measure).toMatchObject({ state: 'measured', value: 50 })
    expect(report.sourceRoute.map(r => r.layer)[0]).toBe('workspace')
  })

  it('outils ignorés : la route prévoyait des outils et AUCUN n’a été appelé', () => {
    const planned = ['search_accounts', 'get_account_briefing']
    const turns = [
      ...many(4, { trace: { tools_planned: planned, tools_called: [], verifier_status: 'pass' } }),
      ...many(4, { trace: { tools_planned: planned, tools_called: ['search_accounts'], verifier_status: 'pass' } }),
      // Aucun outil prévu : ne compte pas dans le dénominateur.
      ...many(4, { trace: { tools_planned: [], tools_called: [], verifier_status: 'pass' } }),
      ...many(2, { trace: { tools_planned: planned, tools_called: ['autre'], verifier_status: 'pass' } }),
    ]
    const report = buildReasoningQualityReport(turns, 30)
    // 6 ignorés (4 vides + 2 « autre ») sur 10 tours avec outils prévus.
    expect(report.metrics.ignoredToolsRate).toMatchObject({ state: 'measured', value: 60, sample: 10, excluded: 4 })
  })

  it('budget : tours interrompus, et réponses finales rendues APRÈS un budget épuisé', () => {
    const obs = (budget_exhausted: boolean, degraded_answer: boolean) => ({
      observability: { budget_exhausted, degraded_answer },
    })
    const turns = [...many(30, obs(false, false)), ...many(10, obs(true, true)), ...many(10, obs(true, false))]
    const report = buildReasoningQualityReport(turns, 30)
    expect(report.metrics.budgetInterruptedRate).toMatchObject({ state: 'measured', value: 40, sample: 50 })
    // Parmi les 20 budgets épuisés, 10 ont quand même rendu une réponse non dégradée.
    expect(report.metrics.finalAnswerAfterBudgetRate).toMatchObject({ state: 'measured', value: 50, sample: 20 })
  })

  it('DataForge : indisponible sur les tours où il était demandé ou disponible', () => {
    const turns = [
      ...many(6, { receipt: receipt([], { dataforge: unavailable }) }),
      ...many(4, { receipt: receipt(['dataforge']) }),
      // Non demandé : ne compte pas.
      ...many(3, { receipt: receipt(['crm']) }),
    ]
    const report = buildReasoningQualityReport(turns, 30)
    expect(report.metrics.dataforgeUnavailableRate).toMatchObject({ state: 'measured', value: 60, sample: 10 })
  })

  it('nomme ce qui ne sort pas — pas un zéro, une raison (#3223, décision Louis 11/10)', () => {
    const report = buildReasoningQualityReport([], 30)
    const names = report.notMeasured.map(n => n.metric)
    // Mesurés depuis le 11/10 : juge évalué, classement agrégé ≥ 3 espaces.
    expect(names).not.toContain('taux de recommandations génériques')
    expect(names).not.toContain('secteurs les moins fiables')
    expect(names).toEqual(['comptes les plus contestés, nommés'])
    for (const n of report.notMeasured) expect(n.reason.length).toBeGreaterThan(20)
  })

  it('le rapport ne porte AUCUN identifiant : ni espace, ni personne, ni message (c64)', () => {
    const report = buildReasoningQualityReport(many(12, { receipt: receipt(['crm']) }), 30)
    const json = JSON.stringify(report)
    expect(json).not.toMatch(/workspace_?id|user_?id|account_?id|message/i)
  })

  it('verdict défavorable, alternatives et NO_GO sans alternative (#3223.7)', () => {
    const trace = (account_verdict: string | undefined, called: string[]) => ({
      trace: { tools_planned: [], tools_called: called, verifier_status: 'pass', account_verdict },
    })
    const turns = [
      // 10 NO_GO : 4 avec alternatives, 6 sans.
      ...many(4, trace('NO_GO_NOW', ['get_account_suitability_verdict', 'suggest_account_alternatives'])),
      ...many(6, trace('NO_GO_NOW', ['get_account_suitability_verdict'])),
      // 10 WATCH : tous sans alternatives.
      ...many(10, trace('WATCH', ['get_account_suitability_verdict'])),
      // 20 favorables.
      ...many(20, trace('GO_NOW', ['get_account_suitability_verdict'])),
      // Non évaluable : hors dénominateur. Sans verdict : hors sujet aussi.
      ...many(3, trace('NOT_EVALUABLE', [])),
      ...many(5, trace(undefined, [])),
    ]
    const report = buildReasoningQualityReport(turns, 30)
    // Défavorable (NO_GO + WATCH) : 20 sur 40 verdicts évaluables.
    expect(report.metrics.counterAdviceRate).toMatchObject({ state: 'measured', value: 50, sample: 40, excluded: 8 })
    // Alternatives : 4 sur 20 verdicts défavorables.
    expect(report.metrics.alternativesRate).toMatchObject({ state: 'measured', value: 20, sample: 20 })
    // NO_GO sans alternative : 6 sur 10 NO_GO.
    expect(report.metrics.noGoWithoutAlternativesRate).toMatchObject({ state: 'measured', value: 60, sample: 10 })
  })

  it('sans verdict lu, ces trois mesures sont « non mesurées » — jamais « 0 % de NO_GO »', () => {
    const turns = many(30, { trace: { tools_planned: [], tools_called: [], verifier_status: 'pass' } })
    const report = buildReasoningQualityReport(turns, 30)
    for (const m of [
      report.metrics.counterAdviceRate,
      report.metrics.alternativesRate,
      report.metrics.noGoWithoutAlternativesRate,
    ])
      expect(m.state).toBe('unmeasured')
  })

  it('taux de corrections utilisateur et de rerun après correction (#3223 X17)', () => {
    const trace = (correction_recognized: boolean | undefined, correction_rerun?: boolean) => ({
      trace: {
        tools_planned: [],
        tools_called: [],
        verifier_status: 'pass',
        correction_recognized,
        correction_rerun,
      },
    })
    const turns = [
      // 14 corrections reconnues : 9 suivies d'un rerun, 3 sans, 2 sans invalidation nommée.
      ...many(9, trace(true, true)),
      ...many(3, trace(true, false)),
      ...many(2, trace(true)),
      // 26 tours sans correction.
      ...many(26, trace(false)),
      // Tours d'avant le champ : hors dénominateur, comptés.
      ...many(4, trace(undefined)),
    ]
    const report = buildReasoningQualityReport(turns, 30)
    expect(report.metrics.userCorrectionRate).toMatchObject({ state: 'measured', value: 35, sample: 40, excluded: 4 })
    // Rerun : 9 sur les 12 corrections dont le rerun est décidable ; 2 indécidables écartées.
    expect(report.metrics.rerunAfterCorrectionRate).toMatchObject({
      state: 'measured',
      value: 75,
      sample: 12,
    })
  })

  it('sous le seuil de tours corrigés, le rerun est « non mesuré » — jamais 0 %', () => {
    const t = (correction_recognized: boolean, correction_rerun?: boolean) => ({
      trace: { tools_planned: [], tools_called: [], verifier_status: 'pass', correction_recognized, correction_rerun },
    })
    const turns = [...many(3, t(true, false)), ...many(40, t(false))]
    const report = buildReasoningQualityReport(turns, 30)
    expect(report.metrics.rerunAfterCorrectionRate).toMatchObject({ state: 'unmeasured', reason: 'sample_too_small' })
    expect('value' in report.metrics.rerunAfterCorrectionRate).toBe(false)
  })

  it('ne nomme plus « non mesurés » les mesures livrées', () => {
    const names = REASONING_QUALITY_NOT_MEASURED.map(m => m.metric)
    expect(names).not.toContain('taux de corrections utilisateur')
    expect(names).not.toContain('taux de rerun après correction')
    expect(names).not.toContain('taux de recommandations génériques')
  })

  it('fausse réussite et mauvais zéro : parts des tours vérifiés dont le vérificateur a levé le motif (#2442.15 X17)', () => {
    const t = (verifier_reasons: string[] | undefined) => ({
      trace: { tools_planned: [], tools_called: [], verifier_status: 'pass', verifier_reasons },
    })
    const turns = [
      ...many(3, t(['action_declaree_sans_preuve'])),
      ...many(2, t(['inconnue_convertie_en_zero', 'reponse_trop_longue'])),
      ...many(25, t([])),
      // Tours d'avant le champ ou non vérifiés : hors dénominateur.
      ...many(6, t(undefined)),
    ]
    const report = buildReasoningQualityReport(turns, 30)
    expect(report.metrics.falseSuccessRate).toMatchObject({ state: 'measured', value: 10, sample: 30, excluded: 6 })
    expect(report.metrics.wrongZeroRate).toMatchObject({ state: 'measured', value: 6.67, sample: 30 })
  })

  it('sans aucun tour vérifié, fausse réussite et mauvais zéro sont « non mesurés » — jamais 0 %', () => {
    const turns = many(30, { trace: { tools_planned: [], tools_called: [], verifier_status: 'pass' } })
    const report = buildReasoningQualityReport(turns, 30)
    for (const m of [report.metrics.falseSuccessRate, report.metrics.wrongZeroRate]) {
      expect(m.state).toBe('unmeasured')
      expect('value' in m).toBe(false)
    }
  })

  it('« Market Memory non citée » : seuls les tours où la mémoire a rendu une entreprise entrent au dénominateur', () => {
    const t = (verifier_reasons: string[] | undefined) => ({
      trace: { tools_planned: [], tools_called: [], verifier_status: 'pass', verifier_reasons },
    })
    const turns = [
      ...Array.from({ length: 3 }, () => t(['memoire_marche_non_citee'])),
      ...Array.from({ length: 9 }, () => t(['memoire_marche_citee'])),
      ...Array.from({ length: 5 }, () => t([])),
      t(undefined),
    ]
    const report = buildReasoningQualityReport(turns, 3)
    expect(report.metrics.marketMemoryUncitedRate).toMatchObject({
      state: 'measured',
      value: 25,
      sample: 12,
      excluded: 6,
    })
  })

  it('« correction sans changement de résultat » : seules les corrections DÉCIDABLES entrent au dénominateur (#3223, lot R17)', () => {
    const t = (correction_without_result_change: boolean | undefined) => ({
      trace: { tools_planned: [], tools_called: [], verifier_status: 'pass', correction_without_result_change },
    })
    const turns = [
      ...many(3, t(true)),
      ...many(9, t(false)),
      // Pas de rerun, ou l'un des deux verdicts inconnu : non décidable, hors dénominateur.
      ...many(5, t(undefined)),
    ]
    const report = buildReasoningQualityReport(turns, 3)
    expect(report.metrics.correctionWithoutResultChangeRate).toMatchObject({
      state: 'measured',
      value: 25,
      sample: 12,
      excluded: 5,
    })
  })

  it('sous le seuil de corrections décidables, « correction sans changement de résultat » est « non mesuré »', () => {
    const t = (correction_without_result_change: boolean | undefined) => ({
      trace: { tools_planned: [], tools_called: [], verifier_status: 'pass', correction_without_result_change },
    })
    const turns = [...many(3, t(true)), ...many(40, t(undefined))]
    const report = buildReasoningQualityReport(turns, 3)
    expect(report.metrics.correctionWithoutResultChangeRate).toMatchObject({
      state: 'unmeasured',
      reason: 'sample_too_small',
    })
    expect('value' in report.metrics.correctionWithoutResultChangeRate).toBe(false)
  })

  it('« GO sur grand compte sans accès » : seuls les verdicts GO_AFTER_PROOF entrent au dénominateur (#3223, lot R17)', () => {
    const t = (account_verdict: string | undefined, large_account_without_access?: boolean) => ({
      trace: {
        tools_planned: [],
        tools_called: [],
        verifier_status: 'pass',
        account_verdict,
        large_account_without_access,
      },
    })
    const turns = [
      ...many(4, t('GO_AFTER_PROOF', true)),
      // Absent sur un GO_AFTER_PROOF = compte pas assez grand, un vrai « non » décidable.
      ...many(8, t('GO_AFTER_PROOF')),
      // Un autre verdict (même avec le drapeau, qui ne devrait jamais s'y trouver) sort du dénominateur.
      ...many(5, t('GO_NOW')),
      ...many(3, t(undefined)),
    ]
    const report = buildReasoningQualityReport(turns, 3)
    expect(report.metrics.goLargeAccountWithoutAccessRate).toMatchObject({
      state: 'measured',
      value: 33.33,
      sample: 12,
      excluded: 8,
    })
  })

  it('sans aucun verdict GO_AFTER_PROOF, « GO sur grand compte sans accès » est « non mesuré » — jamais 0 %', () => {
    const turns = many(30, {
      trace: { tools_planned: [], tools_called: [], verifier_status: 'pass', account_verdict: 'GO_NOW' },
    })
    const report = buildReasoningQualityReport(turns, 3)
    expect(report.metrics.goLargeAccountWithoutAccessRate.state).toBe('unmeasured')
    expect('value' in report.metrics.goLargeAccountWithoutAccessRate).toBe(false)
  })
})

describe('recommandations génériques — un détecteur ÉVALUÉ (#3223, décision Louis 11/10)', () => {
  const reliable = {
    state: 'reliable' as const,
    judgeVersion: 'j1',
    agreementPercent: 90,
    agreed: 27,
    judged: 30,
    thresholdPercent: 85,
    measuredAt: '2026-10-11',
  }
  const unreliable = {
    state: 'unreliable' as const,
    reason: 'below_threshold' as const,
    judgeVersion: 'j1',
    agreementPercent: 70,
    agreed: 21,
    judged: 30,
    thresholdPercent: 85,
  }
  const j = (verdict: string, judgeVersion = 'j1') => ({ verdict, judgeVersion })
  const verdicts = (generic: number, specific: number) => [
    ...Array.from({ length: generic }, () => j('generique')),
    ...Array.from({ length: specific }, () => j('specifique')),
  ]

  it('juge fiable : la part des réponses génériques parmi celles qui recommandent', () => {
    const report = buildReasoningQualityReport([], 30, {
      reliability: reliable,
      judgements: [...verdicts(3, 9), j('sans_recommandation'), j('generique', 'autre-juge')],
    })
    expect(report.genericRecommendation.judge).toEqual(reliable)
    // `sans_recommandation` et le verdict d'un autre juge sortent du dénominateur, et se comptent.
    expect(report.genericRecommendation.measure).toEqual({ state: 'measured', value: 25, sample: 12, excluded: 2 })
  })

  it('sait dire NON : juge non fiable ⇒ AUCUN chiffre, même sur un gros échantillon', () => {
    const report = buildReasoningQualityReport([], 30, { reliability: unreliable, judgements: verdicts(50, 50) })
    expect(report.genericRecommendation.measure).toBeNull()
    expect(report.genericRecommendation.judge).toMatchObject({ state: 'unreliable', reason: 'below_threshold' })
  })

  it('par défaut, le juge livré n’est pas encore calibré : non fiable', () => {
    const report = buildReasoningQualityReport([], 30, { judgements: verdicts(20, 20) })
    expect(report.genericRecommendation.judge.state).toBe('unreliable')
    expect(report.genericRecommendation.measure).toBeNull()
  })

  it('juge fiable mais trop peu de réponses jugées : « non mesuré », jamais 0 %', () => {
    const report = buildReasoningQualityReport([], 30, { reliability: reliable, judgements: verdicts(0, 4) })
    expect(report.genericRecommendation.measure).toMatchObject({ state: 'unmeasured', reason: 'sample_too_small' })
  })
})

describe('comptes et secteurs les plus contestés — en agrégé, trois espaces au moins (c64, c92)', () => {
  const row = (
    workspaceId: string,
    nafCode: string | null,
    employees: string | null,
    contested: number,
    decided: number,
  ) => ({ workspaceId, nafCode, employees, contested, decided })

  it('classe les secteurs portés par trois espaces, du plus contesté au moins contesté', () => {
    const report = buildReasoningQualityReport([], 30, {
      contested: [
        row('w1', '64.19Z', null, 1, 10),
        row('w2', '64.19Z', null, 1, 10),
        row('w3', '64.19Z', null, 1, 10),
        row('w1', '62.01Z', null, 4, 10),
        row('w2', '62.02A', null, 4, 10),
        row('w3', '62.09Z', null, 4, 10),
      ],
    })
    expect(report.contested.minWorkspaces).toBe(3)
    expect(report.contested.bySector.map(c => [c.value, c.measure.value])).toEqual([
      ['naf_62', 40],
      ['naf_64', 10],
    ])
    expect(report.contested.bySector[0]).toMatchObject({ contributingWorkspaces: 3 })
  })

  it('sait dire NON : un secteur porté par deux espaces ne sort pas, quel que soit son volume', () => {
    const report = buildReasoningQualityReport([], 30, {
      contested: [row('w1', '62.01Z', null, 30, 50), row('w2', '62.01Z', null, 30, 50)],
    })
    expect(report.contested.bySector).toEqual([])
  })

  it('une cellule sous le seuil de tours ne se classe pas', () => {
    const report = buildReasoningQualityReport([], 30, {
      contested: [row('w1', '62.01Z', null, 1, 2), row('w2', '62.01Z', null, 1, 2), row('w3', '62.01Z', null, 1, 2)],
    })
    expect(report.contested.bySector).toEqual([])
  })

  it('les comptes se classent par TAILLE, jamais par nom ; aucun identifiant d’espace ne sort', () => {
    const report = buildReasoningQualityReport([], 30, {
      contested: [
        row('ws-alpha', null, '6000', 5, 10),
        row('ws-beta', null, '8000', 5, 10),
        row('ws-gamma', null, '12000', 5, 10),
      ],
    })
    expect(report.contested.bySize.map(c => [c.value, c.measure.value])).toEqual([['ge', 50]])
    const json = JSON.stringify(report.contested)
    for (const ws of ['ws-alpha', 'ws-beta', 'ws-gamma']) expect(json).not.toContain(ws)
  })

  /**
   * #3861 (DEC-4036 Q13, Louis 19/10) — le TAUX DE REPLI IA : part des tours où Laura a servi une
   * demande complexe sur un modèle de capacité moindre (`capability_fallback`, #3861.5). Un tour
   * d'avant le champ sort du dénominateur, jamais « pas de repli ».
   */
  describe('taux de repli IA (#3861, Q13)', () => {
    const obs = (capability_fallback?: boolean): ReasoningTurnSample => ({
      observability: {
        budget_exhausted: false,
        degraded_answer: false,
        ...(capability_fallback === undefined ? {} : { capability_fallback }),
      },
    })

    it('part des tours repliés, sur les tours qui portent le champ', () => {
      const report = buildReasoningQualityReport([...many(3, obs(true)), ...many(9, obs(false)), ...many(4, obs())], 30)
      expect(report.metrics.capabilityFallbackRate).toEqual({ state: 'measured', value: 25, sample: 12, excluded: 4 })
    })

    it('sait dire NON — sans tour qui porte le champ, « non mesuré », jamais 0 %', () => {
      const report = buildReasoningQualityReport(many(20, obs()), 30)
      expect(report.metrics.capabilityFallbackRate.state).toBe('unmeasured')
    })

    it('lit le champ du contexte persisté', () => {
      const turn = reasoningTurnFromContext({
        turn_observability: {
          completed_steps: 1,
          skipped_steps: 0,
          parallel_calls: 0,
          budget_exhausted: false,
          degraded_answer: false,
          job_created: false,
          capability_fallback: true,
        },
      } as never)
      expect(turn?.observability?.capability_fallback).toBe(true)
    })

    it('nomme la bascule de fournisseur et la cohorte canary comme NON mesurées, avec leur raison', () => {
      const report = buildReasoningQualityReport([], 30)
      expect(report.fallbackNotMeasured.map(m => m.metric)).toEqual([
        'bascule vers le modèle de secours (fournisseur indisponible)',
        'repli de la cohorte canary',
      ])
      for (const entry of report.fallbackNotMeasured) expect(entry.reason.length).toBeGreaterThan(20)
    })
  })
})
