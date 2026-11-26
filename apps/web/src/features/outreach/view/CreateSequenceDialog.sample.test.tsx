import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreateSequenceDialog } from './CreateSequenceDialog'

/**
 * #2874 / #2367.17 — L'ÉCHANTILLON AVANT DE VALIDER UNE CAMPAGNE.
 *
 * « Fais-moi un mail pour les cinquante contacts » ne doit pas générer
 * cinquante e-mails d'un coup (#2367, LAU-FINAL-082) — mais rien n'en
 * montrait un SEUL non plus avant validation (registre #2367.17). Ces tests
 * verrouillent : le bouton n'apparaît que pour une campagne à PLUSIEURS
 * contacts (une séquence à un seul contact garde son ancienne relecture,
 * #1935.24, inchangée) ; un clic déclenche UN SEUL appel, pour le premier
 * contact JOIGNABLE ; rien ne part tout seul à l'ouverture.
 */

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => ({ data: undefined }) }))
vi.mock('../hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/crm/api', () => ({ useCrmWriteRequests: () => ({ data: { status: 'not_connected' } }) }))
// #2202.23 — sans rapport avec ce lot : liste vide, aucun avertissement porteur.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('../hooks/useOutreachSequences', () => ({
  useOutreachSequences: () => ({ data: undefined }),
  useEnrollmentEligibility: () => ({ data: undefined }),
}))

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiFetch }))

const CONTACT_A = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Claire Dubois',
  title: 'DSI',
  email: 'claire@example.com',
}
const CONTACT_B = {
  id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Marc Petit',
  title: 'DSI',
  email: 'marc@example.com',
}
const CONTACT_NO_EMAIL = {
  id: '33333333-3333-4333-8333-333333333333',
  full_name: 'Léa Sans Mail',
  title: null,
  email: null,
}

describe('CreateSequenceDialog — échantillon avant validation (#2874 / #2367.17)', () => {
  beforeEach(() => {
    apiFetch.mockReset()
  })

  it('n’affiche aucun bouton d’échantillon pour un seul contact (comportement d’avant, #1935.24 suffit)', () => {
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CONTACT_A]} />)
    expect(screen.queryByText('Voir un échantillon de message')).not.toBeInTheDocument()
  })

  it('affiche le bouton d’échantillon pour une campagne à plusieurs contacts, et ne lance rien tout seul', () => {
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CONTACT_A, CONTACT_B]} />)
    expect(screen.getByText('Voir un échantillon de message')).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('un clic génère UN SEUL échantillon, pour le premier contact JOIGNABLE, et l’affiche', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Cloud souverain', body: 'Bonjour Claire, ...' } })
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={[CONTACT_A, CONTACT_B]}
        campaignContext={{ objective: 'Relancer les DSI industrie' }}
      />,
    )

    fireEvent.click(screen.getByText('Voir un échantillon de message'))

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/ia/message',
      method: 'POST',
      body: { contactId: CONTACT_A.id, channel: 'email', context: 'Relancer les DSI industrie' },
    })
    await waitFor(() => expect(screen.getByText('Bonjour Claire, ...')).toBeInTheDocument())
    expect(screen.getByText('Cloud souverain')).toBeInTheDocument()
  })

  it('un échec de génération se dit — jamais un texte inventé à la place', async () => {
    apiFetch.mockRejectedValue(new Error('502'))
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CONTACT_A, CONTACT_B]} />)

    fireEvent.click(screen.getByText('Voir un échantillon de message'))

    await waitFor(() => expect(screen.getByText('L’échantillon n’a pas pu être généré. Réessaie.')).toBeInTheDocument())
  })

  it('aucun contact joignable par e-mail : pas de bouton, une raison nommée', () => {
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={[CONTACT_NO_EMAIL, { ...CONTACT_NO_EMAIL, id: '44444444-4444-4444-8444-444444444444' }]}
      />,
    )
    expect(screen.queryByText('Voir un échantillon de message')).not.toBeInTheDocument()
    expect(
      screen.getByText('Aucun contact de cette audience n’a d’adresse e-mail : pas d’échantillon possible.'),
    ).toBeInTheDocument()
  })
})
