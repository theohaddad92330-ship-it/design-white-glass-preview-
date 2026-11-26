import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ContactFold } from './ContactFold'

function Probe() {
  probeMounted()
  return <p>contenu</p>
}
const probeMounted = vi.fn()

describe('ContactFold — #3687, une vue repliée ne charge rien', () => {
  it('fermé : les enfants ne sont PAS montés (aucune vue cachée en parallèle)', () => {
    probeMounted.mockClear()
    render(
      <ContactFold id="f" title="Preuves" open={false} onOpenChange={vi.fn()}>
        <Probe />
      </ContactFold>,
    )
    expect(probeMounted).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Preuves' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('ouvert : les enfants sont montés ; le clic demande la bascule', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ContactFold id="f" title="Preuves" open onOpenChange={onOpenChange}>
        <Probe />
      </ContactFold>,
    )
    expect(screen.getByText('contenu')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Preuves' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
