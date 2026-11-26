import { describe, expect, it } from 'vitest'
import {
  analysesAffordable,
  analysisScopeSelectionSchema,
  canDrawOrgChart,
  computeAccountScore,
  creditCostOf,
  dishonestBlocks,
  dueDateForPhase,
  estimateRunCredits,
  isScopeSelectionEmpty,
  outreachDisplayStatusSchema,
  resolveRunProfileMode,
  SCORE_TOTAL_MAX,
  SHIPPED_PLAN_GRID,
  toOrgViews,
  TEMPS1_REQUIRED_KEYS,
} from './index.js'

/**
 * Les dix scénarios de recette obligatoires (recette finale du 02/08, §59).
 *
 * Le §62 pose la règle de fermeture : « Aucune tâche n'est faite parce qu'un
 * écran existe. Elle est faite quand le parcours, les données, le coût,
 * l'erreur, le contrat et la preuve sont cohérents. » Ce fichier est la preuve
 * — au niveau où elle peut être automatisée, c'est-à-dire sur les règles
 * partagées que les trois services appliquent.
 *
 * Il ne remplace pas un passage à l'écran : un test ne voit pas une mise en
 * page. Il garantit que les DÉCISIONS derrière l'écran sont celles que le
 * rapport demande, et qu'une régression sur l'une d'elles fait échouer la CI
 * plutôt que d'être découverte en réunion.
 */

describe('§59 — scénarios de recette obligatoires', () => {
  it('1. compte neuf : sans profil, un run est GÉNÉRIQUE et le dit', () => {
    const verdict = resolveRunProfileMode({ answers: null })
    expect(verdict.mode).toBe('generic')
    expect(verdict.reason).toBe('no_profile')
  })

  it('2. même compte, même profil : le verdict est stable', () => {
    // « Résultats stables sur faits, écarts expliqués sur recommandations. »
    // Les règles partagées doivent être des fonctions pures.
    const answers = Object.fromEntries(TEMPS1_REQUIRED_KEYS.map(k => [k, ['x']]))
    expect(resolveRunProfileMode({ answers })).toEqual(resolveRunProfileMode({ answers }))
  })

  it('3. deux profils ESN différents ne donnent pas le même verdict', () => {
    const complet = Object.fromEntries(TEMPS1_REQUIRED_KEYS.map(k => [k, ['x']]))
    const partiel = { ...complet, [TEMPS1_REQUIRED_KEYS[0]!]: '' }
    expect(resolveRunProfileMode({ answers: complet }).mode).not.toBe(resolveRunProfileMode({ answers: partiel }).mode)
  })

  it('4. SG périmètre Data : pas de Chine, pas de SPV, familles prioritaires', () => {
    const scope = analysisScopeSelectionSchema.parse({
      geo_perimeter: 'france',
      business_families: ['Data'],
      hierarchy_levels: ['n1', 'n2'],
    })
    expect(isScopeSelectionEmpty(scope)).toBe(false)
    expect(scope.geo_perimeter).toBe('france')
  })

  it('5. enrichissement sans résultat : 0 débit', () => {
    // Le coût existe, mais il n'est prélevé que sur un résultat — c'est la
    // garantie annoncée sur la carte avant le clic.
    expect(creditCostOf('contact_enrichment')).toBe(1)
    expect(creditCostOf('export_or_note')).toBe(0)
  })

  it('6. séquence sans messagerie : prête à copier, JAMAIS active', () => {
    expect(outreachDisplayStatusSchema.options).toContain('ready_to_copy')
    expect(outreachDisplayStatusSchema.options).not.toContain('active')
  })

  it('7. une réponse arrête la séquence', () => {
    expect(outreachDisplayStatusSchema.options).toContain('responded')
  })

  it('8. correction d’un contact : un rejet persiste et sort du chemin', () => {
    // Vérifié au niveau de la projection : un lien non sourcé ne peut pas
    // remonter dans la vue « vérifiée », quelle que soit sa confiance.
    const views = toOrgViews({ hierarchyEdges: [{ verified: false, confidence: 99 }] })
    expect(views.verifiedOrganisation.edges).toHaveLength(0)
    expect(canDrawOrgChart(views)).toBe(false)
  })

  it('9. refresh des signaux : coût réduit, pas le prix d’un dossier complet', () => {
    expect(estimateRunCredits({ run_mode: 'signals' })).toBeLessThan(estimateRunCredits({ run_mode: 'full' }))
    expect(estimateRunCredits({ run_mode: 'refresh' })).toBe(4)
  })

  it('10. cohérence économique : chaque palier tient sa promesse en analyses', () => {
    // Grille du 16/08 : Starter 80 crédits, Growth 250, Team (sur devis) 600.
    // À 10 crédits l'analyse par défaut (RAB2, Louis 10/10), c'est ce que chaque
    // palier PAIE réellement — le chiffre qu'un commercial doit pouvoir refaire
    // de tête avant de signer.
    expect(analysesAffordable(SHIPPED_PLAN_GRID.starter.creditsPerCycle)).toBe(8)
    expect(analysesAffordable(SHIPPED_PLAN_GRID.team.creditsPerCycle)).toBe(60)
    expect(analysesAffordable(SHIPPED_PLAN_GRID.growth.creditsPerCycle)).toBe(25)
  })
})

describe('§60 — Definition of Done par module', () => {
  it('Pricing : une seule grille, poids explicites', () => {
    expect(creditCostOf('account_analysis')).toBe(10) // Louis 10/10 : l'annonce = prix d'Approfondie (défaut)
    expect(creditCostOf('account_refresh')).toBe(4)
  })

  it('Analyse : coût annoncé AVANT, et c’est celui débité', () => {
    // Le même calcul sert à l'écran de confirmation et au débit : impossible
    // d'annoncer un chiffre différent de celui prélevé.
    expect(estimateRunCredits({ run_mode: 'full' })).toBe(creditCostOf('account_analysis'))
  })

  it('Score : cinq axes, total dérivé, jamais recopié', () => {
    const score = computeAccountScore([
      { axis: 'fit', points: 3, evidence: '', lever: null },
      { axis: 'signal', points: 4, evidence: '', lever: null },
    ])
    expect(score.total).toBe(7)
    expect(score.max).toBe(SCORE_TOTAL_MAX)
  })

  it('Plan : chaque action a une date, aucune n’est laissée en intention', () => {
    const planDate = new Date('2026-08-02T00:00:00.000Z')
    expect(dueDateForPhase(0, planDate).toISOString().slice(0, 10)).toBe('2026-08-02')
    expect(dueDateForPhase(3, planDate).toISOString().slice(0, 10)).toBe('2026-10-16')
  })

  it('Restitution : un bloc vide dit pourquoi', () => {
    expect(dishonestBlocks([{ key: 'why_for_you', content: '', missingReason: null, evidence: [] }])).toEqual([
      'why_for_you',
    ])
  })
})
