import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EnrichConfirmDialog } from './EnrichConfirmDialog'

vi.mock('@/features/contacts/hooks/useEnrichmentDurationEstimate', () => ({
  useEnrichmentDurationEstimate: vi.fn(() => ({ data: { estimate: null } })),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: vi.fn(() => false) }))

/**
 * #4016.L8b — « Ne plus me demander » : une case sur la question de coût d'UN contact. Cochée puis
 * confirmée, elle pose la préférence ; un lot ne la propose jamais (GA-49).
 */
describe('EnrichConfirmDialog — « Ne plus me demander » (#4016.L8b)', () => {
  it('cochée puis confirmée : enrichit ET pose la préférence', async () => {
    const onConfirm = vi.fn()
    const onDontAskAgain = vi.fn()
    render(
      <EnrichConfirmDialog
        open
        count={1}
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        onDontAskAgain={onDontAskAgain}
      />,
    )
    await userEvent.click(screen.getByRole('checkbox', { name: /Ne plus me demander/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Enrichir$/ }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onDontAskAgain).toHaveBeenCalledTimes(1)
  })

  it('non cochée : enrichit sans toucher à la préférence', async () => {
    const onDontAskAgain = vi.fn()
    render(
      <EnrichConfirmDialog open count={1} onConfirm={vi.fn()} onOpenChange={vi.fn()} onDontAskAgain={onDontAskAgain} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^Enrichir$/ }))
    expect(onDontAskAgain).not.toHaveBeenCalled()
  })

  it('sait dire NON : un lot, une recherche gratuite ou un appelant sans geste ne la proposent pas', () => {
    for (const props of [
      { count: 3, onDontAskAgain: vi.fn() },
      { free: true, onDontAskAgain: vi.fn() },
      { count: 1 },
    ]) {
      const { unmount } = render(<EnrichConfirmDialog open onConfirm={vi.fn()} onOpenChange={vi.fn()} {...props} />)
      expect(screen.queryByRole('checkbox', { name: /Ne plus me demander/ })).not.toBeInTheDocument()
      unmount()
    }
  })
})
