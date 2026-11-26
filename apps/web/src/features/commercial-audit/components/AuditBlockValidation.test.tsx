import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditBlockValidation } from './AuditBlockValidation'
import { commercialAuditFeedbackApi } from '../api'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../api', () => ({
  commercialAuditFeedbackApi: { list: vi.fn(), create: vi.fn() },
  commercialAuditFeedbackKeys: { list: ['commercial-audit', 'feedback'] },
}))

describe('AuditBlockValidation — #2075.14 « Valider par BLOC »', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resetTestQueryClient()
  })

  it('valide CE bloc seul, par sa clé — le clic est la décision', async () => {
    vi.mocked(commercialAuditFeedbackApi.list).mockResolvedValue({ feedback: {} })
    vi.mocked(commercialAuditFeedbackApi.create).mockResolvedValue({ feedback: {} })
    renderWithRouter(<AuditBlockValidation targetKey="consequence:accounts" />)
    await userEvent.click(await screen.findByRole('button', { name: /valider ce bloc/i }))
    await waitFor(() =>
      expect(commercialAuditFeedbackApi.create).toHaveBeenCalledWith({
        target_key: 'consequence:accounts',
        kind: 'validated',
      }),
    )
  })

  it('une fois validé, le bloc le DIT et ne repropose plus le geste', async () => {
    vi.mocked(commercialAuditFeedbackApi.create).mockResolvedValue({
      feedback: {
        'consequence:accounts': {
          target_key: 'consequence:accounts',
          kind: 'validated',
          comment_text: null,
          created_at: '2026-09-28T10:00:00.000Z',
        },
      },
    })
    renderWithRouter(<AuditBlockValidation targetKey="consequence:accounts" />)
    await userEvent.click(await screen.findByRole('button', { name: /valider ce bloc/i }))
    expect(await screen.findByText(/bloc validé/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /valider ce bloc/i })).not.toBeInTheDocument()
  })
})
