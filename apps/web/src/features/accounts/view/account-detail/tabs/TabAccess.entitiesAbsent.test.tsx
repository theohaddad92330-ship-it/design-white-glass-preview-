import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { TabAccess } from './TabAccess'

/**
 * #3473 (recette Y18) — « Par quelle entité entrer » était ABSENT en prod
 * (La Poste) alors qu'il est là en démo. Cause : le bloc n'existait que si le
 * compte avait des entités DÉCLARÉES (`entities.length > 0`) ; l'analyse, elle,
 * pouvait en avoir cartographié sans qu'aucune soit déclarée. L'écran se taisait.
 * Il NOMME maintenant l'absence — jamais une entité inventée.
 */

const apiFetchMock = vi.mocked(apiFetch)
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, useNavigate: () => vi.fn() }
})

const ACCOUNT = {
  id: 'acc-poste',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

function mockLandscape(extra: Record<string, unknown>) {
  apiFetchMock.mockImplementation(async ({ path }: { path: string }) => {
    if (path.endsWith('/market-context')) return null
    return {
      lock: { state: 'inconnu', fact: null },
      modes: [],
      cost: null,
      facts: [],
      entities: [],
      avoidGroupEntry: false,
      warning: null,
      community: null,
      question: null,
      barrier: null,
      addressability: null,
      ...extra,
    }
  })
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TabAccess account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('« Par quelle entité entrer » — l’absence se nomme (#3473)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })
  afterEach(cleanup)

  it('aucune entité déclarée mais l’analyse en a repéré : le bloc le dit, avec le compte', async () => {
    mockLandscape({ analysisEntityCount: 3 })
    mount()
    expect(await screen.findByText('Par quelle entité entrer')).toBeInTheDocument()
    expect(screen.getByText(/3 entités repérées par l’analyse/)).toBeInTheDocument()
  })

  it('aucune entité connue du tout : le bloc dit « aucune », sans « 0 » ni entité inventée', async () => {
    mockLandscape({ analysisEntityCount: 0 })
    mount()
    expect(await screen.findByText('Par quelle entité entrer')).toBeInTheDocument()
    expect(screen.getByText(/Aucune entité n’est connue pour ce compte/)).toBeInTheDocument()
  })

  it('des entités déclarées : la liste, pas la phrase d’absence', async () => {
    mockLandscape({
      entities: [{ id: 'e1', name: 'Poste Immo', kind: 'subsidiary', rank1_incumbent: 'no', score: 1, reason: 'x' }],
      analysisEntityCount: 3,
    })
    mount()
    expect(await screen.findByText('Poste Immo')).toBeInTheDocument()
    expect(screen.queryByText(/Aucune entité n’est connue/)).toBeNull()
  })

  // #3777 (R41) — EDF : neuf entités au rang 1 « inconnu » = neuf pastilles identiques. Une absence ne fait pas de ligne.
  it('SAIT DIRE NON puis OUI : tous les rangs 1 inconnus ⇒ UNE phrase, aucune ligne par entité ; un rang connu garde sa ligne', async () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({
      id: `u${i}`,
      name: `Filiale ${i}`,
      kind: 'subsidiary',
      rank1_incumbent: 'unknown',
      score: 1,
      reason: 'x',
    }))
    mockLandscape({ entities: nine, analysisEntityCount: 9 })
    mount()
    expect(await screen.findByTestId('entities-rank1-unknown')).toHaveTextContent(/9 entités connues/)
    expect(screen.queryByText('Filiale 0')).toBeNull()
    expect(screen.queryAllByText('rang 1 inconnu')).toHaveLength(0)
    cleanup()
    mockLandscape({
      entities: [
        ...nine,
        { id: 'k', name: 'Filiale connue', kind: 'subsidiary', rank1_incumbent: 'yes', score: 2, reason: 'y' },
      ],
      analysisEntityCount: 10,
    })
    mount()
    expect(await screen.findByText('Filiale connue')).toBeInTheDocument()
    expect(screen.queryByText('Filiale 3')).toBeNull()
  })
})
