import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Contact, PendingChatAction } from '@bellum/contracts'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { PendingActions } from './PendingActions'
import { ApiError } from '@/lib/api-error'
import { useAnalysisStore } from '@/stores/analysisStore'

/**
 * La garantie centrale du copilote « qui agit » : il PROPOSE, l'utilisateur
 * exécute. Ces tests verrouillent le fait qu'aucun appel réseau ne part avant le
 * clic, et que le message préparé reste chez nous (Bellum n'envoie jamais).
 */

const apiFetch = vi.fn()
const dispatch = vi.fn()
const enrich = vi.fn()
const createFromCrm = vi.fn()
const getOneContact = vi.fn()
const markContactDeparted = vi.fn()
const exportHubspot = vi.fn()
const exportSalesforce = vi.fn()
const navigate = vi.fn()
const updateRoutine = vi.fn()
const updateNotificationPreferences = vi.fn()
const setStageSla = vi.fn()
const pinMemoryFact = vi.fn()
const proposeAmendment = vi.fn()
const updateProjectStage = vi.fn()
const updateProjectAmount = vi.fn()
const updateProjectBtmmp = vi.fn()
const updateProjectRisks = vi.fn()
vi.mock('@/features/projects/api', () => ({
  projectsApi: {
    updateStage: (...args: unknown[]) => updateProjectStage(...args),
    updateAmount: (...args: unknown[]) => updateProjectAmount(...args),
    updateBtmmp: (...args: unknown[]) => updateProjectBtmmp(...args),
    updateRisks: (...args: unknown[]) => updateProjectRisks(...args),
  },
}))

vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('@/features/actions/api', () => ({ actionsApi: { dispatch: (...args: unknown[]) => dispatch(...args) } }))
vi.mock('@/features/contacts/api', () => ({
  contactsApi: {
    enrich: (...args: unknown[]) => enrich(...args),
    createFromCrm: (...args: unknown[]) => createFromCrm(...args),
    getOne: (...args: unknown[]) => getOneContact(...args),
    markDeparted: (...args: unknown[]) => markContactDeparted(...args),
  },
}))
const addAccountToPortfolio = vi.fn()
const discoverFreshContacts = vi.fn()
vi.mock('@/features/accounts/api', () => ({
  accountsApi: {
    addToPortfolio: (...args: unknown[]) => addAccountToPortfolio(...args),
    discoverFreshContacts: (...args: unknown[]) => discoverFreshContacts(...args),
  },
  accountKeys: { all: ['accounts'] },
}))
const validateExpenseReport = vi.fn()
const rejectExpenseReport = vi.fn()
vi.mock('@/features/expenses/api', () => ({
  expensesApi: {
    validate: (...args: unknown[]) => validateExpenseReport(...args),
    reject: (...args: unknown[]) => rejectExpenseReport(...args),
  },
}))
const createTargetList = vi.fn()
const addTargetListItem = vi.fn()
vi.mock('@/features/target-lists/api', () => ({
  targetListsApi: {
    create: (...args: unknown[]) => createTargetList(...args),
    addItem: (...args: unknown[]) => addTargetListItem(...args),
  },
}))
vi.mock('@/features/crm/api', () => ({ crmApi: { exportContact: (...args: unknown[]) => exportHubspot(...args) } }))
vi.mock('@/features/salesforce/api', () => ({
  salesforceApi: { exportContact: (...args: unknown[]) => exportSalesforce(...args) },
}))
vi.mock('@/features/pipedrive/api', () => ({ pipedriveApi: { exportContact: vi.fn() } }))
vi.mock('@/features/attio/api', () => ({ attioApi: { exportContact: vi.fn() } }))
vi.mock('@/features/routines/api', () => ({ routinesApi: { update: (...args: unknown[]) => updateRoutine(...args) } }))
vi.mock('@/features/notifications/api', () => ({
  notificationsApi: { updatePreferences: (...args: unknown[]) => updateNotificationPreferences(...args) },
}))
vi.mock('@/features/settings/lib/stage-sla-api', () => ({
  stageSlaApi: { set: (...args: unknown[]) => setStageSla(...args) },
}))
// #2783 — `useMissionTerms` porte `canReadFinance` et le moteur de marge
// (devise incluse) que le bloc de simulation d'impact lit avant de s'afficher
// (voir `PendingActions.tsx`). `useMissionTermsMock` par défaut : `isPending`,
// aucun droit finance — le comportement d'avant ce lot pour toutes les cartes
// qui ne le redéfinissent pas. `useMissionMarginScenario` est mocké ici aussi :
// `MissionMarginEngine.tsx` (le simulateur RÉUTILISÉ, #2420.14) l'importe du
// MÊME module (`../api` s'y résout vers `@/features/missions/api`).
const useMissionTermsMock = vi.hoisted(() =>
  vi.fn(
    (): {
      data: { canReadFinance: boolean; marginEngine: { currency: string } | null } | undefined
      isPending: boolean
    } => ({ data: undefined, isPending: true }),
  ),
)
const simulateAmendmentImpact = vi.hoisted(() => vi.fn())
vi.mock('@/features/missions/api', () => ({
  missionsApi: { proposeAmendment: (...args: unknown[]) => proposeAmendment(...args) },
  useMissionTerms: () => useMissionTermsMock(),
  useMissionMarginScenario: () => ({
    mutate: simulateAmendmentImpact,
    data: undefined,
    isPending: false,
    reset: vi.fn(),
  }),
}))
const invalidateQueries = vi.fn()
vi.mock('@/features/memory/api', () => ({
  memoryApi: { pinFact: (...args: unknown[]) => pinMemoryFact(...args) },
  memoryKeys: { all: ['memory'] },
}))
vi.mock('@/lib/query-client', () => ({
  queryClient: { invalidateQueries: (...args: unknown[]) => invalidateQueries(...args) },
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
// #1940.7 — même patron que `ActionPlanBoard.test.tsx` / `ParticipantsPanel.test.tsx`
// pour ce même hook : par défaut aucun membre, donc le sélecteur « assigner à »
// reste absent et le comportement des tests déjà écrits ne change pas.
const useWorkspaceMembersMock = vi.hoisted(() =>
  vi.fn((): { data: WorkspaceMember[]; isLoading: boolean; isError: boolean } => ({
    data: [],
    isLoading: false,
    isError: false,
  })),
)
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => useWorkspaceMembersMock(),
}))

const MESSAGE_ACTION: PendingChatAction = {
  action: 'prepare_message',
  contact_id: '11111111-1111-4111-8111-111111111111',
  contact_name: 'Claire Dubois',
  channel: 'email',
  angle: 'migration cloud',
  cost_credits: 0,
  sends_email: false,
}

const REMINDER_ACTION: PendingChatAction = {
  action: 'schedule_reminder',
  contact_id: '11111111-1111-4111-8111-111111111111',
  contact_name: 'Claire Dubois',
  at: '2026-09-01T07:00:00Z',
  note: 'Relancer après le POC',
  cost_credits: 0,
}

const CRM_NOTE_ACTION: PendingChatAction = {
  action: 'propose_crm_note',
  contact_id: '11111111-1111-4111-8111-111111111111',
  contact_name: 'Claire Dubois',
  note: 'Relancer sur le devis, silence depuis 8 jours.',
  thread_id: 'thread-42',
  cost_credits: 0,
}

const CONTACT_DEPARTURE_ACTION: PendingChatAction = {
  action: 'propose_contact_departure',
  contact_id: '11111111-1111-4111-8111-111111111111',
  contact_name: 'Pierre Eynatte',
  account_id: '22222222-2222-4222-8222-222222222222',
  cost_credits: 0,
}

const ENRICH_ACTION: PendingChatAction = {
  action: 'enrich_contact',
  contact_id: '11111111-1111-4111-8111-111111111111',
  contact_name: 'Claire Dubois',
  contact_title: 'DSI',
  organization_name: 'ACME SA',
  cost_credits: 1,
  credit_kind: 'enrichment',
}

const CRM_ACTION: PendingChatAction = {
  action: 'export_contact_to_crm',
  contact_id: '11111111-1111-4111-8111-111111111111',
  provider: 'salesforce',
  contact_name: 'Claire Dubois',
  contact_email: 'claire@example.com',
  contact_title: 'DSI',
  company: 'ACME SA',
  cost_credits: 0,
}

const MAIL_DRAFT_ACTION: PendingChatAction = {
  action: 'prepare_mail_draft',
  to: 'claire@example.com',
  subject: 'Suite du POC',
  body: 'Bonjour Claire, voici la suite.',
}

/**
 * #2104.25 / #2104.26 — l'APERÇU du brouillon de messagerie affichait
 * destinataire, objet et corps, mais rien sur le CONTEXTE utilisé (répond à un
 * fil, ou nouveau message) ni sur le TON. Aucune donnée inventée : le contexte
 * vient du `thread_id` déjà porté par l'action, le ton n'apparaît QUE si le
 * modèle l'a déclaré (même règle que `prepare_campaign.tone`) — absent, pas de
 * ligne plutôt qu'une valeur devinée.
 */
describe('#2104.25 — aperçu : contexte utilisé', () => {
  it('dit que le brouillon répond à un fil existant quand thread_id est porté', async () => {
    render(<PendingActions actions={[{ ...MAIL_DRAFT_ACTION, thread_id: 't-42' }]} />)
    expect(await screen.findByText('Répond au fil existant')).toBeInTheDocument()
  })

  it('dit que c’est un nouveau message sans thread_id', async () => {
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} />)
    expect(await screen.findByText('Nouveau message')).toBeInTheDocument()
  })
})

describe('#2104.26 — aperçu : ton', () => {
  it('affiche le ton QUAND le modèle l’a déclaré', async () => {
    render(<PendingActions actions={[{ ...MAIL_DRAFT_ACTION, tone: 'direct' }]} />)
    expect(await screen.findByText('direct')).toBeInTheDocument()
  })

  it('aucune ligne « Ton » quand rien n’a été déclaré — jamais une valeur devinée', async () => {
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} />)
    await screen.findByText('Objet')
    expect(screen.queryByText('Ton')).not.toBeInTheDocument()
  })
})

/**
 * #3894.3 (lot RAE2, c74 assoupli le 10/10/2026) — plusieurs destinataires NOMMÉS
 * par la personne : UN brouillon par destinataire, chacun validable à part. Le
 * message ne part jamais ; une audience devinée n'existe pas (le schéma la refuse).
 */
describe('#3894.3 — message à plusieurs contacts nommés', () => {
  const AUDIENCE_ACTION: PendingChatAction = {
    action: 'prepare_message_audience',
    explicit_multi_contact: true,
    channel: 'email',
    angle: 'migration cloud',
    recipients: [
      { contact_id: '11111111-1111-4111-8111-111111111111', contact_name: 'Marie Durand' },
      { contact_id: '22222222-2222-4222-8222-222222222222', contact_name: 'Paul Martin' },
    ],
    skipped: [{ contact_name: 'Claire Dubois', reason: 'Désabonnement' }],
    cost_credits: 0,
    sends_email: false,
  }

  it('rend UNE carte par destinataire nommé, sans rien exécuter au rendu', async () => {
    render(<PendingActions actions={[AUDIENCE_ACTION]} />)
    expect(await screen.findByText(/Préparer un email pour Marie Durand/)).toBeInTheDocument()
    expect(screen.getByText(/Préparer un email pour Paul Martin/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Préparer le message/ })).toHaveLength(2)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('dit que ce sont des destinataires nommés par la personne, et NOMME celui qui est écarté', async () => {
    render(<PendingActions actions={[AUDIENCE_ACTION]} />)
    expect(await screen.findByText(/2 destinataires que tu as nommés/)).toBeInTheDocument()
    expect(screen.getByText(/Écarté : Claire Dubois — Désabonnement/)).toBeInTheDocument()
  })

  it('chaque destinataire se valide séparément — un clic ne prépare QUE son brouillon', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Votre migration', body: 'Bonjour Marie,' } })
    render(<PendingActions actions={[AUDIENCE_ACTION]} />)
    fireEvent.click((await screen.findAllByRole('button', { name: /Préparer le message/ }))[0] as HTMLElement)
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch.mock.calls[0][0]).toMatchObject({
      path: '/ia/message',
      body: { contactId: '11111111-1111-4111-8111-111111111111', channel: 'email', context: 'migration cloud' },
    })
  })

  it('en salle de démonstration, un destinataire semé ne génère rien et le dit', async () => {
    render(
      <PendingActions
        actions={[
          {
            ...AUDIENCE_ACTION,
            recipients: [
              { contact_id: 'demo-contact-trevisani', contact_name: 'Laurent Trévisani' },
              { contact_id: 'demo-contact-castex', contact_name: 'Jean Castex' },
            ],
          },
        ]}
      />,
    )
    fireEvent.click((await screen.findAllByRole('button', { name: /Préparer le message/ }))[0] as HTMLElement)
    expect(await screen.findByText(/salle de démonstration/i)).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('n’attrape pas ce qu’elle ne vise pas — un seul contact reste une carte ordinaire, sans bandeau', async () => {
    render(<PendingActions actions={[MESSAGE_ACTION]} />)
    expect(await screen.findByText(/Préparer un email pour Claire Dubois/)).toBeInTheDocument()
    expect(screen.queryByText(/destinataires que tu as nommés/)).not.toBeInTheDocument()
  })
})

/**
 * #2104.30 — aucun bouton presse-papier n'existait sur la carte de PROPOSITION
 * du brouillon de messagerie (avant le clic « Créer ») : `DraftPanel`
 * (`prepare_message`, phase `draft`) et `DraftDialog` (réponse/relance,
 * #2104.30 côté messagerie) en ont un depuis longtemps, cette carte-ci en
 * était dépourvue. Copier ne dépose rien : geste 100% local, disponible AVANT
 * la confirmation qui écrit vraiment le brouillon.
 */
describe('#2104.30 — action Copier', () => {
  it('copie objet et corps du brouillon proposé dans le presse-papier', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copier' }))
    expect(writeText).toHaveBeenCalledWith('Suite du POC\n\nBonjour Claire, voici la suite.')
  })

  it('n’apparaît pas sur une action qui n’est pas un brouillon de messagerie', () => {
    render(<PendingActions actions={[MESSAGE_ACTION]} />)
    expect(screen.queryByRole('button', { name: 'Copier' })).not.toBeInTheDocument()
  })
})

/**
 * #2277.34 (épopée #2771) — le rollback de `prepare_mail_draft` : `delete_draft`
 * était livré et testé côté routeur sans aucun appelant web. `create_mail_draft`
 * ne journalise rien (aucune trace persistée d'un brouillon créé) — cette carte,
 * tant qu'elle reste montée après le dépôt, est le SEUL endroit qui connaît
 * encore l'id réel du brouillon.
 */
describe('#2277.34 — supprimer le brouillon déposé', () => {
  it('dépose le brouillon puis le supprime via l’Action Router, ciblé sur l’id RÉEL', async () => {
    apiFetch.mockResolvedValue({
      provider: 'gmail',
      draftId: 'draft-42',
      messageId: 'msg-42',
      threadId: 'thread-42',
      webUrl: null,
    })
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Déposer le brouillon' }))
    await screen.findByText(/Brouillon déposé/)

    dispatch.mockResolvedValue({ type: 'delete_draft', status: 'done', reason: 'Le brouillon a été supprimé.' })
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le brouillon' }))

    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    expect(dispatch.mock.calls[0][0]).toEqual({
      type: 'delete_draft',
      targetId: 'draft-42',
      idempotencyKey: expect.stringMatching(/^chat-card\.delete_draft:.+/),
    })
    expect(await screen.findByText('Le brouillon a été supprimé.')).toBeInTheDocument()
  })

  it('un échec se DIT, jamais un succès muet', async () => {
    apiFetch.mockResolvedValue({
      provider: 'gmail',
      draftId: 'draft-43',
      messageId: 'msg-43',
      threadId: 'thread-43',
      webUrl: null,
    })
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Déposer le brouillon' }))
    await screen.findByText(/Brouillon déposé/)

    dispatch.mockResolvedValue({
      type: 'delete_draft',
      status: 'skipped',
      reason: "Ce brouillon n'existe plus — rien à supprimer.",
    })
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le brouillon' }))

    expect(await screen.findByText("Ce brouillon n'existe plus — rien à supprimer.")).toBeInTheDocument()
  })
})

/**
 * #2955 (#2394.57, décision Louis 28/09) — le fil de CETTE conversation part
 * avec le dépôt du brouillon UNIQUEMENT quand la carte répond à un fil
 * (`thread_id`) : c'est ce qui permet au serveur de relire les participants
 * déjà connus de ce fil (état de conversation persisté) sans une nouvelle
 * lecture de la messagerie.
 */
