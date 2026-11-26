import { describe, expect, it } from 'vitest'
import { parseOAuthCallback } from './oauth-callback'

/**
 * #2078.25 — aucune action marquée RÉUSSIE sans confirmation du connecteur.
 * Seul le mot exact `connected`, écrit par le serveur après l'échange réel du
 * jeton, produit un succès. Tout le reste — refus, erreur fournisseur, valeur
 * absente ou inconnue — tombe dans l'échec, jamais dans un succès optimiste.
 */
describe('parseOAuthCallback', () => {
  it('lit un corpus non vide : un retour connu se reconnaît', () => {
    expect(parseOAuthCallback('?google=connected')).toEqual({ provider: 'google', status: 'connected' })
  })

  it('aucun provider connu dans l’URL : rien à traiter', () => {
    expect(parseOAuthCallback('')).toBeNull()
    expect(parseOAuthCallback('?foo=connected')).toBeNull()
  })

  it('sait dire NON : un refus de l’utilisateur n’est PAS un succès', () => {
    expect(parseOAuthCallback('?google=denied')).toEqual({ provider: 'google', status: 'failed', reason: null })
  })

  it('sait dire NON : une erreur fournisseur avec sa raison n’est PAS un succès', () => {
    expect(parseOAuthCallback('?hubspot=error&reason=scope_missing')).toEqual({
      provider: 'hubspot',
      status: 'failed',
      reason: 'scope_missing',
    })
  })

  it('sait dire NON : une valeur inconnue n’est PAS un succès non plus', () => {
    expect(parseOAuthCallback('?microsoft=0')).toEqual({ provider: 'microsoft', status: 'failed', reason: null })
  })
})
