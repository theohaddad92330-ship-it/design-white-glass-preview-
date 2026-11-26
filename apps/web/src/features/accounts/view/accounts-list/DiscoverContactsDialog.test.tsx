import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { DiscoverContactsDialog } = await import('./DiscoverContactsDialog')

type FetchArgs = { path: string; method?: string; body?: unknown }

function account(id: string, name = `Compte ${id}`) {
  return { id, company_name: name }
}

function renderDialog(over: Partial<Parameters<typeof DiscoverContactsDialog>[0]> = {}) {
  const props: Parameters<typeof DiscoverContactsDialog>[0] = {
    open: true,
    onOpenChange: () => {},
    accounts: [account('a1'), account('a2')],
    onDone: () => {},
    ...over,
  }
  return renderWithRouter(<DiscoverContactsDialog {...props} />, '/accounts')
}

function quoteResponse(
  lines: Array<{ accountId: string; companyName: string; cost: number }>,
  over: Record<string, unknown> = {},
) {
  return {
    lines,
    delta: lines.reduce((sum, l) => sum + l.cost, 0),
    remaining: 100,
    sufficient: true,
    ...over,
  }
}

beforeEach(() => {
  resetTestQueryClient()
  apiFetch.mockReset()
})

/**
 * #2809 (#2293.11, #2294.*) — découverte FRAÎCHE de contacts sur une
 * sélection de comptes : des personnes JAMAIS collectées, distinctes de
 * `RefreshContactsDialog.test.tsx` (rejeu d'un axe déjà analysé).
 */
describe('DiscoverContactsDialog (#2809, #2293.11, #2294.*)', () => {
  it('devise le coût EXACT par compte AVANT tout lancement', async () => {
    apiFetch.mockResolvedValueOnce(
      quoteResponse([
        { accountId: 'a1', companyName: 'Compte a1', cost: 1 },
        { accountId: 'a2', companyName: 'Compte a2', cost: 1 },
      ]),
    )
    renderDialog()
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    const call = apiFetch.mock.calls[0]?.[0] as FetchArgs
    expect(call).toEqual(
      expect.objectContaining({
        path: '/contacts/discover/quote',
        method: 'POST',
        body: { accountIds: ['a1', 'a2'] },
      }),
    )
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/cr[ée]dit/i)
  })

  it('confirmer exécute la découverte compte par compte, chaque appel ciblant UN compte', async () => {
    apiFetch.mockResolvedValueOnce(
      quoteResponse([
        { accountId: 'a1', companyName: 'Compte a1', cost: 1 },
        { accountId: 'a2', companyName: 'Compte a2', cost: 1 },
      ]),
    )
    apiFetch.mockResolvedValueOnce({ accountId: 'a1', status: 'ok', found: 2, created: 2, cost: 1 })
    apiFetch.mockResolvedValueOnce({ accountId: 'a2', status: 'empty', found: 0, created: 0, cost: 0 })
    const onDone = vi.fn()
    const onOpenChange = vi.fn()
    renderDialog({ onDone, onOpenChange })
    fireEvent.click(await screen.findByRole('button', { name: /^rechercher$/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    const runCalls = apiFetch.mock.calls.filter(call => (call[0] as FetchArgs).path.startsWith('/contacts/discover/a'))
    expect(runCalls).toHaveLength(2)
    expect(runCalls[0]?.[0]).toEqual(
      expect.objectContaining({ path: '/contacts/discover/a1', method: 'POST', body: { titles: undefined } }),
    )
  })

  it('sans clé fournisseur (status unconfigured), no-op strict — le compte est traité comme les autres, rien débité', async () => {
    apiFetch.mockResolvedValueOnce(quoteResponse([{ accountId: 'a1', companyName: 'Compte a1', cost: 1 }]))
    apiFetch.mockResolvedValueOnce({ accountId: 'a1', status: 'unconfigured', found: 0, created: 0, cost: 0 })
    const onDone = vi.fn()
    renderDialog({ accounts: [account('a1')], onDone })
    fireEvent.click(await screen.findByRole('button', { name: /^rechercher$/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    // Un seul appel d'exécution — jamais de second essai silencieux qui
    // inventerait un contact ou masquerait le statut typé rendu par l'API.
    expect(
      apiFetch.mock.calls.filter(call => (call[0] as FetchArgs).path.startsWith('/contacts/discover/a')),
    ).toHaveLength(1)
  })

  it('échec partiel : un compte en erreur ne bloque pas les autres', async () => {
    apiFetch.mockResolvedValueOnce(
      quoteResponse([
        { accountId: 'a1', companyName: 'Compte a1', cost: 1 },
        { accountId: 'a2', companyName: 'Compte a2', cost: 1 },
      ]),
    )
    apiFetch.mockRejectedValueOnce(new Error('boom'))
    apiFetch.mockResolvedValueOnce({ accountId: 'a2', status: 'ok', found: 1, created: 1, cost: 1 })
    const onDone = vi.fn()
    renderDialog({ onDone })
    fireEvent.click(await screen.findByRole('button', { name: /^rechercher$/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(
      apiFetch.mock.calls.filter(call => (call[0] as FetchArgs).path.startsWith('/contacts/discover/a')),
    ).toHaveLength(2)
  })

  it('solde épuisé : le geste reste refusé, le frein doux propose de contacter l’équipe (#4464)', async () => {
    apiFetch.mockResolvedValueOnce(
      quoteResponse([{ accountId: 'a1', companyName: 'Compte a1', cost: 50 }], { sufficient: false, remaining: 5 }),
    )
    renderDialog({ accounts: [account('a1')] })
    expect(await screen.findByText(/beaucoup utilisé/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^rechercher$/i })).toBeDisabled()
    const link = screen.getByRole('link', { name: /contacter/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('mailto:'))
    expect(screen.queryByRole('link', { name: /recharger/i })).not.toBeInTheDocument()
  })
})