describe('#2955 (#2394.57) — le fil de la conversation accompagne le dépôt', () => {
  const draftResult = { provider: 'gmail', draftId: 'd1', messageId: 'm1', threadId: 't-42', webUrl: null }

  it('porte `conversationId` quand la carte répond à un fil ET que la conversation est connue', async () => {
    apiFetch.mockResolvedValue(draftResult)
    render(<PendingActions actions={[{ ...MAIL_DRAFT_ACTION, thread_id: 't-42' }]} conversationId="conv-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Déposer le brouillon' }))
    await screen.findByText(/Brouillon déposé/)
    expect(apiFetch.mock.calls[0]?.[0]).toMatchObject({
      path: '/mailbox/drafts',
      body: expect.objectContaining({ threadId: 't-42', conversationId: 'conv-1' }),
    })
  })

  it('ne porte AUCUN `conversationId` sur un nouveau message (pas de fil)', async () => {
    apiFetch.mockResolvedValue({ ...draftResult, threadId: null })
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} conversationId="conv-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Déposer le brouillon' }))
    const body = apiFetch.mock.calls[0]?.[0]?.body as Record<string, unknown>
    expect(body).not.toHaveProperty('conversationId')
  })

  it('ne porte AUCUN `conversationId` quand la conversation n’est pas connue (comportement inchangé)', async () => {
    apiFetch.mockResolvedValue(draftResult)
    render(<PendingActions actions={[{ ...MAIL_DRAFT_ACTION, thread_id: 't-42' }]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Déposer le brouillon' }))
    const body = apiFetch.mock.calls[0]?.[0]?.body as Record<string, unknown>
    expect(body).not.toHaveProperty('conversationId')
  })
})

/**
 * #2394.62 — « déposé dans ta messagerie » exige un message_id ET un thread_id
 * RÉELS, pas seulement un `draftId`. Sans preuve, la carte ne dit JAMAIS
 * « Brouillon déposé » : c'est le NO-GO littéral de #2394 (annoncer un
 * brouillon messagerie sans preuve réelle).
 */
describe('#2394.62 — aucune preuve, jamais « déposé »', () => {
  it('un draftId seul, sans message_id ni thread_id, ne dit JAMAIS « déposé »', async () => {
    apiFetch.mockResolvedValue({
      provider: 'gmail',
      draftId: 'draft-44',
      messageId: null,
      threadId: null,
      webUrl: null,
    })
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Déposer le brouillon' }))

    expect(await screen.findByText(/n'a pas confirmé son dépôt/)).toBeInTheDocument()
    expect(screen.queryByText(/Brouillon déposé/)).not.toBeInTheDocument()
  })
})

/**
 * #1912.11 — décision Louis 13/09/2026, batch 11 (« brouillon Gmail » #1930 /
 * #1931 / #1942) : le brouillon dit dans QUEL outil il atterrit quand l'espace
 * a branché une seule messagerie. Le nom vient des connexions (avant le clic)
 * puis du RÉSULTAT réel (après) — jamais d'un littéral.
 */
/**
 * #2322 — LE BESOIN COMPILÉ SE LIT SUR LA CARTE.
 *
 * C'est tout l'enjeu : le compilateur peut être juste, testé et branché — si sa
 * sortie n'arrive à aucun écran, elle n'existe pas. Ces trois tests tiennent ce
 * que la carte DIT : le travail réel (pas l'intitulé), ce qui manque pour
 * comprendre, ce qui a été écarté, et qu'elle n'écrit rien.
 */
const COMPILED_NEED_ACTION: PendingChatAction = {
  action: 'compile_need',
  cost_credits: 0,
  compiled: {
    status: 'proposition',
    source: { kind: 'email', locator: 'fil « besoin EDI »', stated_at: '2026-09-12' },
    account_id: null,
    company_hint: 'Decathlon',
    fields: [
      {
        field: 'title',
        value: 'Data engineer EDI',
        provenance: {
          source_kind: 'email',
          excerpt: 'on cherche un data engineer',
          locator: null,
          stated_at: '2026-09-12',
          confidence: 'explicite',
        },
      },
      {
        field: 'work_to_do',
        value: 'reprendre les flux EDI fournisseurs',
        provenance: {
          source_kind: 'email',
          excerpt: 'il faut reprendre les flux EDI fournisseurs',
          locator: null,
          stated_at: '2026-09-12',
          confidence: 'explicite',
        },
      },
    ],
    proposed_contacts: [],
    unknowns: [],
    contradictions: [],
    not_understood: ['expected_outcome', 'skills'],
    confirmation_level: 'rapporte',
    clarification: null,
  },
  dropped: [{ field: 'seniority', reason: 'sans_extrait' }],
}

describe('#2322 — la carte d’un besoin compilé', () => {
  it('montre le travail réel, ce qui manque et ce qui a été écarté — sans rien appeler', async () => {
    render(<PendingActions actions={[COMPILED_NEED_ACTION]} />)
    expect(await screen.findByText('Besoin compilé — Data engineer EDI, chez Decathlon')).toBeInTheDocument()
    expect(screen.getByText('reprendre les flux EDI fournisseurs')).toBeInTheDocument()
    // Ce qui n’a pas pu être compris est NOMMÉ, jamais compté ni tu.
    expect(screen.getByText('le résultat attendu, les critères bloquants')).toBeInTheDocument()
    expect(screen.getByText('1 valeur sans citation ou hors champ')).toBeInTheDocument()
    expect(screen.getByText('rapporté')).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('annonce une OUVERTURE d’écran, jamais une création', async () => {
    render(<PendingActions actions={[COMPILED_NEED_ACTION]} />)
    expect(await screen.findByRole('button', { name: 'Ouvrir le créateur de besoin' })).toBeInTheDocument()
    expect(screen.getByText(/Rien n'est enregistré avant ton clic/)).toBeInTheDocument()
    // La ligne « ce que ça écrit » dit : rien.
    expect(screen.getByText('rien — ouverture d’écran')).toBeInTheDocument()
  })

  /**
   * #2942, #2152.17 — RÉFUTÉ le 26/09/2026 : le clic ouvrait le créateur
   * D'OPPORTUNITÉ (`/projects?create=1`, `CreateProjectDialog`), jamais le
   * créateur DE BESOIN (`/projects/needs`, `POST /projects/needs`) que le
   * commentaire de ce même fichier annonçait pourtant depuis #2322. Le
   * `provenance: 'model'` du besoin compilé ne pouvait donc JAMAIS s'écrire :
   * `CreateProjectDialog` ne crée pas de besoin, il crée l'affaire qui le
   * porterait. `create_need: '1'` ouvre la BONNE porte.
   */
  it('#2942 — le clic ouvre le créateur DE BESOIN, pas celui d’une opportunité', async () => {
    render(<PendingActions actions={[COMPILED_NEED_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le créateur de besoin' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    // #2942 (reste du 26/09) — le titre et le contexte compilés voyagent
    // maintenant AVEC la provenance : le formulaire ouvert ne redemande plus
    // ce que Laura a déjà dit.
    expect(navigate.mock.calls[0][0]).toEqual({
      to: '/projects',
      search: {
        create_need: 1,
        need_title: 'Data engineer EDI',
        need_context: 'reprendre les flux EDI fournisseurs',
        // #2942 (recette écran 27/09/2026) — sans `account_id` rapproché, le
        // nom lu dans la source voyage (même valeur que l'aperçu de la carte).
        need_account_name: 'Decathlon',
      },
    })
  })

  it('n’affiche AUCUNE ligne pour un champ que la source n’a pas dit', async () => {
    render(<PendingActions actions={[COMPILED_NEED_ACTION]} />)
    await screen.findByText('Besoin compilé — Data engineer EDI, chez Decathlon')
    // Ni « Compétences », ni « Ce qui se contredit » : la source n’en dit rien,
    // et une absence ne fait aucune ligne.
    expect(screen.queryByText('Compétences')).not.toBeInTheDocument()
    expect(screen.queryByText('Ce qui se contredit')).not.toBeInTheDocument()
  })

  /**
   * #2942 (reste du 26/09, 2ᵉ tranche) — quand Laura a compilé des compétences
   * et un TJM, ils voyagent eux aussi vers le créateur de besoin, dans la MÊME
   * forme que l'aperçu de la carte (`needSkills` ci-dessus, une liste jointe
   * par virgules) — jamais une structure inventée pour l'URL.
   */
  it('#2942 — compétences et TJM compilés voyagent aussi vers le créateur de besoin', async () => {
    const actionWithSkills: PendingChatAction = {
      ...COMPILED_NEED_ACTION,
      compiled: {
        ...COMPILED_NEED_ACTION.compiled,
        not_understood: ['expected_outcome'],
        fields: [
          ...COMPILED_NEED_ACTION.compiled.fields,
          {
            field: 'skills',
            value: [
              { term: 'Kubernetes', required: true },
              { term: 'Terraform', required: true },
            ],
            provenance: {
              source_kind: 'email',
              excerpt: 'il faut du Kubernetes et du Terraform',
              locator: null,
              stated_at: '2026-09-12',
              confidence: 'explicite',
            },
          },
          {
            field: 'target_tjm_cents',
            value: 65_000,
            provenance: {
              source_kind: 'email',
              excerpt: 'budget autour de 650€/jour',
              locator: null,
              stated_at: '2026-09-12',
              confidence: 'explicite',
            },
          },
        ],
      },
    }
    render(<PendingActions actions={[actionWithSkills]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le créateur de besoin' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(navigate.mock.calls[0][0]).toEqual({
      to: '/projects',
      search: {
        create_need: 1,
        need_title: 'Data engineer EDI',
        need_context: 'reprendre les flux EDI fournisseurs',
        need_skills: 'Kubernetes, Terraform',
        need_tjm_cents: 65_000,
        // #2942 (recette écran 27/09/2026) — même compte sans account_id rapproché.
        need_account_name: 'Decathlon',
      },
    })
  })
})

describe('#1912.11 — le brouillon nomme la messagerie branchée', () => {
  it('nomme la messagerie branchée AVANT le clic, et n’appelle rien au rendu', async () => {
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} mailboxName="Gmail" />)
    expect(await screen.findByText('un brouillon dans Gmail (aucun envoi)')).toBeInTheDocument()
    expect(screen.getByText(/Le brouillon atterrit dans Gmail\./)).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('dit « ta messagerie » quand aucune messagerie branchée n’est connue — jamais un nom deviné', async () => {
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} />)
    expect(await screen.findByText('un brouillon dans ta messagerie (aucun envoi)')).toBeInTheDocument()
    expect(screen.queryByText(/Gmail|Outlook/)).not.toBeInTheDocument()
  })

  it('après le dépôt, nomme l’outil du RÉSULTAT réel, pas celui supposé avant', async () => {
    apiFetch.mockResolvedValue({
      provider: 'microsoft',
      draftId: 'd-1',
      messageId: 'm-1',
      threadId: 't-1',
      webUrl: null,
    })
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} mailboxName="Gmail" />)
    fireEvent.click(await screen.findByRole('button', { name: /Déposer le brouillon/ }))
    expect(await screen.findByText('Brouillon déposé dans Outlook.')).toBeInTheDocument()
  })

  it('un résultat sans fournisseur lisible retombe sur « ta messagerie »', async () => {
    apiFetch.mockResolvedValue({
      draftId: 'd-2',
      messageId: 'm-2',
      threadId: 't-2',
      webUrl: 'https://exemple.test/d-2',
    })
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} mailboxName="Gmail" />)
    fireEvent.click(await screen.findByRole('button', { name: /Déposer le brouillon/ }))
    expect(
      await screen.findByText("Brouillon déposé dans ta messagerie — tu peux le relire et l'envoyer."),
    ).toBeInTheDocument()
  })
})

/**
 * #1930.4 / #1930.5 / #1930.17 — CE QUE LE BROUILLON MAIL NE MONTRAIT PAS.
 *
 * Contrairement à `prepare_message` (qui a son `DraftPanel`), cette carte
 * n'avait AUCUN panneau de relecture : avant ce lot, ni la destination
 * (distincte de la cible), ni le corps, ni la mention signature/pièces
 * jointes n'étaient visibles avant le clic « Déposer le brouillon ».
 */
describe('#1930 — la prévisualisation du brouillon mail avant confirmation', () => {
  it('affiche la destination, le corps et la note de signature — rien de tout ça n’apparaissait avant', async () => {
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} mailboxName="Gmail" />)
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview).toHaveTextContent('Destination')
    expect(preview).toHaveTextContent('Gmail')
    expect(preview).toHaveTextContent('Contenu')
    expect(preview).toHaveTextContent('Bonjour Claire, voici la suite.')
    expect(preview).toHaveTextContent('Ta signature sera ajoutée. Aucune pièce jointe.')
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

/**
 * #1931.18 — LE CTA « OUVRIR », L'EXEMPLE MÊME QUE #1930 CITAIT.
 *
 * `draft.webUrl` était lu pour choisir la PHRASE (« tu peux le relire et
 * l'envoyer ») puis jeté : le lien réel n'était jamais rendu cliquable.
 */
describe('#1931.18 — le CTA « Ouvrir » sur un brouillon déposé', () => {
  it('affiche un bouton « Ouvrir » vers le lien RÉEL rendu par le serveur', async () => {
    apiFetch.mockResolvedValue({
      provider: 'google',
      draftId: 'd-3',
      messageId: 'm-3',
      threadId: 't-3',
      webUrl: 'https://mail.example/d-3',
    })
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} mailboxName="Gmail" />)
    fireEvent.click(await screen.findByRole('button', { name: /Déposer le brouillon/ }))
    const open = await screen.findByRole('link', { name: 'Ouvrir' })
    expect(open).toHaveAttribute('href', 'https://mail.example/d-3')
  })

  it('n’affiche AUCUN lien « Ouvrir » quand le fournisseur n’en rend pas — jamais un lien deviné', async () => {
    apiFetch.mockResolvedValue({ provider: 'google', draftId: 'd-4', messageId: 'm-4', threadId: 't-4', webUrl: null })
    render(<PendingActions actions={[MAIL_DRAFT_ACTION]} mailboxName="Gmail" />)
    fireEvent.click(await screen.findByRole('button', { name: /Déposer le brouillon/ }))
    await screen.findByText(/Brouillon déposé dans Gmail/)
    expect(screen.queryByRole('link', { name: 'Ouvrir' })).not.toBeInTheDocument()
  })
})

const FIND_ACTION: PendingChatAction = {
  action: 'find_accounts',
  sectors: ['industry'],
  signals: ['hiring'],
  department: '69',
  headcount: '250-999',
  cost_credits: 0,
}

// #1935.14 — une audience 100% téléphone EST une liste d'appels, pas une
// campagne e-mail : `output_kind` le nomme déjà côté outil (`chat_tools.py`).
const CALL_LIST_ACTION: PendingChatAction = {
  action: 'prepare_campaign',
  objective: 'Relancer les DSI industrie sur le cloud souverain',
  channels: ['phone'],
  output_kind: 'call_list',
  contacts: [{ contact_id: '11111111-1111-4111-8111-111111111111', full_name: 'Claire Dubois' }],
  cost_credits: 0,
}

const CAMPAIGN_ACTION: PendingChatAction = {
  action: 'prepare_campaign',
  objective: 'Relancer les DSI industrie sur le cloud souverain',
  channels: ['email'],
  output_kind: 'sequence_campaign',
  contacts: [{ contact_id: '11111111-1111-4111-8111-111111111111', full_name: 'Claire Dubois' }],
  cost_credits: 0,
}

beforeEach(() => {
  apiFetch.mockReset()
  dispatch.mockReset()
  enrich.mockReset()
  exportHubspot.mockReset()
  exportSalesforce.mockReset()
  navigate.mockReset()
  updateRoutine.mockReset()
  updateNotificationPreferences.mockReset()
  setStageSla.mockReset()
  pinMemoryFact.mockReset()
  validateExpenseReport.mockReset()
  rejectExpenseReport.mockReset()
  // #1930.14 — par défaut, la fiche « actuelle » vaut EXACTEMENT ce que la carte
  // CRM propose déjà : aucun diff ne s'affiche tant qu'un test ne fait pas
  // dériver l'une des deux valeurs.
  getOneContact.mockReset()
  getOneContact.mockResolvedValue({
    full_name: 'Claire Dubois',
    email: 'claire@example.com',
    title: 'DSI',
    entity: 'ACME SA',
  } as Contact)
  // #1952.38 — la clé d'idempotence d'un geste vit dans le stockage de l'onglet :
  // sans ce nettoyage, un test hériterait de la clé du précédent.
  sessionStorage.clear()
})

describe('PendingActions', () => {
  it('affiche ce que l’action fera et n’exécute RIEN au rendu', async () => {
    render(<PendingActions actions={[MESSAGE_ACTION, REMINDER_ACTION]} />)

    expect(await screen.findByText(/Préparer un email pour Claire Dubois/)).toBeInTheDocument()
    expect(screen.getByText(/Programmer un rappel sur Claire Dubois/)).toBeInTheDocument()
    // Aucun effet tant que l'utilisateur n'a pas validé.
    expect(apiFetch).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('annonce la non-exécution avant le clic — sans aucun crédit (#4463)', async () => {
    render(<PendingActions actions={[MESSAGE_ACTION]} />)
    expect(await screen.findByText(/Bellum n[’']envoie rien/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
  })

  it('prépare le message au clic — et ne l’envoie pas', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Votre migration', body: 'Bonjour Claire,' } })
    render(<PendingActions actions={[MESSAGE_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Préparer le message/ }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch.mock.calls[0][0]).toMatchObject({
      path: '/ia/message',
      method: 'POST',
      body: { contactId: MESSAGE_ACTION.contact_id, channel: 'email', context: 'migration cloud' },
    })
    // Le message préparé s'affiche, explicitement présenté comme non envoyé.
    expect(await screen.findByText('Bonjour Claire,')).toBeInTheDocument()
    expect(screen.getByText(/à envoyer depuis ta messagerie/)).toBeInTheDocument()
    // Aucun envoi : le seul appel est la génération.
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('programme le rappel au clic via l’Action Router', async () => {
    dispatch.mockResolvedValue({ type: 'schedule_reminder', status: 'done', reason: 'Rappel interne enregistré.' })
    render(<PendingActions actions={[REMINDER_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Programmer le rappel/ }))

    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    expect(dispatch.mock.calls[0][0]).toEqual({
      type: 'schedule_reminder',
      contactId: REMINDER_ACTION.contact_id,
      at: '2026-09-01T07:00:00Z',
      note: 'Relancer après le POC',
      // #1952.38 — la clé voyage AVEC l'intent. `toEqual` et non `toMatchObject` :
      // un champ de plus dans ce qui part vers le routeur doit se voir.
      idempotencyKey: expect.stringMatching(/^chat-card\.schedule_reminder:.+/),
    })
    expect(await screen.findByText(/Rappel interne enregistré/)).toBeInTheDocument()
  })

  // G.1 (recette R3 19/10) — « crée un événement demain 23 h » : Laura PRÉPARE, le clic CRÉE dans l'agenda branché.
  it('G.1 — l’événement préparé se crée au clic par l’Action Router (create_calendar_event), jamais avant', async () => {
    dispatch.mockResolvedValue({ type: 'create_calendar_event', status: 'done', reason: 'Événement créé.' })
    render(
      <PendingActions
        actions={[
          {
            action: 'prepare_calendar_event',
            title: 'Point SNCF',
            starts_at: '2026-10-20T23:00:00+02:00',
            duration_minutes: 45,
          },
        ]}
      />,
    )
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: /Créer l’événement|Créer l'événement/ }))

    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    expect(dispatch.mock.calls[0][0]).toEqual({
      type: 'create_calendar_event',
      title: 'Point SNCF',
      startsAt: '2026-10-20T21:00:00.000Z',
      durationMinutes: 45,
      attendees: [],
      idempotencyKey: expect.stringMatching(/^chat-card\.prepare_calendar_event:.+/),
    })
    expect(await screen.findByText(/Événement créé/)).toBeInTheDocument()
  })

  /**
   * #1931.9 — UN REFUS LAISSE UNE TRACE, IL NE FAIT PLUS DISPARAÎTRE LA CARTE.
   *
   * `dismiss` rendait `null` : un rafraîchissement à cet instant précis
   * perdait le fait même qu'une proposition avait existé et avait été
   * refusée — la « disparition sans trace » que #1931.21 nommait. La carte
   * reste montée, avec le MÊME nom d'état que `CopilotCards`
   * (`cards.state.rejected`, « Refusée »).
   */
  it('« Ignorer » laisse une trace « Refusée » — la carte ne disparaît plus', async () => {
    render(<PendingActions actions={[REMINDER_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Ignorer/ }))
    expect(await screen.findByText('Refusée')).toBeInTheDocument()
    // La description reste lisible : ce qui a été refusé, pas seulement qu'un
    // refus a eu lieu.
    expect(screen.getByText(/Programmer un rappel sur Claire Dubois/)).toBeInTheDocument()
    expect(dispatch).not.toHaveBeenCalled()
  })

  /**
   * #1950.16 — SUPPRIMER UNE ÉTAPE MET À JOUR LE PLAN, PAS SEULEMENT LA CARTE.
   *
   * `PlanRecap` lit `actions` tel que Laura l'a proposé : ignorer une carte ne
   * change que son état LOCAL (`CardState`), jamais le tableau du parent — la
   * ligne récapitulative continuait donc à compter et facturer une étape que
   * plus personne ne voyait. Le compte et le coût total doivent redescendre
   * au clic, sans qu'aucun état de plan nouveau n'existe (toujours dérivé des
   * cartes encore proposées).
   */
  it('#1950.16 — ignorer une carte retire son rang du récapitulatif de plan, qui ne chiffre aucun coût (#4463)', async () => {
    render(<PendingActions actions={[REMINDER_ACTION, ENRICH_ACTION, MESSAGE_ACTION]} />)

    expect(await screen.findByRole('note')).toHaveTextContent('Plan en 3 étapes')
    expect(screen.getByRole('note')).not.toHaveTextContent(/crédit/i)

    // La carte d'enrichissement est la deuxième du plan.
    const dismissButtons = screen.getAllByRole('button', { name: /Ignorer/ })
    fireEvent.click(dismissButtons[1])

    await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent('Plan en 2 étapes'))
    expect(screen.getByRole('note')).not.toHaveTextContent(/crédit/i)
  })

  it('un échec de dispatch est dit, jamais maquillé en succès', async () => {
    dispatch.mockResolvedValue({ type: 'schedule_reminder', status: 'skipped', reason: 'Contact introuvable.' })
    render(<PendingActions actions={[REMINDER_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Programmer le rappel/ }))
    expect(await screen.findByText(/Contact introuvable/)).toBeInTheDocument()
  })

  /**
   * #1959.9 / #1959.10 — L'APPELANT DE `claimNotice`.
   *
   * Le serveur porte désormais QUI a lancé le geste et QUAND
   * (`ActionDispatchResult.claim`). Sans ces deux tests, cette information
   * resterait « du code juste que personne n'appelle » : la carte rendrait
   * toujours la raison générique du routeur.
   */
  it('#1959.9/.10 — une action déjà lancée par un collègue le NOMME, avec l’heure réelle', async () => {
    dispatch.mockResolvedValue({
      type: 'schedule_reminder',
      status: 'done',
      reason: 'Rappel interne enregistré.',
      claim: { actor: 'Marc Dubois', completedAt: '2026-09-15T12:32:00.000Z', self: false },
    })
    render(<PendingActions actions={[REMINDER_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Programmer le rappel/ }))
    expect(await screen.findByText(/Marc Dubois/)).toBeInTheDocument()
    // L'heure s'affiche dans le fuseau de qui lit : l'attendu se CALCULE
    // (la CI tourne en UTC, les postes en Europe/Paris).
    const executed = new Date('2026-09-15T12:32:00.000Z')
    const hhmm = `${String(executed.getHours()).padStart(2, '0')}[:h]${String(executed.getMinutes()).padStart(2, '0')}`
    expect(screen.getByText(new RegExp(hhmm))).toBeInTheDocument()
  })

  it('#1959.10 — un rejeu dont l’effet est ENCORE EN VOL se dit, sans devenir un échec', async () => {
    // Le routeur rend `skipped` pour « quelqu'un d'autre est en train de le
    // faire » : l'afficher en rouge ferait croire à une panne.
    dispatch.mockResolvedValue({
      type: 'schedule_reminder',
      status: 'skipped',
      reason: 'Une action identique (même clé) est déjà en cours de traitement.',
      claim: { actor: 'Marc Dubois', completedAt: null, self: false },
    })
    render(<PendingActions actions={[REMINDER_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Programmer le rappel/ }))
    expect(await screen.findByText(/Marc Dubois a déjà lancé cette action/)).toBeInTheDocument()
  })
})

/**
 * Épopée #2955 (#2394.6/.19/.43) — la carte `propose_crm_note` : le writeback
 * CRM depuis un fil de messagerie, matérialisé par `propose_crm_note`
 * (`chat_tools.py`) et dispatché via `create_crm_note` (`ActionRouterService`,
 * une note sur une fiche déjà là — jamais un export de contact).
 */
describe('PendingActions — propose_crm_note (épopée #2955)', () => {
  it('décrit la note et promet qu’elle n’écrase rien tant que le contact n’est pas déjà dans le CRM', async () => {
    render(<PendingActions actions={[CRM_NOTE_ACTION]} />)
    expect(await screen.findByText(/Écrire une note CRM sur Claire Dubois/)).toBeInTheDocument()
    expect(screen.getByText('Relancer sur le devis, silence depuis 8 jours.')).toBeInTheDocument()
    expect(screen.getByText(/Ajoute une note sur la fiche déjà existante/)).toBeInTheDocument()
  })

  it('écrit la note au clic via l’Action Router — jamais un export de fiche', async () => {
    dispatch.mockResolvedValue({ type: 'create_crm_note', status: 'done', reason: 'Note CRM écrite.' })
    render(<PendingActions actions={[CRM_NOTE_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Écrire la note/ }))

    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    expect(dispatch.mock.calls[0][0]).toEqual({
      type: 'create_crm_note',
      contactId: CRM_NOTE_ACTION.contact_id,
      note: 'Relancer sur le devis, silence depuis 8 jours.',
      idempotencyKey: expect.stringMatching(/^chat-card\.propose_crm_note:.+/),
    })
    expect(await screen.findByText(/Note CRM écrite/)).toBeInTheDocument()
  })

  it('un contact absent du CRM le dit, jamais maquillé en succès', async () => {
    dispatch.mockResolvedValue({
      type: 'create_crm_note',
      status: 'skipped',
      reason: "Ce contact n'a pas été retrouvé dans votre CRM — poussez-le d'abord.",
    })
    render(<PendingActions actions={[CRM_NOTE_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Écrire la note/ }))
    expect(await screen.findByText(/n'a pas été retrouvé dans votre CRM/)).toBeInTheDocument()
  })
})

/**
 * #3871.1 (lot V11, 07/10, recette prod 2e passe) — la carte
 * `propose_contact_departure` : Laura répondait « je ne peux pas modifier
 * directement le statut de la fiche » plutôt que de PROPOSER le passage en
 * historique. Le clic emprunte la route de la fiche contact
 * (`POST /contacts/:id/departed`, `contactsApi.markDeparted`) — jamais une
 * suppression.
 */
describe('PendingActions — propose_contact_departure (#3871.1)', () => {
  it('décrit le passage en historique et promet qu’aucune suppression n’a lieu', async () => {
    render(<PendingActions actions={[CONTACT_DEPARTURE_ACTION]} />)
    expect(await screen.findByText(/Passer Pierre Eynatte en historique/)).toBeInTheDocument()
    expect(screen.getByText(/Rien n'est écrit avant ton clic/)).toBeInTheDocument()
  })

  it('archive le contact au clic — jamais avant', async () => {
    markContactDeparted.mockResolvedValue({
      contact_id: CONTACT_DEPARTURE_ACTION.contact_id,
      lifecycle_state: 'historique',
    })
    render(<PendingActions actions={[CONTACT_DEPARTURE_ACTION]} />)
    expect(markContactDeparted).not.toHaveBeenCalled()

    fireEvent.click(await screen.findByRole('button', { name: /Passer en historique/ }))

    await waitFor(() => expect(markContactDeparted).toHaveBeenCalledWith(CONTACT_DEPARTURE_ACTION.contact_id))
    expect(await screen.findByText(/Pierre Eynatte est passé en historique/)).toBeInTheDocument()
  })
})

/**
 * #1953.14 — UNE ACTION PRÉPARÉE DANS UNE BRANCHE ABANDONNÉE DEVIENT OBSOLÈTE.
 *
 * La carte survit à la branche qui l'a produite (elle reste affichée — on
 * archive, on ne supprime pas) : sans ce drapeau, elle resterait confirmable
 * après qu'un « Réessayer » l'a rendue obsolète, et un clic tardif rejouerait
 * un geste dont le contexte n'existe plus (#1953.13/.20).
 */
describe('PendingActions — obsolète après un réessai (#1953.14)', () => {
  it('une proposition NON confirmée devient obsolète et perd son bouton de confirmation', async () => {
    render(<PendingActions actions={[REMINDER_ACTION]} obsolete />)
    expect(await screen.findByText(/Programmer un rappel sur Claire Dubois/)).toBeInTheDocument()
    expect(screen.getByText(/obsolète/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Programmer le rappel/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ignorer/ })).not.toBeInTheDocument()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('une proposition NON obsolète garde son bouton de confirmation — la garde n’attrape pas ce qu’elle ne vise pas', async () => {
    render(<PendingActions actions={[REMINDER_ACTION]} obsolete={false} />)
    expect(await screen.findByRole('button', { name: /Programmer le rappel/ })).toBeInTheDocument()
  })

  it('une action DÉJÀ EXÉCUTÉE avant de devenir obsolète garde son résultat visible — on ne l’efface pas', async () => {
    dispatch.mockResolvedValue({ type: 'schedule_reminder', status: 'done', reason: 'Rappel interne enregistré.' })
    const { rerender } = render(<PendingActions actions={[REMINDER_ACTION]} obsolete={false} />)
    fireEvent.click(await screen.findByRole('button', { name: /Programmer le rappel/ }))
    expect(await screen.findByText(/Rappel interne enregistré/)).toBeInTheDocument()
    // La branche devient obsolète APRÈS coup (un réessai clique juste ensuite) :
    // le résultat déjà connu reste affiché, jamais remplacé par un bandeau vide.
    rerender(<PendingActions actions={[REMINDER_ACTION]} obsolete />)
    expect(screen.getByText(/Rappel interne enregistré/)).toBeInTheDocument()
  })
})

/**
 * #1952.38 — LA PROTECTION DU ROUTEUR NE PROTÉGEAIT RIEN DEPUIS CET ÉCRAN.
 *
 * `ActionRouterService.dispatchIdempotent` rend la main à `dispatchOne` dès que
 * `idempotencyKey` manque. Cette carte n'en fournissait aucune : un double clic
 * ou un renvoi réseau programmait deux rappels. Les deux tests suivants sont
 * l'un l'inverse de l'autre — une clé aléatoire échoue au premier, une clé
 * partagée par toutes les cartes échoue au second.
 */
describe('PendingActions — la clé d’idempotence est celle du GESTE', () => {
  /** ⚠️ La clé est LUE, jamais supposée : comparer deux `undefined` donnerait un
   *  test vert alors qu'aucune clé ne part — exactement le défaut qu'on corrige. */
  const keyOf = (call: number): string => {
    const key = (dispatch.mock.calls[call]?.[0] as { idempotencyKey?: string } | undefined)?.idempotencyKey
    expect(typeof key).toBe('string')
    return key as string
  }

  it('la MÊME carte confirmée après un remontage rejoue la MÊME clé', async () => {
    // La requête reste EN VOL — l'état exact pendant lequel on rafraîchit,
    // puis reclique en croyant que rien n'est parti.
    dispatch.mockImplementation(() => new Promise(() => {}))
    const first = render(<PendingActions actions={[REMINDER_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Programmer le rappel/ }))
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    first.unmount()

    render(<PendingActions actions={[REMINDER_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Programmer le rappel/ }))
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2))

    expect(keyOf(1)).toBe(keyOf(0))
  })

  it('deux rappels réellement distincts ne partagent JAMAIS une clé', async () => {
    // Le piège que la règle doit éviter dans l'autre sens : deux relances
    // légitimes sur le même contact, à deux dates, sont deux gestes. Les
    // confondre bloquerait la seconde pour toujours.
    dispatch.mockResolvedValue({ type: 'schedule_reminder', status: 'done' })
    const later: PendingChatAction = { ...REMINDER_ACTION, at: '2026-09-22T07:00:00Z' }
    render(<PendingActions actions={[REMINDER_ACTION, later]} />)

    const buttons = await screen.findAllByRole('button', { name: /Programmer le rappel/ })
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2))

    expect(keyOf(1)).not.toBe(keyOf(0))
  })
})

/**
 * Les 3 outils d'action de la §14. Même garantie que les deux précédents : la
 * carte annonce l'effet EXACT et son coût, et rien ne part avant le clic.
 */
describe('PendingActions — enrichir un contact', () => {
  it('annonce l’effet AVANT le clic, sans crédit, et n’enrichit rien au rendu (#4463)', async () => {
    render(<PendingActions actions={[ENRICH_ACTION]} />)
    expect(await screen.findByText(/Enrichir les coordonnées de Claire Dubois \(ACME SA\)/)).toBeInTheDocument()
    expect(screen.getByText(/Cherche les coordonnées de ce contact/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enrichir' })).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /crédit/i })).not.toBeInTheDocument()
    expect(enrich).not.toHaveBeenCalled()
  })

  it('appelle l’endpoint d’enrichissement existant au clic, avec l’ancre org du compte', async () => {
    enrich.mockResolvedValue({ email: 'claire@acme.fr', phone: null, credits_remaining: 4, full_name: 'Claire Dubois' })
    render(<PendingActions actions={[ENRICH_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Enrichir' }))

    await waitFor(() => expect(enrich).toHaveBeenCalledTimes(1))
    expect(enrich.mock.calls[0]).toEqual([
      ENRICH_ACTION.contact_id,
      { first_name: 'Claire', last_name: 'Dubois', organization_name: 'ACME SA' },
    ])
    expect(await screen.findByText(/Coordonnées trouvées/)).toBeInTheDocument()
  })

  // LOT (15/10) DATA-B.5 — « téléphone seul » : la coordonnée déjà connue n'est ni cherchée ni facturée.
  it('relaie la coordonnée seule (`only`) à l’endpoint d’enrichissement', async () => {
    enrich.mockResolvedValue({ email: null, phone: '+33123456789', credits_remaining: 4, full_name: 'Claire Dubois' })
    render(<PendingActions actions={[{ ...ENRICH_ACTION, only: 'phone' }]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Enrichir' }))

    await waitFor(() => expect(enrich).toHaveBeenCalledTimes(1))
    expect(enrich.mock.calls[0]).toEqual([
      ENRICH_ACTION.contact_id,
      { first_name: 'Claire', last_name: 'Dubois', organization_name: 'ACME SA', only: 'phone' },
    ])
  })

  it('dit « aucune coordonnée trouvée » plutôt qu’un succès vide, sans parler de crédit (#4463)', async () => {
    enrich.mockResolvedValue({ email: null, phone: null, credits_remaining: 5, full_name: 'Claire Dubois' })
    render(<PendingActions actions={[ENRICH_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Enrichir/ }))
    expect(await screen.findByText('Aucune coordonnée trouvée.')).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
  })

  /**
   * #1943.6 — LE TROU NOMMÉ PAR L'AUDIT : « aucun test ne tient la carte du
   * chat ». Le routeur d'actions savait déjà dire `insufficient_credits`
   * (`action-router.service.spec.ts`) et le fil de conversation répète déjà un
   * refus 4xx (`chat-error.test.ts`) — cette carte-ci, elle, maquillait TOUT
   * échec en un générique unique (`catch { setState(... t('pending.failed')) }`),
   * crédits insuffisants compris.
   */
  it('#1943.6 — un refus EXPLIQUÉ par le serveur (4xx) se répète, au lieu du générique', async () => {
    enrich.mockRejectedValue(new ApiError('Crédits insuffisants pour cet enrichissement.', 402))
    render(<PendingActions actions={[ENRICH_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Enrichir/ }))
    expect(await screen.findByText('Crédits insuffisants pour cet enrichissement.')).toBeInTheDocument()
    expect(screen.queryByText("L'action n'a pas pu être exécutée.")).not.toBeInTheDocument()
  })

  it('une PANNE (5xx) garde la phrase générique — jamais le détail serveur brut', async () => {
    enrich.mockRejectedValue(new ApiError('Internal server error', 500))
    render(<PendingActions actions={[ENRICH_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Enrichir/ }))
    expect(await screen.findByText("L'action n'a pas pu être exécutée.")).toBeInTheDocument()
    expect(screen.queryByText('Internal server error')).not.toBeInTheDocument()
  })

  /**
   * #2150.41 — « Porte d'entrée Laura ». `enrich_contact` connaît DÉJÀ
   * `action.contact_id` (c'est l'entrée de l'appel) : le seul manque était de
   * le porter dans l'état `scheduled`, où `Ouvrir la fiche` (#1995) existe
   * déjà, générique, pour tout `contactId` connu — aucun bouton neuf.
   */
  it('#2150.41 — offre « Ouvrir la fiche » du contact qui vient d’être enrichi', async () => {
    enrich.mockResolvedValue({ email: 'claire@acme.fr', phone: null, credits_remaining: 4, full_name: 'Claire Dubois' })
    render(<PendingActions actions={[ENRICH_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Enrichir' }))
    await screen.findByText(/Coordonnées trouvées/)
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la fiche/ }))
    expect(navigate).toHaveBeenCalledWith({ to: '/contacts/$id', params: { id: ENRICH_ACTION.contact_id } })
  })
})

describe('PendingActions — pousser vers le CRM', () => {
  /**
   * La carte ne nomme plus l'éditeur (addendum final p12 : « ne jamais révéler
   * les fournisseurs »). Elle nomme la CAPACITÉ — « votre CRM » — pendant que
   * le `provider` continue de router l'appel réel. Les deux moitiés de cette
   * règle sont testées : ce qui s'affiche, et là où ça part.
   */
  it('nomme la capacité et pas l’éditeur, et n’exporte rien au rendu', async () => {
    render(<PendingActions actions={[CRM_ACTION]} />)
    expect(await screen.findByText(/Envoyer Claire Dubois vers ton CRM/)).toBeInTheDocument()
    expect(screen.getByText(/rien d[’']autre/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Salesforce/)).not.toBeInTheDocument()
    expect(exportSalesforce).not.toHaveBeenCalled()
  })

  it('route vers le bon fournisseur au clic — jamais vers un autre CRM', async () => {
    exportSalesforce.mockResolvedValue({ id: 'sf-1', created: true })
    render(<PendingActions actions={[CRM_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Envoyer vers ton CRM/ }))

    await waitFor(() => expect(exportSalesforce).toHaveBeenCalledTimes(1))
    expect(exportHubspot).not.toHaveBeenCalled()
    expect(exportSalesforce.mock.calls[0][0]).toMatchObject({
      firstName: 'Claire',
      lastName: 'Dubois',
      email: 'claire@example.com',
      jobTitle: 'DSI',
      company: 'ACME SA',
    })
    expect(await screen.findByText(/Fiche créée dans ton CRM/)).toBeInTheDocument()
  })

  /**
   * #2150.41 — même mécanisme que l'enrichissement : `export_contact_to_crm`
   * connaît déjà `action.contact_id`, il ne le portait pas jusqu'à l'état
   * `scheduled`.
   */
  it('#2150.41 — offre « Ouvrir la fiche » du contact exporté', async () => {
    exportSalesforce.mockResolvedValue({ id: 'sf-1', created: true })
    render(<PendingActions actions={[CRM_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Envoyer vers ton CRM/ }))
    await screen.findByText(/Fiche créée dans ton CRM/)
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la fiche/ }))
    expect(navigate).toHaveBeenCalledWith({ to: '/contacts/$id', params: { id: CRM_ACTION.contact_id } })
  })
})

/**
 * La prévisualisation (addendum final p12) : avant d'approuver, l'utilisateur
 * doit voir sur QUI l'action porte, par quel canal, ce qu'elle ÉCRIT et ce
 * qu'elle coûte. Une phrase de description ne suffisait pas : approuver revenait
 * à faire confiance à un résumé.
 */
describe('PendingActions — prévisualisation avant approbation', () => {
  it('détaille cible, destination et écriture avant le clic — sans ligne de coût (#4463)', async () => {
    render(<PendingActions actions={[CRM_ACTION]} />)
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview).toHaveTextContent('Cible')
    expect(preview).toHaveTextContent('Claire Dubois')
    expect(preview).toHaveTextContent('Ce qui sera écrit')
    expect(preview).toHaveTextContent('fiche contact créée ou mise à jour')
    expect(preview).not.toHaveTextContent(/Coût|crédit/i)
  })

  // #1930.14 — le diff champ à champ : une correction humaine arrivée après la
  // proposition ne doit jamais être écrasée en silence.
  it('montre la valeur actuelle quand la fiche a changé depuis la proposition', async () => {
    getOneContact.mockResolvedValue({
      full_name: 'Claire Dubois',
      email: 'claire@example.com',
      // La fiche a été corrigée à la main depuis : le poste réel n'est plus
      // celui que la carte s'apprête à écrire dans le CRM.
      title: 'Directrice des systèmes d’information',
      entity: 'ACME SA',
    } as Contact)
    render(<PendingActions actions={[CRM_ACTION]} />)
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview).toHaveTextContent('Poste — valeur actuelle')
    expect(preview).toHaveTextContent('Directrice des systèmes d’information')
    // La valeur qui va RÉELLEMENT partir reste affichée à côté de l'ancienne.
    expect(preview).toHaveTextContent('DSI')
  })

  // Témoin : deux fiches identiques ne doivent jamais afficher de diff — sinon
  // chaque export, changé ou non, crierait « ça va écraser quelque chose ».
  it('ne montre aucune valeur actuelle quand rien n’a changé', async () => {
    render(<PendingActions actions={[CRM_ACTION]} />)
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    await waitFor(() => expect(getOneContact).toHaveBeenCalled())
    expect(preview).not.toHaveTextContent('valeur actuelle')
  })

  it('une action payante n’annonce aucun débit non plus (#4463)', async () => {
    render(<PendingActions actions={[ENRICH_ACTION]} />)
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview).not.toHaveTextContent(/crédit|Coût/i)
    expect(preview).toHaveTextContent('email et téléphone sur la fiche contact, si trouvés')
  })

  it('disparaît une fois l’action exécutée — on montre alors le résultat', async () => {
    exportSalesforce.mockResolvedValue({ id: 'sf-1', created: true })
    render(<PendingActions actions={[CRM_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Envoyer vers ton CRM/ }))
    await waitFor(() => expect(exportSalesforce).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: /Ce que cette action va faire/i })).not.toBeInTheDocument()
  })

  // #1958.18 — RDV INTERNATIONAL. Le fuseau retenu par l'escalier
  // (`resolve_applicable_timezone`) était calculé côté outil sans jamais
  // atteindre l'écran : la personne à Paris qui programme un rappel pour un
  // contact à Montréal ne voyait AUCUNE mention du fuseau dans l'aperçu, alors
  // que l'exemple même du retour (« 9 h, heure de Paris ») l'exige.
  it('#1958.18 — nomme le fuseau retenu quand il est connu (RDV international)', async () => {
    render(
      <PendingActions
        actions={[{ ...REMINDER_ACTION, timezone: 'Europe/Paris', contact_timezone: 'America/Montreal' }]}
      />,
    )
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview).toHaveTextContent('Europe/Paris')
  })

  it('#1958.18 — n’invente aucun fuseau : absent, la ligne ne s’affiche pas', async () => {
    render(<PendingActions actions={[REMINDER_ACTION]} />)
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview).not.toHaveTextContent('Europe/Paris')
    expect(preview).not.toHaveTextContent('undefined')
  })
})

describe('PendingActions — lancer une recherche Découvrir', () => {
  it('affiche les critères en clair et dit qu’explorer est libre, sans crédit (#4463)', async () => {
    render(<PendingActions actions={[FIND_ACTION]} />)
    const description = await screen.findByText(/Lancer une recherche Découvrir/)
    expect(description).toHaveTextContent('Industrie')
    expect(description).toHaveTextContent('recrutement en cours')
    expect(description).toHaveTextContent('département 69')
    expect(screen.getByText(/Explorer est libre/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('#3876.5 — une ville se NOMME comme une ville sur la carte, jamais comme son département', async () => {
    const { department: _department, ...withoutDepartment } = FIND_ACTION
    render(<PendingActions actions={[{ ...withoutDepartment, city: 'Marseille' }]} />)
    const description = await screen.findByText(/Lancer une recherche Découvrir/)
    expect(description).toHaveTextContent('ville de Marseille')
    expect(description).not.toHaveTextContent('département')
  })

  it('#3392 — la région choisie (AURA) se NOMME sur la carte « Action à valider », jamais perdue', async () => {
    render(<PendingActions actions={[{ ...FIND_ACTION, region: ['84'] }]} />)
    const description = await screen.findByText(/Lancer une recherche Découvrir/)
    expect(description).toHaveTextContent('Auvergne-Rhône-Alpes')
  })

  it('#3392 — sans région, aucune région n’est affichée', async () => {
    render(<PendingActions actions={[FIND_ACTION]} />)
    const description = await screen.findByText(/Lancer une recherche Découvrir/)
    expect(description).not.toHaveTextContent('Auvergne-Rhône-Alpes')
  })

  it('ouvre Découvrir pré-rempli au clic — sans aucun appel réseau', async () => {
    render(<PendingActions actions={[FIND_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir Découvrir/ }))

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    // #2165.64 — `discoverSearch` (discover-handoff.tsx) marque désormais
    // l'origine conversation (`laura: '1'`) pour que le rail de Découvrir
    // distingue un préremplissage de Laura d'un rechargement de recherche
    // déjà lancée par le commercial (mêmes clés `sectors`/`department`…).
    expect(navigate.mock.calls[0][0]).toEqual({
      to: '/discover',
      search: { sectors: 'industry', signals: 'hiring', department: '69', headcount: '250-999', laura: '1' },
    })
    expect(apiFetch).not.toHaveBeenCalled()
    expect(enrich).not.toHaveBeenCalled()
  })

  it('#1933.8 — porte le fil source dans la requête, quand il est connu', async () => {
    render(<PendingActions actions={[FIND_ACTION]} conversationId="thread-1" />)

    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir Découvrir/ }))

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(navigate.mock.calls[0][0]).toMatchObject({ search: { from: 'chat:thread-1' } })
  })
})

/**
 * #1935.14 — PROPOSER UNE LISTE D'APPELS, DISTINCTE D'UNE CAMPAGNE E-MAIL.
 *
 * `output_kind` (`call_list` quand SEUL le téléphone est visé) était déjà
 * calculé côté outil (`chat_tools.py`) et déjà au contrat (`copilot-card.ts`),
 * mais s'arrêtait là : `campaignSearch` (l'appelant qui construit l'URL de
 * Séquences) ne le lisait pas parmi les champs transmis, et la carte de chat
 * décrivait toujours « préparer une campagne », jamais une liste d'appels. Le
 * copilote n'appelle jamais : ouvrir Séquences reste la seule suite, la liste
 * y est nommée pour ce qu'elle est.
 */
describe('PendingActions — préparer une liste d’appels (#1935.14)', () => {
  it('décrit une liste d’appels, distinctement d’une campagne e-mail', async () => {
    render(<PendingActions actions={[CALL_LIST_ACTION]} />)
    expect(await screen.findByText(/Préparer une liste d'appels/)).toBeInTheDocument()
  })

  it('décrit toujours une campagne pour une audience non téléphone-seul (comportement inchangé)', async () => {
    render(<PendingActions actions={[CAMPAIGN_ACTION]} />)
    expect(await screen.findByText(/Préparer une campagne/)).toBeInTheDocument()
    expect(screen.queryByText(/liste d'appels/)).not.toBeInTheDocument()
  })

  it('porte `output_kind` jusqu’à l’URL de Séquences, au clic', async () => {
    render(<PendingActions actions={[CALL_LIST_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir Séquences/ }))

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(navigate.mock.calls[0][0]).toMatchObject({
      to: '/actions/sequences',
      search: { output_kind: 'call_list', channels: 'phone' },
    })
  })
})

/**
 * #4463 (crédits implicites, Louis 22/10/2026) — le coût ne s'annonce plus du tout.
 *
 * Avant : la ligne « Coût » disait « aucun crédit » sur un zéro émis, le prix de la grille sur un
 * enrichissement et « coût inconnu » quand le champ manquait (GA-18/GA-19 : un absent n'est jamais « 0 »).
 * Maintenant : plus de ligne « Coût », donc plus de zéro ni d'inconnu à nommer — la règle tient par
 * construction. Ce test sait dire NON : quelle que soit la valeur de `cost_credits` (zéro émis, prix de
 * la grille, absent), un seul « crédit » ou « coût inconnu » à l'écran le fait échouer.
 */
describe('PendingActions — le coût n’est plus annoncé (#4463)', () => {
  const { cost_credits: _omitted, ...ENRICH_WITHOUT_COST } = ENRICH_ACTION

  it.each([
    ['un zéro émis', MESSAGE_ACTION],
    ['le prix de la grille', ENRICH_ACTION],
    ['un coût non émis', ENRICH_WITHOUT_COST as PendingChatAction],
  ])('%s : aucune mention de crédit, de coût ou de « 0 crédit »', async (_label, action) => {
    const { container } = render(<PendingActions actions={[action]} />)
    await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(container).not.toHaveTextContent(/crédit|coût inconnu|aucun crédit/i)
    expect(screen.queryByText('Coût')).not.toBeInTheDocument()
  })
})

/**
 * #1768 — LES DEUX CARTES QUI FAISAIENT TOMBER L'ÉCRAN.
 *
 * `chat_tools.py` émet huit formes de proposition ; cette union n'en connaissait
 * six. Sur `open_screen` et `prepare_consultant_record`,
 * `ACTION_ICON[action.action]` rendait `undefined`, et `<Icon />` jetait — la
 * conversation entière tombait avec la carte. Aucun test ne pouvait le voir :
 * ceux du Python vérifient la charge utile, ceux d'ici montaient les six cartes
 * qu'ils connaissaient.
 *
 * `open_screen` compte double : c'est la carte de `propose_guided_action`,
 * l'outil vers lequel la nouvelle règle de prompt renvoie Laura au lieu de
 * nommer un bouton. Sans ces branches, la règle aggravait le défaut.
 */
const SCREEN_ACTION: PendingChatAction = {
  action: 'open_screen',
  route: '/accounts/partners',
  label: 'tes partenaires',
  highlight: 'les ESN observées autour du compte',
  cost_credits: 0,
}

// #1903.16 / #1903.7 — `route` embarque désormais `?new=true&name=…` (voir
// `chat_tools.py`) : c'est le SEUL véhicule vers l'écran, PendingActions.tsx ne
// faisant que naviguer vers ce que Python lui envoie.
const CONSULTANT_ACTION: PendingChatAction = {
  action: 'prepare_consultant_record',
  route: '/consultants?new=true&name=Claire+Dubois',
  full_name: 'Claire Dubois',
  available_from: '2026-10-01',
  note: 'Java / Kafka, mobile sur Lyon',
  cost_credits: 0,
}

describe('PendingActions — ouvrir un écran (#1768)', () => {
  it('rend la carte au lieu de faire tomber la conversation', async () => {
    render(<PendingActions actions={[SCREEN_ACTION]} />)

    expect(await screen.findByText('Ouvrir tes partenaires')).toBeInTheDocument()
    expect(screen.getByText('les ESN observées autour du compte')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('#3776.6 — ouvrir un écran gratuit n’est PAS une « Action à valider » : un geste léger, sans garantie ni aperçu', async () => {
    render(<PendingActions actions={[SCREEN_ACTION]} />)

    expect(await screen.findByText('Ouvrir tes partenaires')).toBeInTheDocument()
    expect(screen.queryByText('Action à valider')).not.toBeInTheDocument()
    expect(screen.queryByText(/Aucune écriture : ce clic ouvre un écran/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ouvrir l’écran/ })).toBeInTheDocument()
  })

  it('#3776.6 — un écran PAYANT garde sa carte « Action à valider »', async () => {
    render(<PendingActions actions={[{ ...SCREEN_ACTION, cost_credits: 3 }]} />)

    expect(await screen.findByText('Action à valider')).toBeInTheDocument()
  })

  it('#4129.1 / #4129.2 — la carte à valider est le bloc d’action de la bibliothèque, sans perdre la confirmation — et sans ligne de coût (#4463)', async () => {
    const { container } = render(<PendingActions actions={[{ ...SCREEN_ACTION, cost_credits: 3 }]} />)

    const block = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('[data-reply-action="pending"]')
      expect(found).not.toBeNull()
      return found!
    })
    expect(block).toHaveAccessibleName('Action à valider')
    expect(within(block).getByRole('region', { name: /Ce que cette action va faire/i })).not.toHaveTextContent(
      /Coût|crédit/i,
    )
    expect(screen.getAllByRole('button', { name: /Ouvrir l’écran/ })).toHaveLength(1)
    expect(block).toContainElement(screen.getByRole('button', { name: /Ouvrir l’écran/ }))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('ouvre l’écran au clic — aucune écriture, aucun appel réseau', async () => {
    render(<PendingActions actions={[SCREEN_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir l’écran/ }))

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(navigate.mock.calls[0][0]).toEqual({ to: '/accounts/partners' })
    expect(apiFetch).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  /**
   * #1933.8 / #1903.20 — le lien porte `?from=chat:<id>` quand l'appelant
   * connaît le fil source, pour que la page ouverte puisse offrir « Revenir à
   * la conversation ». Témoin voisin juste au-dessus (sans `conversationId`) :
   * la route reste inchangée, jamais un `from` deviné.
   */
  it('#1933.8 — porte le fil source dans le lien, quand il est connu', async () => {
    render(<PendingActions actions={[SCREEN_ACTION]} conversationId="thread-1" />)

    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir l’écran/ }))

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(navigate.mock.calls[0][0]).toEqual({ to: '/accounts/partners?from=chat:thread-1' })
  })

  it('REFUSE une route qui sortirait de l’application', async () => {
    // `route` traverse le modèle et rien ne la valide à l'exécution : une
    // redirection ouverte pilotée par un modèle n'est pas un défaut d'affichage.
    render(<PendingActions actions={[{ ...SCREEN_ACTION, route: '//ailleurs.example' }]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir l’écran/ }))

    await waitFor(() => expect(screen.getByText(/n'a pas pu être exécutée/)).toBeInTheDocument())
    expect(navigate).not.toHaveBeenCalled()
  })

  it('REFUSE une route qui reste dans l’application mais n’existe pas (#1778)', async () => {
    // Le trou que la version du 09/09 laissait ouvert : `/decouvrir` ne sort pas
    // du domaine, donc elle passait — et l'écran est `/discover`. Un clic
    // proposé par Laura menait à un 404, exactement comme `/messagerie` contre
    // `/mailbox` l'a déjà fait en production.
    render(<PendingActions actions={[{ ...SCREEN_ACTION, route: '/decouvrir' }]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir l’écran/ }))

    await waitFor(() => expect(screen.getByText(/n'a pas pu être exécutée/)).toBeInTheDocument())
    expect(navigate).not.toHaveBeenCalled()
  })

  it('ouvre le formulaire du vivier pré-rempli, et n’enregistre rien', async () => {
    render(<PendingActions actions={[CONSULTANT_ACTION]} />)

    expect(await screen.findByText(/Ouvrir une fiche consultant pré-remplie pour Claire Dubois/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir le formulaire/ }))

    // #1903.16 / #1903.7 — la carte n'ouvrait AVANT que `/consultants` : le
    // formulaire restait fermé et le nom dicté se perdait. `route` porte
    // maintenant `?new=1` (ouvre) ET `?name=` (préremplit) — vérifié contre le
    // routeur RÉEL (pas supposé) : `URLSearchParams` décode `+` en espace.
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(navigate.mock.calls[0][0]).toEqual({ to: '/consultants?new=true&name=Claire+Dubois' })
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('une action INCONNUE ne rend rien — elle ne casse pas la conversation', async () => {
    // Le filet, et il est nécessaire même avec la garde de croisement : la
    // prochaine action ajoutée côté Python arrivera dans un navigateur qui sert
    // encore l'ancien front. Ce dépôt a déjà payé cette fenêtre-là.
    render(
      <PendingActions actions={[{ action: 'un_outil_de_demain' } as unknown as PendingChatAction, SCREEN_ACTION]} />,
    )

    expect(await screen.findByText('Ouvrir tes partenaires')).toBeInTheDocument()
    // Une seule carte rendue : l'inconnue s'est tue, elle n'a pas jeté.
    expect(screen.getAllByRole('button', { name: /Ouvrir l’écran/ })).toHaveLength(1)
  })
})

/**
 * #1823 — LE NEUVIÈME LITTÉRAL, ET IL ÉCRIT (au clic, jamais au rendu).
 *
 * `chat_tools.py` émet désormais `toggle_routine` via `_proposal()` — la même
 * porte que les huit précédentes. `chat-actions-cross-language.test.ts` tient
 * la symétrie des noms ; ce fichier tient le COMPORTEMENT : la carte affiche
 * ce qu'elle va faire, et seul le clic appelle `PATCH /routines/:key`
 * (authentifié JWT, la route existante — pas une nouvelle porte).
 */
const TOGGLE_ON_ACTION: PendingChatAction = {
  action: 'toggle_routine',
  key: 'daily_briefing',
  label: 'Brief du matin',
  enabled: true,
  cost_credits: 0,
}

const TOGGLE_OFF_ACTION: PendingChatAction = {
  action: 'toggle_routine',
  key: 'weekly_recap',
  label: 'Récapitulatif de fin de semaine',
  enabled: false,
  cost_credits: 0,
}

describe('PendingActions — basculer une routine (#1823)', () => {
  it('affiche l’intention et n’appelle RIEN au rendu', async () => {
    render(<PendingActions actions={[TOGGLE_ON_ACTION]} />)

    expect(await screen.findByText('Activer Brief du matin')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activer' })).toBeInTheDocument()
    expect(updateRoutine).not.toHaveBeenCalled()
  })

  it('décrit la désactivation distinctement de l’activation', async () => {
    render(<PendingActions actions={[TOGGLE_OFF_ACTION]} />)

    expect(await screen.findByText('Désactiver Récapitulatif de fin de semaine')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeInTheDocument()
  })

  it('annonce ce qui est écrit, sans parler de crédit (#4463)', async () => {
    render(<PendingActions actions={[TOGGLE_ON_ACTION]} />)
    expect(await screen.findByText(/Change seulement ton abonnement/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview.textContent).toMatch(/abonnement à cette routine/)
  })

  it('appelle PATCH /routines/:key au clic — la route existante, pas une neuve', async () => {
    updateRoutine.mockResolvedValue({
      definition: { key: 'daily_briefing' },
      subscription: { key: 'daily_briefing', enabled: true, hour: 8, weekday: null, channel: 'in_app' },
      blockers: [],
      lastRunAt: null,
      lastOutcome: null,
    })
    render(<PendingActions actions={[TOGGLE_ON_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Activer' }))

    await waitFor(() => expect(updateRoutine).toHaveBeenCalledTimes(1))
    expect(updateRoutine).toHaveBeenCalledWith('daily_briefing', { enabled: true })
    expect(await screen.findByText(/Routine activée : Brief du matin/)).toBeInTheDocument()
    // Aucun autre chemin d'écriture n'est emprunté.
    expect(apiFetch).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('rapporte l’ÉTAT RÉEL renvoyé par le serveur, pas ce qui a été demandé', async () => {
    // Idempotence : deux clics sur « désactiver » renvoient tous deux
    // `enabled: false` — l'écran lit le serveur, jamais son propre optimisme.
    updateRoutine.mockResolvedValue({
      definition: { key: 'weekly_recap' },
      subscription: { key: 'weekly_recap', enabled: false, hour: 8, weekday: null, channel: 'in_app' },
      blockers: [],
      lastRunAt: null,
      lastOutcome: null,
    })
    render(<PendingActions actions={[TOGGLE_OFF_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Désactiver' }))

    expect(await screen.findByText(/Routine désactivée : Récapitulatif de fin de semaine/)).toBeInTheDocument()
  })

  it('un échec de bascule est dit, jamais maquillé en succès', async () => {
    updateRoutine.mockRejectedValue(new Error('boom'))
    render(<PendingActions actions={[TOGGLE_ON_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Activer' }))

    expect(await screen.findByText(/n'a pas pu être exécutée/)).toBeInTheDocument()
  })

  it('une clé sans libellé retombe sur un texte honnête, jamais vide', async () => {
    render(<PendingActions actions={[{ ...TOGGLE_ON_ACTION, label: null }]} />)
    expect(await screen.findByText('Activer cette routine')).toBeInTheDocument()
  })

  /**
   * #1822 — L'HEURE, LE JOUR ET LE CANAL passent par la MÊME carte.
   *
   * Le lot 12 renvoyait vers l'écran pour ces trois-là ; Louis a tranché
   * l'inverse. Ce qui compte ici : le clic n'envoie QUE ce qui change (un patch
   * partiel, comme l'écran de réglages lui-même), et la carte ANNONCE le
   * nouvel horaire avant le clic — sinon « Appliquer » demande de faire
   * confiance à une phrase de conversation déjà défilée.
   */
  it('porte l’horaire et le canal dans le patch — et seulement ce qui change', async () => {
    updateRoutine.mockResolvedValue({
      definition: { key: 'weekly_recap' },
      subscription: { key: 'weekly_recap', enabled: true, hour: 18, weekday: 4, channel: 'email' },
      blockers: [],
      lastRunAt: null,
      lastOutcome: null,
    })
    render(
      <PendingActions
        actions={[{ ...TOGGLE_ON_ACTION, key: 'weekly_recap', hour: 18, weekday: 4, channel: 'email' }]}
      />,
    )

    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview.textContent).toMatch(/18\s*h/)
    expect(preview.textContent).toMatch(/jeudi/i)
    expect(preview.textContent).toMatch(/par e-mail/)

    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await waitFor(() => expect(updateRoutine).toHaveBeenCalledTimes(1))
    expect(updateRoutine).toHaveBeenCalledWith('weekly_recap', {
      enabled: true,
      hour: 18,
      weekday: 4,
      channel: 'email',
    })
  })

  it('sans horaire ni canal, le patch reste celui d’avant — aucun champ inventé', async () => {
    // Témoin du cas voisin : une bascule simple ne doit pas se mettre à
    // envoyer `hour: undefined` ni un canal par défaut, qui ÉCRASERAIT le
    // réglage de la personne au passage.
    updateRoutine.mockResolvedValue({
      definition: { key: 'daily_briefing' },
      subscription: { key: 'daily_briefing', enabled: true, hour: 8, weekday: null, channel: 'in_app' },
      blockers: [],
      lastRunAt: null,
      lastOutcome: null,
    })
    render(<PendingActions actions={[TOGGLE_ON_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Activer' }))
    await waitFor(() => expect(updateRoutine).toHaveBeenCalledTimes(1))
    expect(updateRoutine).toHaveBeenCalledWith('daily_briefing', { enabled: true })
  })
})

/**
 * LOT 16 (#1822) — Laura ÉCRIT dans les réglages, avec confirmation.
 *
 * Même patron que `toggle_routine` ci-dessus : la carte affiche l'ancienne et
 * la nouvelle valeur, et seul le clic écrit — par la MÊME route authentifiée
 * que l'écran de réglages (`PATCH /notifications/preferences`,
 * `PUT /pipeline/stage-sla/:stage`), jamais une porte neuve.
 */
const NOTIFICATION_SETTING_ACTION: PendingChatAction = {
  action: 'update_setting',
  screen: '/settings/notifications',
  field: 'buy_signals',
  field_label: 'Alerte de signaux d’achat détectés',
  old_value: true,
  new_value: false,
  cost_credits: 0,
}

const PIPELINE_SETTING_ACTION: PendingChatAction = {
  action: 'update_setting',
  screen: '/settings/pipeline',
  field: 'negotiation',
  field_label: 'Négociation',
  old_value: 21,
  new_value: 30,
  cost_credits: 0,
}

describe('PendingActions — changer un réglage (Lot 16, #1822)', () => {
  it('affiche l’ancienne et la nouvelle valeur, et n’appelle RIEN au rendu', async () => {
    render(<PendingActions actions={[NOTIFICATION_SETTING_ACTION]} />)

    expect(await screen.findByText('Changer « Alerte de signaux d’achat détectés »')).toBeInTheDocument()
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview.textContent).toMatch(/Activé/)
    expect(preview.textContent).toMatch(/Désactivé/)
    expect(updateNotificationPreferences).not.toHaveBeenCalled()
    expect(setStageSla).not.toHaveBeenCalled()
  })

  it('un réglage de notification écrit via PATCH /notifications/preferences au clic', async () => {
    updateNotificationPreferences.mockResolvedValue({})
    render(<PendingActions actions={[NOTIFICATION_SETTING_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Appliquer' }))

    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledTimes(1))
    expect(updateNotificationPreferences).toHaveBeenCalledWith({ buy_signals: false })
    expect(await screen.findByText(/Réglage mis à jour/)).toBeInTheDocument()
    // Aucun autre chemin d'écriture n'est emprunté.
    expect(setStageSla).not.toHaveBeenCalled()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('un réglage de pipe écrit via PUT /pipeline/stage-sla/:stage au clic', async () => {
    setStageSla.mockResolvedValue({ items: [] })
    render(<PendingActions actions={[PIPELINE_SETTING_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Appliquer' }))

    await waitFor(() => expect(setStageSla).toHaveBeenCalledTimes(1))
    expect(setStageSla).toHaveBeenCalledWith('negotiation', 30)
    expect(updateNotificationPreferences).not.toHaveBeenCalled()
  })

  it('un écran que ce front ne sait pas encore écrire échoue proprement, sans appel', async () => {
    render(<PendingActions actions={[{ ...NOTIFICATION_SETTING_ACTION, screen: '/settings/branding' }]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Appliquer' }))

    expect(await screen.findByText(/n'a pas pu être exécutée/)).toBeInTheDocument()
    expect(updateNotificationPreferences).not.toHaveBeenCalled()
    expect(setStageSla).not.toHaveBeenCalled()
  })

  it('un échec d’écriture est dit, jamais maquillé en succès', async () => {
    updateNotificationPreferences.mockRejectedValue(new Error('boom'))
    render(<PendingActions actions={[NOTIFICATION_SETTING_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Appliquer' }))

    expect(await screen.findByText(/n'a pas pu être exécutée/)).toBeInTheDocument()
  })

  it('un champ sans libellé retombe sur un texte honnête, jamais vide', async () => {
    render(<PendingActions actions={[{ ...NOTIFICATION_SETTING_ACTION, field_label: null }]} />)
    expect(await screen.findByText('Changer « ce réglage »')).toBeInTheDocument()
  })
})

/**
 * #1793 (Lot 16) — « lui poser un gros pavé de contexte ».
 *
 * Le clic écrit par la MÊME route que le pin manuel de Réglages › Mémoire
 * (`POST /memory/facts`) — jamais une table neuve.
 */
const PIN_FACT_ACTION: PendingChatAction = {
  action: 'pin_memory_fact',
  fact: 'Compter six semaines de cycle de vente sur ce secteur.',
  cost_credits: 0,
}

describe('PendingActions — épingler un fait (#1793)', () => {
  it('affiche le texte à retenir et n’appelle RIEN au rendu', async () => {
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)

    expect(await screen.findByText('Épingler ce que tu as compris dans ta mémoire')).toBeInTheDocument()
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview.textContent).toContain('Compter six semaines de cycle de vente sur ce secteur.')
    expect(pinMemoryFact).not.toHaveBeenCalled()
  })

  // #2258.4 — la carte montre la donnée AVANT (rien n'est encore épinglé sur ce
  // sujet, l'outil n'écrit jamais par-dessus une ligne existante) ET APRÈS
  // (le fait proposé), pas seulement l'après.
  it('montre l’état avant (rien) et après (le fait proposé) — #2258.4', async () => {
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)

    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview.textContent).toContain('Avant')
    expect(preview.textContent).toContain('Rien n’est encore épinglé sur ce sujet.')
    expect(preview.textContent).toContain(PIN_FACT_ACTION.fact)
  })

  it('épingle via POST /memory/facts au clic, avec origin « copilot » et la portée « toi uniquement » par défaut', async () => {
    pinMemoryFact.mockResolvedValue({ id: 'f-1', fact: PIN_FACT_ACTION.fact })
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Épingler' }))

    await waitFor(() => expect(pinMemoryFact).toHaveBeenCalledTimes(1))
    expect(pinMemoryFact).toHaveBeenCalledWith({
      fact: PIN_FACT_ACTION.fact,
      accountId: null,
      origin: 'copilot',
      scope: 'user',
      // #1918.2 / #1918.5 — rien n'est DÉSIGNÉ : ni périmètre, ni fil.
      businessUnitId: null,
      conversationId: null,
      // #1917.6 — l'échéance part TOUJOURS, `null` tant que personne n'en a
      // choisi une : « sans échéance » est une réponse, pas un champ absent.
      expiresAt: null,
    })
    // #1917 — « après validation », la carte dit POUR QUI c'est enregistré.
    expect(await screen.findByText('Épinglé pour toi uniquement.')).toBeInTheDocument()
  })

  it('#1901.10 — après l’épinglage, la mémoire affichée ailleurs se relit (clé `memory` invalidée)', async () => {
    pinMemoryFact.mockResolvedValue({ id: 'f-1', fact: PIN_FACT_ACTION.fact })
    invalidateQueries.mockClear()
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Épingler' }))

    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['memory'] }))
  })

  it('#1901.10 — un épinglage REFUSÉ n’invalide rien (témoin)', async () => {
    pinMemoryFact.mockRejectedValue(new Error('boom'))
    invalidateQueries.mockClear()
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Épingler' }))

    await waitFor(() => expect(pinMemoryFact).toHaveBeenCalled())
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  /**
   * #1917.3 / #1917.4 / #1918.9 — la PORTÉE est demandée AVANT le clic, et la
   * carte dit QUI pourra le voir. Décision de Louis (12/09) : défaut « moi ».
   */
  it('demande la portée AVANT le clic — « Toi uniquement » coché par défaut — et dit qui pourra le voir', async () => {
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)

    expect(await screen.findByRole('radio', { name: 'Toi uniquement' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Toute ton ESN' })).not.toBeChecked()
    expect(screen.getByText(/Visible par toi uniquement/)).toBeInTheDocument()
    expect(pinMemoryFact).not.toHaveBeenCalled()
  })

  it('choisir « Toute ton ESN » change la phrase de visibilité ET épingle pour l’espace', async () => {
    pinMemoryFact.mockResolvedValue({ id: 'f-3', fact: PIN_FACT_ACTION.fact })
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)

    fireEvent.click(await screen.findByRole('radio', { name: 'Toute ton ESN' }))
    expect(screen.getByText(/Visible par tous les membres de ton espace/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Épingler' }))

    await waitFor(() => expect(pinMemoryFact).toHaveBeenCalledTimes(1))
    expect(pinMemoryFact).toHaveBeenCalledWith(expect.objectContaining({ scope: 'workspace' }))
    expect(await screen.findByText(/Épinglé pour toute ton ESN/)).toBeInTheDocument()
  })

  it('porte le fait à UN compte quand account_id est donné — et reste « toi uniquement » (ce n’est pas une correction)', async () => {
    pinMemoryFact.mockResolvedValue({ id: 'f-2', fact: PIN_FACT_ACTION.fact })
    render(<PendingActions actions={[{ ...PIN_FACT_ACTION, account_id: 'acc-9' }]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Épingler' }))

    await waitFor(() => expect(pinMemoryFact).toHaveBeenCalledTimes(1))
    expect(pinMemoryFact).toHaveBeenCalledWith(
      expect.objectContaining({ fact: PIN_FACT_ACTION.fact, accountId: 'acc-9', scope: 'user' }),
    )
  })

  it('un échec d’épinglage est dit, jamais maquillé en succès', async () => {
    pinMemoryFact.mockRejectedValue(new Error('boom'))
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Épingler' }))

    expect(await screen.findByText(/n'a pas pu être exécutée/)).toBeInTheDocument()
  })
})

// #1926.28-.31, #1925 — la carte Action OS affiche le MÊME brouillon que le
// composer de fiche contact, issu du même appel `/ia/message`. Elle en montre
// la matière (raison, données utilisées, angle alternatif, avertissement
// générique, brief manquant) en LECTURE SEULE : aucun bouton de régénération
// ici — Action OS réécrit son propre geste de confirmation ailleurs, hors du
// périmètre de cet écran.
describe('PendingActions — pourquoi ce message (#1926.28-.31, #1925)', () => {
  it('affiche la raison, les données utilisées, l’angle alternatif et le brief manquant', async () => {
    apiFetch.mockResolvedValue({
      success: true,
      data: {
        subject: 'Votre migration',
        body: 'Bonjour Claire,',
        rationale: 'Le compte a récemment recruté sur la cybersécurité.',
        alternativeAngle: 'Le renouvellement du contrat cloud.',
        brief: { missing: ['persona'] },
        specificity: {
          status: 'specifique',
          count: 2,
          minimum: 2,
          elements: [{ kind: 'precise_contact', value: 'Claire Dubois' }],
          unavailable: [],
        },
        toneOptions: [{ id: 'tutoiement', instruction: 'tutoiement' }],
      },
    })
    render(<PendingActions actions={[MESSAGE_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Préparer le message/ }))
    await screen.findByText('Bonjour Claire,')

    fireEvent.click(screen.getByRole('button', { name: 'Pourquoi ce message' }))
    expect(screen.getByText('Le compte a récemment recruté sur la cybersécurité.')).toBeInTheDocument()
    expect(screen.getByText('Claire Dubois')).toBeInTheDocument()
    expect(screen.getByText(/Le renouvellement du contrat cloud\./)).toBeInTheDocument()
    expect(screen.getByText(/le niveau hiérarchique du contact/)).toBeInTheDocument()

    // Lecture seule : aucun bouton de régénération sur cette carte.
    expect(screen.queryByRole('button', { name: 'Utiliser cet angle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tutoiement' })).not.toBeInTheDocument()
  })

  it('avertit sur un brouillon générique', async () => {
    apiFetch.mockResolvedValue({
      success: true,
      data: {
        subject: 'Votre migration',
        body: 'Bonjour Claire,',
        specificity: { status: 'generique', count: 0, minimum: 2, elements: [], unavailable: [] },
      },
    })
    render(<PendingActions actions={[MESSAGE_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Préparer le message/ }))

    expect(await screen.findByText('Message peu personnalisé')).toBeInTheDocument()
  })

  it('ne casse rien et n’affiche aucun bloc sur une réponse d’API ancienne', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Votre migration', body: 'Bonjour Claire,' } })
    render(<PendingActions actions={[MESSAGE_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Préparer le message/ }))

    await screen.findByText('Bonjour Claire,')
    expect(screen.queryByRole('button', { name: 'Pourquoi ce message' })).not.toBeInTheDocument()
  })
})

/**
 * D1 — décision Louis 14/09/2026 : PROPOSER UNE ANALYSE EST UNE CARTE.
 *
 * Mesuré en production le 14/09 à 15:56 : « Propose-moi de lancer une analyse sur
 * un compte de mon portefeuille qui la mérite. Ne lance rien, propose seulement. »
 * rendait de la PROSE — « Proposition d'analyse — THALES », deux options, huit
 * crédits, le statut du compte. Tout y était sauf le geste.
 *
 * ⚠️ L'antériorité du 05/09 reste entière : « go » en conversation lance toujours
 * (le service IA garde le jeton et les questions lisibles). La carte s'AJOUTE.
 */
const ANALYSIS_ACTION: PendingChatAction = {
  action: 'start_account_analysis',
  company: 'THALES',
  account_id: null,
  analysed_at: null,
  plan_token: 'plan-token-abc',
  preset: 'free',
  reason: 'Trois offres DSI publiées ce mois-ci.',
  cost_credits: 8,
  credits_left: 40,
  credits_left_after: 32,
}

describe('D1 — la carte « Lancer l’analyse »', () => {
  it('annonce le geste SANS coût ni solde — et n’appelle RIEN au rendu (#4463)', async () => {
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)

    expect(await screen.findByText(/Lancer l'analyse de THALES/)).toBeInTheDocument()
    // #4463 — l'action porte `cost_credits: 8` / `credits_left: 40` ; l'écran ne dit ni l'un ni l'autre.
    expect(screen.queryByText(/crédit|il t'en restera|\b8\b|\b32\b/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lancer l'analyse/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ignorer/ })).toBeInTheDocument()
    // La raison de Laura, telle qu'elle l'a écrite — présentée comme sa phrase.
    expect(screen.getByText(/Trois offres DSI publiées ce mois-ci/)).toBeInTheDocument()
    // Le statut du dossier, dit plutôt que deviné.
    expect(screen.getByText(/Jamais analysé/)).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  /**
   * #1957.1 / #1957.2 — le coût ET la durée approximative sont déjà là AVANT
   * le clic qui lance vraiment l'analyse (celui qui débite) : verrou de
   * non-régression, la garantie ne doit jamais glisser derrière le clic.
   */
  it('#1957.2 / #4463 — la durée approximative est dite AVANT le clic, et plus le coût', async () => {
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)

    await screen.findByRole('button', { name: /Lancer l'analyse/ })
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Compte 3 à 6 minutes/)).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  /**
   * #1957.3 — le nombre de sources/objets visés, sur la MÊME carte que le
   * coût. Absent par défaut (`ANALYSIS_ACTION` ne le porte pas) : aucune
   * ligne, jamais un « 0 ».
   */
  it('#1957.3 — le nombre d’objets visés apparaît QUAND le pont l’a mesuré, jamais sinon', async () => {
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)
    await screen.findByRole('button', { name: /Lancer l'analyse/ })
    expect(screen.queryByText(/contact déjà connu|contacts déjà connus/)).not.toBeInTheDocument()
  })

  it('#1957.3 — affiche le nombre mesuré', async () => {
    render(<PendingActions actions={[{ ...ANALYSIS_ACTION, objects_count: 12 }]} />)
    await screen.findByRole('button', { name: /Lancer l'analyse/ })
    expect(screen.getByText('12 contacts déjà connus')).toBeInTheDocument()
  })

  it('le clic — et lui seul — lance l’analyse par la route de l’écran', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acc-1', launched: true })
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Lancer l'analyse/ }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch.mock.calls[0][0]).toMatchObject({
      path: '/analysis/start',
      method: 'POST',
      body: { company_name: 'THALES' },
    })
    expect(await screen.findByText(/est lancée/)).toBeInTheDocument()
  })

  it('#4667 — une analyse lancée d’ici apparaît dans « Mes analyses » : la liste des comptes est invalidée', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acc-1', launched: true })
    invalidateQueries.mockClear()
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Lancer l'analyse/ }))

    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['accounts'] }))
  })

  it('#4667 — sait dire NON : un dossier déjà frais ne lance rien, donc n’invalide rien', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acc-1', launched: false, reason: 'cache_hit' })
    invalidateQueries.mockClear()
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Lancer l'analyse/ }))

    await screen.findByText(/rien n’a été relancé/)
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['accounts'] })
  })

  it('un dossier déjà frais est DIT, jamais maquillé en lancement', async () => {
    // Le serveur court-circuite : rien n'a été enqueué, donc rien n'a été débité.
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acc-1', launched: false, reason: 'cache_hit' })
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Lancer l'analyse/ }))

    expect(
      await screen.findByText(/Un dossier récent existait déjà pour THALES : rien n’a été relancé\./),
    ).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
  })

  it('sans préparation, pas de lancement — le jeton est la preuve qu’un plan existe', async () => {
    const { plan_token: _dropped, ...sansJeton } = ANALYSIS_ACTION
    render(<PendingActions actions={[{ ...sansJeton, plan_token: '' } as PendingChatAction]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Lancer l'analyse/ }))

    await waitFor(() => expect(screen.getByText(/n'a pas abouti|Prépare/i)).toBeInTheDocument())
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('un coût que le serveur n’a pas dit ne s’écrit pas non plus : ni « coût inconnu », ni « 0 crédit » (#4463)', async () => {
    const { cost_credits: _c, credits_left: _l, credits_left_after: _a, ...sansChiffres } = ANALYSIS_ACTION
    render(<PendingActions actions={[sansChiffres as PendingChatAction]} />)

    expect(await screen.findByText(/Lancer l'analyse de THALES/)).toBeInTheDocument()
    expect(screen.queryByText(/il t'en restera|coût inconnu|crédit/i)).not.toBeInTheDocument()
  })

  it('un dossier existant est daté — « déjà analysé le … », jamais une date devinée', async () => {
    render(
      <PendingActions
        actions={[{ ...ANALYSIS_ACTION, account_id: 'acc-1', analysed_at: '2026-03-02T10:00:00.000Z' }]}
      />,
    )
    expect(await screen.findByText(/Analysé le/)).toBeInTheDocument()
  })

  // #1931.9 — un refus laisse une trace « Refusée », il ne fait plus
  // disparaître la carte (voir la description centrale du même comportement,
  // plus haut dans ce fichier).
  it('« Ignorer » laisse une trace « Refusée » sans rien lancer', async () => {
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Ignorer/ }))
    expect(await screen.findByText('Refusée')).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  /**
   * #1957.4 — AVANT une demande lourde, un raccourci propose de limiter le
   * périmètre. Réutilise le SEUL sélecteur du produit (`ScopeDialog`, ouvert
   * par `onOpenScope` — celui de l'en-tête, GA-26) : aucun second sélecteur
   * n'est créé ici, ce bouton se contente de l'ouvrir.
   */
  it('#1957.4 — sur un périmètre large, propose de le limiter avant de lancer l’analyse', async () => {
    const onOpenScope = vi.fn()
    render(<PendingActions actions={[ANALYSIS_ACTION]} scope={{ kind: 'portfolio' }} onOpenScope={onOpenScope} />)

    const shortcut = await screen.findByRole('button', { name: /Limiter/ })
    fireEvent.click(shortcut)
    expect(onOpenScope).toHaveBeenCalledTimes(1)
    // Le clic sur le raccourci n'est PAS le clic sur « Lancer l'analyse » :
    // ouvrir le sélecteur n'engage aucun crédit.
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('#1957.4 — un périmètre déjà scopé sur un compte ne propose rien : il n’y a rien à limiter', async () => {
    render(
      <PendingActions
        actions={[ANALYSIS_ACTION]}
        scope={{ kind: 'account', accountId: 'acc-1' }}
        onOpenScope={vi.fn()}
      />,
    )
    await screen.findByRole('button', { name: /Lancer l'analyse/ })
    expect(screen.queryByRole('button', { name: /Limiter/ })).not.toBeInTheDocument()
  })

  it('#1957.4 — sans périmètre connu (ancien appelant), le raccourci ne s’invente pas', async () => {
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)
    await screen.findByRole('button', { name: /Lancer l'analyse/ })
    expect(screen.queryByRole('button', { name: /Limiter/ })).not.toBeInTheDocument()
  })
})

/**
 * #2729 — UNE ANALYSE LANCÉE DEPUIS /chat DOIT S'ANNONCER LÀ OÙ ELLE A ÉTÉ
 * LANCÉE, PAS SEULEMENT SUR LA FICHE DU COMPTE.
 *
 * Mesuré le 22/09/2026 : le clic sur cette carte appelait bien
 * `POST /analysis/start`, mais n'inscrivait jamais le run dans
 * `analysisStore` — le magasin PARTAGÉ que `/search`, la fiche de compte et la
 * pastille « Tâches de fond » (visible sur TOUS les écrans, y compris /chat,
 * dans l'en-tête de la barre latérale) lisent tous. Une analyse lancée depuis
 * /chat qui se bloquait ou échouait ne remontait donc NULLE PART tant qu'on ne
 * rouvrait pas la fiche du compte à la main.
 */
describe('D1 — #2729 le lancement depuis /chat entre dans le magasin partagé', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
  })

  it('un lancement RÉEL (launched: true) inscrit le run dans analysisStore, comme /search', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acc-1', launched: true })
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Lancer l'analyse/ }))

    await waitFor(() => expect(useAnalysisStore.getState().runs['acc-1']).toBeDefined())
    expect(useAnalysisStore.getState().runs['acc-1']).toMatchObject({
      jobId: 'job-1',
      accountId: 'acc-1',
      companyName: 'THALES',
    })
  })

  it('un run DÉJÀ en vol (in_flight) est ADOPTÉ sans réinitialiser sa progression', async () => {
    // Un onglet a déjà avancé ce run à 75 % ; le clic sur la carte /chat
    // rejoint le MÊME run côté serveur (`reason: 'in_flight'`). `start()`
    // écraserait la position réelle par « Lancement de l'analyse — 0% » —
    // exactement le défaut qu'`adopt()` existe pour éviter (voir
    // `analysisStore.ts`).
    useAnalysisStore.getState().start('acc-1', 'job-0', 'THALES')
    useAnalysisStore.getState().setProgress('acc-1', { percent: 75, phase: 'classification' })
    apiFetch.mockResolvedValue({ jobId: 'job-0', accountId: 'acc-1', launched: true, reason: 'in_flight' })
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Lancer l'analyse/ }))

    await screen.findByText(/est lancée/)
    expect(useAnalysisStore.getState().runs['acc-1'].percent).toBe(75)
  })

  it('un dossier déjà frais (launched: false) n’ajoute AUCUN run à suivre', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acc-1', launched: false, reason: 'cache_hit' })
    render(<PendingActions actions={[ANALYSIS_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Lancer l'analyse/ }))

    await screen.findByText(/Un dossier récent existait déjà pour THALES/)
    expect(useAnalysisStore.getState().runs['acc-1']).toBeUndefined()
  })
})

/**
 * #1995 — LA CARTE QUI CRÉE LA FICHE D'UNE PERSONNE CONNUE DU SEUL CRM.
 *
 * Mesuré en production le 14/09/2026 : Sandrine Pata est citée par le CRM
 * connecté sur THALES, le compte porte 2 027 fiches Bellum, aucune « Pata ».
 * Laura renvoyait vers une fiche qui n'existe pas, et le rappel restait
 * impossible faute d'identifiant.
 */
describe('#1995 — créer la fiche d’un contact connu du seul CRM', () => {
  const CREATE_ACTION: PendingChatAction = {
    action: 'create_contact_from_crm',
    account_id: 'acc-1',
    company: 'THALES',
    full_name: 'Sandrine Pata',
    job_title: 'Directrice des achats',
    email: 'sandrine.pata@example.com',
    crm_reference: 'crm-42',
    cost_credits: 0,
  }

  it('montre les champs AVANT le clic, et n’appelle rien', async () => {
    render(<PendingActions actions={[CREATE_ACTION]} />)
    expect(await screen.findByText(/Créer la fiche Bellum de Sandrine Pata/)).toBeInTheDocument()
    expect(screen.getByText('Directrice des achats')).toBeInTheDocument()
    expect(screen.getByText('sandrine.pata@example.com')).toBeInTheDocument()
    expect(screen.getByText(/une ligne de ton CRM/)).toBeInTheDocument()
    expect(createFromCrm).not.toHaveBeenCalled()
  })

  it('le clic crée la fiche et donne le chemin vers elle', async () => {
    createFromCrm.mockResolvedValueOnce({ status: 'created', contact_id: 'c-new' })
    render(<PendingActions actions={[CREATE_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Créer la fiche/ }))

    await waitFor(() => expect(screen.getByText(/Fiche créée pour Sandrine Pata/)).toBeInTheDocument())
    expect(createFromCrm).toHaveBeenCalledWith('acc-1', {
      full_name: 'Sandrine Pata',
      title: 'Directrice des achats',
      email: 'sandrine.pata@example.com',
      crm_reference: 'crm-42',
    })
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la fiche/ }))
    expect(navigate).toHaveBeenCalledWith({ to: '/contacts/$id', params: { id: 'c-new' } })
  })

  it('SAIT DIRE NON — une ambiguïté ne crée rien et ne fusionne rien', async () => {
    createFromCrm.mockResolvedValueOnce({ status: 'ambiguous', matches: 2 })
    render(<PendingActions actions={[CREATE_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Créer la fiche/ }))

    await waitFor(() => expect(screen.getByText(/rien n'est créé ni fusionné/i)).toBeInTheDocument())
    // Pas de lien : il n'y a pas UNE fiche à ouvrir, c'est tout le problème.
    expect(screen.queryByRole('button', { name: /Ouvrir la fiche/ })).not.toBeInTheDocument()
  })

  it('une fiche qui existait déjà le DIT — rien n’est créé en double', async () => {
    createFromCrm.mockResolvedValueOnce({ status: 'duplicate', contact_id: 'c-9' })
    render(<PendingActions actions={[CREATE_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Créer la fiche/ }))

    await waitFor(() => expect(screen.getByText(/avait déjà une fiche/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Ouvrir la fiche/ })).toBeInTheDocument()
  })

  it('N’AFFICHE PAS une ligne pour un champ absent — jamais un « — » qui se lirait « pas d’e-mail »', async () => {
    const {
      job_title: _j,
      email: _e,
      crm_reference: _r,
      ...minimal
    } = CREATE_ACTION as Extract<PendingChatAction, { action: 'create_contact_from_crm' }>
    render(<PendingActions actions={[minimal as PendingChatAction]} />)
    expect(await screen.findByText(/Créer la fiche Bellum de Sandrine Pata/)).toBeInTheDocument()
    expect(screen.queryByText('Poste')).not.toBeInTheDocument()
    expect(screen.queryByText('E-mail')).not.toBeInTheDocument()
  })

  it('le rappel n’est PAS enchaîné — deux propositions, deux validations', async () => {
    createFromCrm.mockResolvedValueOnce({ status: 'created', contact_id: 'c-new' })
    render(<PendingActions actions={[CREATE_ACTION]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Créer la fiche/ }))
    await waitFor(() => expect(screen.getByText(/Fiche créée pour Sandrine Pata/)).toBeInTheDocument())
    expect(dispatch).not.toHaveBeenCalled()
  })
})

/**
 * Épopée #2853 (#2157.1) — « Créer une cible » depuis Laura : la même
 * capacité que le dossier compte (`useCreateTargetFromAccount.ts`,
 * #2164.44), accessible depuis la conversation.
 */
describe('Épopée #2853 (#2157.1) — créer une cible depuis Laura', () => {
  const CREATE_TARGET_ACTION: PendingChatAction = {
    action: 'create_target_list_from_account',
    account_id: 'acc-renault',
    company: 'RENAULT',
    name: null,
    cost_credits: 0,
  }

  it('montre le compte AVANT le clic, et n’appelle rien', async () => {
    render(<PendingActions actions={[CREATE_TARGET_ACTION]} />)
    expect(await screen.findByText(/Créer une cible \(RENAULT\)/)).toBeInTheDocument()
    expect(createTargetList).not.toHaveBeenCalled()
    expect(addTargetListItem).not.toHaveBeenCalled()
  })

  it('le clic crée la liste PUIS y ajoute le compte, avec la provenance Laura', async () => {
    createTargetList.mockResolvedValueOnce({ id: 'list-1', name: 'Cible — RENAULT' })
    addTargetListItem.mockResolvedValueOnce({ id: 'item-1' })
    render(<PendingActions actions={[CREATE_TARGET_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Créer la cible/ }))

    await waitFor(() => expect(screen.getByText(/Liste « Cible — RENAULT » créée/)).toBeInTheDocument())
    expect(createTargetList).toHaveBeenCalledWith({ name: 'Cible — RENAULT', source: 'laura' })
    expect(addTargetListItem).toHaveBeenCalledWith('list-1', {
      kind: 'account',
      ref_id: 'acc-renault',
      provenance: 'laura',
    })
  })

  it('un nom demandé dans la conversation est repris tel quel, jamais le générique', async () => {
    createTargetList.mockResolvedValueOnce({ id: 'list-2', name: 'Grands comptes IDF' })
    addTargetListItem.mockResolvedValueOnce({ id: 'item-2' })
    render(<PendingActions actions={[{ ...CREATE_TARGET_ACTION, name: 'Grands comptes IDF' }]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Créer la cible/ }))

    await waitFor(() => expect(createTargetList).toHaveBeenCalledWith({ name: 'Grands comptes IDF', source: 'laura' }))
  })
})

/**
 * Épopée #2781 (#2150.30, LOT j1 26/09) — « Ajouter au portefeuille » depuis
 * Laura : la MÊME porte que #2150.32 (CRM) et #2150.42 (recherche globale),
 * `POST /accounts/portfolio` (`accountsApi.addToPortfolio`) — tranché sans
 * Louis : uniformité plutôt qu'un régime à part.
 */
describe('Épopée #2781 (#2150.30) — ajouter au portefeuille depuis Laura', () => {
  const ADD_TO_PORTFOLIO_ACTION: PendingChatAction = {
    action: 'add_account_to_portfolio',
    company_name: 'OGF',
    cost_credits: 0,
  }

  it('montre l’entreprise AVANT le clic, et n’appelle rien', async () => {
    render(<PendingActions actions={[ADD_TO_PORTFOLIO_ACTION]} />)
    expect(await screen.findByText(/Ajouter au portefeuille \(OGF\)/)).toBeInTheDocument()
    expect(addAccountToPortfolio).not.toHaveBeenCalled()
  })

  it('le clic appelle POST /accounts/portfolio, avec les identifiants connus', async () => {
    addAccountToPortfolio.mockResolvedValueOnce({ id: 'acc-1', company_name: 'OGF', siren: null, created: true })
    render(
      <PendingActions
        actions={[{ ...ADD_TO_PORTFOLIO_ACTION, siren: '123456789', sector: 'Funéraire', website: 'ogf.fr' }]}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: /Ajouter au portefeuille/ }))

    await waitFor(() =>
      expect(addAccountToPortfolio).toHaveBeenCalledWith({
        company_name: 'OGF',
        siren: '123456789',
        sector: 'Funéraire',
        website: 'ogf.fr',
      }),
    )
    await waitFor(() => expect(screen.getByText(/OGF ajouté à ton portefeuille/)).toBeInTheDocument())
  })

  it('sans identifiant facultatif, seul le nom part', async () => {
    addAccountToPortfolio.mockResolvedValueOnce({ id: 'acc-2', company_name: 'OGF', siren: null, created: true })
    render(<PendingActions actions={[ADD_TO_PORTFOLIO_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Ajouter au portefeuille/ }))

    await waitFor(() => expect(addAccountToPortfolio).toHaveBeenCalledWith({ company_name: 'OGF' }))
  })
})

/**
 * #2987.56 (épopée #2987) — « Valider/refuser une note de frais » depuis
 * Laura : la MÊME porte que l'écran (`POST /expenses/reports/:id/
 * validate|reject`) — aucun second chemin d'écriture. « Confirmation vocale
 * seule insuffisante pour une dépense importante » (#2434) tenue par
 * construction : le clic reste le seul déclencheur, la carte ne fait rien
 * toute seule.
 */
describe('#2987.56 — décider une note de frais depuis Laura', () => {
  const DECIDE_ACTION: PendingChatAction = {
    action: 'decide_expense_report',
    expense_report_id: 'report-1',
    decision: 'validate',
    reference: 'NF-2026-014',
    bearer_name: 'Julie Martin',
    account_name: 'Orange',
    period_month: '2026-09',
    reason: null,
    cost_credits: 0,
  }

  it('montre le porteur AVANT le clic, et n’appelle rien', async () => {
    render(<PendingActions actions={[DECIDE_ACTION]} />)
    expect(await screen.findByText(/valider cette note de frais/)).toBeInTheDocument()
    expect(validateExpenseReport).not.toHaveBeenCalled()
    expect(rejectExpenseReport).not.toHaveBeenCalled()
  })

  it('le clic sur « valider » appelle POST /expenses/reports/:id/validate, jamais reject', async () => {
    validateExpenseReport.mockResolvedValueOnce({ id: 'report-1' })
    render(<PendingActions actions={[DECIDE_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Appliquer la décision/ }))

    await waitFor(() => expect(validateExpenseReport).toHaveBeenCalledWith('report-1'))
    expect(rejectExpenseReport).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText(/Note de frais validée/)).toBeInTheDocument())
  })

  it('le clic sur « refuser » appelle reject AVEC le motif, jamais validate', async () => {
    rejectExpenseReport.mockResolvedValueOnce({ id: 'report-1' })
    render(<PendingActions actions={[{ ...DECIDE_ACTION, decision: 'reject', reason: 'Justificatif illisible' }]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Appliquer la décision/ }))

    await waitFor(() => expect(rejectExpenseReport).toHaveBeenCalledWith('report-1', 'Justificatif illisible'))
    expect(validateExpenseReport).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText(/Note de frais refusée/)).toBeInTheDocument())
  })
})

/**
 * #3345.2 (LAU-FINAL-255, moitié écriture) — « Laura propose d'écarter une piste
 * reconnue périmée » : le clic emprunte la MÊME route que l'écran Opportunités
 * (`POST /accounts/:id/qualification-leads/:leadKey/decision`) — aucun second
 * chemin d'écriture, et la carte ne fait rien toute seule.
 */
describe('#3345.2 — écarter une piste à qualifier depuis Laura', () => {
  const DISMISS: PendingChatAction = {
    action: 'decide_qualification_lead',
    account_id: 'acc-1',
    account_name: 'Decathlon',
    lead_key: 'lead-1',
    lead_label: 'Refonte data',
    decision: 'dismissed',
    reason: 'no_real_demand',
    note: null,
    snoozed_until: null,
    cost_credits: 0,
  }

  it('dit quelle piste, quel motif — et n’appelle rien avant le clic', async () => {
    render(<PendingActions actions={[DISMISS]} />)
    expect(await screen.findByText(/écarter cette piste/)).toBeInTheDocument()
    expect(screen.getByText('Refonte data')).toBeInTheDocument()
    expect(screen.getByText('Pas de demande réelle')).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('le clic écarte par POST …/qualification-leads/:leadKey/decision, avec le motif', async () => {
    apiFetch.mockResolvedValueOnce({ lead_key: 'lead-1', decision: 'dismissed' })
    render(<PendingActions actions={[DISMISS]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Appliquer la décision/ }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/accounts/acc-1/qualification-leads/lead-1/decision',
        method: 'POST',
        body: { decision: 'dismissed', reason: 'no_real_demand', note: null, snoozed_until: null },
      }),
    )
    await waitFor(() => expect(screen.getByText(/Piste écartée/)).toBeInTheDocument())
  })

  it('un report envoie l’échéance et jamais de motif', async () => {
    apiFetch.mockResolvedValueOnce({ lead_key: 'lead-1', decision: 'snoozed' })
    render(
      <PendingActions actions={[{ ...DISMISS, decision: 'snoozed', reason: null, snoozed_until: '2026-11-15' }]} />,
    )

    fireEvent.click(await screen.findByRole('button', { name: /Appliquer la décision/ }))

    await waitFor(() =>
      expect(apiFetch.mock.calls[0]?.[0]?.body).toEqual({
        decision: 'snoozed',
        reason: null,
        note: null,
        snoozed_until: '2026-11-15',
      }),
    )
    await waitFor(() => expect(screen.getByText(/Piste reportée/)).toBeInTheDocument())
  })
})

/**
 * #1995 bis — LE RAPPEL QUI S'Y RATTACHE, UNE FOIS LA FICHE CRÉÉE.
 *
 * Constat en prod (46df969d7, 17/09) : « Rappelle-moi de relancer Société
 * Générale demain » sur une personne connue du seul CRM faisait REFUSER Laura
 * entièrement — ni carte de création, ni carte de rappel. `create_contact_from_crm`
 * porte désormais le rappel demandé (`pending_reminder_at`/`pending_reminder_note`) :
 * le clic de création laisse un second geste prêt, sans nouveau tour de modèle.
 * Deux clics, deux validations (doctrine du 14/09) : le second reste un geste
 * séparé, jamais déclenché par le premier.
 */
describe('#1995 bis — le rappel qui suit la création', () => {
  const CREATE_ACTION_WITH_REMINDER: PendingChatAction = {
    action: 'create_contact_from_crm',
    account_id: 'acc-1',
    company: 'THALES',
    full_name: 'Sandrine Pata',
    job_title: 'Directrice des achats',
    email: 'sandrine.pata@example.com',
    crm_reference: 'crm-42',
    cost_credits: 0,
    pending_reminder_at: '2026-09-18T07:30:00Z',
    pending_reminder_note: 'Relancer après la présentation',
  }

  it('montre la date du rappel AVANT le clic, à côté des autres champs', async () => {
    render(<PendingActions actions={[CREATE_ACTION_WITH_REMINDER]} />)
    expect(await screen.findByText(/Créer la fiche Bellum de Sandrine Pata/)).toBeInTheDocument()
    expect(screen.getByText('Rappel qui suivra')).toBeInTheDocument()
  })

  it('le clic sur « Créer la fiche » n’appelle PAS le rappel tout seul, mais offre un second bouton', async () => {
    createFromCrm.mockResolvedValueOnce({ status: 'created', contact_id: 'c-new' })
    render(<PendingActions actions={[CREATE_ACTION_WITH_REMINDER]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Créer la fiche/ }))
    await waitFor(() => expect(screen.getByText(/Fiche créée pour Sandrine Pata/)).toBeInTheDocument())
    expect(dispatch).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /Programmer le rappel/ })).toBeInTheDocument()
  })

  it('le second clic pose le rappel sur le contact QUE LA CRÉATION VIENT DE RÉVÉLER', async () => {
    createFromCrm.mockResolvedValueOnce({ status: 'created', contact_id: 'c-new' })
    dispatch.mockResolvedValue({ type: 'schedule_reminder', status: 'done', reason: 'Rappel interne enregistré.' })
    render(<PendingActions actions={[CREATE_ACTION_WITH_REMINDER]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Créer la fiche/ }))
    await waitFor(() => expect(screen.getByText(/Fiche créée pour Sandrine Pata/)).toBeInTheDocument())

    fireEvent.click(await screen.findByRole('button', { name: /Programmer le rappel/ }))

    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    expect(dispatch.mock.calls[0][0]).toEqual({
      type: 'schedule_reminder',
      contactId: 'c-new',
      at: '2026-09-18T07:30:00Z',
      note: 'Relancer après la présentation',
      // #1952.38 — la même clé d'idempotence que le chemin direct : un double
      // clic ou un renvoi réseau ne doit pas poser DEUX rappels.
      idempotencyKey: expect.stringMatching(/^chat-card\.schedule_reminder:.+/),
    })
    expect(await screen.findByText(/Rappel interne enregistré/)).toBeInTheDocument()
  })

  it('un refus serveur sur le rappel n’efface pas la fiche déjà créée', async () => {
    createFromCrm.mockResolvedValueOnce({ status: 'created', contact_id: 'c-new' })
    dispatch.mockResolvedValue({ type: 'schedule_reminder', status: 'failed', reason: 'Crédits insuffisants.' })
    render(<PendingActions actions={[CREATE_ACTION_WITH_REMINDER]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Créer la fiche/ }))
    await waitFor(() => expect(screen.getByText(/Fiche créée pour Sandrine Pata/)).toBeInTheDocument())

    fireEvent.click(await screen.findByRole('button', { name: /Programmer le rappel/ }))

    await waitFor(() => expect(screen.getByText('Crédits insuffisants.')).toBeInTheDocument())
    // La fiche reste là — le second refus ne défait pas le premier succès.
    expect(screen.getByText(/Fiche créée pour Sandrine Pata/)).toBeInTheDocument()
  })

  it('aucun bouton de rappel quand rien n’a été demandé dans le message d’origine', async () => {
    const { pending_reminder_at: _at, pending_reminder_note: _note, ...withoutReminder } = CREATE_ACTION_WITH_REMINDER
    createFromCrm.mockResolvedValueOnce({ status: 'created', contact_id: 'c-new' })
    render(<PendingActions actions={[withoutReminder as PendingChatAction]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Créer la fiche/ }))
    await waitFor(() => expect(screen.getByText(/Fiche créée pour Sandrine Pata/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Programmer le rappel/ })).not.toBeInTheDocument()
  })
})

/**
 * #1917.2 / #1917.5 / #1917.6 — LA FICHE « CE QUE JE RETIENS », AVANT LE CLIC.
 *
 * La carte montrait le texte du fait sous l'intitulé « Fait », et une ligne
 * FIXE « un fait épinglé, dans Réglages › Mémoire » pour dire ce qu'elle
 * écrivait. Trois choses manquaient à qui doit décider : la phrase de ce qui
 * sera retenu, les réponses que cela va influencer — qui dépendent de la portée
 * choisie — et jusqu'à quand cela vaut.
 */
describe('PendingActions — la fiche avant d’enregistrer (#1917)', () => {
  it('#1917.2 — la fiche dit « Ce que je retiens », pas seulement « Fait »', async () => {
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview.textContent).toContain('Ce que je retiens')
    expect(preview.textContent).toContain(PIN_FACT_ACTION.fact)
  })

  it('#1917.5 — « Ce que cela modifiera » SUIT la portée choisie', async () => {
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview.textContent).toContain('Ce que cela modifiera')
    expect(preview.textContent).toContain('Les réponses de Laura, pour toi')

    fireEvent.click(screen.getByRole('radio', { name: 'Toute ton ESN' }))
    expect(preview.textContent).toContain('pour tous les membres de ton ESN')
  })

  it('#1917.5 — sur un compte, elle nomme le compte plutôt que « toutes tes réponses »', async () => {
    render(<PendingActions actions={[{ ...PIN_FACT_ACTION, account_id: 'acc-9' }]} />)
    const preview = await screen.findByRole('region', { name: /Ce que cette action va faire/i })
    expect(preview.textContent).toContain('sur ce compte')
  })

  it('#1917.6 — une DURÉE se choisit, et part avec l’épinglage', async () => {
    pinMemoryFact.mockResolvedValue({ id: 'f-9', fact: PIN_FACT_ACTION.fact })
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)

    expect(await screen.findByRole('radio', { name: 'Sans échéance' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: '3 mois' }))
    // La date RÉSOLUE est annoncée : « 3 mois » ne se vérifie pas de tête.
    expect(screen.getByText(/Jusqu'au /)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Épingler' }))
    await waitFor(() => expect(pinMemoryFact).toHaveBeenCalledTimes(1))
    const sent = pinMemoryFact.mock.calls[0][0] as { expiresAt: string | null }
    expect(sent.expiresAt).toMatch(/T23:59:59\.999Z$/)
    expect(Date.parse(sent.expiresAt as string)).toBeGreaterThan(Date.now())
  })

  it('#1917.6 — le témoin : sans choix, rien n’expire (le comportement d’avant)', async () => {
    pinMemoryFact.mockResolvedValue({ id: 'f-10', fact: PIN_FACT_ACTION.fact })
    render(<PendingActions actions={[PIN_FACT_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Épingler' }))
    await waitFor(() => expect(pinMemoryFact).toHaveBeenCalledTimes(1))
    expect(pinMemoryFact).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: null }))
    expect(screen.queryByText(/Jusqu'au /)).toBeNull()
  })
})

/**
 * #1940.7 — Attribuer la prochaine action à un collègue : un sélecteur
 * « assigner à » sur la carte, relié à `useWorkspaceMembers`. Absent dans un
 * espace solo (pas de collègue à qui déléguer) ; le choix d'un collègue
 * déclenche une vraie notification serveur (`POST /ia/chat/actions/assign`),
 * jamais un simple texte, et la carte devient terminale.
 */
describe('PendingActions — attribuer la prochaine action à un collègue (#1940.7)', () => {
  beforeEach(() => {
    useWorkspaceMembersMock.mockReturnValue({ data: [], isLoading: false, isError: false })
  })

  it('espace solo (aucun collègue) : aucun sélecteur « assigner à »', async () => {
    render(<PendingActions actions={[MESSAGE_ACTION]} />)
    await screen.findByRole('button', { name: /Préparer le message/i })
    expect(screen.queryByRole('button', { name: /Assigner à/i })).toBeNull()
  })

  it('espace équipe : choisir un collègue notifie réellement, jamais soi-même dans la liste', async () => {
    const teamMembers: WorkspaceMember[] = [
      { userId: 'u-self', email: 'moi@esn.fr', fullName: 'Moi-Même', role: 'owner', isSelf: true },
      { userId: 'u-alice', email: 'alice@esn.fr', fullName: 'Alice Dupont', role: 'member', isSelf: false },
    ]
    useWorkspaceMembersMock.mockReturnValue({ data: teamMembers, isLoading: false, isError: false })
    apiFetch.mockResolvedValue({ assignedTo: 'u-alice' })
    render(<PendingActions actions={[MESSAGE_ACTION]} />)

    const u = userEvent.setup({ pointerEventsCheck: 0 })
    await u.click(await screen.findByRole('button', { name: /Assigner à/i }))
    expect(screen.queryByText('Moi-Même')).toBeNull()
    await u.click(await screen.findByText('Alice Dupont'))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/ia/chat/actions/assign' })),
    )
    const body = apiFetch.mock.calls.find(
      call => (call[0] as { path: string }).path === '/ia/chat/actions/assign',
    )?.[0] as {
      body: { assigneeUserId: string; summary: string }
    }
    expect(body.body.assigneeUserId).toBe('u-alice')
    expect(body.body.summary.length).toBeGreaterThan(0)
    expect(await screen.findByText('Assigné à Alice Dupont')).toBeInTheDocument()
    // Terminale : plus de bouton de confirmation sur cette carte.
    expect(screen.queryByRole('button', { name: /Préparer le message/i })).toBeNull()
  })
})

/**
 * #2423.9 — LAURA PROPOSE UN AVENANT À UNE MISSION DÉJÀ SIGNÉE.
 *
 * `propose_mission_amendment` était émis par `chat_tools.py` sans variant zod
 * ni rendu ici (`chat-actions-cross-language.test.ts` le signalait rouge) :
 * Laura proposerait un geste INVISIBLE à l'écran. Ces tests verrouillent le
 * DIFF affiché avant le clic, l'absence de ligne quand un terme n'est pas
 * donné, et le fait que le clic passe par la route RÉELLE et gardée du
 * dossier de la mission — jamais un accord obtenu.
 */
describe('PendingActions — Laura propose un avenant (#2423.9)', () => {
  const AMENDMENT_ACTION: PendingChatAction = {
    action: 'propose_mission_amendment',
    mission_id: 'm-1',
    event_type: 'daily_rate_change',
    effective_from: '2026-10-01',
    proof: 'Email du 20/09, confirmation du client',
    previous_term: { daily_rate: 550 },
    new_term: { daily_rate: 600 },
    cost_credits: 0,
  }

  const AMENDMENT_ACTION_NO_TERM: PendingChatAction = {
    action: 'propose_mission_amendment',
    mission_id: 'm-2',
    event_type: 'work_site_change',
    effective_from: '2026-11-01',
    proof: 'Ticket client #4821',
    cost_credits: 0,
  }

  it('montre le DIFF, la date d’effet et la preuve AVANT le clic — aucun appel réseau', async () => {
    render(<PendingActions actions={[AMENDMENT_ACTION]} />)

    expect(await screen.findByText(/Enregistrer une proposition d'avenant — TJM/)).toBeInTheDocument()
    expect(screen.getByText(/daily_rate : 550.*→.*daily_rate : 600/)).toBeInTheDocument()
    expect(screen.getByText('Email du 20/09, confirmation du client')).toBeInTheDocument()
    expect(proposeAmendment).not.toHaveBeenCalled()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('un terme non donné ne fait AUCUNE ligne — jamais un terme inventé', async () => {
    render(<PendingActions actions={[AMENDMENT_ACTION_NO_TERM]} />)

    await screen.findByText(/Enregistrer une proposition d'avenant — Lieu d'exécution/)
    expect(screen.queryByText('Changement proposé')).not.toBeInTheDocument()
    expect(screen.getByText('Ticket client #4821')).toBeInTheDocument()
  })

  it('le clic enregistre la proposition via la route existante du dossier de la mission, jamais un accord obtenu', async () => {
    proposeAmendment.mockResolvedValueOnce({
      id: 'am-1',
      missionId: 'm-1',
      eventType: 'daily_rate_change',
      status: 'proposed',
      effectiveFrom: '2026-10-01',
      proof: 'Email du 20/09, confirmation du client',
      previousTerm: { daily_rate: 550 },
      newTerm: { daily_rate: 600 },
      pauseCause: null,
      note: null,
      requestedBy: 'u-1',
      requestedAt: '2026-09-23T09:00:00.000Z',
      approvedBy: null,
      approvedAt: null,
    })
    render(<PendingActions actions={[AMENDMENT_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Enregistrer la proposition/ }))

    await waitFor(() => expect(proposeAmendment).toHaveBeenCalledTimes(1))
    expect(proposeAmendment).toHaveBeenCalledWith('m-1', {
      eventType: 'daily_rate_change',
      effectiveFrom: '2026-10-01',
      proof: 'Email du 20/09, confirmation du client',
      previousTerm: { daily_rate: 550 },
      newTerm: { daily_rate: 600 },
    })
    // Jamais « accord obtenu » : le texte dit que ça reste à valider ailleurs.
    expect(
      await screen.findByText(/Avenant enregistré comme proposé — à valider dans le dossier de la mission/),
    ).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la mission/ }))
    expect(navigate).toHaveBeenCalledWith({ to: '/missions/m-1' })
  })

  it('#2423.7 — une pause qui commence nomme sa cause, et rien n’est inventé sans elle', async () => {
    const PAUSE_ACTION: PendingChatAction = {
      action: 'propose_mission_amendment',
      mission_id: 'm-3',
      event_type: 'pause_start',
      effective_from: '2026-12-01',
      proof: 'Arrêt maladie confirmé',
      pause_cause: 'consultant_absence',
      cost_credits: 0,
    }
    render(<PendingActions actions={[PAUSE_ACTION]} />)

    expect(await screen.findByText('Absence du consultant')).toBeInTheDocument()
    // Sans terme connu, aucune ligne de diff n'est inventée.
    expect(screen.queryByText('Changement proposé')).not.toBeInTheDocument()
  })
})

/**
 * #2783 — ÉPOPÉE « SIMULATION IMPACT AVENANT (REVENU/MARGE/FORECAST) »
 * (#2423.6). Constat du tri : `simulateMissionMarginScenario` (#2420.14)
 * existe côté serveur, mais AUCUN chemin de l'avenant ne l'appelait. Ces
 * tests verrouillent : le bloc n'apparaît QUE pour un type d'événement qui
 * porte un TJM ou une date (TJM, durée, dates — portée de l'épopée), QUE
 * pour un lecteur `finance:read` (`canReadFinance`), et réutilise le même
 * simulateur que la fiche mission (`MarginScenarioSimulator`, #2420.14) —
 * jamais un second moteur de calcul.
 */
describe('PendingActions — simuler l’impact d’un avenant avant validation (#2783)', () => {
  beforeEach(() => {
    useMissionTermsMock.mockReset()
    useMissionTermsMock.mockReturnValue({ data: undefined, isPending: true })
  })
  afterEach(() => {
    useMissionTermsMock.mockReset()
    useMissionTermsMock.mockReturnValue({ data: undefined, isPending: true })
  })

  const RATE_ACTION: PendingChatAction = {
    action: 'propose_mission_amendment',
    mission_id: 'm-rate-1',
    event_type: 'daily_rate_change',
    effective_from: '2026-11-01',
    proof: 'Email du client du 22/09',
    previous_term: { daily_rate: 550 },
    new_term: { daily_rate: 600 },
    cost_credits: 0,
  }

  it('un TJM proposé, avec le droit finance : le simulateur existant s’affiche, présélectionné sur « tarif renouvelé »', async () => {
    useMissionTermsMock.mockReturnValue({
      data: { canReadFinance: true, marginEngine: { currency: 'EUR' } },
      isPending: false,
    })
    render(<PendingActions actions={[RATE_ACTION]} />)

    expect(await screen.findByText("Simuler l'impact sur le revenu et la marge, avant de valider")).toBeInTheDocument()
    expect(screen.getByText('Simuler un scénario')).toBeInTheDocument()
    // `renewed_rate` est le seul scénario qui porte un TJM à saisir — sa
    // présence prouve que `defaultKind` a bien présélectionné ce scénario.
    expect(screen.getByPlaceholderText('TJM envisagé (€)')).toBeInTheDocument()
  })

  it('sans le droit finance : aucune simulation ne s’affiche, même sur un TJM', async () => {
    useMissionTermsMock.mockReturnValue({
      data: { canReadFinance: false, marginEngine: null },
      isPending: false,
    })
    render(<PendingActions actions={[RATE_ACTION]} />)

    await screen.findByText(/Enregistrer une proposition d'avenant — TJM/)
    expect(screen.queryByText('Simuler un scénario')).not.toBeInTheDocument()
  })

  it('un changement de lieu (ni TJM ni date) : aucune simulation, quel que soit le droit finance', async () => {
    const SITE_ACTION: PendingChatAction = {
      action: 'propose_mission_amendment',
      mission_id: 'm-site-1',
      event_type: 'work_site_change',
      effective_from: '2026-11-01',
      proof: 'Ticket client #99',
      cost_credits: 0,
    }
    useMissionTermsMock.mockReturnValue({
      data: { canReadFinance: true, marginEngine: { currency: 'EUR' } },
      isPending: false,
    })
    render(<PendingActions actions={[SITE_ACTION]} />)

    await screen.findByText(/Enregistrer une proposition d'avenant — Lieu d'exécution/)
    expect(screen.queryByText('Simuler un scénario')).not.toBeInTheDocument()
  })

  it('un changement de date de fin, avec le droit finance : présélectionné sur « prolongation », pas de champ TJM', async () => {
    const END_DATE_ACTION: PendingChatAction = {
      action: 'propose_mission_amendment',
      mission_id: 'm-end-1',
      event_type: 'end_date_change',
      effective_from: '2026-12-01',
      proof: 'Avenant signé du 24/09',
      previous_term: { end_date: '2026-12-31' },
      new_term: { end_date: '2027-02-28' },
      cost_credits: 0,
    }
    useMissionTermsMock.mockReturnValue({
      data: { canReadFinance: true, marginEngine: { currency: 'EUR' } },
      isPending: false,
    })
    render(<PendingActions actions={[END_DATE_ACTION]} />)

    expect(await screen.findByText('Simuler un scénario')).toBeInTheDocument()
    // `extension` ne porte ni TJM ni coût envisagés — seul un nombre de jours.
    expect(screen.queryByPlaceholderText('TJM envisagé (€)')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Jours')).toBeInTheDocument()
  })
})

/**
 * Épopée #2967 (lot V39) — Laura PROPOSE une transition de besoin, le clic du
 * commercial la VALIDE : la route est la porte du besoin, et le journal
 * reçoit la source `laura` ; les preuves que la machine canonique exige sont
 * nommées AVANT le clic (#2320.27).
 */
describe('PendingActions — transition de besoin proposée par Laura (#2967)', () => {
  const TRANSITION: PendingChatAction = {
    action: 'propose_need_transition',
    need_id: 'n-1',
    from_status: 'matching',
    to_status: 'shortlist_ready',
    reason: null,
    missing_evidence: ['criteria_review', 'unknowns_review'],
    cost_credits: 0,
  }

  beforeEach(() => apiFetch.mockReset())

  it('nomme les preuves à réunir avant le clic — aucun appel réseau', async () => {
    render(<PendingActions actions={[TRANSITION]} />)
    expect(await screen.findByText('Revue des critères, Revue des inconnues')).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('le clic passe par la porte du besoin avec la source `laura`', async () => {
    apiFetch.mockResolvedValueOnce({})
    render(<PendingActions actions={[TRANSITION]} />)
    const buttons = await screen.findAllByRole('button')
    const confirm = buttons.find(b => /Mettre à jour|Appliquer|Valider|Confirmer/i.test(b.textContent ?? ''))
    expect(confirm).toBeDefined()
    fireEvent.click(confirm as HTMLElement)
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/projects/needs/n-1/status',
          method: 'PATCH',
          body: { status: 'shortlist_ready', reason: null, source: 'laura' },
        }),
      ),
    )
  })

  /**
   * #3345.2 (LAU-FINAL-255, recette prod 30/09) — L04/N06 (29/09) avaient
   * signalé, sans le vérifier ni le corriger, que les écrans dérivés (Matching,
   * Aujourd'hui, Vivier, Pilotage) n'étaient pas prouvés relire la table à
   * jour plutôt qu'un cache. Vérifié : `useNeedActions` (l'écran) invalide
   * `openNeedsKeys.all` + `['projects']` après un changement de statut — ce
   * clic-ci ne le faisait pas, écrivait par la MÊME route mais laissait les
   * autres écrans avec leur cache TanStack Query PÉRIMÉ jusqu'à leur propre
   * refetch. MÊMES clés que `useNeedActions` (aucun second calcul, GA-26).
   */
  it('invalide le cache des besoins et des projets après la validation — les autres écrans ne restent pas sur une vue périmée', async () => {
    apiFetch.mockResolvedValueOnce({})
    invalidateQueries.mockClear()
    render(<PendingActions actions={[TRANSITION]} />)
    const buttons = await screen.findAllByRole('button')
    const confirm = buttons.find(b => /Mettre à jour|Appliquer|Valider|Confirmer/i.test(b.textContent ?? ''))
    fireEvent.click(confirm as HTMLElement)
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['open-needs'] }))
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects'] })
  })
})

/**
 * #2844 (recette prod 02/10) — la carte « Matching massif » de la SALLE se
 * montre, mais son clic ne lance rien : les identifiants de besoin y sont ceux
 * de la démonstration, jamais ceux d'un besoin réel.
 */
describe('PendingActions — travail long proposé en salle de démonstration (#2844)', () => {
  const DEMO_JOB: PendingChatAction = {
    action: 'propose_long_job',
    job: 'bulk_matching',
    need_ids: ['demo-need-infra', 'demo-need-data', 'demo-need-secu'],
    needs: [{ need_id: 'demo-need-infra', label: 'Ingénieur infrastructure — socle conteneurisé du portail' }],
    cost_credits: 0,
  }

  beforeEach(() => apiFetch.mockReset())

  it('le clic le DIT : rien n’est lancé depuis la salle, aucun appel réseau', async () => {
    render(<PendingActions actions={[DEMO_JOB]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer en tâche de fond' }))
    expect(await screen.findByText(/n’est pas exécuté dans cette salle/)).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

/**
 * #2434.56 (épopée #3579) — L'ENRICHISSEMENT EN MASSE, PORTE DE DÉPENSE : le
 * plafond total est lu AVANT le clic, le clic enrichit contact par contact par la
 * route unitaire, une erreur arrête le lot, la salle de démonstration ne débite rien.
 */
describe('PendingActions — enrichissement en masse (#2434.56)', () => {
  const contact = (id: string, name: string) => ({
    contact_id: id,
    contact_name: name,
    organization_name: 'ACME SA',
  })
  const BULK: PendingChatAction = {
    action: 'propose_bulk_enrichment',
    contacts: [contact('c-1', 'Claire Dubois'), contact('c-2', 'Alan Turing'), contact('c-3', 'Ada Lovelace')],
    cost_credits: 3,
    credit_kind: 'enrichment',
  }

  it('annonce l’effet AVANT le clic, sans plafond en crédits, et n’enrichit rien au rendu (#4463)', async () => {
    render(<PendingActions actions={[BULK]} />)
    expect(await screen.findByText(/Enrichir les coordonnées de 3 contacts/)).toBeInTheDocument()
    expect(screen.getByText(/Cherche les coordonnées de chaque contact de la liste/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit|Jusqu'à/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enrichir 3 contacts' })).toBeInTheDocument()
    expect(enrich).not.toHaveBeenCalled()
  })

  it('le clic enrichit chaque contact par la route unitaire, puis dit combien ont été trouvés', async () => {
    enrich
      .mockResolvedValueOnce({ email: 'a@acme.fr', phone: null, credits_remaining: 9, full_name: 'Claire Dubois' })
      .mockResolvedValueOnce({ email: null, phone: null, credits_remaining: 9, full_name: 'Alan Turing' })
      .mockResolvedValueOnce({ email: null, phone: '+33100000000', credits_remaining: 8, full_name: 'Ada Lovelace' })
    render(<PendingActions actions={[BULK]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Enrichir 3 contacts' }))
    await waitFor(() => expect(enrich).toHaveBeenCalledTimes(3))
    expect(enrich.mock.calls[1]).toEqual([
      'c-2',
      { first_name: 'Alan', last_name: 'Turing', organization_name: 'ACME SA' },
    ])
    expect(await screen.findByText(/2 contact\(s\) enrichi\(s\) sur 3/)).toBeInTheDocument()
  })

  it('une erreur ARRÊTE le lot : on dit où, on ne continue pas à débiter', async () => {
    enrich
      .mockResolvedValueOnce({ email: 'a@acme.fr', phone: null, credits_remaining: 0, full_name: 'Claire Dubois' })
      .mockRejectedValueOnce(new ApiError('Crédits insuffisants pour cet enrichissement.', 402))
    render(<PendingActions actions={[BULK]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Enrichir 3 contacts' }))
    expect(await screen.findByText(/Lot arrêté après 1 contact\(s\) sur 3/)).toBeInTheDocument()
    expect(enrich).toHaveBeenCalledTimes(2)
  })

  it('la salle de démonstration n’exécute rien et le dit, sans parler de crédit', async () => {
    const demo: PendingChatAction = {
      action: 'propose_bulk_enrichment',
      contacts: [contact('demo-contact-a', 'Pierre Palmieri')],
      cost_credits: 1,
    }
    render(<PendingActions actions={[demo]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Enrichir 1 contact' }))
    expect(await screen.findByText(/n[’']est pas exécuté dans cette salle/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    expect(enrich).not.toHaveBeenCalled()
  })
})

/**
 * #3869.a (lot M05, 09/10) — LA RECHERCHE DE PERSONNES SUR UN RÔLE NON POURVU :
 * le compte et les rôles sont lus AVANT le clic avec le coût de la grille, le
 * clic emprunte la route de la découverte fraîche de `/accounts`, rien n'est
 * envoyé, et la salle de démonstration ne lance rien.
 */
describe('PendingActions — recherche de personnes (#3869.a)', () => {
  beforeEach(() => discoverFreshContacts.mockReset())

  const SEARCH: PendingChatAction = {
    action: 'propose_people_search',
    account_id: 'acc-1',
    company_name: 'SNCF',
    roles: ['Responsable achats', 'Responsable data'],
    cost_credits: 1,
    credit_kind: 'enrichment',
  }

  it('annonce le compte et les rôles AVANT le clic, sans coût, sans rien lancer (#4463)', async () => {
    render(<PendingActions actions={[SEARCH]} />)
    expect(await screen.findByText(/Chercher de nouvelles personnes chez SNCF/)).toBeInTheDocument()
    expect(screen.getByText(/Cherche des personnes correspondant au rôle/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit|débité/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lancer la recherche' })).toBeInTheDocument()
    expect(discoverFreshContacts).not.toHaveBeenCalled()
  })

  it('le clic passe par la route de la découverte, avec les rôles, puis dit combien de personnes sont à vérifier', async () => {
    discoverFreshContacts.mockResolvedValueOnce({ accountId: 'acc-1', status: 'ok', found: 2, created: 2, cost: 1 })
    render(<PendingActions actions={[SEARCH]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer la recherche' }))
    await waitFor(() =>
      expect(discoverFreshContacts).toHaveBeenCalledWith('acc-1', ['Responsable achats', 'Responsable data']),
    )
    expect(await screen.findByText(/2 nouvelles personnes ajoutées au compte, à vérifier/)).toBeInTheDocument()
  })

  it('personne trouvé : rien de débité, et une autre voie est proposée', async () => {
    discoverFreshContacts.mockResolvedValueOnce({ accountId: 'acc-1', status: 'empty', found: 0, created: 0, cost: 0 })
    render(<PendingActions actions={[SEARCH]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer la recherche' }))
    expect(await screen.findByText(/rien n'a été débité/)).toBeInTheDocument()
  })

  // #4057 / #4058 (lot LAURA-RECHERCHE 12/10) — « interlocuteurs cyber de X ».
  const EXPERTISE_SEARCH: PendingChatAction = {
    action: 'propose_people_search',
    account_id: 'acc-1',
    company_name: 'SNCF',
    roles: [],
    expertise: 'GRC',
    sector: 'énergie',
    scope: 'filiale Ouest',
    cost_credits: 1,
    credit_kind: 'enrichment',
  }

  it('#4058 — expertise, secteur et périmètre sont annoncés chacun sous son libellé, sans ligne « rôles » vide', async () => {
    render(<PendingActions actions={[EXPERTISE_SEARCH]} />)
    expect(await screen.findByText('Expertise cherchée')).toBeInTheDocument()
    expect(screen.getByText('GRC')).toBeInTheDocument()
    expect(screen.getByText('Secteur du client')).toBeInTheDocument()
    expect(screen.getByText('énergie')).toBeInTheDocument()
    expect(screen.getByText('Périmètre')).toBeInTheDocument()
    expect(screen.queryByText('Rôles cherchés')).not.toBeInTheDocument()
    // #4057 — aucun champ stratégique n'est demandé.
    expect(screen.queryByText(/TJM|volume potentiel|horizon/i)).not.toBeInTheDocument()
  })

  it('#4058 — le clic envoie l’expertise ET le secteur séparés, sans rôle requis', async () => {
    discoverFreshContacts.mockResolvedValueOnce({ accountId: 'acc-1', status: 'ok', found: 1, created: 1, cost: 1 })
    render(<PendingActions actions={[EXPERTISE_SEARCH]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer la recherche' }))
    await waitFor(() =>
      expect(discoverFreshContacts).toHaveBeenCalledWith('acc-1', [], {
        expertise: 'GRC',
        sector: 'énergie',
        scope: 'filiale Ouest',
      }),
    )
  })

  it('#4058 — une panne de recherche n’est pas présentée comme une absence de personnes', async () => {
    discoverFreshContacts.mockResolvedValueOnce({ accountId: 'acc-1', status: 'down', found: 0, created: 0, cost: 0 })
    render(<PendingActions actions={[EXPERTISE_SEARCH]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer la recherche' }))
    expect(await screen.findByText(/n'a pas pu aboutir/)).toBeInTheDocument()
    expect(screen.queryByText(/Personne de nouveau trouvé/)).not.toBeInTheDocument()
  })

  it('la salle de démonstration ne lance rien et le dit', async () => {
    render(<PendingActions actions={[SEARCH]} isDemo />)
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer la recherche' }))
    expect(await screen.findByText(/la recherche n[’']est pas lancée dans cette salle/)).toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    expect(discoverFreshContacts).not.toHaveBeenCalled()
  })
})

/**
 * #2324.39 — LA MISE À JOUR D'UNE OPPORTUNITÉ, DIFF AVANT ÉCRITURE.
 *
 * Laura PRÉPARE, le commercial CONFIRME : le diff (« avant → après », lu par
 * l'outil) s'affiche AVANT le clic, rien ne part sans lui, et le clic emprunte
 * les routes RÉELLES de l'écran de l'opportunité — aucun second chemin.
 */
describe('PendingActions — mise à jour d’opportunité (#2324.39)', () => {
  const UPDATE: PendingChatAction = {
    action: 'propose_opportunity_update',
    project_id: 'p-1',
    project_label: 'Refonte data',
    company_name: 'SNCF',
    changes: [
      { field: 'stage', previous: 'qualified', next: 'confirmed' },
      { field: 'estimated_amount', previous: null, next: 120000 },
      { field: 'next_step', previous: 'Atelier cadrage', next: 'Soutenance le 30/09' },
    ],
    proof: 'Compte rendu du 22/09',
    cost_credits: 0,
  }

  beforeEach(() => {
    updateProjectStage.mockReset()
    updateProjectAmount.mockReset()
    updateProjectBtmmp.mockReset()
    updateProjectRisks.mockReset()
  })

  it('montre le DIFF champ par champ AVANT le clic — aucun appel réseau', async () => {
    render(<PendingActions actions={[UPDATE]} />)

    expect(await screen.findByText(/Mettre à jour l'opportunité Refonte data/)).toBeInTheDocument()
    // Libellés de l'écran du pipe (`projects:stage.states`), jamais le slug.
    expect(screen.getByText('Cadrage → À qualifier')).toBeInTheDocument()
    // Un « avant » inconnu ne s'invente pas : la valeur proposée seule.
    expect(screen.getByText(/^120\s000\s€$/)).toBeInTheDocument()
    expect(screen.getByText('Atelier cadrage → Soutenance le 30/09')).toBeInTheDocument()
    expect(screen.getByText('Compte rendu du 22/09')).toBeInTheDocument()
    expect(updateProjectStage).not.toHaveBeenCalled()
    expect(updateProjectAmount).not.toHaveBeenCalled()
    expect(updateProjectBtmmp).not.toHaveBeenCalled()
  })

  it('le clic écrit par les routes de l’écran de l’opportunité, champ par champ', async () => {
    updateProjectStage.mockResolvedValueOnce({})
    updateProjectAmount.mockResolvedValueOnce({})
    updateProjectBtmmp.mockResolvedValueOnce({})
    render(<PendingActions actions={[UPDATE]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Appliquer la mise à jour/ }))

    await waitFor(() => expect(updateProjectBtmmp).toHaveBeenCalledTimes(1))
    expect(updateProjectStage).toHaveBeenCalledWith('p-1', 'confirmed')
    expect(updateProjectAmount).toHaveBeenCalledWith('p-1', 120000)
    expect(updateProjectBtmmp).toHaveBeenCalledWith('p-1', { nextStep: 'Soutenance le 30/09' })
    expect(await screen.findByText(/Opportunité mise à jour/)).toBeInTheDocument()
  })

  it('un champ absent du diff ne part pas — jamais une écriture que la carte n’a pas montrée', async () => {
    updateProjectStage.mockResolvedValueOnce({})
    render(
      <PendingActions
        actions={[{ ...UPDATE, changes: [{ field: 'stage', previous: 'qualified', next: 'confirmed' }] }]}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: /Appliquer la mise à jour/ }))
    await waitFor(() => expect(updateProjectStage).toHaveBeenCalledTimes(1))
    expect(updateProjectAmount).not.toHaveBeenCalled()
    expect(updateProjectBtmmp).not.toHaveBeenCalled()
  })

  // #2324.37 — le RISQUE de l'affaire : montré dans le diff, écrit par `PATCH /projects/:id/risks`.
  it('un risque proposé se montre puis part par la route des risques — jamais dans la qualification', async () => {
    updateProjectRisks.mockResolvedValueOnce({})
    render(
      <PendingActions
        actions={[{ ...UPDATE, changes: [{ field: 'risk', previous: null, next: 'Budget 2027 non voté' }] }]}
      />,
    )
    expect(await screen.findByText('Risque')).toBeInTheDocument()
    expect(screen.getByText('Budget 2027 non voté')).toBeInTheDocument()
    expect(updateProjectRisks).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Appliquer la mise à jour/ }))
    await waitFor(() => expect(updateProjectRisks).toHaveBeenCalledWith('p-1', 'Budget 2027 non voté'))
    expect(updateProjectBtmmp).not.toHaveBeenCalled()
  })
})

/**
 * Épopée #2844 (#1952.3 / #1952.7, lot P07) — Laura PROPOSE le lancement d'un
 * travail long, le clic du commercial le LANCE par la route de l'écran. La carte
 * dit « lancé » (jamais « terminé ») et rien ne part avant le clic.
 */
describe('PendingActions — travail long proposé par Laura (#2844)', () => {
  const MATCHING: PendingChatAction = {
    action: 'propose_long_job',
    job: 'bulk_matching',
    need_ids: ['n-1', 'n-2'],
    needs: [
      { need_id: 'n-1', label: 'Architecte data' },
      { need_id: 'n-2', label: null },
    ],
    cost_credits: 0,
  }
  const SEARCH: PendingChatAction = {
    action: 'propose_long_job',
    job: 'multi_source_search',
    need_ids: ['n-1'],
    max_per_source: 5,
    cost_credits: 0,
  }

  beforeEach(() => apiFetch.mockReset())

  it('nomme le travail et les besoins lus avant le clic — aucun appel réseau', async () => {
    render(<PendingActions actions={[MATCHING]} />)
    expect(await screen.findByText('Matching massif')).toBeInTheDocument()
    // Le libellé absent n'est jamais deviné : l'identifiant reste affiché.
    expect(screen.getByText('Architecte data, n-2')).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('le clic lance le matching massif par la route de l’écran', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'job-1', status: 'queued' })
    render(<PendingActions actions={[MATCHING]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Lancer en tâche de fond/i }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/needs/match/bulk', method: 'POST', body: { needIds: ['n-1', 'n-2'] } }),
      ),
    )
    expect(await screen.findByText(/lancé en tâche de fond/i)).toBeInTheDocument()
  })

  it('le clic lance la recherche hors vivier d’UN besoin, avec le volume', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'job-2', status: 'queued' })
    render(<PendingActions actions={[SEARCH]} />)
    fireEvent.click(await screen.findByRole('button', { name: /Lancer en tâche de fond/i }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/projects/needs/n-1/external-sourcing/search/bulk?maxPerSource=5',
          method: 'POST',
        }),
      ),
    )
  })
})

/**
 * #2433.7 (épopée #2876, lot M10 09/10) — le signalement de bug PRÉPARÉ par
 * Laura depuis une capture. Le clic emprunte LA porte du formulaire de
 * signalement (`POST /feedback`, catégorie `bug`) — jamais un second chemin ;
 * rien ne part avant lui, et la salle de démonstration n'envoie rien.
 */
describe('#2433.7 — préparer un signalement de bug depuis une capture', () => {
  const BUG_REPORT_ACTION: PendingChatAction = {
    action: 'prepare_bug_report',
    message: 'L’écran Comptes affiche « Erreur 500 » après le clic sur « Analyser ».',
    route: '/accounts',
    cost_credits: 0,
  }

  it('montre le constat AVANT le clic, et n’envoie rien', async () => {
    render(<PendingActions actions={[BUG_REPORT_ACTION]} />)
    expect(await screen.findByText(/Erreur 500/)).toBeInTheDocument()
    expect(screen.getByText('/accounts')).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/feedback' }))
  })

  it('le clic appelle POST /feedback, catégorie bug, constat et écran nommé', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'fb-1', created_at: '2026-10-09T10:00:00Z', github_issue_number: 42 })
    render(<PendingActions actions={[BUG_REPORT_ACTION]} />)

    fireEvent.click(await screen.findByRole('button', { name: /Envoyer le signalement/ }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/feedback',
          method: 'POST',
          body: expect.objectContaining({
            category: 'bug',
            message: expect.stringMatching(/Erreur 500[\s\S]*\/accounts/),
          }),
        }),
      ),
    )
    // Ce qui n'a pas été MONTRÉ ne part pas : ni journaux, ni appels en échec.
    const body = apiFetch.mock.calls.find(([options]) => options?.path === '/feedback')?.[0]?.body
    expect(body.consoleLogs).toBeUndefined()
    expect(body.networkFailures).toBeUndefined()
    await waitFor(() => expect(screen.getByText(/Signalement envoyé/)).toBeInTheDocument())
  })

  it('en salle de démonstration, le clic le DIT et n’envoie rien', async () => {
    render(<PendingActions actions={[BUG_REPORT_ACTION]} isDemo />)
    fireEvent.click(await screen.findByRole('button', { name: /Envoyer le signalement/ }))
    await waitFor(() => expect(screen.getByText(/Démonstration : le signalement n’est pas envoyé/)).toBeInTheDocument())
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/feedback' }))
  })
})
