import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeclareLinkedInSignalDialog } from './DeclareLinkedInSignalDialog'

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

const declareSignals = vi.fn()
vi.mock('@/features/accounts/api', () => ({
  accountsApi: {
    declareSignals: (...args: unknown[]) => declareSignals(...args),
  },
  accountKeys: {
    detail: (id: string) => ['account', id],
  },
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

beforeEach(() => {
  declareSignals.mockReset()
  toastSuccess.mockClear()
  toastError.mockClear()
})

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

describe('DeclareLinkedInSignalDialog (#2634.1)', () => {
  it('refuse la déclaration tant que ni URL ni texte ne sont saisis', async () => {
    wrap(<DeclareLinkedInSignalDialog accountId="acc-1" />)
    await user().click(screen.getByRole('button', { name: /Ajouter un signal depuis LinkedIn/ }))

    expect(screen.getByRole('button', { name: 'Déclarer ce signal' })).toBeDisabled()
    expect(declareSignals).not.toHaveBeenCalled()
  })

  it('reste refusé si seuls des espaces sont saisis', async () => {
    wrap(<DeclareLinkedInSignalDialog accountId="acc-1" />)
    await user().click(screen.getByRole('button', { name: /Ajouter un signal depuis LinkedIn/ }))
    await user().type(screen.getByLabelText('Texte copié depuis LinkedIn'), '   ')

    expect(screen.getByRole('button', { name: 'Déclarer ce signal' })).toBeDisabled()
  })

  it('déclare le signal avec la source LinkedIn et une saisie manuelle quand URL + texte sont donnés', async () => {
    declareSignals.mockResolvedValue({ added: 1 })
    wrap(<DeclareLinkedInSignalDialog accountId="acc-1" />)
    await user().click(screen.getByRole('button', { name: /Ajouter un signal depuis LinkedIn/ }))

    await user().type(screen.getByLabelText('URL du post ou de l’annonce'), 'https://www.linkedin.com/posts/abc')
    await user().type(screen.getByLabelText('Texte copié depuis LinkedIn'), 'Recrute 3 devs Java')
    await user().click(screen.getByRole('button', { name: 'Déclarer ce signal' }))

    await vi.waitFor(() =>
      expect(declareSignals).toHaveBeenCalledWith('acc-1', {
        source: 'LinkedIn',
        entryKind: 'manual',
        signals: [{ label: 'Recrute 3 devs Java — https://www.linkedin.com/posts/abc' }],
      }),
    )
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  it('accepte une URL seule, sans texte', async () => {
    declareSignals.mockResolvedValue({ added: 1 })
    wrap(<DeclareLinkedInSignalDialog accountId="acc-1" />)
    await user().click(screen.getByRole('button', { name: /Ajouter un signal depuis LinkedIn/ }))

    await user().type(screen.getByLabelText('URL du post ou de l’annonce'), 'https://www.linkedin.com/posts/xyz')
    await user().click(screen.getByRole('button', { name: 'Déclarer ce signal' }))

    await vi.waitFor(() =>
      expect(declareSignals).toHaveBeenCalledWith('acc-1', {
        source: 'LinkedIn',
        entryKind: 'manual',
        signals: [{ label: 'https://www.linkedin.com/posts/xyz' }],
      }),
    )
  })

  it('ne scrape jamais : aucun appel réseau vers linkedin.com, seulement le POST de déclaration', async () => {
    // #2634.1 — la doctrine c79 n'admet LinkedIn que par ce que l'utilisateur
    // apporte lui-même. Ce test garde ça vrai côté écran : le SEUL appel
    // sortant est `accountsApi.declareSignals`, jamais un fetch vers LinkedIn.
    declareSignals.mockResolvedValue({ added: 1 })
    wrap(<DeclareLinkedInSignalDialog accountId="acc-1" />)
    await user().click(screen.getByRole('button', { name: /Ajouter un signal depuis LinkedIn/ }))
    await user().type(screen.getByLabelText('Texte copié depuis LinkedIn'), 'Recrute 3 devs Java')
    await user().click(screen.getByRole('button', { name: 'Déclarer ce signal' }))

    await vi.waitFor(() => expect(declareSignals).toHaveBeenCalledTimes(1))
    expect(declareSignals.mock.calls[0]?.[1]?.source).toBe('LinkedIn')
  })
})
