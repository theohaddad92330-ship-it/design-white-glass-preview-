import { describe, expect, it } from 'vitest'
import { shouldStartFirstSuccessGuide } from './first-success-guide-trigger'

const base = { route: '/chat', needsOnboarding: false, alreadyShown: false, hasActiveGuideSession: false } as const

describe('shouldStartFirstSuccessGuide — #2214.23', () => {
  it('démarre : sur /chat, onboarding terminé, jamais vu, aucun fil en cours', () => {
    expect(shouldStartFirstSuccessGuide(base)).toBe(true)
  })

  it('ne démarre pas ailleurs qu’sur /chat — le guide ne navigue jamais seul (GA-371)', () => {
    expect(shouldStartFirstSuccessGuide({ ...base, route: '/search' })).toBe(false)
  })

  it('ne démarre pas tant que l’onboarding n’est pas terminé', () => {
    expect(shouldStartFirstSuccessGuide({ ...base, needsOnboarding: true })).toBe(false)
  })

  it('ne démarre pas sans lecture fiable de l’état d’onboarding (undefined = en vol/en échec)', () => {
    expect(shouldStartFirstSuccessGuide({ ...base, needsOnboarding: undefined })).toBe(false)
  })

  it('ne démarre pas deux fois — déjà vu', () => {
    expect(shouldStartFirstSuccessGuide({ ...base, alreadyShown: true })).toBe(false)
  })

  it('ne remplace jamais un fil déjà en cours', () => {
    expect(shouldStartFirstSuccessGuide({ ...base, hasActiveGuideSession: true })).toBe(false)
  })
})
