import type { PendingSignature, UnpaidInvoice } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * « Connecté d'un côté, pas de donnée de l'autre ».
 *
 * Le service `admin-docs` interroge RÉELLEMENT quatre outils depuis le 03/08 et
 * expose `GET /admin-docs/signatures` et `GET /admin-docs/invoices` — deux
 * routes que le web n'appelait pas. La carte annonçait donc une capacité muette :
 * on dépose ses clés, la carte dit « connecté », et rien n'apparaît jamais.
 *
 * Ce que ces tests tiennent, et qui n'est pas cosmétique :
 *  · un fournisseur qui n'a PAS répondu est NOMMÉ — « rien à signaler » et « je
 *    n'ai pas pu regarder » sont deux phrases différentes, et c'est la
 *    distinction que le service porte déjà dans `unavailable` ;
 *  · une échéance inconnue ne s'écrit jamais « 0 jour de retard » ;
 *  · sans aucun outil branché, AUCUNE lecture n'est tentée — no-op strict.
 */

const useAdminDocsStatus = vi.fn()
const useAdminDocsSignatures = vi.fn()
const useAdminDocsInvoices = vi.fn()

vi.mock('../api', () => ({
  useAdminDocsStatus: () => useAdminDocsStatus(),
  useAdminDocsSignatures: (enabled: boolean) => useAdminDocsSignatures(enabled),
  useAdminDocsInvoices: (enabled: boolean) => useAdminDocsInvoices(enabled),
  useConnectAdminDocs: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useDisconnectAdminDocs: () => ({ mutate: vi.fn(), isPending: false }),
}))

const { AdminDocsCard } = await import('./AdminDocsCard')

/** Le retour d'un `useQuery`, typé par la forme que la carte LIT — pas `as never`. */
type ReadQuery<T> = { data?: { items: T[]; unavailable: string[] }; isLoading: boolean; isError: boolean }
const idle = { data: undefined, isLoading: false, isError: false }

function setup(input: {
  connected: string[]
  signatures?: ReadQuery<PendingSignature>
  invoices?: ReadQuery<UnpaidInvoice>
}) {
  useAdminDocsStatus.mockReturnValue({ data: { connected: input.connected } })
  useAdminDocsSignatures.mockReturnValue(input.signatures ?? idle)
  useAdminDocsInvoices.mockReturnValue(input.invoices ?? idle)
  return render(<AdminDocsCard />)
}

describe('la carte Signature et facturation rend ce qu’elle lit', () => {
  it('affiche ce qui attend une signature', () => {
    setup({
      connected: ['yousign'],
      signatures: {
        data: {
          items: [
            {
              id: 'sr-1',
              provider: 'yousign',
              title: 'Contrat de prestation — Nexeria',
              signer: 'Camille Roux',
              sentAt: '2026-08-20T09:00:00.000Z',
              daysWaiting: 9,
            },
          ],
          unavailable: [],
        },
        isLoading: false,
        isError: false,
      },
    })

    expect(screen.getByText(/Contrat de prestation — Nexeria/)).toBeTruthy()
    expect(screen.getByText(/Camille Roux/)).toBeTruthy()
    expect(screen.getByText(/9 jour/)).toBeTruthy()
  })

  it('affiche ce qui n’est pas payé, montant compris', () => {
    setup({
      connected: ['qonto'],
      invoices: {
        data: {
          items: [
            {
              id: 'inv-1',
              provider: 'qonto',
              reference: 'F-2026-114',
              client: 'Nexeria',
              amountCents: 1_284_000,
              currency: 'EUR',
              dueAt: '2026-07-31T00:00:00.000Z',
              daysOverdue: 29,
            },
          ],
          unavailable: [],
        },
        isLoading: false,
        isError: false,
      },
    })

    expect(screen.getByText(/F-2026-114/)).toBeTruthy()
    expect(screen.getByText(/29 jour/)).toBeTruthy()
    // Le montant est lu en CENTIMES et rendu une seule fois — 12 840, pas 1 284 000.
    expect(screen.getByText(/12\s?840/)).toBeTruthy()
  })

  it('NOMME l’outil qui n’a pas répondu, au lieu d’annoncer « rien à signaler »', () => {
    setup({
      connected: ['yousign', 'qonto'],
      signatures: { data: { items: [], unavailable: ['yousign'] }, isLoading: false, isError: false },
    })

    const failure = screen.getByTestId('admin-docs-signatures-unavailable')
    expect(failure.textContent).toMatch(/Yousign/)
    // Et surtout : la phrase « rien n'attend » ne doit PAS être rendue à côté.
    expect(screen.queryByTestId('admin-docs-signatures-empty')).toBeNull()
  })

  it('n’écrit jamais « 0 jour de retard » pour une échéance inconnue', () => {
    setup({
      connected: ['tiime'],
      invoices: {
        data: {
          items: [
            {
              id: 'inv-2',
              provider: 'tiime',
              reference: 'F-2026-115',
              client: null,
              amountCents: null,
              currency: null,
              dueAt: null,
              daysOverdue: null,
            },
          ],
          unavailable: [],
        },
        isLoading: false,
        isError: false,
      },
    })

    const row = screen.getByTestId('admin-docs-invoice-inv-2')
    expect(row.textContent).toMatch(/échéance inconnue/i)
    expect(row.textContent).not.toMatch(/0 jour/)
  })

  it('distingue une échéance À VENIR d’un retard', () => {
    setup({
      connected: ['qonto'],
      invoices: {
        data: {
          items: [
            {
              id: 'inv-3',
              provider: 'qonto',
              reference: 'F-2026-116',
              client: 'Alstead',
              amountCents: 300_000,
              currency: 'EUR',
              dueAt: '2026-09-30T00:00:00.000Z',
              daysOverdue: -32,
            },
          ],
          unavailable: [],
        },
        isLoading: false,
        isError: false,
      },
    })

    const row = screen.getByTestId('admin-docs-invoice-inv-3')
    expect(row.textContent).toMatch(/pas encore échue/i)
    expect(row.textContent).not.toMatch(/-32/)
  })

  it('distingue « en cours de lecture » de « rien »', () => {
    setup({
      connected: ['yousign'],
      signatures: { data: undefined, isLoading: true, isError: false },
    })
    expect(screen.getByTestId('admin-docs-signatures-loading')).toBeTruthy()
    expect(screen.queryByTestId('admin-docs-signatures-empty')).toBeNull()
  })

  it('DIT que la lecture a échoué plutôt que de rester muet', () => {
    setup({
      connected: ['yousign'],
      signatures: { data: undefined, isLoading: false, isError: true },
    })
    expect(screen.getByTestId('admin-docs-signatures-failed')).toBeTruthy()
    expect(screen.queryByTestId('admin-docs-signatures-empty')).toBeNull()
  })

  it('sans aucun outil branché, ne tente AUCUNE lecture — no-op strict', () => {
    setup({ connected: [] })
    expect(useAdminDocsSignatures).toHaveBeenCalledWith(false)
    expect(useAdminDocsInvoices).toHaveBeenCalledWith(false)
    expect(screen.queryByTestId('admin-docs-readings')).toBeNull()
  })

  it('branché, la lecture est ACTIVÉE', () => {
    setup({ connected: ['yousign'] })
    expect(useAdminDocsSignatures).toHaveBeenCalledWith(true)
    expect(useAdminDocsInvoices).toHaveBeenCalledWith(true)
  })
})
