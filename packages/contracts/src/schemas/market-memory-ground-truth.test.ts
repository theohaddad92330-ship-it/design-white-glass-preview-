import { describe, expect, it } from 'vitest'
import {
  MARKET_MEMORY_GROUND_TRUTH_LABELS,
  MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS,
  marketMemoryGroundTruthLabelSchema,
  marketMemoryGroundTruthJudgmentInputSchema,
  resolveMarketMemoryGroundTruthMetric,
} from './market-memory-ground-truth.js'

// #1622 — le test qui compte le plus dans ce lot est celui du corpus VIDE :
// aucune des six métriques ne doit jamais rendre un pourcentage tant que le
// nombre de jugements qualifiants reste sous le seuil nommé.
describe('resolveMarketMemoryGroundTruthMetric', () => {
  it('un corpus VIDE (0 jugement) ne rend jamais un pourcentage', () => {
    const result = resolveMarketMemoryGroundTruthMetric({ qualifying: 0, total: 0 })
    expect(result.status).toBe('insufficient_data')
    if (result.status === 'insufficient_data') {
      expect(result.judgmentsCount).toBe(0)
      expect(result.required).toBe(MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS)
    }
    // ⚠️ Le piège central du lot : 0 faux positif sur 0 jugement ne doit
    // JAMAIS se lire « 0 % — tout va bien ». Le type ne porte même pas de
    // `value` numérique dans cette branche : il est impossible d'en afficher
    // un par erreur.
    expect('value' in result).toBe(false)
  })

  it('juste sous le seuil (19 jugements) reste non mesuré', () => {
    const result = resolveMarketMemoryGroundTruthMetric({
      qualifying: 19,
      total: MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS - 1,
    })
    expect(result.status).toBe('insufficient_data')
  })

  it('au seuil exact (20 jugements), la métrique se mesure', () => {
    const result = resolveMarketMemoryGroundTruthMetric({
      qualifying: 5,
      total: MARKET_MEMORY_GROUND_TRUTH_MIN_JUDGMENTS,
    })
    expect(result).toEqual({ status: 'measured', value: 0.25, judgmentsCount: 20 })
  })

  it('au-dessus du seuil, la valeur est le ratio qualifiant/total, jamais dérivée par soustraction', () => {
    const result = resolveMarketMemoryGroundTruthMetric({ qualifying: 30, total: 40 })
    expect(result).toEqual({ status: 'measured', value: 0.75, judgmentsCount: 40 })
  })

  it('refuse un compte qualifiant qui dépasse le total (les comptes ne se déduisent jamais)', () => {
    expect(() => resolveMarketMemoryGroundTruthMetric({ qualifying: 21, total: 20 })).toThrow()
  })

  it('refuse un compte négatif', () => {
    expect(() => resolveMarketMemoryGroundTruthMetric({ qualifying: -1, total: 20 })).toThrow()
  })
})

describe('les six labels de la question ESN ↔ compte', () => {
  // Le retour qui les nomme est cité en commentaire, jamais dans le titre —
  // un numéro à quatre chiffres se lit comme une couleur hexadécimale.
  it('sont exactement les six du retour, dans cet ordre — GA-08 : jamais réordonnés', () => {
    expect(MARKET_MEMORY_GROUND_TRUTH_LABELS).toEqual([
      'useful_and_correct',
      'plausible',
      'misleading',
      'wrong_entity',
      'irrelevant',
      'unknown',
    ])
  })

  it('`unknown` est un label valide — un jugement humain, pas une absence de jugement', () => {
    expect(marketMemoryGroundTruthLabelSchema.safeParse('unknown').success).toBe(true)
  })

  it('rejette un label hors du vocabulaire fermé', () => {
    expect(marketMemoryGroundTruthLabelSchema.safeParse('correct').success).toBe(false)
    expect(marketMemoryGroundTruthLabelSchema.safeParse('').success).toBe(false)
  })
})

describe('marketMemoryGroundTruthJudgmentInputSchema', () => {
  const base = { accountName: 'Société Générale', esnName: 'Capgemini', label: 'useful_and_correct' as const }

  it('accepte un jugement minimal (compte + ESN + label)', () => {
    expect(marketMemoryGroundTruthJudgmentInputSchema.safeParse(base).success).toBe(true)
  })

  it("refuse un champ qui n'existe pas dans le contrat (`.strict()`) — jamais de note libre", () => {
    expect(marketMemoryGroundTruthJudgmentInputSchema.safeParse({ ...base, note: 'je pense que...' }).success).toBe(
      false,
    )
  })

  it('refuse un nom de compte vide', () => {
    expect(marketMemoryGroundTruthJudgmentInputSchema.safeParse({ ...base, accountName: '' }).success).toBe(false)
  })

  it('refuse un label absent du vocabulaire fermé', () => {
    expect(marketMemoryGroundTruthJudgmentInputSchema.safeParse({ ...base, label: 'correct_and_useful' }).success).toBe(
      false,
    )
  })
})
