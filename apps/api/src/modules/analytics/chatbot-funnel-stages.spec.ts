import { MIN_DISTINCT_SESSIONS_FOR_A_METRIC } from '@bellum/contracts'
import {
  buildChatbotStages,
  CHATBOT_STAGES,
  readMedianScore,
  type StageMeasurementInput,
} from './chatbot-funnel-stages'

/** Une mesure complète, généreuse en sessions : le cas nominal des tests. */
function measurement(overrides: Partial<StageMeasurementInput> = {}): StageMeasurementInput {
  return {
    sourceAvailable: true,
    siteVisitors: 4000,
    events: { chat_opened: 120, chat_auto_opened: 80, chat_first_reply: 150, calendly_clicked: 12 },
    visitors: { chat_opened: 110, chat_auto_opened: 70, chat_first_reply: 140, calendly_clicked: 11 },
    ...overrides,
  }
}

function stage(input: StageMeasurementInput, id: (typeof CHATBOT_STAGES)[number]) {
  const found = buildChatbotStages(input).find(reading => reading.stage === id)
  if (!found) throw new Error(`étape ${id} absente du tunnel`)
  return found
}

describe('buildChatbotStages — le tunnel de #1659', () => {
  it('rend les cinq étapes, dans l’ordre du parcours', () => {
    expect(buildChatbotStages(measurement()).map(reading => reading.stage)).toEqual([
      'visitors',
      'widget_opened',
      'conversation',
      'qualified',
      'booked',
    ])
  })

  it('compte les OCCURRENCES, et additionne les deux façons d’ouvrir le widget', () => {
    const opened = stage(measurement(), 'widget_opened')
    expect(opened.measured).toBe(true)
    if (!opened.measured) throw new Error('inatteignable')
    expect(opened.count).toBe(200)
    // Les sessions distinctes sont l'AUTRE grandeur, et elle est plus petite :
    // c'est ce qui permet au seuil de porter sur des personnes.
    expect(opened.sessions).toBe(180)
  })

  it('le taux de passage se lit sur l’étape précédente, en part de 1', () => {
    const opened = stage(measurement(), 'widget_opened')
    expect(opened.passRate).toEqual({ kind: 'measured', ratio: 200 / 4000 })
    const conversation = stage(measurement(), 'conversation')
    expect(conversation.passRate).toEqual({ kind: 'measured', ratio: 150 / 200 })
  })

  it('la première étape n’a pas de taux de passage — et le DIT, plutôt que 0 %', () => {
    const visitors = stage(measurement(), 'visitors')
    expect(visitors.passRate).toEqual({ kind: 'no_previous' })
    expect(visitors.shareOfEntry).toEqual({ kind: 'no_previous' })
  })

  it('« Qualification atteinte » est NON INSTRUMENTÉE — pas « zéro qualifié »', () => {
    const qualified = stage(measurement(), 'qualified')
    expect(qualified.measured).toBe(false)
    if (qualified.measured) throw new Error('inatteignable')
    expect(qualified.unmeasured).toBe('not_instrumented')
    // ⚠️ La distinction porte tout le livrable : « rien ne l'émet » n'appelle
    // pas le même geste que « la source n'a pas répondu ».
    expect(qualified.unmeasured).not.toBe('source_unavailable')
  })

  it('l’étape non instrumentée COUPE le taux de passage suivant — jamais un raccourci', () => {
    // « RDV pris / Score ≥ seuil » n'existe pas : le dénominateur n'est pas
    // mesuré. Enjamber l'étape et diviser par les conversations donnerait un
    // AUTRE taux portant le même nom.
    expect(stage(measurement(), 'booked').passRate).toEqual({ kind: 'unmeasured' })
    // La part de l'ENTRÉE, elle, reste calculable : l'entrée est mesurée.
    expect(stage(measurement(), 'booked').shareOfEntry).toEqual({ kind: 'measured', ratio: 12 / 4000 })
  })

  it('source indisponible : tout est non mesuré, et rien ne vaut zéro', () => {
    const readings = buildChatbotStages(measurement({ sourceAvailable: false }))
    for (const reading of readings) {
      expect(reading.measured).toBe(false)
      if (reading.measured) throw new Error('inatteignable')
      expect(reading.unmeasured).not.toBeNull()
    }
    // L'étape non instrumentée reste non instrumentée : réparer Plausible ne la
    // rendrait pas mesurable, et dire « source indisponible » enverrait
    // chercher une panne qui n'existe pas.
    const qualified = readings.find(reading => reading.stage === 'qualified')
    expect(qualified && !qualified.measured && qualified.unmeasured).toBe('not_instrumented')
  })

  it('visiteurs non mesurés : c’est la SOURCE qui manque, pas l’instrumentation', () => {
    const visitors = stage(measurement({ siteVisitors: null }), 'visitors')
    expect(visitors.measured).toBe(false)
    if (visitors.measured) throw new Error('inatteignable')
    expect(visitors.unmeasured).toBe('source_unavailable')
  })

  it('un événement absent de la réponse vaut ZÉRO — c’est une vraie mesure', () => {
    // Plausible a répondu et n'a pas listé `calendly_clicked` : personne n'a
    // cliqué. C'est le seul cas où zéro est VRAI, et il ne se confond pas avec
    // les deux absences ci-dessus.
    const booked = stage(
      measurement({ events: { chat_first_reply: 150 }, visitors: { chat_first_reply: 140 } }),
      'booked',
    )
    expect(booked.measured).toBe(true)
    if (!booked.measured) throw new Error('inatteignable')
    expect(booked.count).toBe(0)
  })
})

