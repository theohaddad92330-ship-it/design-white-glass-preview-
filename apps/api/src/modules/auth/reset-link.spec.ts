import { buildResetLink, resetSignatureIsValid, signResetToken } from './reset-link'

const SECRET = 'test-reset-signing-secret'

/**
 * Le lien de réinitialisation (défaut trouvé en production le 20/08).
 *
 * Il existait en deux exemplaires : le flux e-mail construisait un lien vers
 * NOTRE écran, le back-office rendait le lien Supabase brut — qui mène à la
 * racine de l'application, où il n'y a rien pour le consommer. Un opérateur
 * remettait donc un lien qui ne permettait pas de changer son mot de passe.
 */
describe('buildResetLink', () => {
  it('mène à l’écran de réinitialisation de l’application, pas à sa racine', () => {
    const link = buildResetLink({
      frontendUrl: 'https://app.bellum-ai.com',
      tokenHash: 'abc123',
      expiresAt: 1_700_000_900_000,
      secret: SECRET,
    })
    expect(link).toContain('https://app.bellum-ai.com/auth/reset-password?')
    expect(link).toContain('token_hash=abc123')
    expect(link).toContain('expires_at=1700000900000')
    expect(link).toMatch(/signature=[a-f0-9]{64}/)
  })

  it('supporte une URL de base avec une barre finale', () => {
    const link = buildResetLink({
      frontendUrl: 'https://app.bellum-ai.com/',
      tokenHash: 'abc123',
      expiresAt: 1,
      secret: SECRET,
    })
    // Sans ça, l'URL porterait un double slash et la route ne matcherait pas.
    expect(link).toContain('https://app.bellum-ai.com/auth/reset-password?')
  })
})

describe('resetSignatureIsValid', () => {
  it('accepte une signature intacte', () => {
    const signature = signResetToken('abc123', 42, SECRET)
    expect(resetSignatureIsValid('abc123', 42, signature, SECRET)).toBe(true)
  })

  it('REFUSE une échéance rallongée dans l’URL', () => {
    // L'échéance entre dans la signature : sans elle, n'importe qui pourrait
    // rallonger la validité d'un lien en éditant le paramètre.
    const signature = signResetToken('abc123', 42, SECRET)
    expect(resetSignatureIsValid('abc123', 999_999, signature, SECRET)).toBe(false)
  })

  it('REFUSE un jeton substitué', () => {
    const signature = signResetToken('abc123', 42, SECRET)
    expect(resetSignatureIsValid('autre', 42, signature, SECRET)).toBe(false)
  })

  it('refuse proprement une signature mal formée, sans lever', () => {
    // `timingSafeEqual` lève sur des longueurs différentes : la forme est
    // vérifiée avant, sinon un lien tronqué produirait un 500 au lieu d'un refus.
    expect(() => resetSignatureIsValid('abc123', 42, 'pas-du-hex', SECRET)).not.toThrow()
    expect(resetSignatureIsValid('abc123', 42, 'pas-du-hex', SECRET)).toBe(false)
    expect(resetSignatureIsValid('abc123', 42, '', SECRET)).toBe(false)
  })
})
