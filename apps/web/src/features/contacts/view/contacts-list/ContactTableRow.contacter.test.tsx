import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ContactEngagementContext,
  type ContactEngagementContextValue,
} from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import { Table, TableBody } from '@bellum/ui'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactTableRow } from './ContactTableRow'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'

// #2158.76 — capturé (pas jeté) : la ligne du tableau doit ouvrir la fiche au
// clavier (Entrée), pas seulement à la souris. Une factory fraîche à chaque
// rendu empêcherait toute assertion sur l'appel.
const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigateMock,
}))

// #2160.9 — « Attribuer » depuis le menu ⋯ de la ligne : mêmes doubles que
// `AccountCollaborationBand.test.tsx` (grammaire de compte) — la liste des
// membres et le hook d'écriture ne doivent payer aucun appel réseau réel.
const { members, assignMutate, demo, enrichMutate, toastSuccess, toastError } = vi.hoisted(() => ({
  members: vi.fn(),
  assignMutate: vi.fn(),
  demo: { isDemo: false },
  enrichMutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => members() }))
vi.mock('@/features/contacts/hooks/useAssignContacts', () => ({
  useAssignContacts: () => ({ mutate: assignMutate, isPending: false }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.isDemo }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutate: enrichMutate, isPending: false, variables: undefined }),
}))
// #4016.L8b — « ne plus me demander » le coût : absente par défaut (la question se pose).
const costPreference = vi.hoisted(() => ({ skip: false, setSkip: vi.fn() }))
vi.mock('@/features/contacts/hooks/useEnrichmentCostPreference', () => ({
  useEnrichmentCostPreference: () => ({ skip: costPreference.skip, setSkip: costPreference.setSkip }),
}))
// #3713.2 — copier l'e-mail depuis la liste : un presse-papiers refusé se DIT
// (toast), jamais une copie silencieuse qui n'a pas eu lieu.
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}))

beforeAll(() => {
  window.scrollTo = vi.fn()
  // Les menus Radix (dont le sous-menu « Attribuer ») ont besoin de ces API de
  // pointeur, que jsdom n'implémente pas.
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

function makeContact(overrides: Partial<GlobalContact> = {}): GlobalContact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Alice Martin',
    title: 'DSI',
    entity: null,
    decision_role: null,
    priority: 5,
    email: 'alice@corp.co',
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: 'apollo',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    company_name: 'Corp',
    ...overrides,
  }
}

describe('SIMON-FIX S.22 — le menu de ligne offre « Contacter » (mêmes canaux que la fiche)', () => {
  const noCoordinates = { email: null, phone: null, linkedin_url: null }
  const openEngagement = vi.fn()
  beforeEach(() => {
    members.mockReturnValue({ data: [] })
    openEngagement.mockClear()
  })
  const renderRow = (contact: GlobalContact) =>
    renderWithRouter(
      <ContactEngagementContext.Provider value={{ openEngagement } as unknown as ContactEngagementContextValue}>
        <Table>
          <TableBody>
            <ContactTableRow
              contact={contact}
              isSelected={false}
              onRowMouseDown={() => {}}
              onRowMouseEnter={() => {}}
              onSelectionChange={() => {}}
            />
          </TableBody>
        </Table>
      </ContactEngagementContext.Provider>,
    )

  // Théo B c1-repertoire.N5 (Louis 22/10) — ni e-mail ni téléphone : « Contacter » devient « Enrichir ».
  // La note LinkedIn et la préparation d'appel restent sur la fiche du contact.
  it('un contact sans e-mail ni téléphone propose « Enrichir » à la place de « Contacter »', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderRow(makeContact(noCoordinates))
    await screen.findByText('Alice Martin')
    await user.click(screen.getByRole('button', { name: /Actions/i }))
    expect(await screen.findByRole('menuitem', { name: 'Enrichir' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Contacter/ })).not.toBeInTheDocument()
  })

  it('un contact joignable par e-mail propose l’e-mail dans le même sous-menu', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderRow(makeContact({ email: 'alice@corp.co' }))
    await screen.findByText('Alice Martin')
    await user.click(screen.getByRole('button', { name: /Actions/i }))
    await user.click(await screen.findByRole('menuitem', { name: /Contacter/ }))
    // « Contacter par e-mail » (déjà dans le menu) + l’e-mail du sous-menu.
    expect((await screen.findAllByRole('menuitem', { name: /e-?mail/i })).length).toBeGreaterThanOrEqual(2)
  })

  it('choisir un canal ouvre la préparation du message sur CE contact', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderRow(makeContact({ email: 'alice@corp.co' }))
    await screen.findByText('Alice Martin')
    await user.click(screen.getByRole('button', { name: /Actions/i }))
    await user.click(await screen.findByRole('menuitem', { name: /Contacter/ }))
    const item = await screen.findByRole('menuitem', { name: /note de connexion|invitation/i })
    fireEvent.click(item)
    await waitFor(() =>
      expect(openEngagement).toHaveBeenCalledWith([expect.objectContaining({ id: 'c1' })], 'linkedin_connection_note'),
    )
  })
})
