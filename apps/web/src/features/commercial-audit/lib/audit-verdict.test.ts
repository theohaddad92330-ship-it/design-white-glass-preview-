import { describe, expect, it } from 'vitest'
import type { CommercialAuditContext } from '@bellum/contracts'
import { COMMERCIAL_AUDIT_CONTEXT_SCHEMA_VERSION } from '@bellum/contracts'
import { buildAuditVerdict } from './audit-verdict'

/**
 * #2090.12 / #2090.13 — UN VERDICT, PAS UN RÉSUMÉ.
 *
 * ⚠️ Le verdict se DÉRIVE de ce que le moteur a RÉELLEMENT mesuré — jamais une
 * phrase de remplissage. Sans rupture ET sans goulot mesuré, il n'y a PAS de
 * verdict : ce test garde cette absence, exactement comme le reste du
 * contrat refuse un « 0 » qui ne serait pas vrai.
 */

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

describe('buildAuditVerdict — rien à trancher n’invente rien', () => {
  it('rend `null` sans rupture ni goulot mesuré — jamais un verdict inventé', () => {
    expect(buildAuditVerdict(context())).toBeNull()
  })

  it('tranche sur la PREMIÈRE rupture déclenchée — la tension, puis sa conséquence', () => {
    const ctx = context({
      contradictions: [
        {
          ruleId: 'tooManySimultaneousMarkets',
          facts: ['4 secteurs nommés'],
          tension: 'Plus de 3 secteurs visés à la fois.',
          possibleExplanation: null,
          questionToValidate: null,
          consequenceIfUnaddressed: 'La prospection se disperse.',
          recommendation: 'y',
          indicator: 'z',
          confidence: 'deduced',
        },
      ],
    })
    const verdict = buildAuditVerdict(ctx)
    expect(verdict).toEqual({
      primary: 'Plus de 3 secteurs visés à la fois.',
      secondary: 'La prospection se disperse.',
      source: 'contradiction',
      ruleId: 'tooManySimultaneousMarkets',
      confidence: 'deduced',
    })
  })

  it('à défaut de rupture, retombe sur le goulot mesuré (`breakpoints`) — jamais un résumé générique', () => {
    const ctx = context({
      breakpoints: [
        {
          label: 'Goulot principal',
          detail: 'Les dossiers avancent sans responsable',
          provenance: null,
          confidence: null,
        },
      ],
    })
    expect(buildAuditVerdict(ctx)).toEqual({
      primary: 'Les dossiers avancent sans responsable',
      secondary: null,
      source: 'breakpoint',
      ruleId: null,
      confidence: null,
    })
  })

  it('une rupture prime sur un goulot — la rupture est la lecture la plus récente et la plus précise', () => {
    const ctx = context({
      contradictions: [
        {
          ruleId: 'offerWithoutProof',
          facts: [],
          tension: 'Une offre affirmée sans preuve.',
          possibleExplanation: null,
          questionToValidate: null,
          consequenceIfUnaddressed: null,
          recommendation: 'y',
          indicator: 'z',
          confidence: 'deduced',
        },
      ],
      breakpoints: [{ label: 'Goulot principal', detail: 'Autre chose', provenance: null, confidence: null }],
    })
    expect(buildAuditVerdict(ctx)?.source).toBe('contradiction')
  })
})
