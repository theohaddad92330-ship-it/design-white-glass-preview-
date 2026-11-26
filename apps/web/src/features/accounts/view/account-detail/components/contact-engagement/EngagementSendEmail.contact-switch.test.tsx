import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Contact } from '@bellum/contracts'

/**
 * #3710.5 — « changer de contact n'utilise pas le brouillon du précédent ».
 *
 * Le fil et le brief sont déjà tenus par contact (`conversation.test.tsx`,
 * #3696.5). Restait l'ÉTAT D'ENVOI : `sentAt` vit dans le composant. Si le
 * panneau reste monté quand le contact change, le compte rendu « envoyé » du
 * contact A s'afficherait sur B — un prospect de salle verrait un message
 * « expédié » à quelqu'un à qui rien n'a été envoyé.
 */
const mutate = vi.fn()
vi.mock('@/features/contacts/hooks/useSendContactEmail', () => ({
  useSendContactEmail: () => ({ mutate, isPending: false }),
}))
vi.mock('@/features/contacts/hooks/useContactSendability', () => ({
  useContactSendability: () => ({ data: { sender: 'moi@exemple.test', reply_to: null } }),
}))
vi.mock('@/features/mailbox/api', () => ({ useMailboxSenders: () => ({ data: undefined }) }))
vi.mock('@/features/contacts/hooks/useContactCadence', () => ({
  useContactCadence: () => ({ data: undefined }),
}))
vi.mock('@/features/contacts/hooks/useContactRanking', () => ({
  useContactRanking: () => ({ data: { excluded: [] }, isLoading: false }),
}))

const { EngagementSendEmailAction } = await import('./EngagementSendEmail')

function contact(id: string, name: string): Contact {
  return {
    id,
    full_name: name,
    email: `${id}@exemple.test`,
    email_sent_at: null,
  } as unknown as Contact
}

describe('EngagementSendEmailAction — #3710.5 l’envoi ne suit pas un autre contact', () => {
  it('le reçu d’envoi du contact A ne s’affiche PAS quand le panneau passe au contact B', () => {
    mutate.mockImplementation((_input: unknown, options: { onSuccess: (r: { email_sent_at: string }) => void }) =>
      options.onSuccess({ email_sent_at: '2026-10-06T09:00:00.000Z' }),
    )
    const a = contact('contact-a', 'Alice Martin')
    const b = contact('contact-b', 'Bruno Petit')
    const { rerender } = render(<EngagementSendEmailAction contact={a} subject="Objet" text="Bonjour Alice" />)

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    fireEvent.click(screen.getByRole('button', { name: "Envoyer l'email" }))
    expect(screen.getByTestId('engagement-sent-summary')).not.toBeNull()

    rerender(<EngagementSendEmailAction contact={b} subject="Objet" text="Bonjour Bruno" />)

    expect(screen.queryByTestId('engagement-sent-summary')).toBeNull()
    expect(screen.getByRole('button', { name: 'Envoyer' })).not.toBeNull()
  })

  it('SAIT DIRE NON : pour le MÊME contact, le reçu reste', () => {
    mutate.mockImplementation((_input: unknown, options: { onSuccess: (r: { email_sent_at: string }) => void }) =>
      options.onSuccess({ email_sent_at: '2026-10-06T09:00:00.000Z' }),
    )
    const a = contact('contact-a', 'Alice Martin')
    const { rerender } = render(<EngagementSendEmailAction contact={a} subject="Objet" text="Bonjour" />)
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    fireEvent.click(screen.getByRole('button', { name: "Envoyer l'email" }))
    rerender(<EngagementSendEmailAction contact={{ ...a }} subject="Objet" text="Bonjour" />)
    expect(screen.getByTestId('engagement-sent-summary')).not.toBeNull()
  })
})
