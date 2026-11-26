import { render, screen } from '@testing-library/react'
import type { MarketContextMatch } from '@bellum/contracts'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useMarketContextSearch } from '@/features/search/hooks/useMarketContextSearch'
import { AuditMarketMemory } from './AuditMarketMemory'

/**
 * #2090.36 / #2090.38 / #2090.41 / #2090.42 / #2090.43.
 *
 * Même discipline que `MarketAwarenessCard.test.tsx` : rien de bloquant, et
 * le vocabulaire gardé ICI (le catalogue complet est gardé séparément par
 * `architecture/audit-market-memory-vocabulary.test.ts`, qui lit les fichiers
 * réels plutôt que ce fixture).
 */
const navigate = vi.fn()
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigate }
})
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useEsnProfile: vi.fn() }))
vi.mock('@/features/search/hooks/useMarketContextSearch', () => ({ useMarketContextSearch: vi.fn() }))

function mockEsnAnswers(overrides: { expertise_areas?: string[]; geo_zones?: string[] } = {}) {
  vi.mocked(useEsnProfile).mockReturnValue({
    data: { expertise_areas: [], geo_zones: [], ...overrides },
  } as unknown as ReturnType<typeof useEsnProfile>)
}

function mockSearch(state: { data?: unknown; isPending?: boolean }) {
  vi.mocked(useMarketContextSearch).mockReturnValue({
    data: state.data,
    isPending: state.isPending ?? false,
  } as unknown as ReturnType<typeof useMarketContextSearch>)
}

function match(companyName: string, observedStack: readonly string[] = []): MarketContextMatch {
  return {
    companyName,
    coverage: {
      covered: true,
      marketPaths: 12,
      esnObserved: [],
      observedStack: observedStack.map(techno => ({ techno, persons: 4 })),
      roleFamilies: [],
      exEsnPresent: null,
      observedZone: null,
    },
  } satisfies MarketContextMatch
}

beforeEach(() => {
  navigate.mockReset()
})

describe('AuditMarketMemory', () => {
  it('ne rend RIEN sans discriminant ni résultat — jamais un état d’erreur dans l’audit', () => {
    mockEsnAnswers()
    mockSearch({ data: undefined })
    expect(render(<AuditMarketMemory />).container).toBeEmptyDOMElement()

    mockEsnAnswers({ geo_zones: ['Lyon & Auvergne-Rhône-Alpes'] })
    mockSearch({ data: { status: 'ok', matches: [] } })
    expect(render(<AuditMarketMemory />).container).toBeEmptyDOMElement()
  })

  it('rend le badge « inclus », la limite et chaque compte avec son nom et sa raison', () => {
    mockEsnAnswers({ expertise_areas: ['Java'], geo_zones: ['Lyon & Auvergne-Rhône-Alpes'] })
    mockSearch({ data: { status: 'ok', matches: [match('Orange', ['Java', 'AWS']), match('SNCF', ['Mainframe'])] } })
    render(<AuditMarketMemory />)
    expect(screen.getByText('Observations du marché · inclus')).toBeInTheDocument()
    expect(screen.getByText(/Aperçu limité/)).toBeInTheDocument()
    expect(screen.getByText('Orange')).toBeInTheDocument()
    expect(screen.getByText('Compatible')).toBeInTheDocument()
    expect(screen.getByText('SNCF')).toBeInTheDocument()
    expect(screen.getByText('À qualifier')).toBeInTheDocument()
    expect(screen.getByText('Observé : Java')).toBeInTheDocument()
  })

  it('le CTA navigue vers Découvrir avec le MÊME discriminant', () => {
    mockEsnAnswers({ expertise_areas: ['Java'], geo_zones: ['Lyon & Auvergne-Rhône-Alpes'] })
    mockSearch({ data: { status: 'ok', matches: [match('Orange', ['Java'])] } })
    render(<AuditMarketMemory />)
    screen.getByText('Voir dans Découvrir').click()
    expect(navigate).toHaveBeenCalledWith({ to: '/discover', search: { mc_location: 'Lyon' } })
  })
})
