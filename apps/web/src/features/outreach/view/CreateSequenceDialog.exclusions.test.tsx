import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreateSequenceDialog } from './CreateSequenceDialog'

/**
 * Lot L-B (#4165) — LES EXCLUSIONS À L'INSCRIPTION, nommées contact par contact
 * dans la fenêtre de création. Une exclusion levable se lève par une case
 * explicite ; l'opposition RGPD ne se lève jamais — ce contact n'est pas inscrit.
 */

const createAsync = vi.hoisted(() => vi.fn())
const eligibilityMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => ({ data: undefined }) }))
vi.mock('../hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync: createAsync, isPending: false }),
}))
vi.mock('@/features/crm/api', () => ({ useCrmWriteRequests: () => ({ data: { status: 'not_connected' } }) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('../hooks/useOutreachSequences', () => ({
  useOutreachSequences: () => ({ data: undefined }),
  useEnrollmentEligibility: () => eligibilityMock(),
}))

const RECENT = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Marie Dubois',
  title: 'DSI',
  email: 'marie@example.com',
  assigned_to: null,
}
const RGPD = {
  id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Karim Haddad',
  title: 'DAF',
  email: 'karim@example.com',
  assigned_to: null,
}
const FREE = {
  id: '33333333-3333-4333-8333-333333333333',
  full_name: 'Léa Roy',
  title: 'CTO',
  email: 'lea@example.com',
  assigned_to: null,
}

const ELIGIBILITY = {
  data: {
    contacts: [
      {
        contact_id: RECENT.id,
        contact_name: 'Marie Dubois',
        exclusions: [{ code: 'recently_contacted', forceable: true }],
        client_status_known: true,
      },
      {
        contact_id: RGPD.id,
        contact_name: 'Karim Haddad',
        exclusions: [{ code: 'rgpd_opposition', forceable: false }],
        client_status_known: true,
      },
      { contact_id: FREE.id, contact_name: 'Léa Roy', exclusions: [], client_status_known: true },
    ],
  },
}

beforeEach(() => {
  createAsync.mockReset().mockResolvedValue({})
  eligibilityMock.mockReset().mockReturnValue(ELIGIBILITY)
})

const contactIdsCreated = (): string[] =>
  createAsync.mock.calls.map(call => (call[0] as { contact_id: string }).contact_id)

describe('CreateSequenceDialog — exclusions à l’inscription (lot L-B)', () => {
  it('nomme chaque contact exclu et sa raison', () => {
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[RECENT, RGPD, FREE]} />)
    const block = screen.getByTestId('enrollment-exclusions')
    expect(block).toHaveTextContent('Marie Dubois')
    expect(block).toHaveTextContent('contacté il y a moins de 30 jours')
    expect(block).toHaveTextContent('Karim Haddad')
  })

  it('sans lever l’exclusion, seuls les contacts libres sont inscrits', async () => {
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[RECENT, RGPD, FREE]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Créer la séquence' }))
    await waitFor(() => expect(createAsync).toHaveBeenCalledTimes(1))
    expect(contactIdsCreated()).toEqual([FREE.id])
    expect(createAsync.mock.calls[0]?.[0]).not.toHaveProperty('override_exclusions')
  })

  it('en levant l’exclusion : le contact récent est inscrit avec le drapeau, JAMAIS le RGPD', async () => {
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[RECENT, RGPD, FREE]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Inscrire quand même/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer la séquence' }))
    await waitFor(() => expect(createAsync).toHaveBeenCalledTimes(2))
    expect(contactIdsCreated().sort()).toEqual([RECENT.id, FREE.id].sort())
    const forced = createAsync.mock.calls.find(
      call => (call[0] as { contact_id: string }).contact_id === RECENT.id,
    )?.[0]
    expect(forced).toMatchObject({ override_exclusions: true })
    const free = createAsync.mock.calls.find(call => (call[0] as { contact_id: string }).contact_id === FREE.id)?.[0]
    expect(free).not.toHaveProperty('override_exclusions')
  })

  it('ne dit rien quand personne n’est exclu', () => {
    eligibilityMock.mockReturnValue({ data: { contacts: [ELIGIBILITY.data.contacts[2]] } })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[FREE]} />)
    expect(screen.queryByTestId('enrollment-exclusions')).not.toBeInTheDocument()
  })
})
