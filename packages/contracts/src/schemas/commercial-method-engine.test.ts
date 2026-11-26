import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_EFFORT_LEVELS,
  COMMERCIAL_OPENING_ROUTES,
  COMMERCIAL_TRAJECTORIES,
  chooseCommercialMethod,
  type CommercialMethodContext,
} from './commercial-method-engine.js'

/**
 * Un contexte « GO, tout va bien » — chaque test n'en change qu'UNE chose,
 * même patron que `need-verdict.test.ts` (`allGreen`).
 */
function baseContext(): CommercialMethodContext {
  return {
    verdict: { verdict: 'go', blockingAxes: [], unmeasuredDecisiveAxes: [] },
    relationshipState: 'positive',
    accessState: 'positive',
    staffingState: 'positive',
    stale: false,
  }
}

describe('chooseCommercialMethod', () => {
  it('NO-GO : on arrête, aucune route ni trajectoire — seule une correction humaine rouvre', () => {
    const method = chooseCommercialMethod({
      ...baseContext(),
      verdict: { verdict: 'no_go', blockingAxes: ['economics'], unmeasuredDecisiveAxes: [] },
    })
    expect(method.effortLevel).toBe('pause_sortie')
    expect(method.openingRoute).toBeNull()
    expect(method.trajectory).toBeNull()
    expect(method.usefulPeople).toEqual([])
    expect(method.nextStep).toBe('reconsider')
    expect(method.switchCondition).toBe('on_human_reopens')
    expect(method.stopCondition).toBe('already_met')
  })

  it('À QUALIFIER (insufficient_data) : l’effort va à la qualification, jamais au message client', () => {
    const method = chooseCommercialMethod({
      ...baseContext(),
      verdict: { verdict: 'insufficient_data', blockingAxes: [], unmeasuredDecisiveAxes: ['economics'] },
    })
    expect(method.effortLevel).toBe('qualification_volume')
    expect(method.requiredProof).toBe('qualification')
    expect(method.nextStep).toBe('qualify')
    expect(method.switchCondition).toBe('on_qualification_complete')
    expect(method.stopCondition).toBe('on_verdict_no_go')
  })

  it('décideur inconnu : la trajectoire passe par le terrain, pas par le haut', () => {
    const method = chooseCommercialMethod({
      ...baseContext(),
      verdict: { verdict: 'insufficient_data', blockingAxes: [], unmeasuredDecisiveAxes: ['economics'] },
      accessState: 'attention',
    })
    expect(method.trajectory).toBe('par_le_terrain')
    expect(method.usefulPeople).toContain('decision_maker')
    expect(method.usefulPeople).toContain('current_contact')
  })

  it('décideur connu : la trajectoire passe par le haut, la personne utile est le décideur', () => {
    const method = chooseCommercialMethod(baseContext())
    expect(method.trajectory).toBe('par_le_haut')
    expect(method.usefulPeople).toEqual(['decision_maker'])
  })

  it('GO mais capacité à staffer bloquante : sprint court, la preuve requise est la shortlist', () => {
    const method = chooseCommercialMethod({ ...baseContext(), staffingState: 'blocking' })
    expect(method.effortLevel).toBe('sprint_court')
    expect(method.requiredProof).toBe('shortlist')
    expect(method.nextStep).toBe('widen_sourcing')
  })

  it('GO, capacité ok, besoin stagnant : focus — c’est le geste qui débloque un besoin qui traîne', () => {
    const method = chooseCommercialMethod({ ...baseContext(), stale: true })
    expect(method.effortLevel).toBe('focus')
    expect(method.nextStep).toBe('build_shortlist')
    expect(method.stopCondition).toBe('on_client_silence')
  })

  it('client déjà connu (relation positive) : réactivation chaude plutôt qu’approche directe', () => {
    const method = chooseCommercialMethod(baseContext())
    expect(method.openingRoute).toBe('reactivation_chaude')
  })

  it('logo neuf (relation non positive) : approche directe ciblée', () => {
    const method = chooseCommercialMethod({ ...baseContext(), relationshipState: 'attention' })
    expect(method.openingRoute).toBe('approche_directe_ciblee')
  })

  it('les trois catalogues restent fermés et nommés, jamais un nombre', () => {
    expect([...COMMERCIAL_EFFORT_LEVELS]).toEqual([
      'focus',
      'sprint_court',
      'qualification_volume',
      'partenaire_rang2',
      'veille',
      'pause_sortie',
    ])
    expect([...COMMERCIAL_OPENING_ROUTES]).toEqual([
      'reactivation_chaude',
      'approche_directe_ciblee',
      'partenaire_rang2',
    ])
    expect([...COMMERCIAL_TRAJECTORIES]).toEqual([
      'par_le_haut',
      'par_le_terrain',
      'manager_intermediaire',
      'parallele_relais_sponsor',
    ])
  })
})
