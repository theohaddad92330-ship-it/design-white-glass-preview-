import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi, beforeEach } from 'vitest'
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

function renderRow(contact: GlobalContact, initialPath = '/') {
  return renderWithRouter(
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
    </Table>,
    initialPath,
  )
}

beforeEach(() => {
  enrichMutate.mockClear()
  costPreference.skip = true
  members.mockReturnValue({ data: [] })
})

// Théo B c1-repertoire.N5 — « COORDONNÉES : DISPONIBILITÉ + ENRICHIR » (Louis 22/10) : par champ, connu en clair ·
// disponible (la source annonce qu'il existe) · à chercher · introuvable (date). Aucun coût, aucune source nommée.
describe('Théo B c1-repertoire — la cellule Coordonnées dit l’état de chaque champ', () => {
  const bare = { email: null, phone: null, linkedin_url: null, decision_role: null }

  it('connu : l’e-mail reste en clair, aucun bouton de recherche pour lui', async () => {
    renderRow(makeContact({ email: 'alice@corp.co', phone: null }))
    await screen.findByText('Alice Martin')
    expect(screen.getByTitle('alice@corp.co')).toHaveTextContent(/^alice@corp\.co$/)
    expect(screen.queryByRole('button', { name: "Chercher l'e-mail" })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'E-mail disponible' })).not.toBeInTheDocument()
  })

  it('annoncé par la source : « E-mail disponible » / « Tél. disponible », un clic enrichit CE champ seul', async () => {
    renderRow(makeContact({ ...bare, email_availability: 'available', phone_availability: 'available' }))
    await screen.findByText('Alice Martin')
    await userEvent.click(screen.getByRole('button', { name: 'E-mail disponible' }))
    expect(enrichMutate).toHaveBeenCalledTimes(1)
    expect(enrichMutate.mock.calls[0]?.[0]).toMatchObject({ only: 'email' })
    await userEvent.click(screen.getByRole('button', { name: 'Tél. disponible' }))
    expect(enrichMutate.mock.calls[1]?.[0]).toMatchObject({ only: 'phone' })
  })

  // #4503.3 — Vicenzo C. affichait « E-mail absent » ET « E-mail disponible » : UN seul état par coordonnée.
  it('#4503.3 : « E-mail disponible » ne s’affiche JAMAIS avec « E-mail absent » (un seul état par coordonnée)', async () => {
    renderRow(makeContact({ ...bare, email_availability: 'available' }))
    await screen.findByText('Alice Martin')
    expect(screen.getByRole('button', { name: 'E-mail disponible' })).toBeInTheDocument()
    expect(screen.queryByText('E-mail absent')).not.toBeInTheDocument()
  })

  it('#4503.3 sait dire NON : sans annonce de la source, « E-mail absent » reste dit', async () => {
    renderRow(makeContact({ ...bare, email_availability: null }))
    await screen.findByText('Alice Martin')
    expect(screen.getByText('E-mail absent')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'E-mail disponible' })).not.toBeInTheDocument()
  })

  it('jamais cherché : « Chercher l’e-mail » / « Chercher le tél. », même geste ciblé', async () => {
    renderRow(makeContact({ ...bare }))
    await screen.findByText('Alice Martin')
    await userEvent.click(screen.getByRole('button', { name: "Chercher l'e-mail" }))
    expect(enrichMutate.mock.calls[0]?.[0]).toMatchObject({ only: 'email' })
    await userEvent.click(screen.getByRole('button', { name: 'Chercher le tél.' }))
    expect(enrichMutate.mock.calls[1]?.[0]).toMatchObject({ only: 'phone' })
  })

  it('déjà cherché sans résultat : « Introuvable · <date> », pas de bouton', async () => {
    renderRow(
      makeContact({
        ...bare,
        enrichment_coordinates: { email: { state: 'not_found', at: '2026-10-07T10:00:00.000Z', sources_queried: 1 } },
        phone_availability: 'not_found',
      }),
    )
    await screen.findByText('Alice Martin')
    expect(screen.getByText(/^Introuvable · 07\/10\/2026$/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Chercher l'e-mail" })).not.toBeInTheDocument()
  })

  it('aucun nom de source ni crédit dans la cellule', async () => {
    renderRow(makeContact({ ...bare, email_availability: 'available' }))
    await screen.findByText('Alice Martin')
    expect(screen.queryByText(/apollo|crédit/i)).not.toBeInTheDocument()
  })

  it('ni e-mail ni téléphone : « Contacter » du menu de ligne devient « Enrichir » (enrichissement ciblé du contact)', async () => {
    renderRow(makeContact({ ...bare }))
    await screen.findByText('Alice Martin')
    await userEvent.click(screen.getByRole('button', { name: /actions/i }))
    expect(screen.queryByRole('menuitem', { name: /Contacter/ })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Enrichir' }))
    expect(enrichMutate).toHaveBeenCalledTimes(1)
  })

  it('un e-mail connu garde « Contacter » (jamais « Enrichir » à la place)', async () => {
    renderRow(makeContact({ email: 'alice@corp.co' }))
    await screen.findByText('Alice Martin')
    await userEvent.click(screen.getByRole('button', { name: /actions/i }))
    expect(screen.queryByRole('menuitem', { name: 'Enrichir' })).not.toBeInTheDocument()
  })
})
