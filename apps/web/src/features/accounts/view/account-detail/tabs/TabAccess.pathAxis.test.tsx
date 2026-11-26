import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import accessEn from '@/i18n/locales/en/access.json'
import accessFr from '@/i18n/locales/fr/access.json'
import { TabAccess } from './TabAccess'

// #4116 (recette 13/10) — le bandeau de fraîcheur lit `useIsDemo` (hors démo seulement).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

/**
 * Lot 13 — deux petits correctifs d'affichage demandés sur l'onglet Accès,
 * livrés avec l'axe CHEMIN côté IA (`discover_scoring.py`) :
 *
 * - #1606.6 — un CTA « Explorer les partenaires » directement sous l'axe
 *   Chemin, quand il est MESURÉ (pas seulement dans la carte « Densité
 *   d'écosystème », qui répond à une autre question) ;
 * - #1606.4 — le coût d'accès n'est pas un axe qu'on n'a pas pu regarder :
 *   c'est un refus assumé (D60), déclaratif. La liste des axes non mesurés le
 *   noyait dans les mêmes lignes muettes que « chemin » et « relation », qui
 *   eux ATTENDENT une donnée. Un badge dédié distingue les deux familles.
 *
 * ⚠️ Au 10/09/2026, aucun appelant réel ne transporte encore de compte de
 * parcours jusqu'à `addressability_for_company` (voir le commentaire IA
 * au-dessus de `_AXIS_LOCK`) — l'axe Chemin mesuré ci-dessous est donc un
 * FIXTURE, exactement comme l'a été l'axe Relation avant #1631.5 : l'écran est
 * prêt, le brancher sur un compte de parcours réel reste à faire côté API/IA.
 */

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, useNavigate: () => navigateMock }
})
const navigateMock = vi.fn()

const ACCOUNT = {
  id: 'acc-path-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

type Landscape = Record<string, unknown>

function landscape(addressability: unknown): Landscape {
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
    addressability,
  }
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TabAccess account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('lot 13 — le CTA de l’axe Chemin et le badge Déclaratif du coût d’accès', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    navigateMock.mockReset()
  })
  afterEach(cleanup)

  it('#1606.6 — propose « Explorer les partenaires » sous l’axe Chemin MESURÉ', async () => {
    apiFetchMock.mockResolvedValue(
      landscape({
        score: 5,
        max: 5,
        unmeasured: ['lock', 'proportion', 'relation', 'access_cost'],
        factors: [
          {
            label: 'Chemin partenaire documenté — preuve forte, à qualifier',
            points: 5,
            evidence: '9 parcours observés relient ALTEN à cet environnement — chemin partenaire à qualifier.',
            axis: 'path',
          },
        ],
      }),
    )
    mount()

    expect(await screen.findByText(/chemin partenaire à qualifier/)).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: 'Explorer les partenaires' })
    fireEvent.click(cta)
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/accounts/$id',
      params: { id: 'acc-path-1' },
      search: { tab: 'partners' },
    })
  })

  it('n’affiche AUCUN CTA quand aucun axe Chemin n’est mesuré', async () => {
    apiFetchMock.mockResolvedValue(
      landscape({
        score: 6,
        max: 6,
        unmeasured: ['proportion', 'path', 'relation', 'access_cost'],
        factors: [
          {
            label: 'Consultation ouverte — la porte l’est aussi',
            points: 6,
            evidence: 'appel d’offres publié : Refonte SI',
            axis: 'lock',
          },
        ],
      }),
    )
    mount()

    await screen.findByText('6/6')
    expect(screen.queryByRole('button', { name: 'Explorer les partenaires' })).not.toBeInTheDocument()
  })

  it('#1606.4 — le coût d’accès porte un badge « Déclaratif », les autres axes non mesurés n’en portent aucun', async () => {
    apiFetchMock.mockResolvedValue(
      landscape({
        score: null,
        max: 0,
        unmeasured: ['lock', 'proportion', 'path', 'relation', 'access_cost'],
        factors: [],
      }),
    )
    mount()

    const declarativeBadges = await screen.findAllByText('Déclaratif')
    expect(declarativeBadges).toHaveLength(1)

    // Le badge est ACCOLÉ à la ligne du coût d'accès — sa rangée NE PORTE que
    // ce texte-là, jamais celui des axes qui ATTENDENT une donnée. Le badge
    // lui-même est un `<div>` (`Badge`) : `.closest('div')` le rend d'abord,
    // il faut remonter d'un cran pour atteindre la RANGÉE qui le contient.
    const badgeRow = declarativeBadges[0].closest('div')?.parentElement
    expect(badgeRow?.textContent).toContain('Coût d’accès —')
    expect(badgeRow?.textContent).not.toContain('Chemin —')
    expect(badgeRow?.textContent).not.toContain('Relation —')

    // Et les lignes Chemin / Relation restent rendues, sans ce badge.
    expect(screen.getByText(/^Chemin —/)).toBeInTheDocument()
    expect(screen.getByText(/^Relation —/)).toBeInTheDocument()
  })

  it('a les mêmes clés en français et en anglais — la parité, pas la bonne volonté', () => {
    expect(typeof accessFr.addressability.pathCta).toBe('string')
    expect(typeof accessEn.addressability.pathCta).toBe('string')
    expect(typeof accessFr.addressability.declarative).toBe('string')
    expect(typeof accessEn.addressability.declarative).toBe('string')
  })
})
