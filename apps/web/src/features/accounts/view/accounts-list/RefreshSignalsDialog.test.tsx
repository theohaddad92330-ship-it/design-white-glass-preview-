import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { RefreshSignalsDialog } = await import('./RefreshSignalsDialog')

type FetchArgs = { path: string; method?: string; body?: unknown }

function account(id: string, name = `Compte ${id}`) {
  return { id, company_name: name }
}

function renderDialog(over: Partial<Parameters<typeof RefreshSignalsDialog>[0]> = {}) {
  const props: Parameters<typeof RefreshSignalsDialog>[0] = {
    open: true,
    onOpenChange: () => {},
    accounts: [account('a1'), account('a2')],
    onDone: () => {},
    ...over,
  }
  return renderWithRouter(<RefreshSignalsDialog {...props} />, '/accounts')
}

function quoteResponse(lines: Array<Record<string, unknown>>, over: Record<string, unknown> = {}) {
  return {
    lines,
    alreadyInvested: 0,
    delta: lines.filter(l => l.status === 'run').reduce((sum, l) => sum + (l.cost as number), 0),
    remaining: 100,
    sufficient: true,
    accounts: [],
    ...over,
  }
}

beforeEach(() => {
  resetTestQueryClient()
  apiFetch.mockReset()
})

/**
 * #2293.2 — « actualiser les signaux de tout un portefeuille », l'un des cas
 * d'usage restants de l'épopée #2809. Aucun moteur neuf : le devis vient de
 * `POST /analysis/deepen/quote` et l'exécution de `POST /analysis/:id/refresh`
 * (axe `signals`), le MÊME moteur que « Approfondir cette réponse » (#2452).
 */
describe('RefreshSignalsDialog (#2293.2)', () => {
  it('devise le lot sur l’axe signals pour chaque compte sélectionné', async () => {
    apiFetch.mockResolvedValueOnce(
      quoteResponse([
        { accountId: 'a1', dimension: 'signals', name: 'Compte a1', status: 'run', cost: 1, refreshedAt: null },
        { accountId: 'a2', dimension: 'signals', name: 'Compte a2', status: 'run', cost: 1, refreshedAt: null },
      ]),
    )
    renderDialog()
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    const call = apiFetch.mock.calls[0]?.[0] as FetchArgs
    expect(call).toEqual(
      expect.objectContaining({
        path: '/analysis/deepen/quote',
        method: 'POST',
        body: {
          targets: [
            { accountId: 'a1', dimension: 'signals' },
            { accountId: 'a2', dimension: 'signals' },
          ],
        },
      }),
    )
    await screen.findByRole('dialog')
    expect(document.body).not.toHaveTextContent(/cr[ée]dit/i)
  })

  it('un compte déjà à jour ne fait aucune ligne « déjà à jour » quand il n’y en a pas', async () => {
    apiFetch.mockResolvedValueOnce(
      quoteResponse([
        { accountId: 'a1', dimension: 'signals', name: 'Compte a1', status: 'run', cost: 1, refreshedAt: null },
      ]),
    )
    renderDialog({ accounts: [account('a1')] })
    await screen.findByRole('dialog')
    expect(document.body).not.toHaveTextContent(/cr[ée]dit/i)
    expect(screen.queryByText(/Déjà à jour/)).not.toBeInTheDocument()
  })

  it('confirmer ne relance QUE les lignes « run », jamais celles déjà à jour ou sans dossier', async () => {
    apiFetch.mockResolvedValueOnce(
      quoteResponse([
        { accountId: 'a1', dimension: 'signals', name: 'Compte a1', status: 'run', cost: 1, refreshedAt: null },
        {
          accountId: 'a2',
          dimension: 'signals',
          name: 'Compte a2',
          status: 'reuse',
          cost: 0,
          refreshedAt: '2026-09-25T00:00:00.000Z',
        },
      ]),
    )
    apiFetch.mockResolvedValueOnce({ dimension: 'signals', remaining: 10 })
    const onDone = vi.fn()
    const onOpenChange = vi.fn()
    renderDialog({ onDone, onOpenChange })
    fireEvent.click(await screen.findByRole('button', { name: /^actualiser$/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    const refreshCalls = apiFetch.mock.calls.filter(call => (call[0] as FetchArgs).path === '/analysis/a1/refresh')
    expect(refreshCalls).toHaveLength(1)
    expect(refreshCalls[0]?.[0]).toEqual(expect.objectContaining({ method: 'POST', body: { dimension: 'signals' } }))
    expect(apiFetch.mock.calls.some(call => (call[0] as FetchArgs).path === '/analysis/a2/refresh')).toBe(false)
  })

  it('échec partiel : une entreprise en erreur ne bloque pas les autres', async () => {
    apiFetch.mockResolvedValueOnce(
      quoteResponse([
        { accountId: 'a1', dimension: 'signals', name: 'Compte a1', status: 'run', cost: 1, refreshedAt: null },
        { accountId: 'a2', dimension: 'signals', name: 'Compte a2', status: 'run', cost: 1, refreshedAt: null },
      ]),
    )
    apiFetch.mockRejectedValueOnce(new Error('boom'))
    apiFetch.mockResolvedValueOnce({ dimension: 'signals', remaining: 10 })
    const onDone = vi.fn()
    renderDialog({ onDone })
    fireEvent.click(await screen.findByRole('button', { name: /^actualiser$/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(apiFetch.mock.calls.filter(call => (call[0] as FetchArgs).path.endsWith('/refresh'))).toHaveLength(2)
  })

  it('solde épuisé : le geste reste refusé, le frein doux propose de contacter l’équipe (#4464)', async () => {
    apiFetch.mockResolvedValueOnce(
      quoteResponse(
        [{ accountId: 'a1', dimension: 'signals', name: 'Compte a1', status: 'run', cost: 50, refreshedAt: null }],
        { sufficient: false, remaining: 5 },
      ),
    )
    renderDialog({ accounts: [account('a1')] })
    expect(await screen.findByText(/beaucoup utilisé/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^actualiser$/i })).toBeDisabled()
    const link = screen.getByRole('link', { name: /contacter/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('mailto:'))
    expect(screen.queryByRole('link', { name: /recharger/i })).not.toBeInTheDocument()
  })

  it('la sélection est bornée à la borne du devis (#2293) — au-delà, seuls les premiers comptes partent', async () => {
    apiFetch.mockResolvedValueOnce(quoteResponse([]))
    const many = Array.from({ length: 25 }, (_, i) => account(`a${i}`))
    renderDialog({ accounts: many })
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    const call = apiFetch.mock.calls[0]?.[0] as FetchArgs
    expect((call.body as { targets: unknown[] }).targets).toHaveLength(20)
    expect(await screen.findByText(/20 premiers comptes/)).toBeInTheDocument()
  })
})
