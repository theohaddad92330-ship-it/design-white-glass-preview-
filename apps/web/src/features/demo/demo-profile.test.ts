import { describe, expect, it } from 'vitest'
import { demoProfileFromSearch, withDemoProfile } from './demo-profile'

describe('demo-profile — #4291 J la démo choisie voyage dans la query', () => {
  it('lit `profil=forfait_conseil`, et rien d’autre', () => {
    expect(demoProfileFromSearch('?profil=forfait_conseil')).toBe('forfait_conseil')
    expect(demoProfileFromSearch('?t=tok&profil=forfait_conseil')).toBe('forfait_conseil')
    expect(demoProfileFromSearch('')).toBeUndefined()
    expect(demoProfileFromSearch('?profil=staffing')).toBeUndefined()
    expect(demoProfileFromSearch('?profil=nimporte')).toBeUndefined()
  })

  it('ajoute le choix à la query sans rien perdre de ce qui y était', () => {
    expect(withDemoProfile('?t=tok&utm_source=linkedin', 'forfait_conseil')).toBe(
      '?t=tok&utm_source=linkedin&profil=forfait_conseil',
    )
    expect(withDemoProfile('', 'forfait_conseil')).toBe('?profil=forfait_conseil')
    expect(withDemoProfile('?t=tok', undefined)).toBe('?t=tok')
  })
})
