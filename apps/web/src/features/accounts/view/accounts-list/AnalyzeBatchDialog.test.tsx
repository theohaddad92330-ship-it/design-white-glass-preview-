import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ReactQuery from '@tanstack/react-query'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { gate } = vi.hoisted(() => ({
  gate: {
    known: true,
    canAnalyze: true,
    canEnrich: true,
    locked: false,
  },
}))
vi.mock('@/features/credits/hooks/useCreditGate', () => ({ useCreditGate: () => gate }))

const { useIsDemo, useQueries } = vi.hoisted(() => ({
  useIsDemo: vi.fn(),
  useQueries: vi.fn(),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo }))
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueries,
}))

const { AnalyzeBatchDialog } = await import('./AnalyzeBatchDialog')

type Account = { id: string; company_name: string; siren?: string | null }

function account(over: Partial<Account> = {}): Account {
  return { id: 'acc-1', company_name: 'ACME', siren: '552100554', ...over }
}

type FetchArgs = { path: string; method?: string; body?: unknown }

function renderDialog(over: Partial<Parameters<typeof AnalyzeBatchDialog>[0]> = {}) {
  const props: Parameters<typeof AnalyzeBatchDialog>[0] = {
    open: true,
    onOpenChange: () => {},
    accounts: [account()],
    onDone: () => {},
    ...over,
  }
  return renderWithRouter(<AnalyzeBatchDialog {...props} />, '/accounts')
}

function freshPlans(count: number) {
  return Array.from({ length: count }, () => ({ data: { scenario: 'fresh' as const, credits: 8 } }))
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({})
  gate.known = true
  gate.canAnalyze = true
  gate.locked = false
  useIsDemo.mockReset().mockReturnValue(false)
  useQueries.mockReset().mockReturnValue(freshPlans(1))
})

/**
 * #2809 (#2293.3) — source `portfolio` de `POST /analysis-batches` : lancer un
 * lot d'analyse COMPLET depuis la sélection de `/accounts`, même moteur de
 * devis (coût EXACT, `GET /analysis/launch-plan`) que Découvrir (GA-26).
 */
describe('AnalyzeBatchDialog (#2809, #2293.3)', () => {
  it("#2293.5 — confirmer crée UN lot (source 'portfolio'), jamais avant le clic", async () => {
    useQueries.mockReturnValue(freshPlans(2))
    apiFetch.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', items: [], total: 2 })
    const onDone = vi.fn()
    renderDialog({
      accounts: [
        account({ id: 'acc-1', siren: '111111111', company_name: 'Banque Alpha' }),
        account({ id: 'acc-2', siren: '222222222', company_name: 'Studio Beta' }),
      ],
      onDone,
    })
    expect(apiFetch).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: /^lancer l.analyse$/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    const batchCalls = apiFetch.mock.calls.filter(call => (call[0] as FetchArgs).path === '/analysis-batches')
    expect(batchCalls).toHaveLength(1)
    expect(batchCalls[0]?.[0]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          source: 'portfolio',
          items: [
            expect.objectContaining({ name: 'Banque Alpha', siren: '111111111' }),
            expect.objectContaining({ name: 'Studio Beta', siren: '222222222' }),
          ],
        }),
      }),
    )
  })

  it("on n'affiche pas ce qu'on n'a pas : un compte sans SIREN est EXCLU du lot, jamais deviné", async () => {
    useQueries.mockReturnValue(freshPlans(1))
    renderDialog({
      accounts: [account({ id: 'acc-1', siren: '111111111' }), account({ id: 'acc-2', siren: null })],
    })
    expect(await screen.findByText(/1 compte sans siren/i)).toBeInTheDocument()
    // Un seul candidat (siren connu) est passé au devis.
    expect((useQueries.mock.calls.at(-1)?.[0] as { queries: unknown[] }).queries).toHaveLength(1)
  })

  it('solde épuisé : le frein doux est visible, rien ne part', async () => {
    gate.known = true
    gate.canAnalyze = false
    useQueries.mockReturnValue(freshPlans(2))
    renderDialog({
      accounts: [account({ id: 'acc-1', siren: '1' }), account({ id: 'acc-2', siren: '2' })],
    })
    expect(await screen.findByText(/beaucoup utilisé/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^lancer l.analyse$/i })).toBeDisabled()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('accès verrouillé (essai expiré) : le geste reste refusé et dit pourquoi', async () => {
    gate.locked = true
    renderDialog()
    expect(await screen.findByRole('button', { name: /^lancer l.analyse$/i })).toBeDisabled()
  })

  it('en démonstration, le devis ne dit aucun crédit et n’appelle pas le lanceur', async () => {
    useIsDemo.mockReturnValue(true)
    useQueries.mockReturnValue([{ data: undefined }])
    renderDialog()
    expect(await screen.findByText(/démonstration/i)).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
