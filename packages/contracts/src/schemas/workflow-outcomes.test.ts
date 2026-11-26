import { describe, expect, it } from 'vitest'
import {
  CONTACT_STOP_REASONS,
  contactStopReasonFor,
  MOTION_CONTACT_STOP_OUTCOMES,
  MOTIONS_WITHOUT_OUTCOME_CONTRACT,
  outcomeContractFor,
  outcomeStopsMotion,
  recordContactStopSchema,
  TRANSPORT_CONTACT_STOP_REASONS,
  WORKFLOW_MOTIONS,
  WORKFLOW_OUTCOME_CATALOG,
} from './workflow-outcomes.js'

describe('le catalogue d’issues est réellement là', () => {
  it('porte les huit motions, chacune complète', () => {
    expect(WORKFLOW_MOTIONS).toHaveLength(8)
    for (const motion of WORKFLOW_MOTIONS) {
      const contract = WORKFLOW_OUTCOME_CATALOG[motion]
      expect(contract.motion).toBe(motion)
      expect(contract.trigger.trim().length).toBeGreaterThan(0)
      expect(contract.inputs.length).toBeGreaterThan(0)
      expect(contract.drafts.length).toBeGreaterThan(0)
      expect(contract.fallback.trim().length).toBeGreaterThan(0)
      // Une motion sans issue possible ne produit rien de mesurable.
      expect(contract.outcomes.length).toBeGreaterThanOrEqual(4)
    }
  })

  it('les issues d’une motion sont uniques — sinon rien ne s’additionne', () => {
    for (const motion of WORKFLOW_MOTIONS) {
      const outcomes = WORKFLOW_OUTCOME_CATALOG[motion].outcomes
      expect(new Set(outcomes).size).toBe(outcomes.length)
    }
  })

  it('les conditions d’arrêt sont uniques et nommées', () => {
    // ⚠️ Une condition d'arrêt n'est PAS forcément une issue, et le premier jet
    // de ce test le supposait à tort. `do_not_call` est un fait porté par le
    // CONTACT — il arrête la motion avant qu'elle compose le numéro — alors que
    // `relationship_invalid` est les deux à la fois. Ce qui se garde vraiment,
    // c'est qu'aucune condition ne soit vide ni répétée.
    for (const motion of WORKFLOW_MOTIONS) {
      const { stop } = WORKFLOW_OUTCOME_CATALOG[motion]
      expect(new Set(stop).size).toBe(stop.length)
      for (const condition of stop) expect(condition.trim().length).toBeGreaterThan(0)
    }
  })

  it('au moins une motion s’arrête sur une de ses PROPRES issues', () => {
    // La garde qui empêche `stop` de devenir une liste de mots décoratifs :
    // `relationship_invalid` doit rester à la fois un résultat et un arrêt.
    const both = WORKFLOW_MOTIONS.filter(motion => {
      const { outcomes, stop } = WORKFLOW_OUTCOME_CATALOG[motion]
      return stop.some(condition => outcomes.includes(condition))
    })
    expect(both.length).toBeGreaterThan(0)
    expect(both).toContain('historical_relationship_reactivation')
  })

  it('les deux motions SANS contrat sont nommées, pas inventées', () => {
    expect(MOTIONS_WITHOUT_OUTCOME_CONTRACT).toEqual(['plan_de_compte', 'linkedin_outreach'])
    for (const motion of MOTIONS_WITHOUT_OUTCOME_CONTRACT) {
      expect(outcomeContractFor(motion)).toBeNull()
    }
  })
})

describe('outcomeStopsMotion — on n’arrête pas sur une table qu’on n’a pas', () => {
  it('reconnaît une condition d’arrêt', () => {
    expect(outcomeStopsMotion('cold_call_qualification', 'do_not_call')).toBe(true)
    expect(outcomeStopsMotion('cold_call_qualification', 'voicemail')).toBe(false)
  })

  it('rend `false` pour une motion inconnue', () => {
    // Un arrêt inventé ferait cesser une relance légitime sans que personne
    // comprenne pourquoi — aussi coûteux qu'une insistance.
    expect(outcomeStopsMotion('plan_de_compte', 'do_not_call')).toBe(false)
    expect(outcomeStopsMotion('', '')).toBe(false)
  })
})

