import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedPortfolio } from '@bellum/contracts'
import { AccountOfferLensBanner } from './AccountOfferLensBanner'

/**
 * LE BANDEAU NE PROMET JAMAIS UNE PERSONNALISATION QUI N'A PAS EU LIEU.
 *
 * C'est la seule chose que ces tests gardent, et c'est la seule qui compte : un
 * commercial qui lit « analyse personnalisée avec ton portefeuille » sur un
 * espace où personne n'a rien saisi croira que le dossier a été lu sous SON
 * prisme. Le reste — la mise en forme du territoire, le libellé du domaine —
 * est du confort.
 */

const portfolio = vi.fn()
const esnProfile = vi.fn(() => ({ data: undefined as { geo_zones?: string[] } | undefined }))

vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => esnProfile() as unknown,
}))

vi.mock('@/features/profile/hooks/useOfferPortfolio', () => ({
  useOfferPortfolio: () => portfolio() as unknown,
}))

function resolved(overrides: Partial<ResolvedPortfolio>): {
  data: ResolvedPortfolio
  isPending: false
  isError: false
} {
  return {
    data: {
      version: 1,
      company_type: null,
      target_application_sectors: [],
      target_site: { types: [], min_headcount: null },
      target_geographies: [],
      preferred_buyer_role_families: [],
      secondary_gatekeeper_role_families: [],
      preferred_terms: [],
      forbidden_terms: [],
      lexicon: { overrides: [] },
      privacy: { feedback_reuse: 'tenant_private' },
      source: 'portfolio',
      ...overrides,
    } as ResolvedPortfolio,
    isPending: false,
    isError: false,
  }
}

beforeEach(() => {
  portfolio.mockReset()
  esnProfile.mockReset()
  esnProfile.mockReturnValue({ data: undefined })
})
afterEach(cleanup)

describe('avant de savoir, il ne dit RIEN', () => {
  it('ne rend rien pendant la lecture — un « non renseigné » de chargement se lit comme une vérité', () => {
    portfolio.mockReturnValue({ data: undefined, isPending: true, isError: false })
    const { container } = render(<AccountOfferLensBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien quand la lecture a ÉCHOUÉ — « je n’ai pas pu lire » n’est pas « rien n’est configuré »', () => {
    portfolio.mockReturnValue({ data: undefined, isPending: false, isError: true })
    const { container } = render(<AccountOfferLensBanner />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('quand rien n’est renseigné, il le DIT', () => {
  it('n’affiche AUCUN portefeuille par défaut', () => {
    portfolio.mockReturnValue(resolved({ source: 'legacy' }))
    render(<AccountOfferLensBanner />)
    expect(screen.getByText(/pas encore renseigné/i)).toBeInTheDocument()
    // Et surtout : jamais le mot qui promet ce qui n'a pas eu lieu.
    expect(screen.queryByText(/Analyse personnalisée/i)).toBeNull()
  })
})

describe('quand il est renseigné, il nomme le prisme ET le territoire', () => {
  it('rend les zones de chasse déclarées', () => {
    portfolio.mockReturnValue(
      resolved({ company_type: 'industrial_engineering', target_geographies: ['AURA', 'BFC', 'PACA'] }),
    )
    render(<AccountOfferLensBanner />)
    expect(screen.getByText(/AURA \/ BFC \/ PACA/)).toBeInTheDocument()
    expect(screen.getByText(/Analyse personnalisée/i)).toBeInTheDocument()
  })

  it('ne devine JAMAIS « France entière » quand aucune zone n’est déclarée', () => {
    portfolio.mockReturnValue(resolved({ company_type: 'esn_it', target_geographies: [] }))
    render(<AccountOfferLensBanner />)
    expect(screen.getByText(/aucune zone déclarée/i)).toBeInTheDocument()
    expect(screen.queryByText(/France entière/i)).toBeNull()
  })

  // LUDB.4 — la fiche lisait `target_geographies` seul pendant que Réglages ›
  // Profil montrait `geo_zones` : « aucune zone déclarée » sur un profil rempli.
  it('LUDB.4 — lit la zone du PROFIL quand le portefeuille n’en porte pas', () => {
    portfolio.mockReturnValue(resolved({ company_type: 'industrial_engineering', target_geographies: [] }))
    esnProfile.mockReturnValue({ data: { geo_zones: ['Lyon & Auvergne-Rhône-Alpes', 'Marseille & PACA'] } })
    render(<AccountOfferLensBanner />)
    expect(screen.getByText(/Lyon & Auvergne-Rhône-Alpes \/ Marseille & PACA/)).toBeInTheDocument()
    expect(screen.queryByText(/aucune zone déclarée/i)).toBeNull()
  })

  it('dit que le type de société n’est pas connu plutôt que d’en choisir un', () => {
    portfolio.mockReturnValue(resolved({ company_type: null, target_geographies: ['IDF'] }))
    render(<AccountOfferLensBanner />)
    expect(screen.getByText(/type de société non renseigné/i)).toBeInTheDocument()
  })
})
