import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Contact, ProjectContact } from '@bellum/contracts'

// #2171.42 — `Link` a besoin d'un routeur monté ; ce test de panneau isolé
// n'en fournit pas, même mock que `ProjectDetailSheet.test.tsx`.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={to.replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? '')}>{children}</a>
  ),
}))

let contacts: ProjectContact[] = []
let isLoading = false
let isError = false
const linkMutate = vi.fn()

vi.mock('../hooks/useProjectContacts', () => ({
  useProjectContacts: () => ({ data: contacts, isLoading, isError }),
  useLinkProjectContact: () => ({ mutate: linkMutate, isPending: false }),
}))

let accountContacts: Contact[] = []
vi.mock('@/features/contacts/hooks/useContactsByAccount', () => ({
  useContactsByAccount: () => ({ data: accountContacts, isLoading: false }),
}))

// #2171.34 — même porte que `CompactContactRow` (`ContactRowActions`, compte) :
// « préparer un message » ouvre le panneau d'engagement, jamais un second
// rédacteur de message.
const openEngagement = vi.fn()
vi.mock('../../accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement }),
  useOptionalContactEngagement: () => ({ openEngagement }),
}))

const { ProjectContactsPanel } = await import('./ProjectContactsPanel')

function accountContact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'c-1',
    full_name: 'Dana Leroy',
    email: null,
    email_message: null,
    email_sent_at: null,
    ...over,
  } as Contact
}

function contact(over: Partial<ProjectContact> = {}): ProjectContact {
  return {
    contact_id: '11111111-1111-4111-8111-111111111111',
    full_name: 'Camille Petit',
    title: 'DSI',
    email: 'camille@client.example',
    role: 'sponsor',
    created_at: '2026-08-20T00:00:00.000Z',
    ...over,
  }
}

/**
 * #2171.5 (lot W20, registre 16/09) — LA FICHE OPPORTUNITÉ RELIE LES CONTACTS.
 *
 * `GET /projects/:id/contacts` existait déjà côté API (rôle compris :
 * sponsor/décideur/prescripteur/acheteur/utilisateur/bloqueur, entité
 * `ProjectContactEntity`, service `ProjectPipelineService.listContacts`) et
 * AUCUN écran ne l'appelait — le défaut n°1 du dépôt, vu depuis le web.
 */
describe('ProjectContactsPanel — la fiche opportunité relie les contacts', () => {
  beforeEach(() => {
    cleanup()
    contacts = []
    isLoading = false
    isError = false
    accountContacts = []
    linkMutate.mockReset()
    openEngagement.mockReset()
  })

  it('liste un contact rattaché avec son rôle SUR CE PROJET', () => {
    contacts = [contact()]
    render(
      <ProjectContactsPanel
        projectId="22222222-2222-4222-8222-222222222222"
        accountId="33333333-3333-4333-8333-333333333333"
      />,
    )
    expect(screen.getByText('Camille Petit')).toBeInTheDocument()
    expect(screen.getByText('Sponsor')).toBeInTheDocument()
  })

  it("n'affiche AUCUNE ligne quand la fiche ne porte aucun contact — une liste vide n'invente personne", () => {
    contacts = []
    render(
      <ProjectContactsPanel
        projectId="22222222-2222-4222-8222-222222222222"
        accountId="33333333-3333-4333-8333-333333333333"
      />,
    )
    expect(screen.getByText('Aucun contact rattaché à cette opportunité pour l’instant.')).toBeInTheDocument()
    expect(screen.queryByText('Camille Petit')).not.toBeInTheDocument()
  })

  it('un échec de lecture ne se lit jamais « aucun contact »', () => {
    isError = true
    render(
      <ProjectContactsPanel
        projectId="22222222-2222-4222-8222-222222222222"
        accountId="33333333-3333-4333-8333-333333333333"
      />,
    )
    expect(screen.getByText('Les contacts n’ont pas pu être chargés.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun contact rattaché à cette opportunité pour l’instant.')).not.toBeInTheDocument()
  })

  /**
   * #2171.42 — TOUS LES OBJETS LIÉS SONT CLIQUABLES. Vrai pour le compte, les
   * besoins, les positionnements ; faux pour les contacts avant ce point.
   */
  it('chaque contact mène à sa fiche (#2171.42)', () => {
    contacts = [contact({ contact_id: '44444444-4444-4444-8444-444444444444' })]
    render(
      <ProjectContactsPanel
        projectId="22222222-2222-4222-8222-222222222222"
        accountId="33333333-3333-4333-8333-333333333333"
      />,
    )
    const link = screen.getByText('Camille Petit').closest('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/contacts/44444444-4444-4444-8444-444444444444')
  })
})

