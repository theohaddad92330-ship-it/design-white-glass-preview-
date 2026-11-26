import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { teamGuardrailsApi } from '@/features/team-guardrails/api'
import { CreateSequenceDialog } from './CreateSequenceDialog'

/**
 * #4158.47 — créer une séquence sur le contact d'un collègue demande d'abord
 * une confirmation « contacté il y a N j par un collègue » (#21) : jamais un
 * blocage dur, et aucun dialogue quand l'espace ne sait rien.
 */

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => ({ data: undefined }) }))
const mutateAsync = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/features/crm/api', () => ({ useCrmWriteRequests: () => ({ data: { status: 'not_connected' } }) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('../hooks/useOutreachSequences', () => ({
  useOutreachSequences: () => ({ data: undefined }),
  useEnrollmentEligibility: () => ({ data: undefined }),
}))
vi.mock('@/features/team-guardrails/api', () => ({ teamGuardrailsApi: { checkContacts: vi.fn() } }))

const CONTACT = {
  id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Marc Petit',
  title: 'DSI',
  email: 'marc@example.com',
  assigned_to: null,
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  vi.clearAllMocks()
  mutateAsync.mockResolvedValue({})
})

describe('CreateSequenceDialog — garde collègue à la création (#4158.47)', () => {
  it('confirme avant de créer quand un collègue a contacté le contact', async () => {
    vi.mocked(teamGuardrailsApi.checkContacts).mockResolvedValue({
      items: [
        {
          contact_id: CONTACT.id,
          do_not_contact: null,
          contacted: {
            contact_id: CONTACT.id,
            by_user_id: 'u-bob',
            by_name: 'Bob Durand',
            at: '',
            days_ago: 3,
            proof: 'verified',
          },
        },
      ],
    })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CONTACT]} />)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('outreach:dialog.create') }))
    expect(await screen.findByText(/Bob Durand a contacté ce contact il y a 3 jours/)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('teamGuardrails:guard.confirm') }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  })

  it('crée directement quand l’espace ne sait rien', async () => {
    vi.mocked(teamGuardrailsApi.checkContacts).mockResolvedValue({ items: [] })
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CONTACT]} />)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('outreach:dialog.create') }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  })
})
