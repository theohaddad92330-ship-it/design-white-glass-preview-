import type { Request } from 'express'
import { IMPERSONATION_COOKIE } from './impersonation-config'
import { fromImpersonationCookie } from './impersonation.strategy'

// #4608.5 — la salle de démonstration ne se laisse pas avaler par une incarnation ouverte à côté.
const IMPERSONATED = '11111111-1111-4111-8111-111111111111'
const DEMO_ROOM = '22222222-2222-4222-8222-222222222222'

function token(sub: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64({ sub, impersonation: true })}.sig`
}

function req(cookieSub: string | null, hint?: string): Request {
  return {
    cookies: cookieSub ? { [IMPERSONATION_COOKIE]: token(cookieSub) } : {},
    headers: hint ? { 'x-bellum-user': hint } : {},
  } as unknown as Request
}

describe('#4608.5 — le cookie d’incarnation ne s’applique qu’à l’onglet qui incarne', () => {
  it("sans indication d'onglet : l'incarnation s'applique (comportement historique)", () => {
    expect(fromImpersonationCookie()(req(IMPERSONATED))).toBe(token(IMPERSONATED))
  })

  it("l'onglet déclare le compte incarné : l'incarnation s'applique", () => {
    expect(fromImpersonationCookie()(req(IMPERSONATED, IMPERSONATED))).toBe(token(IMPERSONATED))
  })

  it('REFUS : un onglet de démo (autre identité) n’est JAMAIS servi comme le compte incarné', () => {
    expect(fromImpersonationCookie()(req(IMPERSONATED, DEMO_ROOM))).toBeNull()
  })

  it('REFUS : un jeton illisible avec une indication d’onglet ne passe pas', () => {
    const r = { cookies: { [IMPERSONATION_COOKIE]: 'pas-un-jwt' }, headers: { 'x-bellum-user': DEMO_ROOM } }
    expect(fromImpersonationCookie()(r as unknown as Request)).toBeNull()
  })
})
