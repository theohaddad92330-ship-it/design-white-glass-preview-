import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_TRAJECTORY_KINDS,
  computeCommercialTrajectories,
  type TrajectoryContact,
} from './commercial-trajectory.js'

/**
 * #3402 — LA CARTE D'INFLUENCE DEVIENT DES TRAJECTOIRES COMMERCIALES.
 *
 * Quatre trajectoires minimales nommées par le retour : par le haut (sponsor
 * déjà accessible), par le terrain (utilisateur/champion), par un manager
 * intermédiaire (technique/influenceur), en parallèle (terrain + sponsor à la
 * fois). Purement dérivé de `Contact.decision_role`, un champ déjà réel et
 * déjà corrigible (le tiroir de correction de l'organigramme) — jamais une
 * réimplémentation du classifieur de niveau hiérarchique, qui vit côté serveur
 * (voir le docblock de `getRecommendedPath`, `organigrammeData.ts`).
 */

function contact(overrides: Partial<TrajectoryContact> & { id: string; full_name: string }): TrajectoryContact {
  return { title: null, decision_role: null, priority: 3, ...overrides }
}

describe('#3402 — quatre trajectoires, et quatre seulement', () => {
  it('nomme les quatre trajectoires dans l’ordre du retour', () => {
    expect(COMMERCIAL_TRAJECTORY_KINDS).toEqual(['top', 'field', 'middle_manager', 'parallel'])
  })
})

describe('#3402.2 — par le haut : un sponsor déjà accessible', () => {
  it('un contact `economic` forme la trajectoire `top`', () => {
    const trajectories = computeCommercialTrajectories([
      contact({ id: 'c1', full_name: 'Anne Dupuis', decision_role: 'economic' }),
    ])
    const top = trajectories.find(t => t.kind === 'top')
    expect(top?.steps).toHaveLength(1)
    expect(top?.steps[0]?.fullName).toBe('Anne Dupuis')
  })

  it('aucun contact `economic` (ou `sponsor`, legacy) ⇒ AUCUNE trajectoire `top` — jamais une ligne vide', () => {
    const trajectories = computeCommercialTrajectories([contact({ id: 'c1', full_name: 'X', decision_role: 'user' })])
    expect(trajectories.find(t => t.kind === 'top')).toBeUndefined()
  })
})

describe('#3402.3 — par le terrain : utilisateur ou champion', () => {
  it('un `user` ET un `champion` forment ensemble la trajectoire `field`', () => {
    const trajectories = computeCommercialTrajectories([
      contact({ id: 'c1', full_name: 'Utilisateur', decision_role: 'user' }),
      contact({ id: 'c2', full_name: 'Champion', decision_role: 'champion' }),
    ])
    const field = trajectories.find(t => t.kind === 'field')
    expect(field?.steps.map(s => s.fullName).sort()).toEqual(['Champion', 'Utilisateur'])
  })
})

describe('#3402.4 — par un manager intermédiaire : technique ou influenceur', () => {
  it('un `technical` forme la trajectoire `middle_manager`', () => {
    const trajectories = computeCommercialTrajectories([
      contact({ id: 'c1', full_name: 'Responsable applicatif', decision_role: 'technical' }),
    ])
    expect(trajectories.find(t => t.kind === 'middle_manager')?.steps).toHaveLength(1)
  })
})

describe('#3402.5 — en parallèle : terrain ET sponsor à la fois', () => {
  it('un relais opérationnel ET un sponsor donnent la trajectoire `parallel`, avec LES DEUX', () => {
    const trajectories = computeCommercialTrajectories([
      contact({ id: 'c1', full_name: 'Champion', decision_role: 'champion' }),
      contact({ id: 'c2', full_name: 'Sponsor', decision_role: 'economic' }),
    ])
    const parallel = trajectories.find(t => t.kind === 'parallel')
    expect(parallel?.steps.map(s => s.fullName).sort()).toEqual(['Champion', 'Sponsor'])
  })

  it('sponsor SEUL, sans relais terrain ⇒ pas de trajectoire `parallel`', () => {
    const trajectories = computeCommercialTrajectories([
      contact({ id: 'c1', full_name: 'Sponsor', decision_role: 'economic' }),
    ])
    expect(trajectories.find(t => t.kind === 'parallel')).toBeUndefined()
  })
})

describe('#3402.6 — chaque trajectoire nomme son risque quand un fait le justifie', () => {
  it('une trajectoire portée par UN SEUL contact porte le risque `single_contact`', () => {
    const trajectories = computeCommercialTrajectories([
      contact({ id: 'c1', full_name: 'Seul', decision_role: 'economic' }),
    ])
    expect(trajectories.find(t => t.kind === 'top')?.risk).toBe('single_contact')
  })

  it('une trajectoire avec plusieurs contacts ne porte AUCUN risque inventé', () => {
    const trajectories = computeCommercialTrajectories([
      contact({ id: 'c1', full_name: 'Un', decision_role: 'user' }),
      contact({ id: 'c2', full_name: 'Deux', decision_role: 'champion' }),
    ])
    expect(trajectories.find(t => t.kind === 'field')?.risk).toBeNull()
  })
})

describe('#3402.8 — ne fabrique aucun lien hiérarchique : une trajectoire vient du champ `decision_role` seul', () => {
  it('un contact sans rôle connu (`unknown`, ou `null`) n’entre dans AUCUNE trajectoire', () => {
    const trajectories = computeCommercialTrajectories([
      contact({ id: 'c1', full_name: 'Inconnu', decision_role: 'unknown' }),
      contact({ id: 'c2', full_name: 'Vide', decision_role: null }),
    ])
    expect(trajectories).toEqual([])
  })

  it('le tri à l’intérieur d’une trajectoire suit la PRIORITÉ déjà connue, jamais un ordre inventé', () => {
    const trajectories = computeCommercialTrajectories([
      contact({ id: 'c1', full_name: 'Priorité 3', decision_role: 'user', priority: 3 }),
      contact({ id: 'c2', full_name: 'Priorité 1', decision_role: 'champion', priority: 1 }),
    ])
    const field = trajectories.find(t => t.kind === 'field')
    expect(field?.steps.map(s => s.fullName)).toEqual(['Priorité 1', 'Priorité 3'])
  })
})
