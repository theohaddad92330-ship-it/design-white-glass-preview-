import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: { path: string }) => apiFetch(args) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace('$' + key, value), to)}>
      {children}
    </a>
  ),
}))

const { NeedBeforeMissionCard } = await import('./NeedBeforeMissionCard')

function answer(handoff: unknown, duplicates: unknown) {
  // Un appel sans chemin (lecture voisine de la coque) reçoit les doublons : il ne pilote rien ici.
  apiFetch.mockImplementation((args?: { path?: string }) =>
    Promise.resolve(args?.path?.endsWith('/handoff-check') ? handoff : duplicates),
  )
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NeedBeforeMissionCard needId="n-1" />
    </QueryClientProvider>,
  )
}

beforeEach(() => apiFetch.mockReset())

describe('Refonte Théo — « Avant la mission » et « Doublons » (AFFAIRES-B4 / B5)', () => {
  it('nomme ce qui manquera au passage en mission', async () => {
    answer(
      { needId: 'n-1', status: 'presented', allowed: false, missing: ['consultant_engaged'], existingMissionId: null },
      { needId: 'n-1', candidates: [] },
    )
    mount()
    expect(await screen.findByRole('heading', { name: 'Avant la mission' })).toBeInTheDocument()
    expect(await screen.findByText(/Un consultant engagé/)).toBeInTheDocument()
  })

  it('rien ne manque : le dit, sans liste vide', async () => {
    answer(
      { needId: 'n-1', status: 'won', allowed: true, missing: [], existingMissionId: null },
      { needId: 'n-1', candidates: [] },
    )
    mount()
    expect(await screen.findByText(/Rien ne manque/)).toBeInTheDocument()
  })

  it('une mission déjà ouverte se nomme et mène à elle', async () => {
    answer(
      { needId: 'n-1', status: 'won', allowed: false, missing: ['mission_already_exists'], existingMissionId: 'm-9' },
      { needId: 'n-1', candidates: [] },
    )
    mount()
    expect(await screen.findByRole('link', { name: /Ouvrir la mission/ })).toHaveAttribute('href', '/missions/m-9')
  })

  it('liste les doublons probables, chacun vers sa fiche, avec la raison en clair', async () => {
    answer(
      { needId: 'n-1', status: 'presented', allowed: true, missing: [], existingMissionId: null },
      {
        needId: 'n-1',
        candidates: [
          { needId: 'n-2', title: 'Architecte plateforme', status: 'to_match', reason: 'competences_communes' },
        ],
      },
    )
    mount()
    expect(await screen.findByRole('link', { name: 'Architecte plateforme' })).toHaveAttribute(
      'href',
      '/projects/needs/n-2',
    )
    expect(screen.getByText(/compétence commune/)).toBeInTheDocument()
  })

  it('aucun doublon est une vraie réponse, dite en mots', async () => {
    answer(
      { needId: 'n-1', status: 'presented', allowed: true, missing: [], existingMissionId: null },
      { needId: 'n-1', candidates: [] },
    )
    mount()
    expect(await screen.findByText(/Aucun autre besoin de ce compte/)).toBeInTheDocument()
  })

  it('une lecture qui échoue ne se lit jamais « rien ne manque »', async () => {
    apiFetch.mockImplementation((args?: { path?: string }) =>
      args?.path ? Promise.reject(new Error('boom')) : Promise.resolve(null),
    )
    const { container } = mount()
    await vi.waitFor(() => expect(container.textContent).toMatch(/contrôle de passage en mission n’a pas pu être lu/))
    expect(container.textContent).toMatch(/recherche de doublons n’a pas pu être lue/)
    expect(screen.queryByText(/Rien ne manque/)).toBeNull()
    expect(screen.queryByText(/Aucun autre besoin/)).toBeNull()
  })
})
