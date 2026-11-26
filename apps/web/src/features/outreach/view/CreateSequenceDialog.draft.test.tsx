import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * #3702 — créer une séquence depuis la fiche contact doit PRÉPARER le brouillon
 * de l'étape e-mail (objet + corps, moteur existant) AVANT la création, pour
 * que l'étape naisse relisible et que le centre « À valider » ne reste pas vide.
 * Si la préparation échoue, l'écran DIT pourquoi — la séquence se crée quand
 * même, l'objet et le corps s'écrivent à la main dans « Modifier ».
 */
const { mutateAsync, prepareEmailDraft, warning } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  prepareEmailDraft: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => ({ data: undefined }) }))
vi.mock('../hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning, error: vi.fn() } }))
vi.mock('@/features/crm/api', () => ({ useCrmWriteRequests: () => ({ data: { status: 'not_connected' } }) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('../hooks/useOutreachSequences', () => ({
  useOutreachSequences: () => ({ data: undefined }),
  useEnrollmentEligibility: () => ({ data: undefined }),
}))
vi.mock('../prepare-email-draft', () => ({ prepareEmailDraft }))

import { CreateSequenceDialog } from './CreateSequenceDialog'

const FICHE = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Louis Schlegel',
  title: 'Recette 10-10',
  email: 'louis@example.com',
}

const submit = async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  await user.click(screen.getByRole('button', { name: /Créer/ }))
}

beforeEach(() => {
  mutateAsync.mockReset()
  mutateAsync.mockResolvedValue({ id: 'seq' })
  prepareEmailDraft.mockReset()
  warning.mockReset()
})

describe('CreateSequenceDialog — le brouillon est préparé avant la création (#3702)', () => {
  it('prépare le brouillon du contact AVANT de créer la séquence', async () => {
    const order: string[] = []
    prepareEmailDraft.mockImplementation(async () => {
      order.push('prepare')
      return { contactId: FICHE.id, status: 'prepared' }
    })
    mutateAsync.mockImplementation(async () => {
      order.push('create')
      return { id: 'seq' }
    })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[FICHE]} />)
    await submit()
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(prepareEmailDraft).toHaveBeenCalledWith(expect.objectContaining({ id: FICHE.id }), undefined)
    expect(order).toEqual(['prepare', 'create'])
  })

  it('échec de préparation : la séquence se crée quand même et l’écran dit POURQUOI', async () => {
    prepareEmailDraft.mockResolvedValue({ contactId: FICHE.id, status: 'failed', reason: 'generation_failed' })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[FICHE]} />)
    await submit()
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(warning).toHaveBeenCalled())
    const message = String(warning.mock.calls[0]?.[0])
    expect(message).toContain('Louis Schlegel')
    expect(message).toMatch(/Modifier/)
  })
})
