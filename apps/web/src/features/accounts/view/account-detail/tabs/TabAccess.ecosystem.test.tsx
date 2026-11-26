import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, AccountMarketContext } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import accessEn from '@/i18n/locales/en/access.json'
import accessFr from '@/i18n/locales/fr/access.json'
import { TabAccess } from './TabAccess'

/**
 * #1631.7 — « DENSITÉ D'ÉCOSYSTÈME », le vocabulaire prescrit par le retour du
 * 06/09/2026 (issue #1631) — et ce qu'il refuse nommément.
 *
 * Trois expressions, un seul refus et deux wordings à tenir :
 *  - « Densité d'écosystème » (titre) et « Écosystème de services dense »
 *    DOIVENT apparaître dès qu'au moins une ESN a été observée ;
 *  - « Compte saturé » ne doit JAMAIS apparaître — ce que le retour interdit
 *    nommément sur le seul nombre d'ESN ;
 *  - aucun NO-GO automatique : pas de couleur d'alerte, un CTA qui ouvre
 *    Partenaires plutôt qu'un blocage.
 *
 * Binaire, pas un barème : `esn_observed > 0` est la même lecture déjà
 * approuvée pour `AccountMarketContextButton` (#1582) — jamais un seuil
 * Faible/Moyenne/Forte sur le nombre brut, qui serait corrélé à la taille de
 * l'entreprise.
 *
 * ⚠️ `apiFetch` est mocké et discriminé PAR CHEMIN (`/access` contre
 * `/market-context`) : `TabAccess` interroge les deux routes, et la lire via
 * `useQuery` direct — plutôt que le hook partagé `useAccountMarketContext` —
 * est un choix délibéré pour ne PAS exiger de `SessionProvider` sur les
 * suites voisines (voir le commentaire de `TabAccess.tsx`).
 */

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, useNavigate: () => navigateMock }
})
const navigateMock = vi.fn()

const ACCOUNT = {
  id: 'acc-eco-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

type Landscape = Record<string, unknown>

function landscape(): Landscape {
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
  }
}

/** Discrimine les deux routes que `TabAccess` interroge, PAR CHEMIN. */
function mockRoutes(marketContext: AccountMarketContext | null) {
  apiFetchMock.mockImplementation(async ({ path }: { path: string }) => {
    if (path.endsWith('/market-context')) return marketContext
    return landscape()
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

describe('la « densité d’écosystème » de l’onglet Accès', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    navigateMock.mockReset()
  })
  afterEach(cleanup)

  it('au moins une ESN observée : le titre, le wording prescrit, et le CTA', async () => {
    mockRoutes({ paths_observed: 12, esn_observed: 3 })
    mount()

    expect(await screen.findByText('Densité d’écosystème')).toBeInTheDocument()
    expect(screen.getByText('Écosystème de services dense')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Plusieurs relations ESN↔environnement ont été observées. Une approche directe peut mériter davantage de qualification.',
      ),
    ).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: 'Explorer les partenaires' })
    fireEvent.click(cta)
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/accounts/$id',
      params: { id: 'acc-eco-1' },
      search: { tab: 'partners' },
    })
  })

  it('« Compte saturé » n’apparaît JAMAIS — le retour l’interdit nommément', async () => {
    mockRoutes({ paths_observed: 12, esn_observed: 3 })
    const { container } = mount()

    await screen.findByText('Densité d’écosystème')
    expect(container.textContent ?? '').not.toContain('Compte saturé')
  })

  it('aucune couleur d’alerte — pas de NO-GO automatique', async () => {
    mockRoutes({ paths_observed: 12, esn_observed: 3 })
    mount()

    const badge = await screen.findByText('Écosystème de services dense')
    expect(badge.className).not.toMatch(/warning|danger/)
  })

  it('aucune ESN observée (compte couvert, `esn_observed: 0`) : la carte ne se rend PAS', async () => {
    mockRoutes({ paths_observed: 12, esn_observed: 0 })
    mount()

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(screen.queryByText('Densité d’écosystème')).not.toBeInTheDocument()
  })

  it('compte non couvert (`market-context: null`) : la carte ne se rend pas — pas de seuil deviné', async () => {
    mockRoutes(null)
    mount()

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(screen.queryByText('Densité d’écosystème')).not.toBeInTheDocument()
  })

  it('mémoire marché en panne : la carte ne se rend pas — elle n’invente rien sur une erreur', async () => {
    apiFetchMock.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith('/market-context')) throw new Error('lecture impossible')
      return landscape()
    })
    mount()

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(screen.queryByText('Densité d’écosystème')).not.toBeInTheDocument()
  })

  it('a les mêmes clés en français et en anglais — la parité, pas la bonne volonté', () => {
    const fr = Object.keys(accessFr.ecosystem).sort()
    const en = Object.keys(accessEn.ecosystem).sort()
    expect(fr.length).toBeGreaterThanOrEqual(4)
    expect(en).toEqual(fr)
  })
})
