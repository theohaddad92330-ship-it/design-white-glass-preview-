import { auditHypothesesFrom, type CommercialTensionRuleId } from '@bellum/contracts'
import { DEMO_PROFILE_CONTEXT } from './demo-dataset'

/**
 * #2010.10 — LA PARITÉ DÉMO DU BLOC « HYPOTHÈSES À VÉRIFIER ».
 *
 * Même raison d'être que `demo-audit-first-moves-coverage.spec.ts` : le bloc
 * n'ajoute AUCUNE table et AUCUNE clé de `raw_analysis`, il dérive des MÊMES
 * ruptures que la carte des premiers mouvements (`AuditFirstMoves`), déjà
 * calculées sur {@link DEMO_PROFILE_CONTEXT}. `demo-coverage.spec.ts`, qui
 * raisonne au niveau TABLE, resterait donc verte même si la salle voyait
 * « aucune hypothèse » sous les recommandations. Une garde AVEUGLE n'est pas
 * une exemption.
 *
 * ⚠️ Ce que cette suite EXÉCUTE vraiment : `auditHypothesesFrom`, la
 * dérivation du contrat, sur les ruptures que le semis déclenche. Ce qu'elle
 * RÉIMPLÉMENTE : les deux conditions de déclenchement, lues sur les MÊMES
 * champs du semis — `tension-detectors.ts` vit dans `apps/web` et l'API ne
 * l'importe pas (même choix que `demo-audit-first-moves-coverage.spec.ts`).
 * `triggered()` (`tension-detectors.ts:120-148`) pose TOUJOURS un
 * `possibleExplanation` non nul sur une règle qui se déclenche : les deux
 * ruptures de ce semis en portent donc une, et la carte n'est jamais vide.
 */

/** Même seuil que `MAX_SIMULTANEOUS_MARKETS` (`tension-detectors.ts`, #2064.2). */
const MAX_SIMULTANEOUS_MARKETS = 3

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

/** La rupture, dans la forme minimale que `auditHypothesesFrom` lit — un
 *  `possibleExplanation` NON NUL, comme `triggered()` le pose toujours. */
function contradiction(ruleId: CommercialTensionRuleId) {
  return {
    ruleId,
    possibleExplanation: `Hypothèse pour la règle ${ruleId}`,
    questionToValidate: `Question à valider pour la règle ${ruleId}`,
    confidence: 'deduced' as const,
  }
}

describe('parité démo — les hypothèses à vérifier de l’audit commercial', () => {
  const rules = demoTriggeredRules()

  it('le semis déclenche bien DEUX ruptures — sinon le bloc serait vide en salle', () => {
    expect(rules).toEqual(['tooManySimultaneousMarkets', 'keyAccountsWithoutAccessPath'])
  })

  it('la salle voit DEUX hypothèses, une par rupture déclenchée', () => {
    const hypotheses = auditHypothesesFrom(rules.map(contradiction))
    expect(hypotheses).toHaveLength(2)
    expect(hypotheses.map(item => item.ruleId).sort()).toEqual(
      ['keyAccountsWithoutAccessPath', 'tooManySimultaneousMarkets'].sort(),
    )
  })

  it('chaque hypothèse de démonstration porte sa question à valider — jamais une affirmation nue', () => {
    for (const item of auditHypothesesFrom(rules.map(contradiction))) {
      expect(item.questionToValidate).not.toBeNull()
    }
  })
})
