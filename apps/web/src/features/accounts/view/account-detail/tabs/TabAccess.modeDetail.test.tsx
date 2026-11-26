import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import accessEn from '@/i18n/locales/en/access.json'
import accessFr from '@/i18n/locales/fr/access.json'
import { TabAccess, shouldShowAccessModeFallbackReason } from './TabAccess'

/**
 * #2298.10 — LA ROUTE EN SEPT ÉLÉMENTS, RÉDIGÉE PAR MODE D'ACCÈS.
 *
 * Décision Louis du 20/09/2026 : les sept éléments (voie recommandée ·
 * prérequis · première personne · question à poser · condition suivante ·
 * repli · route déconseillée) se rédigent PAR MODE D'ACCÈS, à partir du
 * catalogue déjà existant des sept `AccessMode` (`access.json`, clé
 * `modes`) — jamais un second catalogue (GA-26).
 *
 * Décision Louis du 21/09/2026, qui REMPLACE celle du 20/09 sur le seul
 * septième élément : « route déconseillée » N'EST PLUS une phrase unique —
 * chaque porte déconseillée dit POURQUOI, écrite au même endroit que les six
 * autres. Une porte SANS raison écrite ne porte AUCUNE mention (doctrine
 * « on n'affiche pas ce qu'on n'a pas ») ; le repli générique
 * (`notRecommendedMissing`) ne reste que si AUCUNE porte du catalogue n'a de
 * raison écrite.
 */

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, useNavigate: () => vi.fn() }
})

const ACCOUNT = {
  id: 'acc-mode-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

function landscape(modes: { mode: string; feasibility: string }[]) {
  return {
    lock: { state: 'inconnu', fact: null },
    modes,
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

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TabAccess account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('#2298.10 — cliquer une porte ouvre son détail, en sept éléments (six rédigés, un nommé absent)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })
  afterEach(cleanup)

  it('le clic sur une porte ouvre une modale qui NOMME ce mode', async () => {
    apiFetchMock.mockResolvedValue(landscape([{ mode: 'introduction_relation', feasibility: 'possible' }]))
    mount()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Par une introduction/i }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Par une introduction' })).toBeInTheDocument()
  })

  it('affiche les SIX éléments rédigés : voie recommandée, prérequis, première personne, question à poser, condition suivante, repli', async () => {
    apiFetchMock.mockResolvedValue(landscape([{ mode: 'rang2_soustraitance', feasibility: 'available' }]))
    mount()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /En rang 2, sous une ESN en place/i }))
    const dialog = await screen.findByRole('dialog')

    for (const field of [
      'recommendedPath',
      'prerequisite',
      'firstPerson',
      'questionToAsk',
      'nextCondition',
      'fallback',
    ] as const) {
      expect(within(dialog).getByText(accessFr.modes.detailLabels[field])).toBeInTheDocument()
      expect(within(dialog).getByText(accessFr.modes.detail.rang2_soustraitance[field])).toBeInTheDocument()
    }
  })

  it('affiche la route déconseillée AVEC sa raison quand la porte en porte une', async () => {
    apiFetchMock.mockResolvedValue(landscape([{ mode: 'filiale_bu', feasibility: 'possible' }]))
    mount()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Par une filiale ou une entité/i }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(accessFr.modes.detailLabels.notRecommended)).toBeInTheDocument()
    expect(within(dialog).getByText(accessFr.modes.detail.filiale_bu.notRecommended)).toBeInTheDocument()
    // Une raison écrite existe ailleurs dans le catalogue : le repli
    // générique ne doit donc plus apparaître nulle part sur cette porte.
    expect(within(dialog).queryByText(accessFr.modes.detailLabels.notRecommendedMissing)).not.toBeInTheDocument()
  })

  it('une porte SANS raison écrite ne porte AUCUNE mention — ni le label, ni le repli générique', async () => {
    apiFetchMock.mockResolvedValue(landscape([{ mode: 'cotraitance', feasibility: 'possible' }]))
    mount()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /En cotraitance/i }))
    const dialog = await screen.findByRole('dialog')

    // `cotraitance` ne porte pas de raison écrite dans le catalogue actuel,
    // mais `filiale_bu` en porte une : le repli générique se tait donc ici.
    expect(within(dialog).queryByText(accessFr.modes.detailLabels.notRecommended)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(accessFr.modes.detailLabels.notRecommendedMissing)).not.toBeInTheDocument()
  })

  it('shouldShowAccessModeFallbackReason — vrai seulement quand AUCUNE porte n’a de raison écrite', () => {
    expect(shouldShowAccessModeFallbackReason({})).toBe(true)
    expect(shouldShowAccessModeFallbackReason({ filiale_bu: 'x' })).toBe(false)
    expect(shouldShowAccessModeFallbackReason({ direct_reference: 'y', cotraitance: 'z' })).toBe(false)
  })

  it('les flèches parcourent LA LISTE DES MODES, sans fermer la modale', async () => {
    apiFetchMock.mockResolvedValue(
      landscape([
        { mode: 'direct_reference', feasibility: 'available' },
        { mode: 'direct_hors_panel', feasibility: 'possible' },
      ]),
    )
    mount()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /En direct, en étant référencé/i }))
    expect(await screen.findByRole('heading', { name: 'En direct, en étant référencé' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: accessFr.modes.nextMode }))
    expect(await screen.findByRole('heading', { name: 'En direct, hors panel' })).toBeInTheDocument()
  })

  it('a les mêmes clés en français et en anglais pour les sept modes, GA-parity', () => {
    const modes = Object.keys(accessFr.modes.detail) as (keyof typeof accessFr.modes.detail)[]
    expect(modes).toHaveLength(7)
    for (const mode of modes) {
      expect(Object.keys(accessFr.modes.detail[mode]).sort()).toEqual(Object.keys(accessEn.modes.detail[mode]).sort())
    }
  })
})
