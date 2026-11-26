import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { ReportCorrectionDialog } from '@/features/profile/components/ReportCorrectionDialog'
import { esnProfileApi } from '@/features/profile/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/profile/api', () => ({ esnProfileApi: { reportCorrection: vi.fn() } }))

// #2018.7 — signaler une information d'entreprise fausse, sans l'écraser.
describe('ReportCorrectionDialog', () => {
  it('signale — persiste et confirme, sans jamais écrire le champ', async () => {
    vi.mocked(esnProfileApi.reportCorrection).mockResolvedValue({
      id: 'req-1',
      fieldKey: 'esn_name',
      reason: 'Ancienne raison sociale',
      status: 'pending',
      createdAt: '2026-09-18T10:00:00.000Z',
      resolvedAt: null,
    })
    const onOpenChange = vi.fn()
    renderWithRouter(<ReportCorrectionDialog open fieldKey="esn_name" onOpenChange={onOpenChange} />)

    await userEvent.type(await screen.findByLabelText(/pourquoi/i), 'Ancienne raison sociale')
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }))

    await waitFor(() =>
      expect(esnProfileApi.reportCorrection).toHaveBeenCalledWith({
        fieldKey: 'esn_name',
        reason: 'Ancienne raison sociale',
      }),
    )
    expect(toast.success).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('sait dire NON — le bouton reste désactivé tant qu’aucune raison n’est écrite', async () => {
    renderWithRouter(<ReportCorrectionDialog open fieldKey="esn_name" onOpenChange={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /envoyer/i })).toBeDisabled()
  })

  it('un échec affiche une erreur et ne ferme pas le dialogue', async () => {
    vi.mocked(esnProfileApi.reportCorrection).mockRejectedValue(new Error('boom'))
    const onOpenChange = vi.fn()
    renderWithRouter(<ReportCorrectionDialog open fieldKey="esn_name" onOpenChange={onOpenChange} />)

    await userEvent.type(await screen.findByLabelText(/pourquoi/i), 'Raison')
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