describe('le seuil d’agrégation minimale (doctrine c64_analytique_produit)', () => {
  it('retient le taux quand le dénominateur porte moins de sessions que le seuil', () => {
    const rare = measurement({
      siteVisitors: MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1,
      events: { chat_opened: 2 },
      visitors: { chat_opened: 2 },
    })
    const opened = stage(rare, 'widget_opened')
    expect(opened.passRate).toEqual({
      kind: 'below_threshold',
      sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
    // ⚠️ Le COMPTE reste publié : c'est un volume d'écran, pas une métrique
    // comportementale. Ce que le seuil retient, c'est le TAUX.
    expect(opened.measured).toBe(true)
  })

  it('publie le taux dès le seuil atteint — le seuil est une borne INCLUSE', () => {
    const juste = measurement({
      siteVisitors: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
      events: { chat_opened: 2 },
      visitors: { chat_opened: 2 },
    })
    expect(stage(juste, 'widget_opened').passRate).toEqual({
      kind: 'measured',
      ratio: 2 / MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
  })

  it('LIT le seuil du contrat partagé, il ne le recopie pas (GA-26)', () => {
    // Contrôle positif de la lecture : si l'import était mort, la constante
    // vaudrait `undefined` et le cas « juste au seuil » ci-dessus passerait
    // pour de mauvaises raisons.
    expect(MIN_DISTINCT_SESSIONS_FOR_A_METRIC).toBeGreaterThan(0)
    expect(Number.isInteger(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)).toBe(true)
  })
})

describe('readMedianScore — la médiane du score', () => {
  it('sans distribution : NON INSTRUMENTÉ, jamais « 0 » ni « sous le seuil »', () => {
    // C'est l'état réel du dépôt : le score est calculé côté site et aucun
    // événement ne le porte. « Sous le seuil » laisserait croire qu'il suffit
    // d'attendre plus de visiteurs.
    expect(readMedianScore(null)).toEqual({ kind: 'not_instrumented' })
  })

  it('sous le seuil de sessions : la médiane ne se publie PAS, elle se nomme', () => {
    expect(readMedianScore({ 8: 2, 14: 1 })).toEqual({
      kind: 'below_threshold',
      sessions: 3,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
  })

  it('médiane d’une distribution, effectif impair', () => {
    expect(readMedianScore({ 4: 2, 12: 1, 20: 2 })).toEqual({ kind: 'measured', value: 12, sessions: 5 })
  })

  it('médiane d’une distribution, effectif pair — moyenne des deux du milieu', () => {
    expect(readMedianScore({ 4: 3, 20: 3 })).toEqual({ kind: 'measured', value: 12, sessions: 6 })
  })

  it('ignore une entrée cassée sans la compter comme une session', () => {
    expect(readMedianScore({ 4: 3, 20: 3, NaN: 4 } as unknown as Record<number, number>)).toEqual({
      kind: 'measured',
      value: 12,
      sessions: 6,
    })
  })
})
