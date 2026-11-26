import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { usePistesToReview } from '@/features/crm-counters/usePistesToReview'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@/features/crm-counters/usePistesToReview', () => ({ usePistesToReview: vi.fn() }))
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}))
const { PipelineDetectionsLink } = await import('./PipelineDetectionsLink')

// #4545 — la ligne du Pipe est l'un des cinq chemins vers le panneau des pistes : elle POSE `?pistes=1`
// (le panneau, `PistesDrawer`, est monté par la page et s'ouvre par l'URL, comme tous les autres chemins).
describe('PipelineDetectionsLink — la ligne « N pistes à revoir » du Pipe', () => {
  beforeEach(async () => {
    navigate.mockClear()
    await i18n.changeLanguage('fr')
    vi.mocked(usePistesToReview).mockReturnValue(3)
  })

  it('un clic ouvre le panneau des pistes, sans quitter le Pipe', async () => {
    renderWithRouter(<PipelineDetectionsLink />)
    fireEvent.click(await screen.findByRole('button', { name: /3 pistes à revoir/ }))
    expect(navigate).toHaveBeenCalledTimes(1)
    const call = navigate.mock.calls[0]?.[0]
    expect(call.to).toBe('/projects')
    expect(call.search({ stage: 'won' })).toEqual({ stage: 'won', pistes: 1 })
  })

  it.each([null, 0])('piste à revoir = %s : aucune ligne — on n’affiche pas ce qu’on n’a pas', async count => {
    vi.mocked(usePistesToReview).mockReturnValue(count)
    renderWithRouter(<PipelineDetectionsLink />)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(screen.queryByRole('button', { name: /pistes? à revoir/ })).toBeNull()
  })
})
