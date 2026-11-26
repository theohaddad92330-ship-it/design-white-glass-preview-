import { signPhoneRevealToken, verifyPhoneRevealToken } from './phone-reveal-token'

/**
 * E1 (#3698) — le jeton de l'URL de retour Apollo. L'endpoint est PUBLIC : le
 * jeton EST la porte. Il doit savoir dire NON à tout ce qui n'est pas lui.
 */
describe('phone-reveal-token (E1)', () => {
  const SECRET = 's'.repeat(40)
  const NOW = Date.UTC(2026, 9, 7, 10, 0, 0)
  const base = {
    contactId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '33333333-3333-4333-8333-333333333333',
    nonce: 'n-abc',
    expiresAt: NOW + 3_600_000,
  }

  it('rend le contact et le nonce d’un jeton valide', () => {
    const token = signPhoneRevealToken(base, SECRET)
    expect(verifyPhoneRevealToken(token, SECRET, NOW)).toEqual({
      contactId: base.contactId,
      workspaceId: base.workspaceId,
      nonce: 'n-abc',
    })
  })

  it('NON : autre secret', () => {
    const token = signPhoneRevealToken(base, SECRET)
    expect(verifyPhoneRevealToken(token, 't'.repeat(40), NOW)).toBeNull()
  })

  it('NON : jeton expiré', () => {
    const token = signPhoneRevealToken(base, SECRET)
    expect(verifyPhoneRevealToken(token, SECRET, base.expiresAt + 1)).toBeNull()
  })

  it('NON : contact changé dans la charge (signature ne suit pas)', () => {
    const token = signPhoneRevealToken(base, SECRET)
    const [, sig] = token.split('.')
    const forged = `${Buffer.from(`22222222-2222-4222-8222-222222222222.${base.workspaceId}.n-abc.${base.expiresAt}`).toString('base64url')}.${sig}`
    expect(verifyPhoneRevealToken(forged, SECRET, NOW)).toBeNull()
  })

  it('NON : secret absent ou trop court — jamais une porte ouverte', () => {
    const token = signPhoneRevealToken(base, SECRET)
    expect(verifyPhoneRevealToken(token, '', NOW)).toBeNull()
    expect(() => signPhoneRevealToken(base, '')).toThrow()
  })

  it('NON : n’importe quoi', () => {
    expect(verifyPhoneRevealToken('', SECRET, NOW)).toBeNull()
    expect(verifyPhoneRevealToken('abc', SECRET, NOW)).toBeNull()
    expect(verifyPhoneRevealToken('a.b.c', SECRET, NOW)).toBeNull()
  })

  it('le jeton tient dans un segment d’URL', () => {
    expect(signPhoneRevealToken(base, SECRET)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })
})
