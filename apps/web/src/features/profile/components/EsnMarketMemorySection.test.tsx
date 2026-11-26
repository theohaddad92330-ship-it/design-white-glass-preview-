import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import type { MarketEsnView, MarketEsnViewRead } from '@bellum/contracts'
import { EsnMarketMemorySection } from '@/features/profile/components/EsnMarketMemorySection'
import { useEsnMarketMemory } from '@/features/profile/hooks/useEsnMarketMemory'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

vi.mock('@/features/profile/hooks/useEsnMarketMemory', () => ({ useEsnMarketMemory: vi.fn() }))

/**
 * « Ton entreprise dans la mémoire marché » (#1636).
 *
 * Le bloc a un seul travail difficile : ne jamais transformer ce que NOUS
 * savons en fait sur l'entreprise du lecteur. Les cas d'absence sont donc
 * testés plus longuement que le cas nominal.
 */

const VIEW: MarketEsnView = {
  matchedCompanyName: 'ALTEN',
  matchedOn: 'name',
  pathsObserved: 14,
  roleFamilies: ['Développement', 'Data / IA', 'Chef de projet'],
  destinations: ['ORANGE', 'SNCF', 'THALES'],
}

const COVERED: MarketEsnViewRead = { status: 'ok', view: VIEW }

function setup(read: MarketEsnViewRead | undefined, isLoading = false) {
  vi.mocked(useEsnMarketMemory).mockReturnValue({ data: read, isLoading } as unknown as ReturnType<
    typeof useEsnMarketMemory
  >)
  return renderWithRouter(<EsnMarketMemorySection />)
}

describe('EsnMarketMemorySection', () => {
  it('dit ce que le produit OBSERVE, jamais ce que l’entreprise fait', async () => {
    setup(COVERED)

    expect(await screen.findByText(/voilà ce que .* observe/i)).toBeInTheDocument()
    expect(screen.getByText(/14 parcours observés autour de ton entreprise/i)).toBeInTheDocument()
    expect(screen.getByText(/Développement/)).toBeInTheDocument()
    expect(screen.getByText(/ORANGE/)).toBeInTheDocument()
    expect(screen.queryByText(/la vérité sur/i)).not.toBeInTheDocument()
  })

  it('NOMME l’entreprise rapprochée et par quoi — le rapprochement par nom est faible', async () => {
    setup(COVERED)

    expect(await screen.findByText(/ALTEN.*par son nom/i)).toBeInTheDocument()
  })

  it('sous le seuil : « pas suffisamment couverte », aucune conclusion négative, aucun zéro', async () => {
    setup({ status: 'insufficient' })

    expect(await screen.findByText(/n’est pas suffisamment couverte dans nos observations/i)).toBeInTheDocument()
    expect(screen.queryByText(/\b0\b/)).not.toBeInTheDocument()
    expect(screen.queryByText(/externalis/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/aucun parcours/i)).not.toBeInTheDocument()
  })

  it('sans nom d’entreprise : l’interrupteur est ÉTEINT, ce n’est pas une absence de couverture', async () => {
    // #1636 — un écran qui lit ce qui MANQUE sans lire l'INTERRUPTEUR annonce
    // une panne au repos.
    setup({ status: 'undeclared' })

    expect(await screen.findByText(/renseigne le nom de ton entreprise/i)).toBeInTheDocument()
    expect(screen.queryByText(/pas suffisamment couverte/i)).not.toBeInTheDocument()
  })

  it('une panne se DIT, elle ne se rend pas comme une absence d’observations', async () => {
    setup({ status: 'unavailable', reason: 'read_failed' })

    expect(await screen.findByText(/n’ont pas pu être lues/i)).toBeInTheDocument()
    expect(screen.queryByText(/pas suffisamment couverte/i)).not.toBeInTheDocument()
  })

  it('pendant le chargement, il ne conclut RIEN', () => {
    setup(undefined, true)

    expect(screen.queryByText(/pas suffisamment couverte/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/parcours observés/i)).not.toBeInTheDocument()
  })

  it('une liste vide ne s’affiche pas comme une liste vide', async () => {
    setup({ status: 'ok', view: { ...VIEW, roleFamilies: [], destinations: [] } })

    expect(await screen.findByText(/14 parcours observés/i)).toBeInTheDocument()
    expect(screen.queryByText(/familles principales/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/écosystèmes de destination/i)).not.toBeInTheDocument()
  })

  it('le bloc est en LECTURE SEULE — aucun bouton, aucun champ', async () => {
    setup(COVERED)

    await screen.findByText(/14 parcours observés/i)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
