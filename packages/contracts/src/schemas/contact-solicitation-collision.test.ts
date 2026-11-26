import { describe, expect, it } from 'vitest'
import {
  detectContactSolicitationCollisions,
  type ContactSolicitationCandidate,
} from './contact-solicitation-collision.js'

/**
 * #2325.35 — « détecte les mêmes contacts sollicités [ailleurs] », transposée
 * de {@link detectStaffingCollisions} (#2325.34) du consultant au contact :
 * même définition (deux lectures ACTIVES concurrentes sur la même personne),
 * même refus de lire l'auteur (doctrine « l'analytique mesure le produit,
 * jamais la personne »).
 */
function sequence(over: Partial<ContactSolicitationCandidate> = {}): ContactSolicitationCandidate {
  return {
    id: 'seq-1',
    contactId: 'contact-1',
    contactName: 'Alex Martin',
    status: 'active',
    ...over,
  }
}

describe('detectContactSolicitationCollisions — #2325.35', () => {
  it('deux séquences ACTIVES sur le même contact remontent en collision', () => {
    const collisions = detectContactSolicitationCollisions([sequence({ id: 'seq-1' }), sequence({ id: 'seq-2' })])
    expect(collisions).toEqual([
      { contactId: 'contact-1', contactName: 'Alex Martin', sequenceIds: ['seq-1', 'seq-2'] },
    ])
  })

  it('une seule séquence active sur un contact ne collisionne pas', () => {
    expect(detectContactSolicitationCollisions([sequence({ id: 'seq-1' })])).toEqual([])
  })

  it('une séquence PAUSÉE/TERMINÉE/ANNULÉE ne compte pas — elle ne sollicite plus personne', () => {
    for (const status of ['paused', 'completed', 'cancelled'] as const) {
      const collisions = detectContactSolicitationCollisions([
        sequence({ id: 'seq-1', status: 'active' }),
        sequence({ id: 'seq-2', status }),
      ])
      expect(collisions).toEqual([])
    }
  })

  it('une liste vide ne collisionne jamais — jamais une réponse inventée', () => {
    expect(detectContactSolicitationCollisions([])).toEqual([])
  })

  it('ne lit jamais un identifiant de commercial : aucune clé "userId"/"ownerId" sur le candidat ni sur le résultat', () => {
    const collision = detectContactSolicitationCollisions([sequence({ id: 'seq-1' }), sequence({ id: 'seq-2' })])[0] as
      | Record<string, unknown>
      | undefined
    expect(collision).not.toHaveProperty('userId')
    expect(collision).not.toHaveProperty('ownerId')
  })
})
