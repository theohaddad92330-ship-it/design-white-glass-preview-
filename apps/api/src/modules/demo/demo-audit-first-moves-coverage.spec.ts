import {
  AUDIT_MOVE_KIND_BY_RULE,
  MAX_AUDIT_MOVES,
  auditMovesFrom,
  type CommercialTensionRuleId,
} from '@bellum/contracts'
import { DEMO_PROFILE_CONTEXT } from './demo-dataset'

/**
 * #2074.10-.15 / #2090.7 — LA PARITÉ DÉMO DES « PREMIERS MOUVEMENTS ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ALORS QUE `demo-coverage.spec.ts` EST VERTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La carte des premiers mouvements n'ajoute AUCUNE table et AUCUNE clé de
 * `raw_analysis` : elle dérive des ruptures déjà calculées sur
 * {@link DEMO_PROFILE_CONTEXT}. `demo-coverage.spec.ts`, qui raisonne au niveau
 * TABLE, resterait donc verte même si la salle voyait « aucun mouvement ne peut
 * être proposé » en bas de l'audit. Une garde AVEUGLE n'est pas une exemption.
 *
 * ⚠️ Ce que cette suite EXÉCUTE vraiment : `auditMovesFrom`, la dérivation du
 * contrat, sur les ruptures que le semis déclenche. Ce qu'elle RÉIMPLÉMENTE :
 * les deux conditions de déclenchement, lues sur les MÊMES champs du semis —
 * `tension-detectors.ts` vit dans `apps/web` et l'API ne l'importe pas
 * (périmètre du dépôt, même choix que `demo-hero-state-coverage.spec.ts`).
 * Vider `target_sectors` ou ramener `size` à autre chose que `all` fait donc
 * rougir ce fichier en NOMMANT la règle qui ne se déclenche plus.
 */

/** Même seuil que `MAX_SIMULTANEOUS_MARKETS` (`tension-detectors.ts`, #2064.2). */
const MAX_SIMULTANEOUS_MARKETS = 3

/**
 * Les ruptures que le semis déclenche, recalculées ici sur ses propres champs.
 * Deux seulement : les seize autres règles lisent une réalité opérationnelle
 * (vivier, besoins, partenaires, appels d'offres, missions) que ce jeu ne
 * porte pas, et elles restent honnêtement `unknown` en démonstration comme en
 * production — identique des deux côtés.
 */
function demoTriggeredRules(): CommercialTensionRuleId[] {
  const ideal = DEMO_PROFILE_CONTEXT.idealAccountProfile
  if (!ideal) return []
  const rules: CommercialTensionRuleId[] = []
  const sectors = ideal.sectorsPriority.map(sector => sector.trim()).filter(sector => sector.length > 0)
  if (sectors.length > MAX_SIMULTANEOUS_MARKETS) rules.push('tooManySimultaneousMarkets')
  if ((ideal.size === 'grandCompte' || ideal.size === 'all') && ideal.entryStrategy === 'bottomUp') {
    rules.push('keyAccountsWithoutAccessPath')
  }
  return rules
}

/** La rupture, dans la forme minimale que `auditMovesFrom` lit. */
function contradiction(ruleId: CommercialTensionRuleId) {
  return {
    ruleId,
    recommendation: `Geste recommandé par la règle ${ruleId}`,
    tension: `Tension mesurée par la règle ${ruleId}`,
    indicator: `Indicateur suivi pour la règle ${ruleId}`,
    confidence: 'single_source' as const,
  }
}

describe('parité démo — les premiers mouvements de l’audit commercial', () => {
  const rules = demoTriggeredRules()

  it('le semis déclenche bien DEUX ruptures — sinon la carte serait vide en salle', () => {
    expect(rules).toEqual(['tooManySimultaneousMarkets', 'keyAccountsWithoutAccessPath'])
  })

  it('la salle voit DEUX mouvements, de deux genres DIFFÉRENTS', () => {
    const moves = auditMovesFrom(rules.map(contradiction))
    expect(moves).toHaveLength(2)
    expect(new Set(moves.map(move => move.kind)).size).toBe(2)
    expect(moves.map(move => move.kind).sort()).toEqual(['ouverture', 'pilotage'])
  })

  it('aucun mouvement de démonstration n’est présenté comme déjà créé', () => {
    for (const move of auditMovesFrom(rules.map(contradiction))) expect(move.status).toBe('propose')
  })

  it('le TROISIÈME genre reste absent, et c’est mesuré, pas oublié', () => {
    // Aucune des huit règles `engagement` ne se déclenche sur ce semis : elles
    // lisent toutes une réalité opérationnelle (contacts relancés, entretiens,
    // missions, viviers) que `DEMO_PROFILE_CONTEXT` ne porte pas. La carte
    // montre donc deux mouvements sur trois possibles — jamais un troisième
    // inventé pour remplir la ligne, et jamais un taux « 2/3 » (GA-259).
    const engagement = rules.filter(ruleId => AUDIT_MOVE_KIND_BY_RULE[ruleId] === 'engagement')
    expect(engagement).toEqual([])
    expect(auditMovesFrom(rules.map(contradiction)).length).toBeLessThan(MAX_AUDIT_MOVES)
  })
})
