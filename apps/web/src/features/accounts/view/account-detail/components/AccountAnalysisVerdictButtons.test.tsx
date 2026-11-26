import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AccountFeedbackItem } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountAnalysisVerdictButtons } from './AccountAnalysisVerdictButtons'

/**
 * #2076.9-.12 — « Première preuve sur une situation connue » : un compte que
 * l'utilisateur connaît déjà, sur lequel il juge la PREMIÈRE analyse. Même
 * patron que `PlayFeedbackButtons` (A2) — MÊME endpoint
 * (`POST /accounts/:id/feedback`), MÊME service, un vocabulaire de verdict
 * différent (`target: 'global'`, verdicts juste/partiel/faux/manquant —
 * decisions-louis-22-09-soir.md §1, reco appliquée).
 */
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiFetch: apiFetchMock }))

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe('AccountAnalysisVerdictButtons', () => {
  it('rend les quatre verdicts, aucun appel avant le clic', async () => {
    renderWithRouter(<AccountAnalysisVerdictButtons accountId="acc-1" />)
    expect(await screen.findByRole('button', { name: /juste/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /partiel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /faux/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /manquant/i })).toBeInTheDocument()
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  // #3279 — la question en toutes lettres ne prend plus de place : elle est le
  // nom accessible du groupe (et son infobulle), jamais un texte visible.
  it('la question de justesse est en aria-label + infobulle, pas en texte visible', async () => {
    renderWithRouter(<AccountAnalysisVerdictButtons accountId="acc-0" />)
    const group = await screen.findByRole('group')
    expect(group).toHaveAttribute('aria-label', expect.stringMatching(/première analyse/i))
    expect(group).toHaveAttribute('title', expect.stringMatching(/première analyse/i))
    expect(screen.queryByText(/première analyse/i)).not.toBeInTheDocument()
    for (const name of [/juste/i, /partiel/i, /faux/i, /manquant/i]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('title')
    }
  })

  it('un clic sur « Juste » POSTe le verdict sur `target: global`, MÊME endpoint que le feedback dossier', async () => {
    apiFetchMock.mockResolvedValue({
      item: {
        id: 'fb-1',
        target: 'global',
        targetRef: '',
        verdict: 'juste',
        note: null,
        createdAt: '2026-09-22T00:00:00Z',
      },
    } satisfies { item: AccountFeedbackItem })
    const user = userEvent.setup()
    renderWithRouter(<AccountAnalysisVerdictButtons accountId="acc-2" />)

    await user.click(await screen.findByRole('button', { name: /juste/i }))

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/accounts/acc-2/feedback',
      method: 'POST',
      body: { target: 'global', targetRef: '', verdict: 'juste' },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: /juste/i })).toHaveAttribute('aria-pressed', 'true'))
  })

  it('un second clic (autre verdict) ne renvoie rien tant que la première requête est en vol', async () => {
    let resolveFirst: (() => void) | undefined
    apiFetchMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFirst = () =>
            resolve({
              item: {
                id: 'fb-2',
                target: 'global',
                targetRef: '',
                verdict: 'partiel',
                note: null,
                createdAt: '2026-09-22T00:00:00Z',
              },
            })
        }),
    )
    const user = userEvent.setup()
    renderWithRouter(<AccountAnalysisVerdictButtons accountId="acc-3" />)

    await user.click(await screen.findByRole('button', { name: /partiel/i }))
    await user.click(screen.getByRole('button', { name: /manquant/i }))
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    resolveFirst?.()
  })
})
