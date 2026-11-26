import { describe, expect, it } from 'vitest'
import {
  accountArchetypeSchema,
  esnRevenueModelSchema,
  esnStageSchema,
  esnProfileContextSchema,
  relationshipStateSchema,
  salesContextSchema,
  salesDerivationSchema,
  salesRuleCitationSchema,
  type SalesContext,
} from './sales-context.js'

/** A minimal, fully-valid SalesContext: a small ESN (founder-led, rang2), a PME/ETI
 *  account inferred from a couple of signals, and a cold relationship — the exact
 *  (profil+stade) × (archétype) × (relation) triple the thesis (p2/p17) demands. */
const validContext = (): SalesContext =>
  salesContextSchema.parse({
    salesContextVersion: 1,
    esnProfile: {
      stage: 'petite',
      businessModel: { rankPosition: 'rang2', staffingModel: 'regie', marginBand: 'moyen', tjmBand: 'moyen' },
      capacity: { benchAvailable: 'haut', deliveryCapacity: 'moyen', seniorityBand: 'moyen' },
      gtm: { model: 'founder_led', channels: ['linkedin'], salesTeamSize: 1 },
      references: { sectors: ['retail'], clients: ['ACME'], cases: ['migration ERP'] },
      tools: ['hubspot'],
    },
    account: {
      archetype: 'pme_eti',
      derivation: 'inferred',
      confidence: 72,
      evidence: ['NAF 62.02A', 'effectif ~250', 'ETI mono-entité'],
    },
    relationship: {
      state: 'froid',
      derivation: 'inferred',
      confidence: 80,
      evidence: ['commercial_status=prospect', 'aucune interaction CRM'],
    },
  })

describe('SalesContext — enums (Théo taxonomy)', () => {
  it('reconciles the 2 diverging size scales into ONE esnStage (p3)', () => {
    expect(esnStageSchema.options).toEqual(['freelance', 'petite', 'structuration', 'etablie', 'grande'])
  })
  it('carries the net-new account archetypes incl. média + international (p5)', () => {
    expect(accountArchetypeSchema.options).toEqual([
      'startup',
      'pme_eti',
      'grand_groupe',
      'banque_assurance',
      'public',
      'luxe_retail_media',
      'industrie',
      'international',
      'inconnu',
    ])
  })
  it('carries the account-level relationship taxonomy (TABLE B, p6)', () => {
    expect(relationshipStateSchema.options).toEqual([
      'froid',
      'connu',
      'linkedin',
      'dormant',
      'refere',
      'ancien_client',
      'rang2',
      'client_actif',
      'besoin_ouvert',
      // #2371.4 (#2887) — le 10e stade, une ESN partenaire avec des placements en cours.
      'partenaire_actif',
    ])
  })
  it('carries the 4 provenance kinds', () => {
    expect(salesDerivationSchema.options).toEqual(['user_declared', 'user_override', 'inferred', 'default'])
  })
})

describe('SalesContext — valid shape & defaults', () => {
  it('parses a fully-specified context', () => {
    expect(() => validContext()).not.toThrow()
  })

  it('fills esnProfile sub-objects with defaults from just a stage (capturé ≠ consommé)', () => {
    const p = esnProfileContextSchema.parse({ stage: 'freelance' })
    expect(p.businessModel.rankPosition).toBe('inconnu')
    expect(p.capacity.benchAvailable).toBe('inconnu')
    expect(p.gtm.model).toBe('inconnu')
    expect(p.gtm.channels).toEqual([])
    expect(p.references.sectors).toEqual([])
    expect(p.tools).toEqual([])
  })

  it('defaults salesContextVersion to 1', () => {
    const sc = validContext()
    expect(sc.salesContextVersion).toBe(1)
  })
})

