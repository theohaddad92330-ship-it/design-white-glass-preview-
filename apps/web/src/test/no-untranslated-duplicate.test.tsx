import { render, screen } from '@testing-library/react'
import type { AnalysisApolloOrgEnrichment } from '@bellum/contracts'
import { ApolloFirmographicsCard } from '@/features/accounts/view/account-detail/tabs/sections/ApolloFirmographicsCard'

/**
 * L'écran ne redit pas en anglais ce qu'il dit déjà en français.
 *
 * Signalé en bêta sur une fiche de compte : un paragraphe entier en anglais,
 * alors que l'application est en français. Le texte est la présentation
 * d'entreprise renvoyée par la source d'enrichissement ; elle arrive telle
 * quelle, et la carte le signalait honnêtement (« reprise telle quelle, non
 * traduite »). Une mention ne fait pas d'un paragraphe anglais un contenu
 * français : la plainte reste juste.
 *
 * Le traduire à l'affichage demanderait un appel de modèle par consultation, et
 * une traduction machine d'une donnée de source est exactement ce que la carte
 * refusait de faire. Mais sur la fiche visée, le produit AVAIT déjà sa propre
 * présentation en français — la lecture Bellum, juste au-dessus. Le paragraphe
 * anglais n'ajoutait donc rien : il doublait.
 *
 * La règle retenue : la présentation de la source ne s'affiche que pour COMBLER
 * un vide, jamais pour doubler la nôtre. Rien n'est perdu quand nous n'avons
 * rien à dire, et rien d'anglais ne s'affiche quand nous avons mieux.
 */

const ENRICHMENT = {
  shortDescription: 'Airbus SE is Europe’s largest aeronautics and space company.',
  estimatedNumEmployees: 150000,
} as unknown as AnalysisApolloOrgEnrichment

describe('la présentation de la source ne double pas la nôtre', () => {
  it('elle est masquée quand le produit a déjà sa présentation en français', () => {
    render(<ApolloFirmographicsCard enrichment={ENRICHMENT} hasOwnSummary />)
    expect(screen.queryByText(/Airbus SE is Europe/)).toBeNull()
  })

  it('elle comble un vide, et dit alors qu’elle n’est pas traduite', () => {
    render(<ApolloFirmographicsCard enrichment={ENRICHMENT} hasOwnSummary={false} />)
    expect(screen.getByText(/Airbus SE is Europe/)).toBeTruthy()
    // Sans la mention, le lecteur croirait la phrase écrite par nous.
    expect(screen.getByText(/non traduite/i)).toBeTruthy()
  })

  it('le reste de la carte est rendu dans les deux cas', () => {
    // Le garde doit vérifier qu'on masque un paragraphe, pas la carte entière —
    // les faits chiffrés, eux, n'ont pas de langue.
    const { container } = render(<ApolloFirmographicsCard enrichment={ENRICHMENT} hasOwnSummary />)
    expect(container.textContent).toContain('150')
  })
})
