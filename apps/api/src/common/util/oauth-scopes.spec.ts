import { grantedScopes, hasScope, looksLikeMissingScope } from './oauth-scopes'

/**
 * Ce que ces tests défendent : la différence entre « je n'ai rien trouvé » et
 * « je n'ai pas le droit de regarder ».
 *
 * Les deux se ressemblent à l'écran et n'appellent pas le même geste. Confondre
 * les deux a coûté, en production, un espace documentaire qui rendait une liste
 * vide et deux écrans CRM en erreur interne.
 */

describe('grantedScopes', () => {
  it('ne prend pas une portée pour une autre par sous-chaîne', () => {
    // `Mail.Read` ne donne PAS le droit d'écrire un brouillon : le croire
    // afficherait un bouton « Préparer » qui échoue au clic.
    const granted = grantedScopes('Mail.Read Calendars.ReadWrite')

    expect(hasScope(granted, 'Mail.ReadWrite')).toBe(false)
    expect(hasScope(granted, 'Mail.Read')).toBe(true)
  })

  it('accepte la casse du fournisseur', () => {
    // Microsoft rend `Mail.Read` sur l'écran de consentement et `mail.read`
    // dans la réponse du jeton. Comparer tel quel éteindrait une capacité qui
    // fonctionne.
    expect(hasScope(grantedScopes('mail.read'), 'Mail.Read')).toBe(true)
  })

  it('une portée absente reste absente', () => {
    expect(hasScope(grantedScopes(null), 'Files.Read.All')).toBe(false)
    expect(hasScope(grantedScopes('   '), 'Files.Read.All')).toBe(false)
  })
})

describe('looksLikeMissingScope', () => {
  it('reconnaît le refus de portée dans le texte du fournisseur', () => {
    expect(
      looksLikeMissingScope(
        "HubSpot read deals failed: This app hasn't been granted all required scopes to make this call.",
      ),
    ).toBe(true)
    expect(looksLikeMissingScope('Graph 403 Forbidden')).toBe(true)
  })

  it('ne prend pas une panne pour un refus', () => {
    // « Réessaie dans un moment » est le bon conseil ici, et le mauvais pour un
    // droit jamais accordé.
    expect(looksLikeMissingScope('socket hang up')).toBe(false)
    expect(looksLikeMissingScope('HubSpot search failed: 502 Bad Gateway')).toBe(false)
  })
})
