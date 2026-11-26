import type { MyMessageDraftItem, OutreachMessage } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const validate = vi.fn()
const archive = vi.fn()
const approve = vi.fn()
const reject = vi.fn()
const sendMail = vi.fn()
const outreachList = vi.fn()
let drafts: MyMessageDraftItem[] = []

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string; params?: unknown; search?: unknown }) => (
    <a href={to} {...(rest as object)}>
      {children}
    </a>
  ),
}))
vi.mock('@/features/outreach/api', () => ({
  outreachKeys: { messages: () => ['outreach', 'messages'] },
  outreachMessagesApi: {
    list: () => outreachList(),
    approve: (body: unknown) => approve(body),
  },
}))
vi.mock('../../api', () => ({
  useMyMessageDrafts: () => ({ data: { items: drafts, total: drafts.length }, isLoading: false }),
  useScheduledSends: () => ({ data: { items: [] } }),
  useScheduleSendActions: () => ({ schedule: { mutate: vi.fn(), isPending: false, error: null } }),
  useMailboxStatus: () => ({
    data: { address: 'theo@kalixa.example', capabilities: { send: true, draft: true, read: true } },
  }),
  useDraftReviewActions: () => ({
    validate: { mutate: validate, mutateAsync: vi.fn().mockResolvedValue({}), isPending: false },
    archive: { mutate: archive, isPending: false },
  }),
  useDraftVersions: () => ({
    data: {
      items: [
        {
          id: 'v1',
          createdAt: '2026-10-20T17:05:00.000Z',
          editedBody: null,
          usedStyleId: null,
          usedTemplateSource: null,
        },
        {
          id: 'v2',
          createdAt: '2026-10-21T08:40:00.000Z',
          editedBody: 'corrigé',
          usedStyleId: null,
          usedTemplateSource: null,
        },
      ],
    },
  }),
  useCreateDraft: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  useSendMail: () => ({ mutate: sendMail, isPending: false, data: undefined }),
  useRejectSequenceMessage: () => ({ mutate: reject, isPending: false }),
}))

// #4418.1 — le geste « Marquer envoyé » lit/écrit côté contact : ses crochets sont la frontière de ce test.
vi.mock('@/features/contacts/hooks/useDeclareSent', () => ({
  useDeclareSent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
}))
vi.mock('@/features/contacts/hooks/useContactCadence', () => ({ useContactCadence: () => ({ data: undefined }) }))

const { DraftsView } = await import('./DraftsView')

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const list = () => screen.getByRole('list', { name: 'Messages à relire' })
const reader = () => screen.getByTestId('mailbox-reader')
/** Ouvre un brouillon depuis la liste (sa ligne), puis la relecture « Relire & valider ». */
async function openRow(subject: RegExp) {
  await screen.findByRole('list', { name: 'Messages à relire' })
  await user().click(within(list()).getByRole('button', { name: subject }))
}
const SEQ = '00000000-0000-4000-8000-0000000000e1'

function draft(overrides: Partial<MyMessageDraftItem>): MyMessageDraftItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    contactId: '00000000-0000-4000-8000-0000000000c1',
    channel: 'email',
    subject: 'Votre retour sur le profil SAP',
    body: 'Bonjour Paul, avez-vous pu regarder le parcours ?',
    editedSubject: null,
    editedBody: null,
    usedTemplateSource: null,
    usedTemplateVersion: null,
    usedStyleId: null,
    unchanged: false,
    angle: null,
    createdAt: '2026-10-22T08:00:00.000Z',
    validatedAt: null,
    contactName: 'Paul Ferrer',
    contactEmail: 'paul.ferrer@altiver-industries.example',
    accountId: null,
    accountName: 'Altiver Industries',
    versionCount: 2,
    ...overrides,
  }
}

function sequenceMessage(overrides: Partial<OutreachMessage>): OutreachMessage {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    contact_id: '00000000-0000-4000-8000-0000000000c2',
    contact_name: 'Léa Robert',
    contact_role: null,
    account_name: 'Méridien Banque',
    channel: 'email',
    sequence_id: SEQ,
    status: 'needs_review',
    current_version: 3,
    subject: 'Le bon interlocuteur pour le reporting',
    body: 'Bonjour Léa, je cherche à comprendre votre reporting.',
    view: 'blocked',
    blockers: ['opted_out'],
    created_at: '2026-10-20T08:00:00.000Z',
    updated_at: '2026-10-20T08:00:00.000Z',
    ...overrides,
  } as OutreachMessage
}

