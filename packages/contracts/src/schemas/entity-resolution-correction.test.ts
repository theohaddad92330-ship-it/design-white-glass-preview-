import { describe, expect, it } from 'vitest'
import { entityResolutionSchema, type EntityResolution } from './entity-resolution.js'
import {
  applyEntityResolutionCorrections,
  ENTITY_RESOLUTION_CORRECTION_DECISIONS,
  entityResolutionCorrectionRequestSchema,
  type EntityResolutionCorrection,
} from './entity-resolution-correction.js'

/**
 * #2284.67-.69 (tranche 2) — la correction d'identité VERSIONNÉE par l'espace.
 *
 * Ce qui est gardé ici, en pur :
 *  - .67 la correction de l'espace DOMINE le calcul, quelle que soit sa date ;
 *  - .68 elle est versionnée : la plus haute version gagne, les autres restent ;
 *  - .69 elle se SUPERPOSE à la lecture : le verdict calculé n'est jamais réécrit ;
 *  - .65 elle répond à la question d'ambiguïté (« c'est bien celle-ci » /
 *    « ce n'est pas celle-ci ») ;
 *  - aucune donnée de l'entité écartée n'est recopiée sur l'entité choisie
 *    (#2284.70 : ne jamais mélanger deux entités).
 */

const RESOLVED: EntityResolution = entityResolutionSchema.parse({
  state: 'resolved',
  kind: 'subsidiary',
  canonical_id: 'FR-SIREN-552081317',
  commercial_name: 'EDF',
  legal_name: 'ELECTRICITE DE FRANCE',
  country: 'FR',
  identifiers: { siren: '552081317' },
  domain: 'edf.fr',
  naf_code: '35.11Z',
  naf_label: "Production d'électricité",
  location: 'Paris',
  parent_names: ['ETAT FRANCAIS'],
  children_count: 4,
  sources: ['legal_identifier', 'registry_country'],
  confidence: 92,
  reasons: [],
  question: null,
  // Le calcul est PLUS RÉCENT que toutes les corrections ci-dessous.
  resolved_at: '2026-09-30T10:00:00Z',
})

const AMBIGUOUS: EntityResolution = entityResolutionSchema.parse({
  ...RESOLVED,
  state: 'ambiguous',
  kind: null,
  canonical_id: null,
  legal_name: null,
  identifiers: {},
  naf_code: null,
  naf_label: null,
  location: null,
  parent_names: [],
  children_count: null,
  sources: ['normalized_name'],
  confidence: null,
  question: {
    candidates: [
      { name: 'ORANGE', siren: '380129866', city: 'Issy-les-Moulineaux' },
      { name: 'ORANGE BANK', siren: '572043800', city: 'Montreuil' },
      { name: 'ORANGE CARAIBE', siren: '379984891', city: 'Fort-de-France' },
    ],
  },
})

function correction(
  version: number,
  decision: 'confirmed' | 'rejected',
  target_name: string,
  target_siren: string | null,
): EntityResolutionCorrection {
  return { version, decision, target_name, target_siren, note: null, decided_at: '2026-09-01T09:00:00Z' }
}

describe('contrat de la correction (#2284.67-.69)', () => {
  it('deux décisions, pas quatre', () => {
    expect([...ENTITY_RESOLUTION_CORRECTION_DECISIONS]).toEqual(['confirmed', 'rejected'])
  })

  it('refuse une cible sans nom et un SIREN mal formé', () => {
    expect(
      entityResolutionCorrectionRequestSchema.safeParse({ decision: 'confirmed', target_name: '  ' }).success,
    ).toBe(false)
    expect(
      entityResolutionCorrectionRequestSchema.safeParse({
        decision: 'confirmed',
        target_name: 'ORANGE',
        target_siren: '38012',
      }).success,
    ).toBe(false)
  })

  it("jette l'espace et l'auteur venus du corps (ils viennent du jeton)", () => {
    const parsed = entityResolutionCorrectionRequestSchema.parse({
      decision: 'rejected',
      target_name: 'ORANGE BANK',
      target_siren: '572043800',
      workspace_id: 'x',
      decided_by: 'y',
    })
    expect(parsed).not.toHaveProperty('workspace_id')
    expect(parsed).not.toHaveProperty('decided_by')
  })
})

