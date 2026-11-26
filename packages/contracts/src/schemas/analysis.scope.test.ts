import { describe, expect, it } from 'vitest'
import {
  analysisScopeSelectionSchema,
  estimateAnalysisCredits,
  estimateRunCredits,
  isScopeSelectionEmpty,
} from './analysis.js'

// Théo B r1-recherche.N1 — plusieurs objectifs pour UNE analyse.
describe('objectifs multiples du cadrage', () => {
  it('accepte une liste d’objectifs de la table fermée, sans doublon', () => {
    const parsed = analysisScopeSelectionSchema.parse({ objectives: ['open_account', 'find_decision_makers'] })
    expect(parsed.objectives).toEqual(['open_account', 'find_decision_makers'])
    expect(analysisScopeSelectionSchema.safeParse({ objectives: ['open_account', 'open_account'] }).success).toBe(false)
  })

  it('refuse un objectif hors table', () => {
    expect(analysisScopeSelectionSchema.safeParse({ objectives: ['vendre_tout'] }).success).toBe(false)
  })

  it('un cadrage réduit aux objectifs n’est pas vide', () => {
    expect(isScopeSelectionEmpty({ objectives: ['prepare_meeting'] })).toBe(false)
    expect(isScopeSelectionEmpty({ objectives: [] })).toBe(true)
  })
})

describe('angle du cadrage (« Ton angle, en une phrase »)', () => {
  it('accepte une phrase, la nettoie, et refuse un roman', () => {
    expect(analysisScopeSelectionSchema.parse({ angle: '  Placer deux profils Data  ' }).angle).toBe(
      'Placer deux profils Data',
    )
    expect(analysisScopeSelectionSchema.safeParse({ angle: 'x'.repeat(301) }).success).toBe(false)
  })

  it('un cadrage réduit à l’angle n’est pas vide', () => {
    expect(isScopeSelectionEmpty({ angle: 'Qui décide sur la Data à Lyon ?' })).toBe(false)
  })
})

describe('cadrage structuré avant le lancement (§18)', () => {
  it('accepte les cinq dimensions que le rapport demande', () => {
    const parsed = analysisScopeSelectionSchema.parse({
      legal_perimeter: 'group',
      geo_perimeter: 'france',
      business_families: ['Data', 'Infra'],
      hierarchy_levels: ['n1', 'n2'],
      run_mode: 'full',
    })
    expect(parsed.hierarchy_levels).toEqual(['n1', 'n2'])
  })

  it('un cadrage réduit à UNE dimension n’est pas vide', () => {
    // C'est le mode de défaillance à éviter : un cadrage jeté avant d'atteindre
    // le run laisse l'utilisateur voir son choix accepté puis introuvable dans
    // le résultat, sans jamais rien qui explique la disparition.
    expect(isScopeSelectionEmpty({ geo_perimeter: 'france' })).toBe(false)
    expect(isScopeSelectionEmpty({ hierarchy_levels: ['n2'] })).toBe(false)
    expect(isScopeSelectionEmpty({ run_mode: 'refresh' })).toBe(false)
    expect(isScopeSelectionEmpty({})).toBe(true)
    expect(isScopeSelectionEmpty(null)).toBe(true)
  })

  it('le coût suit le MODE, pas le périmètre', () => {
    // Le périmètre change ce qu'on collecte, le mode ce qu'on produit. Un
    // dossier complet et une actualisation ne peuvent pas coûter pareil.
    expect(estimateRunCredits({ run_mode: 'full' })).toBe(10)
    expect(estimateRunCredits({ run_mode: 'refresh' })).toBe(4)
    expect(estimateRunCredits({ run_mode: 'signals' })).toBe(1)
    // Absent ⇒ dossier complet, le prix plein. Jamais le prix plancher : une
    // requête sans mode ne doit pas offrir un dossier à un huitième du coût.
    expect(estimateRunCredits(undefined)).toBe(10)
    expect(estimateRunCredits({})).toBe(10)
  })

  // Louis 10/10 — sans palier choisi le prix est celui d'« Approfondie » (10), plus l'ancien 8.
  // #2163.76 — ce qui est EXCLU réduit le prix ANNONCÉ (`ScopeConfirmPanel.tsx`),
  // le même compte que celui débité (`resolveAnalysisCost`, credits.service.ts).
  it('#2163.76 — un crédit de moins par entité écartée, jamais gratuit', () => {
    expect(estimateAnalysisCredits('groupe', 0)).toBe(10)
    expect(estimateAnalysisCredits('groupe', 3)).toBe(7)
    expect(estimateAnalysisCredits('groupe', 30)).toBe(1)
  })

  it('#2163.76 — excludedCount omis reste byte-identique à avant ce paramètre', () => {
    expect(estimateAnalysisCredits('groupe')).toBe(10)
    expect(estimateAnalysisCredits(undefined)).toBe(10)
  })

  it('refuse un niveau hiérarchique inventé', () => {
    expect(() => analysisScopeSelectionSchema.parse({ hierarchy_levels: ['ceo'] })).toThrow()
  })

  // #2624.1 — la taille n'avait AUCUN champ nulle part (ni web, ni API, ni IA).
  it('accepte un critère d’effectif (headcount_min / headcount_max)', () => {
    const parsed = analysisScopeSelectionSchema.parse({ headcount_min: 50, headcount_max: 999 })
    expect(parsed.headcount_min).toBe(50)
    expect(parsed.headcount_max).toBe(999)
    expect(isScopeSelectionEmpty({ headcount_min: 50 })).toBe(false)
    expect(isScopeSelectionEmpty({ headcount_max: 999 })).toBe(false)
  })

  it('refuse un effectif négatif ou non entier', () => {
    expect(() => analysisScopeSelectionSchema.parse({ headcount_min: -1 })).toThrow()
    expect(() => analysisScopeSelectionSchema.parse({ headcount_max: 1.5 })).toThrow()
  })
})
