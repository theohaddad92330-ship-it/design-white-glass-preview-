import { describe, expect, it } from 'vitest'
import { canSeeOnboardingLink, isHomeRoute } from './onboarding-link-access'

// #4364 — DROITS du lien permanent : même public que l'entrée « Réglages › Profil » d'aujourd'hui, SANS
// élargissement. Ce fichier prouve le REFUS.
describe('#4364 — qui voit le lien permanent vers le questionnaire', () => {
  const base = { isDemo: false, awaitingCompanyAdmin: false }

  it.each(['in_progress', 'completed', 'refresh_required', 'activated', 'audit_to_review'])(
    'un membre qui a démarré (statut %s) le voit — sans aucun drapeau',
    status => {
      expect(canSeeOnboardingLink({ ...base, status })).toBe(true)
    },
  )

  it('REFUS — un membre qui attend son administrateur ne le voit pas (il n’a pas à décrire l’ESN)', () => {
    expect(canSeeOnboardingLink({ ...base, status: 'in_progress', awaitingCompanyAdmin: true })).toBe(false)
  })

  it('REFUS — l’espace de démonstration, partagé entre prospects, ne le voit pas', () => {
    expect(canSeeOnboardingLink({ ...base, status: 'completed', isDemo: true })).toBe(false)
  })

  it('REFUS — un état absent, illisible ou jamais démarré ne fabrique pas de lien', () => {
    expect(canSeeOnboardingLink({ ...base, status: undefined })).toBe(false)
    expect(canSeeOnboardingLink({ ...base, status: null })).toBe(false)
    expect(canSeeOnboardingLink({ ...base, status: 'not_started' })).toBe(false)
  })

  it('l’accueil est /briefing, et rien d’autre', () => {
    expect(isHomeRoute('/briefing')).toBe(true)
    expect(isHomeRoute('/briefing/')).toBe(true)
    expect(isHomeRoute('/accounts')).toBe(false)
    expect(isHomeRoute('/onboarding')).toBe(false)
  })
})
