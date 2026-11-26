import { describe, expect, it } from 'vitest'
import { redactLocation, redactUrl } from './safeUrl'

/**
 * #1960.7 — CE QUI PART DANS UN SIGNALEMENT NE PORTE JAMAIS UN JETON D'URL.
 *
 * Mesuré avant ce lot : `FeedbackWidget` envoyait `window.location.href` ENTIER,
 * et le fil des gestes gardait `pathname + search`. Or une requête ou une ancre
 * porte des secrets : `?t=` du lien de démonstration, `code`/`state` d'un retour
 * OAuth, `#access_token=` d'un lien de connexion. Tout finissait dans le corps
 * d'un ticket, sans aperçu. `networkBuffer` retirait déjà la requête des appels
 * en échec — la famille était traitée à moitié.
 */
describe('redactUrl', () => {
  it.each([
    ['https://app.example/demo?t=jeton-secret', 'https://app.example/demo?…'],
    ['https://app.example/auth/callback#access_token=abc', 'https://app.example/auth/callback#…'],
    ['https://app.example/integrations?code=xyz&state=s#frag', 'https://app.example/integrations?…#…'],
    ['https://app.example/accounts/42', 'https://app.example/accounts/42'],
  ])('%s → %s', (raw, expected) => {
    expect(redactUrl(raw)).toBe(expected)
  })

  it('garde le chemin seul quand l’adresse est illisible, sans jamais rendre la requête', () => {
    expect(redactUrl('http://[invalide/chat?t=secret')).not.toContain('secret')
  })
})

describe('redactLocation', () => {
  it('rend le chemin et la PRÉSENCE d’une requête ou d’une ancre, jamais leur valeur', () => {
    expect(redactLocation({ pathname: '/chat', search: '?c=123', hash: '' })).toBe('/chat?…')
    expect(redactLocation({ pathname: '/chat', search: '', hash: '#x' })).toBe('/chat#…')
    expect(redactLocation({ pathname: '/chat', search: '', hash: '' })).toBe('/chat')
  })
})
