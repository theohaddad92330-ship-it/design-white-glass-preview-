import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { DeliverabilityBlock } from './DeliverabilityBlock'

/**
 * #2384.5 — la délivrabilité DISTINCTE du taux d'envoi.
 *
 * Chaque test protège une lecture FAUSSE que l'écran produirait sans lui :
 *  · un rebond mesuré affiché comme un « 0 % » plutôt qu'un vrai pourcentage ;
 *  · une réponse partielle (`{}`, ce que rend le fetch mocké des tests) qui
 *    ferait planter l'écran au lieu de se lire comme « rien à afficher » ;
 *  · une plainte/réputation de domaine non mesurée rendue à « 0 » au lieu de
 *    nommée absente (GA-18/GA-19).
 */
const useContactDeliverabilityMock = vi.fn()
vi.mock('@/features/contacts/hooks/useContactDeliverability', () => ({
  useContactDeliverability: () => useContactDeliverabilityMock(),
}))

beforeEach(async () => {
  useContactDeliverabilityMock.mockReset()
  await i18n.changeLanguage('fr')
})

describe('DeliverabilityBlock', () => {
  it('affiche les envoyés/rebonds/taux mesurés et nomme ce qui ne l’est pas', async () => {
    useContactDeliverabilityMock.mockReturnValue({
      data: {
        sent: 10,
        bounced: 2,
        bounceRate: 0.2,
        bounceReasons: [{ reason: 'permanent', count: 2 }],
        domainReputation: null,
        complaints: null,
      },
    })

    renderWithRouter(<DeliverabilityBlock />)

    expect(await screen.findByText('20.0%')).toBeInTheDocument()
    expect(screen.getByText('permanent — 2')).toBeInTheDocument()
    // Réputation de domaine et plaintes : jamais un « 0 », toujours nommées absentes.
    expect(screen.getAllByText(/^non mesuré/)).toHaveLength(2)
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('ne plante pas et se lit « rien à afficher » sur une réponse partielle (`{}`)', async () => {
    useContactDeliverabilityMock.mockReturnValue({ data: {} })

    renderWithRouter(<DeliverabilityBlock />)

    expect(await screen.findByText('Aucun envoi mesuré pour l’instant.')).toBeInTheDocument()
  })

  it('ne plante pas tant que la requête est en cours (`data` absent)', async () => {
    useContactDeliverabilityMock.mockReturnValue({ data: undefined })

    renderWithRouter(<DeliverabilityBlock />)

    expect(await screen.findByText('Aucun envoi mesuré pour l’instant.')).toBeInTheDocument()
  })
})
