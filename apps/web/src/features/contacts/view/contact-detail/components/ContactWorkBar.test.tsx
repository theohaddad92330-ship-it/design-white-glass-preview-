import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useCreateOutreachCallTask } from '@/features/outreach/hooks/useOutreachMutations'
import { ContactWorkBar } from './ContactWorkBar'

vi.mock('@/features/outreach/hooks/useOutreachMutations', () => ({
  useCreateOutreachCallTask: vi.fn(),
}))

describe('ContactWorkBar — #3688.1, note / échange / tâche en haut de la fiche', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    vi.mocked(useCreateOutreachCallTask).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCreateOutreachCallTask>)
  })

  it('« Ajouter une note » et « Consigner un échange » déclenchent leur geste', async () => {
    const onAddNote = vi.fn()
    const onLogExchange = vi.fn()
    const user = userEvent.setup()
    render(<ContactWorkBar contactId="c1" onAddNote={onAddNote} onLogExchange={onLogExchange} />)

    await user.click(screen.getByRole('button', { name: 'Ajouter une note' }))
    await user.click(screen.getByRole('button', { name: 'Consigner un échange' }))
    expect(onAddNote).toHaveBeenCalledTimes(1)
    expect(onLogExchange).toHaveBeenCalledTimes(1)
  })

  it('« Planifier un appel » ouvre le créateur d’appel du contact', async () => {
    const user = userEvent.setup()
    render(<ContactWorkBar contactId="c1" onAddNote={vi.fn()} onLogExchange={vi.fn()} />)
    expect(screen.queryByLabelText('Raison de l’appel')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Planifier un appel' }))
    expect(screen.getByLabelText('Raison de l’appel')).toBeInTheDocument()
  })
})
