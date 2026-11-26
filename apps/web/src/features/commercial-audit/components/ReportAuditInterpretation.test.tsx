import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { ReportAuditInterpretation } from './ReportAuditInterpretation'
import { esnProfileApi } from '@/features/profile/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/profile/api', () => ({ esnProfileApi: { reportCorrection: vi.fn() } }))

/**
 * #2010.15 — PRÉCISER / SIGNALER une mauvaise interprétation de l'audit.
 *
 * Distinct de #2018.7 (`ReportCorrectionDialog`, une réponse DÉCLARÉE) : ce
 * geste vise le VERDICT/les recommandations que l'audit a produits, pas un
 * champ du profil — `fieldKey` porte donc `AUDIT_INTERPRETATION_FIELD_KEY`,
 * jamais une clé d'`EsnAnswers`.
 */
describe('ReportAuditInterpretation — #2010.15', () => {
  it('le dialogue est FERMÉ tant que rien ne l’a ouvert', () => {
    renderWithRouter(<ReportAuditInterpretation />)
    expect(screen.queryByRole('button', { name: /envoyer/i })).not.toBeInTheDocument()
  })

  it('signale l’interprétation de l’audit — clé fixe, jamais une clé de réponse', async () => {
    vi.mocked(esnProfileApi.reportCorrection).mockResolvedValue({
      id: 'req-1',
      fieldKey: 'audit:interpretation',
      reason: 'Le verdict ne correspond pas à ce que je vis sur le terrain.',
      status: 'pending',
      createdAt: '2026-09-22T10:00:00.000Z',
      resolvedAt: null,
    })
    renderWithRouter(<ReportAuditInterpretation />)

    await userEvent.click(await screen.findByRole('button', { name: /signaler/i }))
    await userEvent.type(
      await screen.findByLabelText(/pourquoi/i),
      'Le verdict ne correspond pas à ce que je vis sur le terrain.',
    )
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }))

    await waitFor(() =>
      expect(esnProfileApi.reportCorrection).toHaveBeenCalledWith({
        fieldKey: 'audit:interpretation',
        reason: 'Le verdict ne correspond pas à ce que je vis sur le terrain.',
      }),
    )
    expect(toast.success).toHaveBeenCalled()
  })

  it('le dialogue se REFERME après l’envoi — le bouton « Signaler » redevient seul visible', async () => {
    vi.mocked(esnProfileApi.reportCorrection).mockResolvedValue({
      id: 'req-1',
      fieldKey: 'audit:interpretation',
      reason: 'Raison',
      status: 'pending',
      createdAt: '2026-09-22T10:00:00.000Z',
      resolvedAt: null,
    })
    renderWithRouter(<ReportAuditInterpretation />)

    await userEvent.click(await screen.findByRole('button', { name: /signaler/i }))
    await userEvent.type(await screen.findByLabelText(/pourquoi/i), 'Raison')
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /envoyer/i })).not.toBeInTheDocument())
  })
})
