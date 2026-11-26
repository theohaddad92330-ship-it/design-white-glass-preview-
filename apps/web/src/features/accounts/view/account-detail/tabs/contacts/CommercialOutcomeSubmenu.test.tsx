import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@bellum/ui'
import { i18n } from '@/i18n'
import { CommercialOutcomeSubmenu } from './CommercialOutcomeSubmenu'

/**
 * #2126.47/.50/.51/.53/.54 (épopée #2787) — le sous-menu qui enregistre un
 * outcome PORTÉ PAR UN CONTACT, distinct de {@link ContactOutcomeSubmenu}
 * (`user_status`) — voir le docblock du composant.
 */
const recordMutate = vi.fn()

vi.mock('@/features/accounts/hooks/useCommercialOutcomes', () => ({
  useRecordCommercialOutcome: () => ({ mutate: recordMutate, isPending: false }),
}))

function contact(partial: Partial<Contact> = {}): Contact {
  return { id: 'c1', account_id: 'a1', full_name: 'Camille Roux', ...partial } as unknown as Contact
}

function draw(c: Contact) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DropdownMenu open>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <CommercialOutcomeSubmenu contact={c} />
        </DropdownMenuContent>
      </DropdownMenu>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  recordMutate.mockReset()
})

describe('CommercialOutcomeSubmenu', () => {
  it('ouvre sur les cinq outcomes PORTÉS PAR UN CONTACT — jamais les deux de portée compte', async () => {
    draw(contact())
    await userEvent.click(screen.getByText('Enregistrer un résultat'))
    expect(screen.getByText('Relation qualifiée')).toBeInTheDocument()
    expect(screen.getByText('Message répondu')).toBeInTheDocument()
    expect(screen.getByText('Consultant positionné')).toBeInTheDocument()
    expect(screen.getByText('Contact incorrect')).toBeInTheDocument()
    expect(screen.getByText('Refus')).toBeInTheDocument()
    // #2126.48 est une portée COMPTE, jamais nommée sur une ligne de contact.
    expect(screen.queryByText(/[Pp]artenaire/)).not.toBeInTheDocument()
  })

  it('enregistre l’outcome cliqué avec l’identifiant DE CE CONTACT', async () => {
    draw(contact({ id: 'c-42' }))
    await userEvent.click(screen.getByText('Enregistrer un résultat'))
    await userEvent.click(screen.getByText('Message répondu'))
    expect(recordMutate).toHaveBeenCalledWith(
      { type: 'message_replied', contactId: 'c-42' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('un contact SANS compte (à qualifier) désactive le sous-menu — rien à rattacher', async () => {
    draw(contact({ account_id: null }))
    const trigger = screen.getByText('Enregistrer un résultat').closest('[role="menuitem"]')
    expect(trigger).toHaveAttribute('data-disabled')
  })
})
