import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const excludeEntity = vi.fn()
const restoreEntity = vi.fn()
vi.mock('@/features/contacts/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  contactsApi: {
    excludeEntity: (...args: unknown[]) => excludeEntity(...args),
    restoreEntity: (...args: unknown[]) => restoreEntity(...args),
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { ContactsEntityExclude } = await import('./ContactsEntityExclude')
const { toast } = await import('sonner')

const renderIt = (props: Partial<Parameters<typeof ContactsEntityExclude>[0]> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContactsEntityExclude accountId="acc-1" entity="Boulangerie Ange" contactIds={['c-1', 'c-2']} {...props} />
    </QueryClientProvider>,
  )

// #4928.5 — « Écarter les contacts de cette entité » : un geste explicite, confirmé, réversible (archivage motivé).
describe('ContactsEntityExclude (#4928.5)', () => {
  beforeEach(async () => {
    excludeEntity.mockReset()
    restoreEntity.mockReset()
    restoreEntity.mockResolvedValue({ account_id: 'acc-1', restored: 2, contact_ids: ['c-1', 'c-2'] })
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
    excludeEntity.mockResolvedValue({ account_id: 'acc-1', excluded: 2, contact_ids: ['c-1', 'c-2'] })
    await i18n.changeLanguage('fr')
  })

  it('un clic ne part pas seul : il demande confirmation en nommant l’entité et le nombre', () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Écarter les contacts de cette entité/ }))
    expect(screen.getByText(/2 contacts de « Boulangerie Ange »/)).toBeInTheDocument()
    expect(excludeEntity).not.toHaveBeenCalled()
  })

  it('confirmer envoie UN seul geste serveur pour l’entité, avec un motif qui la nomme (#4928.5)', async () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Écarter les contacts de cette entité/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(excludeEntity).toHaveBeenCalledTimes(1))
    expect(excludeEntity).toHaveBeenCalledWith('acc-1', 'Boulangerie Ange', expect.stringContaining('Boulangerie Ange'))
  })

  it('un refus du serveur est dit, jamais un faux succès', async () => {
    excludeEntity.mockRejectedValue(new Error('403'))
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Écarter les contacts de cette entité/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('le geste inverse est VISIBLE après l’écartement : « Annuler » réintègre l’entité (#4928.5)', async () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Écarter les contacts de cette entité/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const options = vi.mocked(toast.success).mock.calls[0][1] as { action?: { label: string; onClick: () => void } }
    expect(options.action?.label).toBe('Annuler')
    options.action?.onClick()
    await waitFor(() => expect(restoreEntity).toHaveBeenCalledWith('acc-1', 'Boulangerie Ange'))
  })

  it('annuler ne touche à rien', () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /Écarter les contacts de cette entité/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(excludeEntity).not.toHaveBeenCalled()
  })

  it('aucun contact dans l’entité : aucun bouton (jamais « écarter 0 »)', () => {
    renderIt({ contactIds: [] })
    expect(screen.queryByRole('button', { name: /Écarter/ })).toBeNull()
  })
})
