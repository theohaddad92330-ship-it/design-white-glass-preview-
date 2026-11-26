import { describe, expect, it } from 'vitest'
import { suggestedEffortLevelFor } from './discover-effort-suggestion'

/**
 * #3408.3 (beta 30/09/2026, #3408) — « permettre de produire une sélection
 * structurée : comptes Focus ; comptes Sprint ; partenaires possibles ;
 * comptes à surveiller ; comptes à écarter avec motif. »
 *
 * Découvrir range déjà chaque candidat dans une des QUATRE familles (tome 1
 * §8.4, `discoverFamily`) : hors de portée / via un intermédiaire / tu peux y
 * aller / à investiguer — visibles sur chaque carte (`FamilyBadge`), mais
 * jamais traduites dans le vocabulaire du board d'effort (`sprint.ts`) que le
 * retour demande. Ce module fait ce pont, sans inventer de nouvelle famille
 * ni de nouveau lexique (GA-26) — jamais `focus` ni `watch` : les deux
 * exigent une décision humaine que la seule famille ne fournit pas (un plan
 * de compte pour Focus, une condition de réveil pour Veille — voir
 * `sprintEntryProblems`/`sprintDecisionProblems`, `sprint.ts`), et
 * l'inventer serait la donnée fictive que la doctrine interdit.
 */
describe('#3408.3 — suggestedEffortLevelFor', () => {
  it('hors de portée ⇒ écarté (`no_go`), avec un motif exploitable (≥ 3 caractères)', () => {
    const suggestion = suggestedEffortLevelFor('out_of_reach')
    expect(suggestion.level).toBe('no_go')
    expect(suggestion.reasonKey).toBe('outOfReach')
  })

  it('via un intermédiaire ⇒ route partenaire (`partner_route`)', () => {
    expect(suggestedEffortLevelFor('via_intermediary').level).toBe('partner_route')
  })

  it('tu peux y aller ⇒ sprint court (`extension`) — pas `focus`, qui exige un plan de compte', () => {
    expect(suggestedEffortLevelFor('reachable').level).toBe('extension')
  })

  it('à investiguer ⇒ qualification au volume (`volume`)', () => {
    expect(suggestedEffortLevelFor('investigate').level).toBe('volume')
  })
})
