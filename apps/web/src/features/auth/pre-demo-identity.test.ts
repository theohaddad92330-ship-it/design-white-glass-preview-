import { beforeEach, describe, expect, it } from 'vitest'
import { rememberPreDemoIdentity, takePreDemoIdentity } from './pre-demo-identity'

const REAL = '11111111-1111-4111-8111-111111111111'

beforeEach(() => window.sessionStorage.clear())

describe('pre-demo-identity (#4608)', () => {
  it("rend l'identité d'avant la démonstration, une seule fois", () => {
    rememberPreDemoIdentity(REAL)
    expect(takePreDemoIdentity()).toEqual({ userId: REAL, path: '/' })
    expect(takePreDemoIdentity()).toBeNull()
  })

  it("n'enregistre rien sans identité", () => {
    rememberPreDemoIdentity(null)
    expect(takePreDemoIdentity()).toBeNull()
  })

  it('REFUS : un chemin externe ou vers la démo / la connexion retombe sur /', () => {
    for (const path of ['//evil.example', 'https://evil.example', '/demo/acces', '/login']) {
      window.sessionStorage.setItem('bellum.tab.preDemo', JSON.stringify({ userId: REAL, path }))
      expect(takePreDemoIdentity()?.path).toBe('/')
    }
  })

  it('REFUS : un contenu corrompu ne donne aucune identité', () => {
    window.sessionStorage.setItem('bellum.tab.preDemo', '{pas du json')
    expect(takePreDemoIdentity()).toBeNull()
  })
})
