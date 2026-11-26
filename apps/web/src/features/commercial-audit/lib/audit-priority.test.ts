import { describe, expect, it } from 'vitest'
import type { CommercialAuditContext } from '@bellum/contracts'
import { COMMERCIAL_AUDIT_CONTEXT_SCHEMA_VERSION } from '@bellum/contracts'
import { buildWeeklyPriority } from './audit-priority'

/** Même carcasse vide que `audit-verdict.test.ts` — un seul endroit qui la
 *  tape en dur aurait suffi, mais les deux fichiers testent des dérivations
 *  différentes et ne s'importent pas l'un l'autre (chacun teste une unité). */
function context(overrides: Partial<CommercialAuditContext> = {}): CommercialAuditContext {
  return {
    schemaVersion: COMMERCIAL_AUDIT_CONTEXT_SCHEMA_VERSION,
    generatedAt: null,
    profileContextVersion: null,
    scope: null,
    facts: null,
    unknowns: [],
    contradictions: [],
    assets: null,
    constraints: null,
    currentCommercialMachine: null,
    funnel: null,
    // #2042.15 → #2051.16 — aucune réponse du questionnaire lue dans CE test :
    // ni le verdict ni la priorité ne les consomment.
    declaredSignals: null,
    // #2067.2 / .4 / .5 / .6 — l'arbitrage de la charge active : ni le verdict
    // ni la priorité ne le consomment.
    activeLoad: null,
    breakpoints: null,
    maturity: null,
    strategicOptions: null,
    recommendedDirection: null,
    stopKeepReinforce: null,
    thirtyDayPlan: null,
    conditionalRoadmap: null,
    productPersonalization: null,
    questionsToRevisit: null,
    milestones: null,
    productConfiguration: null,
    ...overrides,
  }
}

describe('buildWeeklyPriority — #2090.31', () => {
  it('rend `null` sans rupture ni conseil — jamais une priorité inventée', () => {
    expect(buildWeeklyPriority(context())).toBeNull()
  })

  it('reprend la QUESTION À VALIDER de la première rupture — une action, pas un résumé', () => {
    const ctx = context({
      contradictions: [
        {
          ruleId: 'tooManySimultaneousMarkets',
          facts: [],
          tension: 'x',
          possibleExplanation: null,
          questionToValidate: 'Combien de secteurs comptes-tu vraiment travailler ce trimestre ?',
          consequenceIfUnaddressed: null,
          recommendation: 'y',
          indicator: 'z',
          confidence: 'deduced',
        },
      ],
    })
    expect(buildWeeklyPriority(ctx)).toEqual({
      action: 'Combien de secteurs comptes-tu vraiment travailler ce trimestre ?',
      ruleId: 'tooManySimultaneousMarkets',
      confidence: 'deduced',
    })
  })

  it('sans question à valider mais avec une rupture, retombe sur sa conséquence', () => {
    const ctx = context({
      contradictions: [
        {
          ruleId: 'offerWithoutProof',
          facts: [],
          tension: 'x',
          possibleExplanation: null,
          questionToValidate: null,
          consequenceIfUnaddressed: 'Un prospect qui challenge l’angle n’a rien à quoi se raccrocher.',
          recommendation: 'y',
          indicator: 'z',
          confidence: 'deduced',
        },
      ],
    })
    expect(buildWeeklyPriority(ctx)).toEqual({
      action: 'Un prospect qui challenge l’angle n’a rien à quoi se raccrocher.',
      ruleId: 'offerWithoutProof',
      confidence: 'deduced',
    })
  })

  it('sans rupture, retombe sur le dernier conseil de la colonne Renforcer (le conseil clé)', () => {
    const ctx = context({
      stopKeepReinforce: { stop: null, keep: null, reinforce: ['Le goulot', 'Rappeler les reprises datées'] },
    })
    expect(buildWeeklyPriority(ctx)).toEqual({
      action: 'Rappeler les reprises datées',
      ruleId: null,
      confidence: null,
    })
  })

  it('une colonne Renforcer VIDE (mesurée, sans rien à nommer) ne produit pas de priorité', () => {
    const ctx = context({ stopKeepReinforce: { stop: null, keep: null, reinforce: [] } })
    expect(buildWeeklyPriority(ctx)).toBeNull()
  })
})
