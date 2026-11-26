import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivateSwitch } from './PrivateSwitch'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

// #4158.55 — des accolades, PAS `() => apiFetch.mockClear()` : Vitest appelle comme *nettoyage* toute
// fonction retournée par `beforeEach`, donc le mock retourné était rappelé APRÈS le test — et, avec un
// `mockRejectedValue`, rejetait hors de tout `await` (« Error: Forbidden » attribué au test, sans cause
// apparente). Ce n'était pas jsdom.
beforeEach(() => {
  apiFetch.mockReset()
})

function wrap(isPrivate: boolean | undefined) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PrivateSwitch kind="projects" id="p-1" isPrivate={isPrivate} invalidate={[['projects']]} />
    </QueryClientProvider>,
  )
}

// #4158.34
describe('PrivateSwitch', () => {
  it('est décoché quand rien n’est posé : le défaut reste « partagé »', () => {
    wrap(undefined)
    expect(screen.getByRole('checkbox', { name: 'Privé' })).not.toBeChecked()
  })

  it('reflète un objet déjà privé', () => {
    wrap(true)
    expect(screen.getByRole('checkbox', { name: 'Privé' })).toBeChecked()
  })

  it('PATCH /privacy/projects/:id avec le nouvel état', async () => {
    apiFetch.mockResolvedValue({ id: 'p-1', is_private: true })
    wrap(false)
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('checkbox', { name: 'Privé' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/privacy/projects/p-1',
        method: 'PATCH',
        body: { is_private: true },
      }),
    )
  })

  // #4158.55 — l'erreur 403 du serveur (ni porteur, ni `team:manage`) se DIT, et la case reste à l'état réel.
  it('un refus 403 du serveur affiche l’erreur et laisse la case à son état réel', async () => {
    apiFetch.mockImplementation(() => Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 })))
    wrap(false)
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('checkbox', { name: 'Privé' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de changer la confidentialité')
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Privé' })).not.toBeChecked())
  })
})
