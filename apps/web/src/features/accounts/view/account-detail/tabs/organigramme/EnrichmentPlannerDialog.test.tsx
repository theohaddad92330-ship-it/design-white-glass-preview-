import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEnrichmentParams, EnrichmentPlannerDialog } from './EnrichmentPlannerDialog'

const toastSuccess = vi.fn()
const toastError = vi.fn()
const toastInfo = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    info: (...a: unknown[]) => toastInfo(...a),
  },
}))

const enrichmentPlan = vi.fn()
const enrichmentConfirm = vi.fn()
vi.mock('@/features/accounts/api', () => ({
  accountsApi: {
    enrichmentPlan: (...args: unknown[]) => enrichmentPlan(...args),
    enrichmentConfirm: (...args: unknown[]) => enrichmentConfirm(...args),
  },
  accountKeys: {
    detail: (id: string) => ['account', id],
    enrichmentPlan: (id: string, params: unknown) => ['account', 'enrichment-plan', id, params],
  },
}))

vi.mock('@/features/contacts/api', () => ({
  contactKeys: { byAccount: (id: string) => ['contacts', 'by-account', id] },
}))

let creditGate = { known: true, canAnalyze: true, canEnrich: true, locked: false }
vi.mock('@/features/credits/hooks/useCreditGate', () => ({ useCreditGate: () => creditGate }))

// #2130.59 — le double du traceur produit ANONYME (jamais `accountId`).
const tracker = vi.hoisted(() => ({ trackActionStarted: vi.fn(), trackActionCompleted: vi.fn() }))
vi.mock('@/lib/product-tracker', () => tracker)

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

beforeEach(() => {
  enrichmentPlan.mockReset()
  enrichmentConfirm.mockReset()
  toastSuccess.mockClear()
  toastError.mockClear()
  toastInfo.mockClear()
  creditGate = { known: true, canAnalyze: true, canEnrich: true, locked: false }
  tracker.trackActionStarted.mockClear()
  tracker.trackActionCompleted.mockClear()
})

function measuredEstimate(overrides?: Partial<Record<string, unknown>>) {
  return {
    mode: 'next_batch',
    scopeLabel: 'Les prochains contacts les plus utiles',
    contactsTargeted: { status: 'measured', value: 42 },
    waveCount: { status: 'measured', value: 1 },
    waveSize: 50,
    estimatedCredits: { status: 'measured', value: 3 },
    ...overrides,
  }
}

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

describe('buildEnrichmentParams', () => {
  it('next_batch / missing_roles / full_account ne demandent aucun paramètre', () => {
    expect(buildEnrichmentParams('next_batch', '', [])).toEqual({ mode: 'next_batch' })
    expect(buildEnrichmentParams('missing_roles', '', [])).toEqual({ mode: 'missing_roles' })
    expect(buildEnrichmentParams('full_account', '', [])).toEqual({ mode: 'full_account' })
  })

  it('direction sans entité (ou seulement des espaces) est null', () => {
    expect(buildEnrichmentParams('direction', '', [])).toBeNull()
    expect(buildEnrichmentParams('direction', '   ', [])).toBeNull()
  })

  it('direction avec une entité rend le mode + entity (trim)', () => {
    expect(buildEnrichmentParams('direction', '  Engineering  ', [])).toEqual({
      mode: 'direction',
      entity: 'Engineering',
    })
  })

  it('hierarchy_level sans niveau est null, avec niveaux rend la liste', () => {
    expect(buildEnrichmentParams('hierarchy_level', '', [])).toBeNull()
    expect(buildEnrichmentParams('hierarchy_level', '', ['L2', 'L3'])).toEqual({
      mode: 'hierarchy_level',
      hierarchyLevels: ['L2', 'L3'],
    })
  })
})

