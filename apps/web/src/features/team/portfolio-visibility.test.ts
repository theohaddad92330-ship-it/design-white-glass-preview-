import { describe, expect, it } from 'vitest'
import { readPortfolioVisibility } from './portfolio-visibility'

describe('lire le cloisonnement de portefeuille sur la charge utile de l’espace', () => {
  it('rend la valeur que le serveur a envoyée', () => {
    expect(readPortfolioVisibility({ portfolioVisibility: 'restricted' })).toBe('restricted')
    expect(readPortfolioVisibility({ portfolioVisibility: 'open' })).toBe('open')
  })

  it('rend `null` — et surtout PAS « open » — quand le serveur ne dit rien', () => {
    // ⚠️ C'est la règle du dépôt appliquée à un réglage : une valeur absente ne
    // s'affiche jamais à sa valeur par défaut. `GET /workspaces/me` ne renvoie
    // pas encore ce champ ; rendre 'open' ferait présenter « ouvert à toute
    // l'équipe » comme le réglage en cours à une ESN qui a cloisonné. La
    // question à se poser est celle de GA-19 : si la valeur est absente,
    // « open » est-il VRAI ? Non — il est seulement le défaut du serveur.
    expect(readPortfolioVisibility({ id: 'ws-1', name: 'ESN', role: 'owner' })).toBeNull()
    expect(readPortfolioVisibility({ portfolioVisibility: null })).toBeNull()
    expect(readPortfolioVisibility({ portfolioVisibility: undefined })).toBeNull()
  })

  it('refuse une valeur hors de l’énumération du contrat', () => {
    // Le champ est lu à travers le schéma zod du contrat, pas comparé à des
    // chaînes recopiées : une troisième valeur ajoutée côté serveur sans passer
    // par `PORTFOLIO_VISIBILITIES` n'est pas affichée par accident.
    expect(readPortfolioVisibility({ portfolioVisibility: 'private' })).toBeNull()
    expect(readPortfolioVisibility({ portfolioVisibility: 3 })).toBeNull()
    expect(readPortfolioVisibility({ portfolioVisibility: { visibility: 'open' } })).toBeNull()
  })
})
