import { describe, expect, it } from 'vitest'
import { describeOwnerInvitation, refusalMessage } from './owner-invitation-state'
import type { AdminOwnerInvitation } from './admin'

const invitation = (over: Partial<AdminOwnerInvitation> = {}): AdminOwnerInvitation => ({
  email: 'theo@skaizen.fr',
  ownerFirstName: 'Théo',
  esnName: 'Skaizen',
  planLabel: 'Team',
  prepared: true,
  error: null,
  expiresAt: '2026-09-22T10:00:00.000Z',
  sentAt: null,
  sentBy: null,
  sendCount: 0,
  alertedAt: null,
  ...over,
})

describe('describeOwnerInvitation (#2643.2)', () => {
  it('dit « indisponible » quand le champ est absent — console neuve, API ancienne', () => {
    expect(describeOwnerInvitation(undefined)).toEqual({ kind: 'unavailable' })
  })

  it('dit « aucune » quand le compte du propriétaire a été RÉUTILISÉ — rien n’a été préparé', () => {
    expect(describeOwnerInvitation(null)).toEqual({ kind: 'none' })
  })

  it('dit PRÉPARÉE ET JAMAIS ENVOYÉE — le fait le plus important de l’écran (#1665 règle 2)', () => {
    const state = describeOwnerInvitation(invitation({ sentAt: null, sendCount: 0 }))
    expect(state).toMatchObject({ kind: 'present', prepared: true, sentAt: null, sendCount: 0 })
  })

  it('dit ENVOYÉE, avec qui et quand', () => {
    const state = describeOwnerInvitation(
      invitation({ sentAt: '2026-09-20T09:00:00.000Z', sentBy: 'louis@bellum.ai', sendCount: 1 }),
    )
    expect(state).toMatchObject({ kind: 'present', sentAt: '2026-09-20T09:00:00.000Z', sentBy: 'louis@bellum.ai' })
  })

  it('dit l’ERREUR quand le lien n’a pas pu être engendré — jamais un succès maquillé', () => {
    const state = describeOwnerInvitation(invitation({ prepared: false, error: 'rate limited' }))
    expect(state).toMatchObject({ kind: 'present', prepared: false, error: 'rate limited' })
  })
})

/**
 * #2643.3 — les refus de la cadence J+2/J+5, en clair pour l’opérateur qui
 * clique « Relancer » trop tôt ou trop souvent.
 */
describe('refusalMessage (#2643.3)', () => {
  it('dit la cadence quand la relance n’est pas encore due', () => {
    expect(refusalMessage('not_due_yet')).toContain('pas encore due')
  })

  it('dit que la cadence est épuisée après deux relances', () => {
    expect(refusalMessage('cadence_exhausted')).toContain('épuisée')
  })

  it('rend le code brut inchangé quand il ne connaît pas la raison — jamais un texte inventé', () => {
    expect(refusalMessage('un_code_inconnu')).toBe('un_code_inconnu')
  })

  it('rend un texte générique quand aucune raison n’est donnée', () => {
    expect(refusalMessage(undefined)).toBe('Échec de l’envoi.')
  })
})
