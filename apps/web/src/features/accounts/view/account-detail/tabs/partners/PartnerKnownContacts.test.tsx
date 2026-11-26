import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// #4987 — les contacts DÉJÀ en base d'une ESN de rang 2 qui existe comme compte de l'espace.
const state: { contacts: { data?: unknown[]; isPending: boolean; isError: boolean }; accountId: string | null } = {
  contacts: { data: undefined, isPending: true, isError: false },
  accountId: null,
}
const openEngagement = vi.fn()

vi.mock('@/features/contacts/hooks/useContactsByAccount', () => ({
  useContactsByAccount: (accountId: string | null) => {
    state.accountId = accountId
    return state.contacts
  },
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useOptionalContactEngagement: () => ({ openEngagement }),
}))

const { PartnerKnownContacts } = await import('./PartnerKnownContacts')

const ESN_ACCOUNT = '44444444-4444-4444-8444-444444444444'
beforeEach(() => {
  openEngagement.mockClear()
  state.contacts = { data: undefined, isPending: true, isError: false }
  state.accountId = null
})
afterEach(cleanup)

describe('#4987 — contacts connus d’une ESN de rang 2', () => {
  it('ESN de rang 2 présente dans l’espace : ses contacts, et « Préparer un message » ouvre le brouillon', () => {
    state.contacts = {
      isPending: false,
      isError: false,
      data: [{ id: 'k1', full_name: 'Sonia Pires', title: 'Directrice de comptes' }],
    }
    render(<PartnerKnownContacts rank="rank2" name="Altea" workspaceAccountId={ESN_ACCOUNT} />)
    expect(state.accountId).toBe(ESN_ACCOUNT)
    expect(screen.getByText('Sonia Pires')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Préparer un message/ }))
    // Le copilote prépare, il n'envoie jamais : on ouvre le brouillon existant sur CE contact.
    expect(openEngagement).toHaveBeenCalledWith([expect.objectContaining({ id: 'k1' })], 'email')
  })

  it('ESN présente mais sans contact ⇒ « aucun contact connu », jamais un contact inventé', () => {
    state.contacts = { isPending: false, isError: false, data: [] }
    render(<PartnerKnownContacts rank="rank2" name="Altea" workspaceAccountId={ESN_ACCOUNT} />)
    expect(screen.getByText(/Aucun contact connu/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Préparer/ })).toBeNull()
  })

  it('ESN absente de l’espace ⇒ « aucun contact connu » et AUCUNE lecture de contacts', () => {
    render(<PartnerKnownContacts rank="rank2" name="Altea" workspaceAccountId={undefined} />)
    expect(screen.getByText(/Aucun contact connu/)).toBeInTheDocument()
    expect(state.accountId).toBeNull()
  })

  it('un rang observé ou inconnu n’est pas « rang 2 » : rien ne s’affiche (#1624.6)', () => {
    const { container } = render(<PartnerKnownContacts rank="unknown" name="Altea" workspaceAccountId={ESN_ACCOUNT} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lecture en cours ou en panne ⇒ rien d’affirmé', () => {
    const { container, rerender } = render(
      <PartnerKnownContacts rank="rank2" name="Altea" workspaceAccountId={ESN_ACCOUNT} />,
    )
    expect(container).toBeEmptyDOMElement()
    state.contacts = { isPending: false, isError: true }
    rerender(<PartnerKnownContacts rank="rank2" name="Altea" workspaceAccountId={ESN_ACCOUNT} />)
    expect(container).toBeEmptyDOMElement()
  })
})
