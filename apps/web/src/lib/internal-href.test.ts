import { describe, expect, it } from 'vitest'
import { splitInternalHref } from './internal-href'

// #4868.1 — UN découpeur de chaîne → { to, search, hash } : le lien de Laura n'emporte plus sa requête DANS le chemin.
describe('splitInternalHref', () => {
  it('sépare le chemin, la recherche analysée et l’ancre', () => {
    expect(splitInternalHref('/consultants?new=true&name=Ana+L%C3%A9vy#fiche')).toEqual({
      to: '/consultants',
      search: { new: true, name: 'Ana Lévy' },
      hash: 'fiche',
    })
  })

  it('un chemin nu reste nu : ni search ni hash inventés', () => {
    expect(splitInternalHref('/dashboard')).toEqual({ to: '/dashboard' })
  })

  it('une requête vide n’écrit aucune recherche', () => {
    expect(splitInternalHref('/contacts?')).toEqual({ to: '/contacts' })
  })

  it('le repère de retour du fil (from=chat:<id>) voyage comme n’importe quel paramètre', () => {
    expect(splitInternalHref('/discover?sectors=it&from=chat%3Aabc')).toEqual({
      to: '/discover',
      search: { sectors: 'it', from: 'chat:abc' },
    })
  })
})
