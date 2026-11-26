import { describe, expect, it } from 'vitest'
import {
  MISSION_END_CHECK_ITEMS,
  MISSION_END_CHECK_KEYS,
  MISSION_END_REASONS,
  computeMissionEndChecklist,
  missionEndCheckInputSchema,
  missionEndReasonInputSchema,
  missionInterruptionInputSchema,
  type MissionEndDeclared,
} from './mission-end.js'

const declared = (key: MissionEndDeclared['key'], at = '2026-09-20T10:00:00Z'): MissionEndDeclared => ({
  key,
  confirmedAt: at,
  confirmedBy: 'u1',
  note: 'passation faite le 20/09',
})

describe('#2414 — les 8 motifs de fin de mission (épopée #2986)', () => {
  it('porte les 8 valeurs demandées, ni plus ni moins de sens', () => {
    expect(MISSION_END_REASONS).toEqual([
      'date_prevue',
      'renouvellement_refuse',
      'interruption',
      'remplacement',
      'demission',
      'fin_budget',
      'mauvais_fit',
      'fin_projet',
    ])
  })

  it('refuse une valeur hors catalogue', () => {
    expect(missionEndReasonInputSchema.safeParse({ reason: 'autre' }).success).toBe(false)
    expect(missionEndReasonInputSchema.safeParse({ reason: 'demission' }).success).toBe(true)
  })
})

describe('#2414 — le catalogue de la checklist de sortie (client / consultant / interne)', () => {
  it('porte les trois groupes cités par la triage (#2414.11/13/16, .18-23, .29/31-33)', () => {
    const byGroup = (group: 'client' | 'consultant' | 'internal') =>
      MISSION_END_CHECK_ITEMS.filter(i => i.group === group).map(i => i.key)
    expect(byGroup('client')).toEqual(['client_handover', 'client_documents', 'client_payment'])
    expect(byGroup('consultant')).toEqual([
      'consultant_mobility',
      'consultant_daily_rate',
      'consultant_preferences',
      'consultant_cv_updated',
      'consultant_consent',
      'consultant_other_processes',
    ])
    expect(byGroup('internal')).toEqual([
      'internal_actions',
      'internal_references',
      'internal_equipment',
      'internal_documents',
    ])
  })

  it('MISSION_END_CHECK_KEYS (GA-12, contrainte SQL) reste aligné sur le catalogue', () => {
    expect(MISSION_END_CHECK_KEYS).toEqual(MISSION_END_CHECK_ITEMS.map(i => i.key))
  })
})

describe('computeMissionEndChecklist', () => {
  it('une mission qui vient de finir : rien de coché → tout manque, nommé', () => {
    const r = computeMissionEndChecklist({ declared: [] })
    expect(r.verdict).toBe('not_started')
    expect(r.missing.length).toBe(MISSION_END_CHECK_ITEMS.length)
    expect(r.done).toEqual([])
  })

  it('#2414.62 — recette « fin normale » : les 13 items cochés → complet', () => {
    const all = MISSION_END_CHECK_ITEMS.map(i => declared(i.key))
    const r = computeMissionEndChecklist({ declared: all })
    expect(r.verdict).toBe('complete')
    expect(r.missing).toEqual([])
    expect(r.done.length).toBe(MISSION_END_CHECK_ITEMS.length)
  })

  it('#2414.63 — recette « renouvellement incertain » : la checklist reste partielle sans bloquer', () => {
    const r = computeMissionEndChecklist({ declared: [declared('client_handover'), declared('consultant_consent')] })
    expect(r.verdict).toBe('in_progress')
    expect(r.missing).toContain('client_payment')
    expect(r.done.map(d => d.key)).toEqual(['client_handover', 'consultant_consent'])
  })

  it('un geste déclaré garde son auteur, sa date et sa note (jamais recalculé)', () => {
    const r = computeMissionEndChecklist({ declared: [declared('client_documents')] })
    expect(r.items.find(i => i.key === 'client_documents')).toMatchObject({
      state: 'done',
      confirmedBy: 'u1',
      confirmedAt: '2026-09-20T10:00:00Z',
      note: 'passation faite le 20/09',
    })
  })
})

describe('#2414.7 — pas de case cochée sans note', () => {
  it('refuse une note vide et une clé hors catalogue', () => {
    expect(missionEndCheckInputSchema.safeParse({ item: 'client_handover', note: '  ' }).success).toBe(false)
    expect(missionEndCheckInputSchema.safeParse({ item: 'inconnu', note: 'ok ok' }).success).toBe(false)
    expect(missionEndCheckInputSchema.safeParse({ item: 'client_handover', note: 'transmis le 20/09' }).success).toBe(
      true,
    )
  })
})

describe('#2414 — mission interrompue (traitement spécifique, NO-GO)', () => {
  it('exige motif, responsabilités, risque et les deux accusés — jamais une disponibilité déjà confirmée', () => {
    const parsed = missionInterruptionInputSchema.safeParse({
      responsibility: 'client',
      risk: 'faible',
      confidentialityAcknowledged: true,
      nonSolicitationAcknowledged: true,
      note: 'Le client a mis fin au contrat après un désaccord sur le périmètre.',
    })
    expect(parsed.success).toBe(true)
    // #2414 NO-GO — la disponibilité n'entre JAMAIS dans la déclaration d'une
    // interruption : elle se confirme séparément, par un second geste humain.
    expect(parsed.success && 'availabilityConfirmed' in parsed.data).toBe(false)
  })

  it('refuse une interruption sans les deux accusés de réception (confidentialité / non-sollicitation)', () => {
    expect(
      missionInterruptionInputSchema.safeParse({
        responsibility: 'client',
        risk: 'faible',
        confidentialityAcknowledged: false,
        nonSolicitationAcknowledged: true,
        note: 'motif suffisamment long pour passer la validation du champ note',
      }).success,
    ).toBe(false)
  })

  it('refuse une note trop courte (le motif ne se devine pas)', () => {
    expect(
      missionInterruptionInputSchema.safeParse({
        responsibility: 'client',
        risk: 'faible',
        confidentialityAcknowledged: true,
        nonSolicitationAcknowledged: true,
        note: 'trop court',
      }).success,
    ).toBe(false)
  })
})
