import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

// #2380.50 — le refus « séquence déjà active » NOMME déjà la séquence
// (#2380.49). Ce qui manquait : une PROPOSITION de collaboration quand le
// propriétaire est un COLLÈGUE — jamais quand c'est la sienne propre, et
// jamais un envoi automatique (un texte copié, pas parti).

const create = vi.fn()
const clipboardWriteText = vi.fn()
const toastSuccess = vi.fn()
const toastWarning = vi.fn()
const toastError = vi.fn()

vi.mock('@/features/outreach/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/outreach/api')>('@/features/outreach/api')
  return {
    ...actual,
    outreachApi: { ...actual.outreachApi, create: (...a: unknown[]) => create(...a) },
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

import { useCreateOutreachSequence } from './useOutreachMutations'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  create.mockReset()
  clipboardWriteText.mockReset()
  toastSuccess.mockReset()
  toastWarning.mockReset()
  toastError.mockReset()
  Object.assign(navigator, { clipboard: { writeText: clipboardWriteText } })
})

describe('useCreateOutreachSequence — collision d’équipe (#2380.50)', () => {
  it('propose une collaboration avec le propriétaire de la séquence en place', async () => {
    create.mockRejectedValue(
      new ApiError(
        'Une séquence est déjà active sur ce contact (« Prospection — 3 touches »).',
        400,
        'outreach_sequence_collision',
        {
          code: 'outreach_sequence_collision',
          ownerName: 'Alice Martin',
          ownerEmail: 'alice@esn.fr',
          contactName: 'Jean Dupont',
          sequenceName: 'Prospection — 3 touches',
        },
      ),
    )
    const { result } = renderHook(() => useCreateOutreachSequence(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate({ contact_id: 'c1', template: 'prospection_3_touches' })
    })

    await waitFor(() => expect(toastWarning).toHaveBeenCalled())
    expect(toastError).not.toHaveBeenCalled()

    const [title, opts] = toastWarning.mock.calls[0] as [string, { action?: { label: string; onClick: () => void } }]
    expect(title).toBeTruthy()
    expect(opts.action?.label).toContain('Alice Martin')

    // Le geste COPIE — rien n'est envoyé automatiquement.
    opts.action?.onClick()
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalled())
    const copied = clipboardWriteText.mock.calls[0]![0] as string
    expect(copied).toContain('Alice Martin')
    expect(copied).toContain('Jean Dupont')
    expect(copied).toContain('Prospection — 3 touches')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  it('un presse-papiers refusé se DIT — jamais un faux succès', async () => {
    create.mockRejectedValue(
      new ApiError('Une séquence est déjà active sur ce contact.', 400, 'outreach_sequence_collision', {
        code: 'outreach_sequence_collision',
        ownerName: 'Alice Martin',
        ownerEmail: null,
        contactName: 'Jean Dupont',
        sequenceName: 'Prospection — 3 touches',
      }),
    )
    clipboardWriteText.mockRejectedValue(new Error('denied'))
    const { result } = renderHook(() => useCreateOutreachSequence(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate({ contact_id: 'c1', template: 'prospection_3_touches' })
    })
    await waitFor(() => expect(toastWarning).toHaveBeenCalled())
    const opts = toastWarning.mock.calls[0]![1] as { action?: { onClick: () => void } }
    opts.action?.onClick()

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('une collision SANS proposition (sa propre séquence) reste un simple échec', async () => {
    create.mockRejectedValue(new ApiError('Une séquence est déjà active sur ce contact.', 400))
    const { result } = renderHook(() => useCreateOutreachSequence(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate({ contact_id: 'c1', template: 'prospection_3_touches' })
    })

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastWarning).not.toHaveBeenCalled()
  })
})
