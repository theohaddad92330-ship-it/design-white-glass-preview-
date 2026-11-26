import { screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { Account } from '@bellum/contracts'
import { TabPartners } from './TabPartners'

/**
 * #1579 — une TROISIÈME nature de preuve dans l'onglet Partenaires.
 *
 * Le produit portait « déclaré par quelqu'un » et « détecté par l'analyse ».
 * L'observation en est une autre, et ce qui compte ici est ce qu'elle NE dit
 * pas : elle n'affirme aucune intervention actuelle.
 */

const observed = [
  { esnName: 'ALTEN', persons: 9, certainty: 'forte' as const, alsoKnown: false },
  { esnName: 'Capgemini', persons: 3, certainty: 'moyenne' as const, alsoKnown: true },
]

/**
 * ⚠️ Un identifiant DIFFÉRENT par test, et ce n'est pas de la coquetterie :
 * `renderWithRouter` partage un `QueryClient` au niveau du module, donc le cache
 * de React Query SURVIT d'un test à l'autre. Avec le même `account.id`, le test
 * suivant relit la réponse du précédent et passe au vert en lisant des données
 * qu'il n'a pas fournies — exactement le genre de test qui ne mesure rien.
 */
const account = (id: string) => ({ id, company_name: 'Thales' }) as unknown as Account

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

function mockLandscape(payload: Record<string, unknown>) {
  apiFetch.mockResolvedValue(payload)
}

describe('TabPartners — les sociétés observées', () => {
  beforeEach(() => apiFetch.mockReset())

  it('affiche la mise en garde AVEC le bloc — une observation n’est pas une présence actuelle', async () => {
    const id = 'a-observed-1'
    mockLandscape({ partners: [], recommendations: [], observed })
    renderWithRouter(<TabPartners account={account(id)} />)

    expect(await screen.findByText('ALTEN')).toBeInTheDocument()
    expect(screen.getByText(/ne prouve pas une intervention actuelle/)).toBeInTheDocument()
  })

  /**
   * #1605 — CE TEST A CHANGÉ D'INTENTION, ET C'EST VOULU.
   *
   * Il gardait la pastille « Déjà dans ta liste », qui disait qu'une société
   * observée était aussi connue de l'espace. Elle n'existe plus : depuis #1605,
   * une société déjà connue REJOINT la liste canonique avec ses origines de
   * preuve, et ce bloc ne porte que ce que l'espace ignore encore. Le doublon
   * n'est plus signalé, il n'existe plus.
   *
   * Ce qui reste à garder, et qui est le fond du bloc : une société observée que
   * personne n'a déclarée est une PISTE, pas une présence.
   */
  it('ne porte que les sociétés que l’espace ne connaît PAS encore', async () => {
    const id = 'a-observed-2'
    mockLandscape({ partners: [], recommendations: [], observed })
    renderWithRouter(<TabPartners account={account(id)} />)

    expect(await screen.findByText('Capgemini')).toBeInTheDocument()
    expect(screen.queryByText('Déjà dans ta liste')).not.toBeInTheDocument()
  })

  it('n’affiche AUCUN bloc quand rien n’est observé', async () => {
    const id = 'a-observed-3'
    mockLandscape({ partners: [], recommendations: [], observed: [] })
    renderWithRouter(<TabPartners account={account(id)} />)

    await screen.findByText('Les ESN présentes')
    expect(screen.queryByText(/Sociétés de services observées/)).not.toBeInTheDocument()
    expect(screen.queryByText(/parcours observé/)).not.toBeInTheDocument()
  })

  it('n’affiche AUCUN bloc quand le champ est ABSENT — une API plus ancienne que le web', async () => {
    const id = 'a-observed-4'
    mockLandscape({ partners: [], recommendations: [] })
    renderWithRouter(<TabPartners account={account(id)} />)

    await screen.findByText('Les ESN présentes')
    expect(screen.queryByText(/Sociétés de services observées/)).not.toBeInTheDocument()
  })
})
