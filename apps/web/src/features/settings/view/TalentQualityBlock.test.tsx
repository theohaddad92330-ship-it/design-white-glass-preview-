import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { stats } = vi.hoisted(() => ({ stats: vi.fn() }))
vi.mock('@/features/consultants/hooks', () => ({ useTalentStats: () => stats() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}))

const { TalentQualityBlock } = await import('./TalentQualityBlock')

const STATS = { total: 7, enrichedPercent: 71, incompleteCount: 4, lastUpdatedAt: '2026-08-30T00:00:00.000Z' }

beforeEach(() => stats.mockReset().mockReturnValue({ data: STATS, isLoading: false }))
afterEach(cleanup)

// #4349 V.1 — décision Louis 19/10 : la qualité des fiches consultants vit dans Réglages › Mes données.
describe('TalentQualityBlock — qualité des fiches consultants (#4349 V.1)', () => {
  it('affiche le % de profils enrichis et la dernière mise à jour', () => {
    render(<TalentQualityBlock />)
    expect(screen.getByText('Profils enrichis')).toBeInTheDocument()
    expect(screen.getByText('71 %')).toBeInTheDocument()
    expect(screen.getByText('Mis à jour')).toBeInTheDocument()
  })

  it('KEVIN-FIX K.2 — « Profils enrichis » DIT son seuil, pour ne pas contredire la complétude à 5 axes', () => {
    render(<TalentQualityBlock />)
    expect(screen.getByText(/au moins 3 des 5 axes/)).toBeInTheDocument()
  })

  it('« non mesuré », jamais 0 %, sans talent à mesurer', () => {
    stats.mockReturnValue({ data: { ...STATS, enrichedPercent: null, lastUpdatedAt: null }, isLoading: false })
    render(<TalentQualityBlock />)
    expect(screen.queryByText('0 %')).not.toBeInTheDocument()
    expect(screen.getAllByText('non mesuré')).toHaveLength(2)
  })

  it('ne rend rien pendant le chargement', () => {
    stats.mockReturnValue({ data: undefined, isLoading: true })
    const { container } = render(<TalentQualityBlock />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renvoie vers le Vivier', () => {
    render(<TalentQualityBlock />)
    expect(screen.getByText('Voir les fiches à compléter').closest('a')).toHaveAttribute('to', '/consultants')
  })
})
