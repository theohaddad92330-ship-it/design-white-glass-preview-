import { describe, expect, it } from 'vitest'
import {
  couleurStatutSession,
  finDeSession,
  libelleStatutSession,
  peutTerminer,
  resumeParStatut,
} from './impersonations.logic'

describe('libelleStatutSession', () => {
  it('nomme les trois statuts', () => {
    expect(libelleStatutSession('ongoing')).toBe('En cours')
    expect(libelleStatutSession('ended')).toBe('Terminée')
    expect(libelleStatutSession('expired_sans_arret')).toBe('Expirée sans arrêt')
  })
})

describe('couleurStatutSession', () => {
  it('sait dire NON — seule "expired_sans_arret" est colorée en alerte', () => {
    expect(couleurStatutSession('expired_sans_arret')).toBe('var(--amber)')
    expect(couleurStatutSession('ongoing')).not.toBe('var(--amber)')
    expect(couleurStatutSession('ended')).not.toBe('var(--amber)')
  })
})

describe('resumeParStatut', () => {
  it('un statut absent est un VRAI zéro, jamais une case vide', () => {
    expect(resumeParStatut([{ status: 'ongoing' }])).toEqual({ ongoing: 1, ended: 0, expired_sans_arret: 0 })
  })

  it('compte chaque statut indépendamment', () => {
    const sessions = [
      { status: 'ongoing' },
      { status: 'ended' },
      { status: 'ended' },
      { status: 'expired_sans_arret' },
    ] as const
    expect(resumeParStatut(sessions)).toEqual({ ongoing: 1, ended: 2, expired_sans_arret: 1 })
  })
})

// LUDOVIC-D LC.10 — une session « En cours » se termine depuis la console ; l'audit se lit.
describe('LC.10 — peutTerminer / finDeSession', () => {
  it('seule une session en cours porte « Terminer »', () => {
    expect(peutTerminer('ongoing')).toBe(true)
    expect(peutTerminer('ended')).toBe(false)
    expect(peutTerminer('expired_sans_arret')).toBe(false)
  })

  it('dit QUI a terminé : l’admin, ou l’opérateur lui-même ; rien tant que la session court', () => {
    expect(finDeSession({ actor: 'ops@bellum', endedBy: 'louis@bellum', status: 'ended' })).toBe(
      'Terminée par louis@bellum',
    )
    expect(finDeSession({ actor: 'ops@bellum', endedBy: 'ops@bellum', status: 'ended' })).toBe(
      'Quittée par l’opérateur',
    )
    expect(finDeSession({ actor: 'ops@bellum', endedBy: null, status: 'ongoing' })).toBeNull()
  })
})