describe('contactStopReasonFor — arrêter la MOTION, ou arrêter la PERSONNE', () => {
  it('chaque arrêt de personne issu d’une motion en est réellement un arrêt', () => {
    // La garde qui empêche cette liste de dériver du catalogue : une raison qui
    // n'arrêterait plus aucune motion serait un arrêt inventé, et cette
    // vérification est la seule qui le verrait.
    for (const outcome of MOTION_CONTACT_STOP_OUTCOMES) {
      const motions = WORKFLOW_MOTIONS.filter(motion => outcomeStopsMotion(motion, outcome))
      expect({ outcome, motions: motions.length > 0 }).toEqual({ outcome, motions: true })
    }
  })

  it('le vocabulaire complet est la somme des deux origines, dans cet ordre', () => {
    // L'ordre est celui de la contrainte SQL : un enum ne perd jamais de valeur
    // et n'en insère jamais au milieu.
    expect(CONTACT_STOP_REASONS).toEqual([...MOTION_CONTACT_STOP_OUTCOMES, ...TRANSPORT_CONTACT_STOP_REASONS])
  })

  it('rend la raison quand l’issue arrête la motion ET porte sur la personne', () => {
    expect(contactStopReasonFor('cold_call_qualification', 'do_not_call')).toBe('do_not_call')
    expect(contactStopReasonFor('historical_relationship_reactivation', 'relationship_invalid')).toBe(
      'relationship_invalid',
    )
  })

  it('rend `null` sur un arrêt qui ne dit RIEN de la personne', () => {
    // Une mission qui se termine arrête son suivi ; le client, lui, reste
    // parfaitement joignable. Les confondre ferait taire un compte entier.
    expect(outcomeStopsMotion('mission_follow_up', 'mission_end_confirmed')).toBe(true)
    expect(contactStopReasonFor('mission_follow_up', 'mission_end_confirmed')).toBeNull()
    expect(contactStopReasonFor('push_profile', 'rejected')).toBeNull()
  })

  it('rend `null` quand l’issue n’arrête pas CETTE motion', () => {
    // `do_not_call` déclaré au terme d'une motion qui ne l'a jamais prévu
    // poserait un arrêt sur quelqu'un que personne n'a appelé.
    expect(contactStopReasonFor('reverse_prospecting', 'do_not_call')).toBeNull()
    expect(contactStopReasonFor('cold_call_qualification', 'voicemail')).toBeNull()
  })
})

describe('recordContactStopSchema — une seule forme à la fois', () => {
  it('accepte une issue de motion', () => {
    expect(recordContactStopSchema.parse({ motion: 'cold_call_qualification', outcome: 'do_not_call' }).outcome).toBe(
      'do_not_call',
    )
  })

  it('accepte une raison directe — le transport n’est l’issue d’aucune motion', () => {
    expect(recordContactStopSchema.parse({ reason: 'unsubscribed' }).reason).toBe('unsubscribed')
  })

  it('refuse une issue ORPHELINE de sa motion', () => {
    // Sans la motion, rien ne permet de vérifier que l'issue arrête quoi que
    // ce soit — et le serveur devrait alors la croire sur parole.
    expect(() => recordContactStopSchema.parse({ outcome: 'do_not_call' })).toThrow()
    expect(() => recordContactStopSchema.parse({ motion: 'cold_call_qualification' })).toThrow()
  })

  it('refuse un corps vide et une raison inconnue', () => {
    expect(() => recordContactStopSchema.parse({})).toThrow()
    expect(() => recordContactStopSchema.parse({ reason: 'trop_occupe' })).toThrow()
  })
})
