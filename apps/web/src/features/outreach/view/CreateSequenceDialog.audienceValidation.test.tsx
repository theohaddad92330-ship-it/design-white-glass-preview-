import { render, screen, within } from '@testing-library/react'
import { CreateSequenceDialog } from './CreateSequenceDialog'

/**
 * #2202.19 / #2202.22 — AVANT VALIDATION : DOUBLONS ET DÉJÀ EN SÉQUENCE.
 *
 * Deux avertissements, ni l'un ni l'autre bloquant — même geste que
 * l'avertissement « porté par un collègue » (#2202.23) : signaler, jamais
 * décider à la place du commercial.
 */

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => ({ data: undefined }) }))
vi.mock('../hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/crm/api', () => ({ useCrmWriteRequests: () => ({ data: { status: 'not_connected' } }) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))

const useOutreachSequencesMock = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useOutreachSequences', () => ({
  useEnrollmentEligibility: () => ({ data: undefined }),
  useOutreachSequences: () => useOutreachSequencesMock(),
}))

const CLAIRE = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Claire Dubois',
  title: 'DSI',
  email: 'claire@example.com',
}
const CLAIRE_DUPLICATE = {
  id: '22222222-2222-4222-8222-222222222222',
  full_name: 'C. Dubois (import)',
  title: 'DSI',
  email: 'Claire@Example.com',
}
const MARC = {
  id: '33333333-3333-4333-8333-333333333333',
  full_name: 'Marc Petit',
  title: 'RSSI',
  email: 'marc@example.com',
}

beforeEach(() => useOutreachSequencesMock.mockReset())

describe('CreateSequenceDialog — doublons e-mail (#2202.19)', () => {
  it('avertit quand deux contacts sélectionnés partagent la même adresse e-mail', () => {
    useOutreachSequencesMock.mockReturnValue({ data: undefined })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CLAIRE, CLAIRE_DUPLICATE]} />)
    expect(
      screen.getByText('2 contacts sélectionnés partagent leur adresse e-mail avec un autre :'),
    ).toBeInTheDocument()
    expect(screen.getByText('Claire Dubois — claire@example.com')).toBeInTheDocument()
    expect(screen.getByText('C. Dubois (import) — Claire@Example.com')).toBeInTheDocument()
  })

  it('ne dit rien quand chaque adresse est unique', () => {
    useOutreachSequencesMock.mockReturnValue({ data: undefined })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CLAIRE, MARC]} />)
    expect(screen.queryByText(/partagent leur adresse/)).not.toBeInTheDocument()
  })
})

describe('CreateSequenceDialog — déjà en séquence (#2202.22)', () => {
  it('avertit quand un contact sélectionné a déjà une séquence ACTIVE', () => {
    useOutreachSequencesMock.mockReturnValue({ data: [{ contact_id: CLAIRE.id, status: 'active' }] })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CLAIRE]} />)
    const heading = screen.getByText('1 contact sélectionné a déjà une séquence en cours :')
    expect(heading).toBeInTheDocument()
    expect(within(heading.parentElement as HTMLElement).getByText('Claire Dubois')).toBeInTheDocument()
  })

  it('ne dit rien pour une séquence TERMINÉE ou ANNULÉE', () => {
    useOutreachSequencesMock.mockReturnValue({ data: [{ contact_id: CLAIRE.id, status: 'completed' }] })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CLAIRE]} />)
    expect(screen.queryByText(/déjà une séquence/)).not.toBeInTheDocument()
  })

  it("ne devine RIEN tant que les séquences n'ont pas répondu", () => {
    useOutreachSequencesMock.mockReturnValue({ data: undefined })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CLAIRE]} />)
    expect(screen.queryByText(/déjà une séquence/)).not.toBeInTheDocument()
  })
})
