import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { AuditFeedbackControls } from './AuditFeedbackControls'
import { commercialAuditFeedbackApi } from '../api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../api', () => ({
  commercialAuditFeedbackApi: { list: vi.fn(), create: vi.fn() },
  commercialAuditFeedbackKeys: { list: ['commercial-audit', 'feedback'] },
}))

/**
 * #2075.12 / #2075.13 — commenter une conclusion, refuser une recommandation.
 * Même patron de test que `ReportAuditInterpretation.test.tsx`.
 */
describe('AuditFeedbackControls — #2075.12 / #2075.13', () => {
  beforeEach(() => vi.clearAllMocks())

  it('le dialogue de commentaire est FERMÉ tant que rien ne l’a ouvert', () => {
    renderWithRouter(<AuditFeedbackControls targetKey="bottleneck" />)
    expect(screen.queryByRole('button', { name: /envoyer/i })).not.toBeInTheDocument()
  })

  it('#2075.12 — commente une conclusion avec son texte, `target_key` = la clé de l’audit', async () => {
    vi.mocked(commercialAuditFeedbackApi.create).mockResolvedValue({
      feedback: {
        bottleneck: {
          target_key: 'bottleneck',
          kind: 'comment',
          comment_text: 'On en a déjà parlé.',
          created_at: '2026-09-26T10:00:00.000Z',
        },
      },
    })
    renderWithRouter(<AuditFeedbackControls targetKey="bottleneck" />)

    await userEvent.click(await screen.findByRole('button', { name: /commenter/i }))
    await userEvent.type(await screen.findByLabelText(/note/i), 'On en a déjà parlé.')
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }))

    await waitFor(() =>
      expect(commercialAuditFeedbackApi.create).toHaveBeenCalledWith({
        target_key: 'bottleneck',
        kind: 'comment',
        comment_text: 'On en a déjà parlé.',
      }),
    )
  })

  it('n’envoie AUCUN commentaire vide — le bouton « Envoyer » reste désactivé', async () => {
    renderWithRouter(<AuditFeedbackControls targetKey="bottleneck" />)

    await userEvent.click(await screen.findByRole('button', { name: /commenter/i }))

    expect(await screen.findByRole('button', { name: /envoyer/i })).toBeDisabled()
    expect(commercialAuditFeedbackApi.create).not.toHaveBeenCalled()
  })

  it('#2075.13 — refuse une recommandation D’UN CLIC, sans texte — le clic EST la décision', async () => {
    vi.mocked(commercialAuditFeedbackApi.create).mockResolvedValue({
      feedback: {
        stop: { target_key: 'stop', kind: 'refused', comment_text: null, created_at: '2026-09-26T10:00:00.000Z' },
      },
    })
    renderWithRouter(<AuditFeedbackControls targetKey="stop" />)

    await userEvent.click(await screen.findByRole('button', { name: /refuser/i }))

    await waitFor(() =>
      expect(commercialAuditFeedbackApi.create).toHaveBeenCalledWith({ target_key: 'stop', kind: 'refused' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('un échec du refus se dit — jamais silencieux', async () => {
    vi.mocked(commercialAuditFeedbackApi.create).mockRejectedValue(new Error('boom'))
    renderWithRouter(<AuditFeedbackControls targetKey="stop" />)

    await userEvent.click(await screen.findByRole('button', { name: /refuser/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })
})
