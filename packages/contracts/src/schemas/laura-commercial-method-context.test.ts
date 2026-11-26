import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_EFFORT_LEVELS,
  COMMERCIAL_METHOD_ACTIONS,
  COMMERCIAL_METHOD_CONDITIONS,
  COMMERCIAL_METHOD_PROOFS,
  COMMERCIAL_OPENING_ROUTES,
  COMMERCIAL_TRAJECTORIES,
  COMMERCIAL_USEFUL_PEOPLE,
  chooseCommercialMethod,
  type CommercialMethodContext,
} from './commercial-method-engine.js'
import {
  LAURA_COMMERCIAL_METHOD_LABELS_FR,
  renderLauraCommercialMethodContext,
} from './laura-commercial-method-context.js'

// #3390.10/.11 — même entrée ⇒ même méthode côté écran (`method` de la réponse
// verdict, rendue par NeedVerdictBanner) et côté prompt de Laura.
const GO: CommercialMethodContext = {
  verdict: { verdict: 'go', blockingAxes: [], unmeasuredDecisiveAxes: [] },
  relationshipState: 'positive',
  accessState: 'positive',
  staffingState: 'positive',
  stale: false,
}
const NO_GO: CommercialMethodContext = {
  verdict: { verdict: 'no_go', blockingAxes: ['staffing_capacity'], unmeasuredDecisiveAxes: [] },
  relationshipState: 'attention',
  accessState: null,
  staffingState: 'blocking',
  stale: true,
}

describe('renderLauraCommercialMethodContext', () => {
  it('chaque valeur de chaque énumération du moteur a son libellé (aucun code brut au modèle)', () => {
    const l = LAURA_COMMERCIAL_METHOD_LABELS_FR
    for (const v of COMMERCIAL_EFFORT_LEVELS) expect(l.effortLevel[v]).toBeTruthy()
    for (const v of COMMERCIAL_OPENING_ROUTES) expect(l.openingRoute[v]).toBeTruthy()
    for (const v of COMMERCIAL_TRAJECTORIES) expect(l.trajectory[v]).toBeTruthy()
    for (const v of COMMERCIAL_USEFUL_PEOPLE) expect(l.usefulPeople[v]).toBeTruthy()
    for (const v of COMMERCIAL_METHOD_PROOFS) expect(l.proof[v]).toBeTruthy()
    for (const v of COMMERCIAL_METHOD_ACTIONS) expect(l.nextStep[v]).toBeTruthy()
    for (const v of COMMERCIAL_METHOD_CONDITIONS) {
      expect(l.switchCondition[v]).toBeTruthy()
      expect(l.stopCondition[v]).toBeTruthy()
    }
  })

  it('même entrée ⇒ même méthode : le texte porte les libellés de CE que chooseCommercialMethod rend', () => {
    for (const context of [GO, NO_GO]) {
      const method = chooseCommercialMethod(context)
      const text = renderLauraCommercialMethodContext({ method })
      const l = LAURA_COMMERCIAL_METHOD_LABELS_FR
      expect(text).toContain(l.effortLevel[method.effortLevel])
      expect(text).toContain(l.nextStep[method.nextStep])
      expect(text).toContain(l.switchCondition[method.switchCondition])
      expect(text).toContain(l.stopCondition[method.stopCondition])
      if (method.openingRoute) expect(text).toContain(l.openingRoute[method.openingRoute])
      if (method.trajectory) expect(text).toContain(l.trajectory[method.trajectory])
    }
  })

  it('deux entrées qui donnent deux méthodes donnent deux textes (le rendu ne lisse pas)', () => {
    expect(renderLauraCommercialMethodContext({ method: chooseCommercialMethod(GO) })).not.toBe(
      renderLauraCommercialMethodContext({ method: chooseCommercialMethod(NO_GO) }),
    )
  })

  it('pause_sortie : ni route d’ouverture ni trajectoire — aucune ligne vide', () => {
    const method = chooseCommercialMethod(NO_GO)
    expect(method.openingRoute).toBeNull()
    const text = renderLauraCommercialMethodContext({ method })
    expect(text).not.toContain("Route d'ouverture")
    expect(text).not.toContain('Trajectoire')
    expect(text).not.toMatch(/null|undefined/)
  })

  it('#3390.9b — la charge mesurée est NOMMÉE à côté de la méthode, sans seuil inventé', () => {
    const text = renderLauraCommercialMethodContext({
      method: chooseCommercialMethod(GO),
      commercialContext: { weeklyAvailableHours: 12, overdueActions: 4 },
    })
    expect(text).toContain('12 h par semaine')
    expect(text).toContain('4')
    expect(text).toMatch(/actions en retard/)
    // Information, jamais un verdict de saturation.
    expect(text).toMatch(/ne conclus pas à une saturation/i)
    expect(text).not.toMatch(/\d\s?%/)
  })

  it('#3390.9b — rien de mesuré ⇒ aucune ligne de charge, jamais « 0 »', () => {
    const base = renderLauraCommercialMethodContext({ method: chooseCommercialMethod(GO) })
    for (const commercialContext of [
      undefined,
      { weeklyAvailableHours: null, overdueActions: null },
      { weeklyAvailableHours: 0, overdueActions: 0 },
    ]) {
      const text = renderLauraCommercialMethodContext({ method: chooseCommercialMethod(GO), commercialContext })
      expect(text).toBe(base)
      expect(text).not.toMatch(/h par semaine|en retard/)
    }
  })

  it('aucun nom de fournisseur ni de personne : des libellés de rôles seulement', () => {
    const text = renderLauraCommercialMethodContext({ method: chooseCommercialMethod(GO) })
    expect(text).toMatch(/décideur|interlocuteur/)
  })
})