describe('EnrichmentPlannerDialog', () => {
  it('estime le mode par défaut (next_batch) dès l’ouverture', async () => {
    enrichmentPlan.mockResolvedValue(measuredEstimate())
    wrap(<EnrichmentPlannerDialog open onOpenChange={vi.fn()} accountId="acc-1" />)

    await vi.waitFor(() => expect(enrichmentPlan).toHaveBeenCalledWith('acc-1', { mode: 'next_batch' }))
    await screen.findByText(/42 contacts ciblés/)
    expect(document.body).not.toHaveTextContent(/cr[ée]dit/i)
  })

  it('ne lance AUCUNE requête sur « Cette direction » tant qu’aucune entité n’est saisie', async () => {
    enrichmentPlan.mockResolvedValue(measuredEstimate())
    wrap(<EnrichmentPlannerDialog open onOpenChange={vi.fn()} accountId="acc-1" />)
    await screen.findByText(/42 contacts ciblés/)
    enrichmentPlan.mockClear()

    await user().click(screen.getByRole('button', { name: /Cette direction/ }))

    expect(enrichmentPlan).not.toHaveBeenCalled()
  })

  it('estime « Cette direction » une fois l’entité saisie', async () => {
    enrichmentPlan.mockResolvedValue(measuredEstimate({ contactsTargeted: { status: 'measured', value: 7 } }))
    wrap(<EnrichmentPlannerDialog open onOpenChange={vi.fn()} accountId="acc-1" />)

    await user().click(screen.getByRole('button', { name: /Cette direction/ }))
    await user().type(screen.getByLabelText('Direction'), 'Engineering')

    await vi.waitFor(() =>
      expect(enrichmentPlan).toHaveBeenCalledWith('acc-1', { mode: 'direction', entity: 'Engineering' }),
    )
  })

  it('estime « Niveau hiérarchique » une fois un niveau coché', async () => {
    enrichmentPlan.mockResolvedValue(measuredEstimate())
    wrap(<EnrichmentPlannerDialog open onOpenChange={vi.fn()} accountId="acc-1" />)

    await user().click(screen.getByRole('button', { name: /Niveau hiérarchique/ }))
    await user().click(screen.getByLabelText('L2 · Direction'))

    await vi.waitFor(() =>
      expect(enrichmentPlan).toHaveBeenCalledWith('acc-1', { mode: 'hierarchy_level', hierarchyLevels: ['L2'] }),
    )
  })

  it('un périmètre non mesurable affiche la RAISON, jamais un 0', async () => {
    enrichmentPlan.mockResolvedValue(
      measuredEstimate({
        contactsTargeted: { status: 'unknown', reason: 'Les zones à couvrir ne sont pas calculables ici.' },
        waveCount: { status: 'unknown', reason: 'Les zones à couvrir ne sont pas calculables ici.' },
        estimatedCredits: { status: 'unknown', reason: 'Les zones à couvrir ne sont pas calculables ici.' },
      }),
    )
    wrap(<EnrichmentPlannerDialog open onOpenChange={vi.fn()} accountId="acc-1" />)

    await screen.findByText('Les zones à couvrir ne sont pas calculables ici.')
    expect(screen.queryByText(/^0 /)).not.toBeInTheDocument()
    // Le bouton Lancer reste désactivé sur un périmètre non mesuré.
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeDisabled()
  })

  it('un périmètre vide (0 contact) dit « rien à enrichir » et désactive Lancer', async () => {
    enrichmentPlan.mockResolvedValue(measuredEstimate({ contactsTargeted: { status: 'measured', value: 0 } }))
    wrap(<EnrichmentPlannerDialog open onOpenChange={vi.fn()} accountId="acc-1" />)

    await screen.findByText(/Rien à enrichir/)
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeDisabled()
  })

  it('Lancer envoie le mode courant et affiche le résultat', async () => {
    enrichmentPlan.mockResolvedValue(measuredEstimate())
    enrichmentConfirm.mockResolvedValue({ matched: 42, waveSize: 42, creditsDebited: 3, remaining: 0 })
    wrap(<EnrichmentPlannerDialog open onOpenChange={vi.fn()} accountId="acc-1" />)

    await screen.findByText(/42 contacts ciblés/)
    await user().click(screen.getByRole('button', { name: 'Lancer' }))

    await vi.waitFor(() => expect(enrichmentConfirm).toHaveBeenCalledWith('acc-1', { mode: 'next_batch' }))
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastInfo).not.toHaveBeenCalled() // remaining = 0, pas de relance à annoncer
  })

  // #2130.59 — LANCER émet enrichment_started, agrégé par écran (jamais
  // accountId — anonyme, distinct de la mutation métier ci-dessus).
  it('#2130.59 — Lancer émet enrichment_started, puis complété au succès', async () => {
    enrichmentPlan.mockResolvedValue(measuredEstimate())
    enrichmentConfirm.mockResolvedValue({ matched: 42, waveSize: 42, creditsDebited: 3, remaining: 0 })
    wrap(<EnrichmentPlannerDialog open onOpenChange={vi.fn()} accountId="acc-1" />)

    await screen.findByText(/42 contacts ciblés/)
    await user().click(screen.getByRole('button', { name: 'Lancer' }))

    expect(tracker.trackActionStarted).toHaveBeenCalledWith('enrichment_started', '/accounts/$id')
    await vi.waitFor(() =>
      expect(tracker.trackActionCompleted).toHaveBeenCalledWith('enrichment_started', expect.anything()),
    )
  })

  it('annonce ce qui reste quand une vague ne finit pas le périmètre', async () => {
    enrichmentPlan.mockResolvedValue(measuredEstimate())
    enrichmentConfirm.mockResolvedValue({ matched: 50, waveSize: 50, creditsDebited: 3, remaining: 70 })
    wrap(<EnrichmentPlannerDialog open onOpenChange={vi.fn()} accountId="acc-1" />)

    await screen.findByText(/42 contacts ciblés/)
    await user().click(screen.getByRole('button', { name: 'Lancer' }))

    await vi.waitFor(() => expect(toastInfo).toHaveBeenCalled())
  })

  it('Lancer est désactivé sans crédit — jamais de débit à zéro crédit', async () => {
    creditGate = { known: true, canAnalyze: false, canEnrich: false, locked: false }
    enrichmentPlan.mockResolvedValue(measuredEstimate())
    wrap(<EnrichmentPlannerDialog open onOpenChange={vi.fn()} accountId="acc-1" />)

    await screen.findByText(/42 contacts ciblés/)
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeDisabled()
  })

  it('repart d’un état propre à chaque ouverture', async () => {
    enrichmentPlan.mockResolvedValue(measuredEstimate())
    const { rerender } = wrap(<EnrichmentPlannerDialog open={false} onOpenChange={vi.fn()} accountId="acc-1" />)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    rerender(
      <QueryClientProvider client={qc}>
        <EnrichmentPlannerDialog open onOpenChange={vi.fn()} accountId="acc-1" />
      </QueryClientProvider>,
    )

    await vi.waitFor(() => expect(enrichmentPlan).toHaveBeenCalledWith('acc-1', { mode: 'next_batch' }))
  })
})
