import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accountsApi } from '@/features/accounts/api'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'
import { NotInPortfolioEmptyState } from './NotInPortfolioEmptyState'

vi.mock('@/features/accounts/api', async importOriginal => {
  const original = await importOriginal<typeof import('@/features/accounts/api')>()
  return { ...original, accountsApi: { ...original.accountsApi, list: vi.fn() } }
})
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))

const page = (totalItems: number) => ({
  data: [],
  pagination: { currentPage: 1, size: 1, totalItems, totalPages: totalItems, hasNext: false, hasPrev: false },
})

/**
 * #4621 — ENGIE, mesuré le 18/10 dans l'espace, répondait « Aucun compte ne correspond » : la liste écarte les comptes
 * archivés de la recherche (#4053, décision inscrite — on ne la renverse pas). Mais l'écran ne DISAIT rien : rien ne
 * distinguait « absent » d'« archivé ». Il le dit maintenant, et offre le geste qui y mène (l'onglet « Hors priorité »).
 */
describe('NotInPortfolioEmptyState — #4621', () => {
  beforeEach(() => {
    resetTestQueryClient()
    vi.mocked(accountsApi.list).mockReset()
  })

  it('interroge les ARCHIVÉS avec le nom tapé, un seul résultat demandé (on ne lit que le total)', async () => {
    vi.mocked(accountsApi.list).mockResolvedValue(page(0))
    renderWithRouter(<NotInPortfolioEmptyState company="ENGIE" onShowArchived={() => {}} />)
    await screen.findByText(/peut exister sans y être/)
    expect(accountsApi.list).toHaveBeenCalledWith(expect.objectContaining({ q: 'ENGIE', status: 'archived', limit: 1 }))
  })

  it('un compte archivé correspond : l’écran DIT qu’il est archivé et offre de l’ouvrir, sans proposer d’analyse payante', async () => {
    vi.mocked(accountsApi.list).mockResolvedValue(page(1))
    const onShowArchived = vi.fn()
    renderWithRouter(<NotInPortfolioEmptyState company="ENGIE" onShowArchived={onShowArchived} />)

    expect(await screen.findByText(/est archivé/i)).toBeInTheDocument()
    expect(screen.queryByText(/peut exister sans y être/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /analyser/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /hors priorité/i }))
    expect(onShowArchived).toHaveBeenCalledTimes(1)
  })

  it('accorde le nombre : plusieurs archivés', async () => {
    vi.mocked(accountsApi.list).mockResolvedValue(page(3))
    renderWithRouter(<NotInPortfolioEmptyState company="ENGIE" onShowArchived={() => {}} />)
    expect(await screen.findByText(/3 comptes archivés/i)).toBeInTheDocument()
  })

  it('aucun archivé ne correspond : le message d’avant, inchangé, avec l’analyse (le test sait dire NON)', async () => {
    vi.mocked(accountsApi.list).mockResolvedValue(page(0))
    renderWithRouter(<NotInPortfolioEmptyState company="ENGIE" onShowArchived={() => {}} />)
    expect(await screen.findByText(/peut exister sans y être/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /analyser « ENGIE »/i })).toBeInTheDocument()
    expect(screen.queryByText(/archivé/i)).not.toBeInTheDocument()
  })

  it('la lecture des archivés échoue : le message d’avant — jamais un « 0 archivé » affirmé', async () => {
    vi.mocked(accountsApi.list).mockRejectedValue(new Error('boom'))
    renderWithRouter(<NotInPortfolioEmptyState company="ENGIE" onShowArchived={() => {}} />)
    expect(await screen.findByText(/peut exister sans y être/)).toBeInTheDocument()
    expect(screen.queryByText(/archivé/i)).not.toBeInTheDocument()
  })

  /**
   * #4621.1 — la VRAIE cause mesurée en base le 26/10 (`Engie`, status `error`, 0 contact/angle/plan/run) : la coquille
   * d'échec VIDE est masquée par conception (anti-parasite), donc « Aucun compte ne correspond » alors que la base
   * sait qu'une analyse a échoué sur ce nom. Seul le total est lu, avec le même nom et le filtre « Échecs ».
   */
  it('une analyse ÉCHOUÉE porte ce nom : l’écran le DIT et offre de la reprendre, jamais « absent »', async () => {
    vi.mocked(accountsApi.list).mockImplementation(async query => page(query?.status === 'archived' ? 0 : 1))
    renderWithRouter(<NotInPortfolioEmptyState company="Engie" onShowArchived={() => {}} />)

    expect(await screen.findByText(/analyse a échoué/i)).toBeInTheDocument()
    expect(screen.queryByText(/peut exister sans y être/)).not.toBeInTheDocument()
    expect(accountsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'Engie', status: ['error', 'canceled'], limit: 1 }),
    )
    expect(screen.getByRole('link', { name: /reprendre/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /voir les échecs/i })).toBeInTheDocument()
  })

  it('l’archivé l’emporte sur l’échec : le compte est connu et rangé, c’est ce qu’on dit d’abord', async () => {
    vi.mocked(accountsApi.list).mockResolvedValue(page(1))
    renderWithRouter(<NotInPortfolioEmptyState company="Engie" onShowArchived={() => {}} />)
    expect(await screen.findByText(/est archivé/i)).toBeInTheDocument()
    expect(screen.queryByText(/analyse a échoué/i)).not.toBeInTheDocument()
  })
})
