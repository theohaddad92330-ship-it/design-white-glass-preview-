import { beforeEach, describe, expect, it } from 'vitest'
import { forgetTabIdentity, readTabIdentity, rememberTabIdentity } from './tab-identity'

const REAL = '11111111-1111-4111-8111-111111111111'

describe("identité de l'onglet", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it("retient l'identité et la relit", () => {
    rememberTabIdentity(REAL)
    expect(readTabIdentity()).toBe(REAL)
  })

  it("n'écrit que ce qui a une chance d'être lu par le serveur", () => {
    rememberTabIdentity('pas-un-uuid')
    rememberTabIdentity(null)
    rememberTabIdentity(undefined)
    expect(readTabIdentity()).toBeNull()
  })

  it("l'oublie à la déconnexion", () => {
    rememberTabIdentity(REAL)
    forgetTabIdentity()
    expect(readTabIdentity()).toBeNull()
  })

  it('reste dans sessionStorage — jamais dans localStorage, que les onglets partagent', () => {
    rememberTabIdentity(REAL)
    expect(window.sessionStorage.getItem('bellum.tab.user')).toBe(REAL)
    expect(window.localStorage.getItem('bellum.tab.user')).toBeNull()
  })

  it('ignore une valeur corrompue plutôt que de la renvoyer', () => {
    window.sessionStorage.setItem('bellum.tab.user', '{}')
    expect(readTabIdentity()).toBeNull()
  })
})
