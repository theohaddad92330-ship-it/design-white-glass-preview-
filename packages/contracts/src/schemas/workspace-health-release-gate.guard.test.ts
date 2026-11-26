import { describe, expect, it } from 'vitest'
import {
  computeWorkspaceHealth,
  HEALTH_AXES,
  HEALTH_WEIGHTS,
  type HealthAxis,
  type HealthInput,
} from './workspace-health.js'

/**
 * GA — RELEASE GATE DAILY OS : le score de santé d'espace ne perd jamais une
 * dimension, et une dimension non évaluable n'est jamais comptée zéro.
 *
 * #2977 / #2406.37 — « GO RELEASE : bloc livré seulement après release gate
 * multi-profils ». `git grep -i 'release.gate|releaseGate|goRelease'`
 * rendait 0 résultat avant cette garde (registre `.claude/notes/registre-
 * 2026-09-17-lau-120-2406.md`, ligne 2406.37) : le mécanisme de blocage
 * n'existait pas, seul le calcul existait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX FAÇONS DE CASSER LE SCORE SANS QUE `computeWorkspaceHealth` MENTE
 * ─────────────────────────────────────────────────────────────────────────
 *  1. **Une dimension disparaît du calcul** — retirée de `HEALTH_AXES`,
 *     dupliquée sur la place d'une autre, ou neutralisée par un poids à 0
 *     (mathématiquement identique à une absence : elle ne peut plus jamais
 *     peser dans le score ni dans la cause principale).
 *  2. **Un axe non évaluable est compté zéro** — le bug d'un `?? 0` écrit à
 *     la place d'une exclusion du dénominateur. Le score baisse alors comme
 *     si l'espace avait échoué sur cet axe, alors qu'on n'a simplement rien
 *     mesuré (exactement l'axe « consommation de crédits » cassé une fois
 *     déjà, `agent_docs/chantiers-livres.md` ligne 470).
 *
 * Trois preuves exigées par la doctrine (« une garde protège une règle, elle
 * ne l'invente pas ») : elle LIT le vrai barème, elle sait dire NON sur une
 * fixture synthétique cassée des DEUX façons, et elle n'accuse pas un barème
 * complet simplement réordonné.
 */

const CANONICAL_DIMENSION_COUNT = 9

/** Vraie sur un barème qui a perdu une dimension — absente du tableau,
 *  dupliquée en silence sur la place d'une autre, ou neutralisée à 0. */
function dimensionMissing(axes: readonly string[], weights: Readonly<Record<string, number>>): boolean {
  if (axes.length !== CANONICAL_DIMENSION_COUNT) return true
  if (new Set(axes).size !== axes.length) return true
  return axes.some(axis => !(axis in weights) || (weights[axis] ?? 0) <= 0)
}

/**
 * Vraie si `compute` traite une dimension non évaluable comme un zéro mesuré.
 *
 * Méthode : partir d'un espace parfait (tous les axes à 1), puis comparer le
 * score obtenu en fixant UN axe à `0` (mesuré, mauvais) contre celui obtenu
 * en le fixant à `null` (non mesuré). Sur un calcul juste, `null` retire
 * l'axe du dénominateur — le score reste à 100 — tandis que `0` le fait
 * baisser : les deux DOIVENT différer. S'ils sont égaux, `null` a été traité
 * exactement comme `0`.
 */
function treatsUnmeasuredAsZero(
  compute: (input: HealthInput) => { score: number | null },
  axes: readonly HealthAxis[],
  axis: HealthAxis,
): boolean {
  const perfect = Object.fromEntries(axes.map(a => [a, 1])) as HealthInput
  const withMeasuredZero = compute({ ...perfect, [axis]: 0 })
  const withUnmeasured = compute({ ...perfect, [axis]: null })
  return withMeasuredZero.score === withUnmeasured.score
}

describe('GA — release gate Daily OS : le barème lit encore les neuf dimensions', () => {
  it('LIT le vrai barème — neuf dimensions, chacune pesée', () => {
    expect(HEALTH_AXES.length).toBe(CANONICAL_DIMENSION_COUNT)
    expect(dimensionMissing(HEALTH_AXES, HEALTH_WEIGHTS)).toBe(false)
  })

  it('sait dire NON — dimension retirée du tableau (fixture synthétique)', () => {
    const axesSansConnecteurs = HEALTH_AXES.filter(a => a !== 'connectors')
    expect(dimensionMissing(axesSansConnecteurs, HEALTH_WEIGHTS)).toBe(true)
  })

  it('sait dire NON — dimension neutralisée à poids zéro (fixture synthétique)', () => {
    const poidsNeutralise = { ...HEALTH_WEIGHTS, connectors: 0 }
    expect(dimensionMissing(HEALTH_AXES, poidsNeutralise)).toBe(true)
  })

  it('sait dire NON — dimension dupliquée en silence sur la place d’une autre', () => {
    const axesDupliques = HEALTH_AXES.map(a => (a === 'connectors' ? 'activation' : a))
    expect(dimensionMissing(axesDupliques, HEALTH_WEIGHTS)).toBe(true)
  })

  it('n’accuse PAS un barème complet simplement réordonné', () => {
    const reordonne = [...HEALTH_AXES].reverse()
    expect(dimensionMissing(reordonne, HEALTH_WEIGHTS)).toBe(false)
  })
})

describe('GA — release gate Daily OS : « non évaluable » n’est jamais compté zéro', () => {
  it.each(HEALTH_AXES)('%s — le VRAI calcul ne le compte pas zéro', axis => {
    expect(treatsUnmeasuredAsZero(computeWorkspaceHealth, HEALTH_AXES, axis)).toBe(false)
  })

  it('sait dire NON sur un calcul cassé par un `?? 0` (fixture synthétique)', () => {
    // La régression exacte que cette garde existe pour empêcher : rapporter
    // au total des poids FIXE plutôt qu'aux poids réellement évalués, et
    // traiter `null` comme `0` dans la somme des points gagnés.
    const casse = (input: HealthInput): { score: number | null } => {
      const total = HEALTH_AXES.reduce((sum, a) => sum + HEALTH_WEIGHTS[a], 0)
      const gagne = HEALTH_AXES.reduce((sum, a) => sum + HEALTH_WEIGHTS[a] * (input[a] ?? 0), 0)
      return { score: Math.round((gagne / total) * 100) }
    }
    expect(treatsUnmeasuredAsZero(casse, HEALTH_AXES, 'connectors')).toBe(true)
  })
})