describe('SalesContext — certainty/evidence invariants (p31: jamais inventer)', () => {
  it('accepts a user-asserted axis at confidence 100 with no evidence', () => {
    expect(() =>
      salesContextSchema.parse({
        esnProfile: { stage: 'grande' },
        account: { archetype: 'banque_assurance', derivation: 'user_override', confidence: 100, evidence: [] },
        relationship: { state: 'client_actif', derivation: 'user_declared', confidence: 100, evidence: [] },
      }),
    ).not.toThrow()
  })

  it('rejects a user-asserted axis whose confidence is not 100', () => {
    expect(() =>
      salesContextSchema.parse({
        esnProfile: { stage: 'grande' },
        account: { archetype: 'banque_assurance', derivation: 'user_override', confidence: 80, evidence: [] },
        relationship: { state: 'froid', derivation: 'default', confidence: 0, evidence: [] },
      }),
    ).toThrow(/user-asserted and must have confidence 100/)
  })

  it('rejects an inferred axis with no evidence (must cite the proof)', () => {
    expect(() =>
      salesContextSchema.parse({
        esnProfile: { stage: 'petite' },
        account: { archetype: 'startup', derivation: 'inferred', confidence: 60, evidence: [] },
        relationship: { state: 'froid', derivation: 'default', confidence: 0, evidence: [] },
      }),
    ).toThrow(/inferred account must cite at least one piece of evidence/)
  })

  it('rejects an inferred axis at confidence 100 (100 means user-asserted)', () => {
    expect(() =>
      salesContextSchema.parse({
        esnProfile: { stage: 'petite' },
        account: { archetype: 'startup', derivation: 'inferred', confidence: 100, evidence: ['NAF'] },
        relationship: { state: 'froid', derivation: 'default', confidence: 0, evidence: [] },
      }),
    ).toThrow(/inferred account must have confidence ≤ 99/)
  })

  it('rejects a default axis whose confidence is not 0 (nothing known)', () => {
    expect(() =>
      salesContextSchema.parse({
        esnProfile: { stage: 'petite' },
        account: { archetype: 'inconnu', derivation: 'default', confidence: 40, evidence: [] },
        relationship: { state: 'froid', derivation: 'default', confidence: 0, evidence: [] },
      }),
    ).toThrow(/default account .* confidence 0/)
  })
})

describe('SalesRuleCitation — every downstream reco cites rule + profile + proof (p31)', () => {
  it('requires a non-empty rule and defaults evidence to []', () => {
    const c = salesRuleCitationSchema.parse({ rule: 'board-guardrail:cold-small-esn' })
    expect(c.evidence).toEqual([])
    expect(() => salesRuleCitationSchema.parse({ rule: '' })).toThrow()
  })
})

/**
 * #2645.2 — le MODÈLE DE REVENU dans le profil ESN.
 *
 * Il ne s'agit pas d'un champ de plus : deux consommateurs le lisent (l'ANGLE
 * proposé, la CADENCE de relance). Le contrat doit donc porter la valeur
 * NON MESURÉE comme une valeur à part entière — `inconnu` — pour qu'aucun
 * lecteur n'ait à deviner « récurrent » par défaut.
 */
describe('#2645.2 — modèle de revenu (récurrent / ponctuel)', () => {
  it('porte les trois modèles mesurables et « inconnu »', () => {
    expect(esnRevenueModelSchema.options).toEqual(['recurrent', 'mixte', 'ponctuel', 'inconnu'])
  })

  it("vaut « inconnu » quand rien n'a été déclaré — jamais « récurrent » par défaut", () => {
    const p = esnProfileContextSchema.parse({ stage: 'freelance' })
    expect(p.businessModel.revenueModel).toBe('inconnu')
  })

  it('transporte le modèle déclaré jusqu’au contexte complet', () => {
    const p = esnProfileContextSchema.parse({ stage: 'petite', businessModel: { revenueModel: 'ponctuel' } })
    expect(p.businessModel.revenueModel).toBe('ponctuel')
  })
})
