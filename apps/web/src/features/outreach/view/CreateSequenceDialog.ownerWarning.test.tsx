import { render, screen } from '@testing-library/react'
import { CreateSequenceDialog } from './CreateSequenceDialog'

/**
 * #2202.23 — AVANT VALIDATION : PROPRIÉTAIRES.
 *
 * Un contact déjà PORTÉ par un collègue (`contacts.assigned_to`) ne le disait
 * nulle part avant de lancer une séquence dessus — même geste que
 * `colleagueOwner` sur la fiche contact (`ContactHeader.tsx`), jamais un
 * second calcul qui pourrait diverger sur qui compte comme « moi ».
 */

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => ({ data: undefined }) }))
vi.mock('../hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/crm/api', () => ({ useCrmWriteRequests: () => ({ data: { status: 'not_connected' } }) }))

const useWorkspaceMembersMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => useWorkspaceMembersMock(),
}))
vi.mock('../hooks/useOutreachSequences', () => ({
  useOutreachSequences: () => ({ data: undefined }),
  useEnrollmentEligibility: () => ({ data: undefined }),
}))

const ME = 'a0000000-0000-4000-8000-000000000001'
const COLLEAGUE = 'a0000000-0000-4000-8000-000000000002'
const FORMER_MEMBER = 'a0000000-0000-4000-8000-000000000009'

const MEMBERS = [
  { userId: ME, email: 'me@example.com', fullName: 'Moi-même', role: 'member' as const, isSelf: true },
  { userId: COLLEAGUE, email: 'jean@example.com', fullName: 'Jean Dupont', role: 'member' as const, isSelf: false },
]

const MINE = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Claire Dubois',
  title: 'DSI',
  email: 'claire@example.com',
  assigned_to: ME,
}
const COLLEAGUE_OWNED = {
  id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Marc Petit',
  title: 'DSI',
  email: 'marc@example.com',
  assigned_to: COLLEAGUE,
}
const FORMER_MEMBER_OWNED = {
  id: '33333333-3333-4333-8333-333333333333',
  full_name: 'Nadia Cohen',
  title: 'DSI',
  email: 'nadia@example.com',
  assigned_to: FORMER_MEMBER,
}
const UNASSIGNED = {
  id: '44444444-4444-4444-8444-444444444444',
  full_name: 'Paul Martin',
  title: 'DSI',
  email: 'paul@example.com',
  assigned_to: null,
}

beforeEach(() => useWorkspaceMembersMock.mockReset())

describe('CreateSequenceDialog — avertissement porteur (#2202.23)', () => {
  it('avertit, avec le NOM du collègue, quand un contact sélectionné est porté par quelqu’un d’autre', () => {
    useWorkspaceMembersMock.mockReturnValue({ data: MEMBERS })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[COLLEAGUE_OWNED]} />)
    expect(screen.getByText('1 contact sélectionné est déjà porté par un collègue :')).toBeInTheDocument()
    expect(screen.getByText('Marc Petit — porté par Jean Dupont')).toBeInTheDocument()
  })

  it('avertit sans inventer de nom quand le porteur n’est plus dans l’espace', () => {
    useWorkspaceMembersMock.mockReturnValue({ data: MEMBERS })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[FORMER_MEMBER_OWNED]} />)
    expect(screen.getByText('Nadia Cohen — porté par un autre membre de l’espace')).toBeInTheDocument()
  })

  it('ne dit rien pour un contact que JE porte moi-même', () => {
    useWorkspaceMembersMock.mockReturnValue({ data: MEMBERS })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[MINE]} />)
    expect(screen.queryByText(/porté par/)).not.toBeInTheDocument()
  })

  it('ne dit rien pour un contact sans porteur attribué', () => {
    useWorkspaceMembersMock.mockReturnValue({ data: MEMBERS })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[UNASSIGNED]} />)
    expect(screen.queryByText(/porté par/)).not.toBeInTheDocument()
  })

  it('ne devine RIEN tant que la liste des membres n’a pas répondu — pas de faux positif ni négatif', () => {
    useWorkspaceMembersMock.mockReturnValue({ data: undefined })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[COLLEAGUE_OWNED]} />)
    expect(screen.queryByText(/porté par/)).not.toBeInTheDocument()
  })

  it('compte chaque contact séparément — deux contacts portés par des collègues font deux lignes', () => {
    useWorkspaceMembersMock.mockReturnValue({ data: MEMBERS })
    render(
      <CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[COLLEAGUE_OWNED, FORMER_MEMBER_OWNED]} />,
    )
    expect(screen.getByText('2 contacts sélectionnés sont déjà portés par un collègue :')).toBeInTheDocument()
    expect(screen.getByText('Marc Petit — porté par Jean Dupont')).toBeInTheDocument()
    expect(screen.getByText('Nadia Cohen — porté par un autre membre de l’espace')).toBeInTheDocument()
  })

  it('reste visible depuis la fiche contact, où le sélecteur est masqué (contactsLocked)', () => {
    useWorkspaceMembersMock.mockReturnValue({ data: MEMBERS })
    render(<CreateSequenceDialog open onOpenChange={() => {}} contactsLocked initialContacts={[COLLEAGUE_OWNED]} />)
    expect(screen.getByText('Marc Petit — porté par Jean Dupont')).toBeInTheDocument()
  })
})