function renderView(props: { sequenceId?: string } = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DraftsView timeZone="Europe/Paris" {...props} />
    </QueryClientProvider>,
  )
}

describe('DraftsView — Messages à relire (Théo B m2-brouillons)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    for (const fn of [validate, archive, approve, reject, sendMail, outreachList]) fn.mockReset()
    outreachList.mockResolvedValue([])
    drafts = []
  })

  it('#4418.1 — « Marquer envoyé » est atteignable sur un brouillon de séquence, à côté de « Copier le texte »', async () => {
    outreachList.mockResolvedValue([sequenceMessage({ blockers: [], view: 'to_review' })])
    renderView()
    await openRow(/Léa Robert/)
    expect(within(reader()).getByRole('button', { name: 'Marquer envoyé' })).toBeTruthy()
    expect(within(reader()).getByRole('button', { name: 'Copier le texte' })).toBeTruthy()
  })

  it('N1 — liste les brouillons de contact ET les envois de séquence, avec le destinataire et le compte', async () => {
    drafts = [draft({})]
    outreachList.mockResolvedValue([sequenceMessage({})])
    renderView()
    await screen.findByRole('list', { name: 'Messages à relire' })
    expect(await within(list()).findByText('Léa Robert')).toBeTruthy()
    expect(within(list()).getByText('Paul Ferrer')).toBeTruthy()
    expect(within(list()).getByText('Altiver Industries')).toBeTruthy()
    // Théo B m2 — la liste « Messages à relire » et le brouillon ouvert à côté, dans l'espace de travail de la page.
    expect(screen.getByRole('heading', { level: 2, name: 'Messages à relire' })).toBeTruthy()
    expect(within(screen.getByTestId('mailbox-workspace')).getByTestId('mailbox-reader')).toBeTruthy()
    // Les puces d'origine : « Tous » plus chaque origine PRÉSENTE (pas de « Réponses » : aucune réponse).
    const filters = screen.getByRole('group', { name: 'Origine des brouillons' })
    expect(within(filters).getByText('Tous')).toBeTruthy()
    expect(within(filters).getByText('Contacts')).toBeTruthy()
    expect(within(filters).queryByText('Réponses')).toBeNull()
  })

  it('R5 — aucune ligne : « Rien dans cette vue » et l’invitation, jamais une page muette', async () => {
    renderView()
    expect(await screen.findByText('Rien dans cette vue.')).toBeTruthy()
    expect(screen.getByText('Les autres vues restent disponibles.')).toBeTruthy()
    expect(screen.getByText('Ton prochain échange commence ici.')).toBeTruthy()
  })

  it('R3 — « Relire & valider » ouvre la relecture ; « Valider le brouillon » reste grisé tant qu’elle n’est pas confirmée ; valider n’envoie rien', async () => {
    drafts = [draft({})]
    renderView()
    await openRow(/Votre retour sur le profil SAP/)
    await user().click(within(reader()).getByRole('button', { name: 'Relire & valider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Relire avant de valider' })
    expect(within(dialog).getByText('paul.ferrer@altiver-industries.example')).toBeTruthy()
    expect(within(dialog).getByText('theo@kalixa.example')).toBeTruthy()
    const validateButton = within(dialog).getByRole('button', { name: 'Valider le brouillon' })
    expect((validateButton as HTMLButtonElement).disabled).toBe(true)
    await user().click(within(dialog).getByRole('checkbox'))
    expect((validateButton as HTMLButtonElement).disabled).toBe(false)
    await user().click(validateButton)
    expect(validate).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', expect.anything())
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('N2 — « Expéditeur, version & historique » dit l’expéditeur, les versions et ce qui les a produites', async () => {
    drafts = [draft({})]
    renderView()
    await openRow(/Votre retour sur le profil SAP/)
    await user().click(await screen.findByText('Expéditeur, version & historique'))
    expect(screen.getByText('Expéditeur : theo@kalixa.example')).toBeTruthy()
    expect(screen.getByText(/Version 2 · modifiée par toi/)).toBeTruthy()
    expect(screen.getByText(/Version 1 · préparée depuis la fiche contact/)).toBeTruthy()
  })

  it('A1 — un brouillon VALIDÉ garde ses gestes d’envoi : programmer, envoyer sur clic, déposer dans ma boîte', async () => {
    drafts = [draft({ validatedAt: '2026-10-21T18:02:00.000Z' })]
    renderView()
    await openRow(/Votre retour sur le profil SAP/)
    expect(await screen.findByRole('button', { name: 'Programmer l’envoi' })).toBeTruthy()
    // Validé : plus de relecture à faire, les gestes d'envoi prennent sa place.
    expect(within(reader()).queryByRole('button', { name: 'Relire & valider' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Déposer dans ma boîte' })).toBeTruthy()
    await user().click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0][0].items[0]).toMatchObject({ to: 'paul.ferrer@altiver-industries.example' })
  })

  it('A3 — un destinataire refusé est dit AVANT la validation, qui reste impossible', async () => {
    outreachList.mockResolvedValue([sequenceMessage({})])
    renderView()
    await openRow(/Le bon interlocuteur pour le reporting/)
    const alert = await within(reader()).findByRole('alert')
    expect(within(alert).getByText('Ce message ne peut pas partir')).toBeTruthy()
    expect((within(reader()).getByRole('button', { name: 'Relire & valider' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('A2 — un envoi de séquence se valide (version affichée) ou se refuse, depuis la même liste', async () => {
    outreachList.mockResolvedValue([sequenceMessage({ view: 'to_review', blockers: [] })])
    approve.mockResolvedValue({ approved: [], excluded: [] })
    renderView()
    await openRow(/Le bon interlocuteur pour le reporting/)
    await user().click(within(reader()).getByRole('button', { name: 'Relire & valider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Relire avant de valider' })
    await user().click(within(dialog).getByRole('checkbox'))
    await user().click(within(dialog).getByRole('button', { name: 'Valider le brouillon' }))
    expect(approve).toHaveBeenCalledWith({ items: [{ id: '00000000-0000-4000-8000-0000000000a1', version: 3 }] })
    await user().click(within(reader()).getByRole('button', { name: 'Refuser cet envoi' }))
    expect(reject).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000a1', expect.anything())
  })

  it('R6 — « Archiver le brouillon » archive la version (on n’efface rien)', async () => {
    drafts = [draft({})]
    renderView()
    await openRow(/Votre retour sur le profil SAP/)
    await user().click(within(reader()).getByRole('button', { name: 'Archiver le brouillon' }))
    expect(archive).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', expect.anything())
  })

  it('N5 — la vue d’une séquence ne montre que ses messages', async () => {
    outreachList.mockResolvedValue([
      sequenceMessage({}),
      sequenceMessage({
        id: '00000000-0000-4000-8000-0000000000a2',
        sequence_id: '00000000-0000-4000-8000-0000000000e2',
        contact_name: 'Autre Contact',
      }),
    ])
    renderView({ sequenceId: SEQ })
    await screen.findByRole('list', { name: 'Messages à relire' })
    expect(await within(list()).findByText('Léa Robert')).toBeTruthy()
    expect(screen.queryByText('Autre Contact')).toBeNull()
    expect(screen.getByText('Messages de la séquence')).toBeTruthy()
  })

  it('N1 — « Sélectionner » puis « Relire & valider la sélection » : les refusés sont écartés d’office, rien ne part', async () => {
    drafts = [draft({})]
    outreachList.mockResolvedValue([sequenceMessage({})])
    renderView()
    await screen.findByRole('list', { name: 'Messages à relire' })
    await within(list()).findByText('Léa Robert')
    await user().click(screen.getByRole('button', { name: 'Sélectionner' }))
    await user().click(screen.getByRole('checkbox', { name: 'Sélectionner le brouillon pour Paul Ferrer' }))
    await user().click(screen.getByRole('checkbox', { name: 'Sélectionner le brouillon pour Léa Robert' }))
    expect(screen.getByText('2 sélectionnés')).toBeTruthy()
    await user().click(screen.getByRole('button', { name: 'Relire & valider la sélection' }))
    const dialog = await screen.findByRole('dialog', { name: 'Relire et valider 1 brouillon' })
    expect(within(dialog).getByText(/Écartés d’office.*Léa Robert/)).toBeTruthy()
    const go = within(dialog).getByRole('button', { name: 'Valider le brouillon' })
    expect((go as HTMLButtonElement).disabled).toBe(true)
    await user().click(within(dialog).getByRole('checkbox'))
    expect(sendMail).not.toHaveBeenCalled()
    expect(approve).not.toHaveBeenCalled()
  })
})
