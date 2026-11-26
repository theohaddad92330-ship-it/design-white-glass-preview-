import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicBanner } from '@bellum/contracts'
import { BannerBar } from './BannerBar'

// Drive the bar off a mocked hook so the test needs no query client / session.
const mockUseActiveBanners = vi.fn()
vi.mock('./useBanners', () => ({
  useActiveBanners: () => mockUseActiveBanners(),
}))

function banner(over: Partial<PublicBanner> = {}): PublicBanner {
  return {
    id: over.id ?? 'b1',
    kind: over.kind ?? 'announcement',
    variant: over.variant ?? 'info',
    title: over.title ?? { fr: 'Titre FR', en: 'Title EN' },
    body: over.body ?? { fr: '', en: '' },
    cta: over.cta ?? null,
    dismissible: over.dismissible ?? true,
    priority: over.priority ?? 0,
    version: over.version ?? 1,
  }
}

beforeEach(() => {
  window.localStorage.clear()
  // Deterministic locale for content assertions.
  Object.defineProperty(window.navigator, 'language', { value: 'fr-FR', configurable: true })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('BannerBar', () => {
  it('renders nothing when there are no active banners', () => {
    mockUseActiveBanners.mockReturnValue({ data: [] })
    const { container } = render(<BannerBar />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders active banners stacked in the order provided by the API', () => {
    mockUseActiveBanners.mockReturnValue({
      data: [
        banner({ id: 'high', title: { fr: 'Priorité haute', en: 'High' }, priority: 9 }),
        banner({ id: 'low', title: { fr: 'Priorité basse', en: 'Low' }, priority: 1 }),
      ],
    })
    render(<BannerBar />)
    const rows = screen.getAllByRole('status')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAttribute('data-banner-id', 'high')
    expect(rows[1]).toHaveAttribute('data-banner-id', 'low')
  })

  it('renders the viewer-locale content and a CTA link', () => {
    mockUseActiveBanners.mockReturnValue({
      data: [
        banner({
          title: { fr: 'Offre du week-end', en: 'Weekend offer' },
          cta: { label: { fr: 'Voir l’offre', en: 'See the offer' }, url: 'https://bellum-ai.com/offre' },
        }),
      ],
    })
    render(<BannerBar />)
    expect(screen.getByText('Offre du week-end')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Voir l’offre' })
    expect(link).toHaveAttribute('href', 'https://bellum-ai.com/offre')
  })

  it('dismisses a dismissible banner and persists it to localStorage', () => {
    mockUseActiveBanners.mockReturnValue({ data: [banner({ id: 'promo', version: 3, dismissible: true })] })
    const { rerender } = render(<BannerBar />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer l’annonce' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('bellum:banner-dismissed:promo:3')).toBe('1')

    // Stays gone on a re-render (persisted dismissal, same version).
    rerender(<BannerBar />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('reappears after a version bump (re-published banner defeats the dismissal)', () => {
    window.localStorage.setItem('bellum:banner-dismissed:promo:3', '1')
    mockUseActiveBanners.mockReturnValue({ data: [banner({ id: 'promo', version: 4, dismissible: true })] })
    render(<BannerBar />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('never shows a dismiss control for a non-dismissible banner', () => {
    mockUseActiveBanners.mockReturnValue({
      data: [banner({ id: 'maint', kind: 'maintenance', variant: 'warning', dismissible: false })],
    })
    render(<BannerBar />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fermer l’annonce' })).not.toBeInTheDocument()
  })

  it('hides a banner already dismissed at the same version on mount', () => {
    window.localStorage.setItem('bellum:banner-dismissed:promo:2', '1')
    mockUseActiveBanners.mockReturnValue({ data: [banner({ id: 'promo', version: 2, dismissible: true })] })
    const { container } = render(<BannerBar />)
    expect(container).toBeEmptyDOMElement()
  })
})
