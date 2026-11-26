import { describe, expect, it } from 'vitest'
import { acteurDepuisBasicAuth } from './guard'

function requeteAvec(authorization?: string): Request {
  return new Request('http://localhost/x', { headers: authorization ? { authorization } : {} })
}

// #2445.12 (épopée #2766, lot SRC5 28/09 soir) — extrait de
// `analyses/[id]/stop/route.ts` : deux routes neuves (incidents/actions,
// incidents/communications) en avaient besoin, une SECONDE copie aurait
// divergé à la première correction (GA-26).
describe('acteurDepuisBasicAuth', () => {
  it('lit l’utilisateur du Basic-Auth', () => {
    const jeton = Buffer.from('louis@bellum-it.com:secret').toString('base64')
    expect(acteurDepuisBasicAuth(requeteAvec(`Basic ${jeton}`) as never)).toBe('louis@bellum-it.com')
  })

  it('rend « backoffice » sans en-tête Basic-Auth — jamais une identité inventée', () => {
    expect(acteurDepuisBasicAuth(requeteAvec() as never)).toBe('backoffice')
  })

  it('rend « backoffice » quand l’utilisateur décodé est VIDE — jamais une chaîne vide', () => {
    const jeton = Buffer.from(':secret').toString('base64')
    expect(acteurDepuisBasicAuth(requeteAvec(`Basic ${jeton}`) as never)).toBe('backoffice')
  })
})