describe('applyEntityResolutionCorrections', () => {
  it('sans correction : le verdict calculé, intact (même référence)', () => {
    expect(applyEntityResolutionCorrections(RESOLVED, [])).toBe(RESOLVED)
  })

  it('un dossier antérieur à #2284 reste muet', () => {
    expect(applyEntityResolutionCorrections(null, [correction(1, 'confirmed', 'X', null)])).toBeNull()
  })

  it('#2284.65 — « c’est bien celle-ci » sur un candidat ancre l’entité, sans rien recopier du calcul', () => {
    const out = applyEntityResolutionCorrections(AMBIGUOUS, [correction(1, 'confirmed', 'ORANGE BANK', '572043800')])
    expect(entityResolutionSchema.safeParse(out).success).toBe(true)
    expect(out?.state).toBe('manual_override')
    expect(out?.canonical_id).toBe('FR-SIREN-572043800')
    expect(out?.legal_name).toBe('ORANGE BANK')
    expect(out?.identifiers).toEqual({ siren: '572043800' })
    expect(out?.location).toBe('Montreuil')
    expect(out?.sources).toContain('workspace_correction')
    expect(out?.question).toBeNull()
    // Une décision humaine n'est pas probable : aucune confiance chiffrée.
    expect(out?.confidence).toBeNull()
  })

  it('#2284.67 — la correction gagne sur un calcul PLUS RÉCENT qu’elle', () => {
    const out = applyEntityResolutionCorrections(RESOLVED, [
      correction(1, 'rejected', 'ELECTRICITE DE FRANCE', '552081317'),
    ])
    expect(out?.state).toBe('unresolved')
    expect(out?.canonical_id).toBeNull()
    // L'entité écartée ne laisse ni son type, ni sa mère, ni ses filiales.
    expect(out?.kind).toBeNull()
    expect(out?.parent_names).toEqual([])
    expect(out?.children_count).toBeNull()
    expect(out?.identifiers).toEqual({})
    expect(out?.sources).toContain('workspace_correction')
    expect(entityResolutionSchema.safeParse(out).success).toBe(true)
  })

  it('confirmer l’entité déjà résolue la garde entière, et la marque comme tranchée par l’espace', () => {
    const out = applyEntityResolutionCorrections(RESOLVED, [
      correction(1, 'confirmed', 'ELECTRICITE DE FRANCE', '552081317'),
    ])
    expect(out?.state).toBe('manual_override')
    expect(out?.canonical_id).toBe('FR-SIREN-552081317')
    expect(out?.parent_names).toEqual(['ETAT FRANCAIS'])
    expect(out?.kind).toBe('subsidiary')
    expect(out?.confidence).toBeNull()
  })

  it('#2284.68 — la plus haute VERSION gagne, pas l’ordre du tableau', () => {
    const out = applyEntityResolutionCorrections(AMBIGUOUS, [
      correction(2, 'rejected', 'ORANGE BANK', '572043800'),
      correction(1, 'confirmed', 'ORANGE BANK', '572043800'),
    ])
    expect(out?.state).not.toBe('manual_override')
    expect(out?.question?.candidates.map(c => c.siren)).toEqual(['380129866', '379984891'])
  })

  it('« ce n’est pas celle-ci » retire le candidat ; un seul restant n’est plus une ambiguïté ancrée', () => {
    const out = applyEntityResolutionCorrections(AMBIGUOUS, [
      correction(1, 'rejected', 'ORANGE BANK', '572043800'),
      correction(2, 'rejected', 'ORANGE CARAIBE', '379984891'),
    ])
    expect(out?.state).toBe('unresolved')
    expect(out?.canonical_id).toBeNull()
    expect(out?.question?.candidates.map(c => c.name)).toEqual(['ORANGE'])
    expect(entityResolutionSchema.safeParse(out).success).toBe(true)
  })

  it('#2284.69 — le verdict calculé n’est jamais muté', () => {
    const before = JSON.stringify(AMBIGUOUS)
    applyEntityResolutionCorrections(AMBIGUOUS, [correction(1, 'confirmed', 'ORANGE', '380129866')])
    expect(JSON.stringify(AMBIGUOUS)).toBe(before)
  })

  it('une cible sans SIREN se reconnaît au nom normalisé, jamais à un préfixe', () => {
    const out = applyEntityResolutionCorrections(AMBIGUOUS, [correction(1, 'rejected', 'orange', null)])
    expect(out?.question?.candidates.map(c => c.name)).toEqual(['ORANGE BANK', 'ORANGE CARAIBE'])
  })
})
