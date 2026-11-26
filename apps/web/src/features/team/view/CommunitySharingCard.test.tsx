import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TEAM_KEY } from '@/features/team/hooks/useTeam'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { CommunitySharingCard } = await import('./CommunitySharingCard')

function renderCard(props: { sharing: boolean; canManage: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <CommunitySharingCard {...props} />
    </QueryClientProvider>,
  )
  return { invalidate }
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({ sharing: true })
})

describe('l’opt-in de la donnée communautaire', () => {
  it('sends the new value to the server', async () => {
    renderCard({ sharing: false, canManage: true })
    await userEvent.click(screen.getByRole('switch'))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/workspaces/community-sharing', method: 'PATCH', body: { sharing: true } }),
      ),
    )
  })

  it('invalidates the SAME cache key the team screen reads', async () => {
    // ⚠️ Trouvé en recette live : la carte invalidait une clé RÉ-ÉCRITE à la
    // main. Le serveur enregistrait le réglage, l'écran continuait d'afficher
    // l'ancienne valeur, et le clic suivant renvoyait la même valeur. Un réglage
    // qui ne se voit pas est un réglage qu'on croit cassé.
    const { invalidate } = renderCard({ sharing: false, canManage: true })
    await userEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: TEAM_KEY }))
  })

  it('lets no one but the owner touch it', async () => {
    renderCard({ sharing: false, canManage: false })
    expect(screen.getByRole('switch')).toBeDisabled()
    await userEvent.click(screen.getByRole('switch'))
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
