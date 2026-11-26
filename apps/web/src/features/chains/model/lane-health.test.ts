import { describe, expect, it } from 'vitest'
import type { Chain } from '@bellum/contracts'
import type { ChainLane } from '../api'
import { boardTotals, countOf, needsAttention, slowestStep } from './lane-health'

/**
 * LE COMPTEUR ET LE FILTRE SONT LE MÊME PRÉDICAT (#1504).
 *
 * Le défaut que ces tests empêchent est silencieux : « 6 parcours bloqués »
 * au-dessus de quatre cartes. Aucune exception, aucun écran cassé — juste un
 * chiffre qui ment. Il a été payé au lot 9 sur `/actions/sequences`.
 */

const chainOf = (key: string, steps: number): Chain =>
  ({
    key,
    label: { fr: key, en: key },
    purpose: { fr: 'finalité', en: 'purpose' },
    domain: 'acquisition',
    subjectType: 'account',
    steps: Array.from({ length: steps }, (_, index) => ({
      position: index + 1,
      label: { fr: `étape ${index + 1}`, en: `step ${index + 1}` },
      actor: 'user',
      expectedOutput: { fr: 'x', en: 'x' },
      automationLevel: 'n1_prepare',
      requiredCapability: null,
      outsideTool: false,
    })),
    gates: [],
    returnLoop: { fr: 'x', en: 'x' },
  }) as Chain

function lane(over: Partial<ChainLane> & { key: string }): ChainLane {
  const { key, ...rest } = over
  return {
    chain: chainOf(key, 3),
    positions: [
      { position: 1, count: 0, medianDaysAtPosition: null },
      { position: 2, count: 0, medianDaysAtPosition: null },
      { position: 3, count: 0, medianDaysAtPosition: null },
    ],
    gates: [],
    total: 0,
    awaitingDecision: 0,
    stalled: 0,
    ...rest,
  }
}

describe('needsAttention — un seul prédicat pour le compteur ET le filtre', () => {
  it('une décision en attente demande l’attention', () => {
    expect(needsAttention(lane({ key: 'a', total: 3, awaitingDecision: 1 }))).toBe(true)
  })

  it('un dossier sans mouvement AUSSI, même sans porte', () => {
    // Les deux causes ne se soignent pas pareil, mais les deux répondent à la
    // question de la page.
    expect(needsAttention(lane({ key: 'b', total: 3, stalled: 2 }))).toBe(true)
  })

  it('un parcours qui avance ne demande rien', () => {
    expect(needsAttention(lane({ key: 'c', total: 5 }))).toBe(false)
  })

  it('le COMPTEUR et le FILTRE tombent toujours d’accord', () => {
    const lanes = [
      lane({ key: 'a', total: 3, awaitingDecision: 1 }),
      lane({ key: 'b', total: 2, stalled: 2 }),
      lane({ key: 'c', total: 5 }),
      lane({ key: 'd' }),
    ]
    const filtered = lanes.filter(needsAttention)
    const counted = lanes.reduce((sum, entry) => sum + (needsAttention(entry) ? 1 : 0), 0)

    expect(counted).toBe(filtered.length)
    // ⚠️ La contre-épreuve : sans elle, ce test passerait sur un corpus vide,
    // où 0 === 0 est vrai et ne prouve rien.
    expect(filtered.length).toBe(2)
  })
})

describe('boardTotals — les chiffres de tête lisent les mêmes champs que les cartes', () => {
  it('additionne ce que les pistes portent', () => {
    const lanes = [
      lane({ key: 'a', total: 3, awaitingDecision: 1, stalled: 1 }),
      lane({ key: 'b', total: 2, awaitingDecision: 2 }),
    ]
    expect(boardTotals(lanes)).toEqual({ tracked: 5, awaitingDecision: 3, stalled: 1 })
  })
})

describe('slowestStep — une durée ne s’affiche que si elle est mesurée', () => {
  it('désigne l’étape dont l’attente médiane est la plus longue', () => {
    const lanes = [
      lane({
        key: 'a',
        total: 2,
        positions: [
          { position: 1, count: 1, medianDaysAtPosition: 2 },
          { position: 2, count: 1, medianDaysAtPosition: 8.4 },
          { position: 3, count: 0, medianDaysAtPosition: null },
        ],
      }),
    ]
    expect(slowestStep(lanes)).toMatchObject({ position: 2, days: 8.4 })
  })

  it('ignore une étape VIDE — « 0 jour » n’y est pas une attente courte', () => {
    // Sans ce filtre, une étape où personne ne se trouve gagnerait ou perdrait
    // le classement pour une raison fausse.
    const lanes = [
      lane({
        key: 'a',
        total: 1,
        positions: [
          { position: 1, count: 0, medianDaysAtPosition: 0 },
          { position: 2, count: 1, medianDaysAtPosition: 3 },
          { position: 3, count: 0, medianDaysAtPosition: null },
        ],
      }),
    ]
    expect(slowestStep(lanes)).toMatchObject({ position: 2, days: 3 })
  })

  it('rend `null` quand RIEN n’est mesurable — pas « 0 jour »', () => {
    // Un tableau de bord qui ne sait pas le dit. Il ne dit pas « tout va bien ».
    expect(slowestStep([lane({ key: 'a' })])).toBeNull()
    expect(slowestStep([])).toBeNull()
  })
})

/**
 * L'API PRÉCÉDENTE — le quart d'heure où le web est neuf et l'API ne l'est pas.
 *
 * Vercel sert le web en deux minutes, Railway sert l'API en dix. Entre les deux,
 * un écran neuf interroge l'ancienne API. Ce n'est pas une hypothèse : le
 * 05/09/2026, `/actions/chaines` est tombé sur « Oups » en production pendant
 * cette fenêtre, parce que `chain.purpose[locale]` s'évaluait sur `undefined`.
 *
 * Ces tests décrivent la charge utile de l'API PRÉCÉDENTE — sans `purpose`, sans
 * `medianDaysAtPosition`, sans `awaitingDecision`, sans `stalled` — et exigent
 * que rien ne rende `NaN` ni ne jette.
 */
describe('la charge utile de l’API précédente ne casse rien', () => {
  const legacy = {
    chain: { ...chainOf('a', 3), purpose: undefined },
    positions: [
      { position: 1, count: 0 },
      { position: 2, count: 1 },
      { position: 3, count: 0 },
    ],
    gates: [],
    total: 1,
  } as unknown as ChainLane

  it('les totaux valent des NOMBRES, jamais NaN', () => {
    const totals = boardTotals([legacy])
    expect(totals).toEqual({ tracked: 1, awaitingDecision: 0, stalled: 0 })
    // La contre-épreuve qui compte : `sum + undefined` vaut NaN, et « NaN
    // dossiers suivis » se serait affiché tel quel dans l'entête.
    expect(Object.values(totals).every(Number.isFinite)).toBe(true)
  })

  it('rien ne demande l’attention faute de mesure — et surtout, rien ne jette', () => {
    expect(() => needsAttention(legacy)).not.toThrow()
    expect(needsAttention(legacy)).toBe(false)
  })

  it('aucune étape n’est élue « la plus lente » sans durée servie', () => {
    // `undefined` n'est pas `null` : la garde d'origine ne testait que `null` et
    // aurait retenu une étape dont `days` valait `undefined`.
    expect(slowestStep([legacy])).toBeNull()
  })

  it('countOf ramène l’absence à zéro, et laisse passer un vrai zéro', () => {
    expect(countOf(undefined)).toBe(0)
    expect(countOf(0)).toBe(0)
    expect(countOf(7)).toBe(7)
  })
})