/**
 * #2171.31 — AJOUTER UN CONTACT.
 *
 * `PUT /projects/:id/contacts/:contactId` (rôle inclus) et `GET
 * /contacts/account/:accountId` existaient déjà tous les deux — ce test est
 * le premier à les relier depuis un écran.
 */
describe('ProjectContactsPanel — ajouter un contact (#2171.31)', () => {
  beforeEach(() => {
    cleanup()
    contacts = []
    isLoading = false
    isError = false
    accountContacts = []
    linkMutate.mockReset()
    openEngagement.mockReset()
  })

  it('propose les contacts du compte qui ne sont PAS déjà rattachés', async () => {
    accountContacts = [
      accountContact({ id: 'c-1', full_name: 'Dana Leroy' }),
      accountContact({ id: 'c-2', full_name: 'Camille Petit' }),
    ]
    contacts = [contact({ contact_id: 'c-2', full_name: 'Camille Petit' })]
    render(
      <ProjectContactsPanel
        projectId="22222222-2222-4222-8222-222222222222"
        accountId="33333333-3333-4333-8333-333333333333"
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Choisis un contact du compte' }))

    expect(screen.getByRole('option', { name: 'Dana Leroy' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Camille Petit' })).not.toBeInTheDocument()
  })

  it('rattache le contact choisi avec le rôle choisi', async () => {
    accountContacts = [accountContact({ id: 'c-1', full_name: 'Dana Leroy' })]
    render(
      <ProjectContactsPanel
        projectId="22222222-2222-4222-8222-222222222222"
        accountId="33333333-3333-4333-8333-333333333333"
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Choisis un contact du compte' }))
    await userEvent.click(screen.getByRole('option', { name: 'Dana Leroy' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Son rôle sur cette affaire' }))
    await userEvent.click(screen.getByRole('option', { name: 'Décideur' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rattacher' }))

    expect(linkMutate).toHaveBeenCalledWith({ contactId: 'c-1', role: 'decideur' }, expect.anything())
  })

  it('un compte sans contact disponible le dit, sans formulaire inerte', async () => {
    accountContacts = []
    render(
      <ProjectContactsPanel
        projectId="22222222-2222-4222-8222-222222222222"
        accountId="33333333-3333-4333-8333-333333333333"
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }))

    expect(
      screen.getByText('Tous les contacts du compte sont déjà rattachés, ou le compte n’en porte aucun.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rattacher' })).not.toBeInTheDocument()
  })
})

/**
 * #2171.34 — PRÉPARER UN MESSAGE, depuis le contact de l'opportunité. Même
 * porte et même garde que `ContactRowActions` côté compte
 * (`CompactContactRow.tsx`) : un brouillon EXISTE déjà (déjà envoyé, ou un
 * corps déjà rédigé) — jamais un formulaire qui inventerait un message vide.
 */
describe('ProjectContactsPanel — préparer un message (#2171.34)', () => {
  beforeEach(() => {
    cleanup()
    contacts = []
    isLoading = false
    isError = false
    accountContacts = []
    linkMutate.mockReset()
    openEngagement.mockReset()
  })

  it('ouvre le panneau d’engagement quand un brouillon existe déjà', async () => {
    contacts = [contact({ contact_id: 'c-1' })]
    accountContacts = [
      accountContact({
        id: 'c-1',
        full_name: 'Camille Petit',
        email: 'camille@client.example',
        email_message: { subject: 'Suite à notre échange', body: 'Bonjour' },
      }),
    ]
    render(
      <ProjectContactsPanel
        projectId="22222222-2222-4222-8222-222222222222"
        accountId="33333333-3333-4333-8333-333333333333"
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Préparer un message' }))
    expect(openEngagement).toHaveBeenCalledWith([expect.objectContaining({ id: 'c-1' })], 'email')
  })

  it('reste désactivé sans brouillon et sans envoi déjà fait — aucun message inventé', () => {
    contacts = [contact({ contact_id: 'c-1' })]
    accountContacts = [
      accountContact({ id: 'c-1', full_name: 'Camille Petit', email: 'camille@client.example', email_message: null }),
    ]
    render(
      <ProjectContactsPanel
        projectId="22222222-2222-4222-8222-222222222222"
        accountId="33333333-3333-4333-8333-333333333333"
      />,
    )

    expect(screen.getByRole('button', { name: 'Préparer un message' })).toBeDisabled()
  })
})
