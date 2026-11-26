import type { Contact, MessageDraftVersionItem } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApproachApi from './approach-api'
import { ApproachPage } from './ApproachPage'

const contact = {
  id: 'c1',
  full_name: 'Paul Ferrer',
  title: 'Responsable programme SAP',
  entity: 'Altiver Industries',
  email: 'paul.ferrer@altiver-industries.fr',
  linkedin_url: 'https://www.linkedin.com/in/paul-ferrer',
  account_id: 'a1',
  email_sent_at: null,
} as unknown as Contact

let accountReady = true
let identityDoubtReason: 'homonym_conflict' | null = null
let sendabilityReason: string | null = null
let thread: MessageDraftVersionItem[] = []
const validateMutate = vi.fn()
const saveMutate = vi.fn()
const editEntry = vi.fn()
const generateDraft = vi.fn()
const trackers = vi.hoisted(() => ({
  trackEngagementOpened: vi.fn(),
  trackLinkedinOpened: vi.fn(),
  trackMessageCopied: vi.fn(),
  trackMessageDeclaredSent: vi.fn(),
  trackMessageDismissed: vi.fn(),
  trackMessageGenerated: vi.fn(),
}))

const lauraContext = vi.hoisted(() => ({ publish: vi.fn() }))
vi.mock('@/features/laura/bubble/page-context-store', () => ({ useLauraContext: lauraContext.publish }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({
    children,
    pageTitle,
    pageSubtitle,
    headerActions,
  }: {
    children: ReactNode
    pageTitle?: string
    pageSubtitle?: string
    headerActions?: ReactNode
  }) => (
    <div>
      <header data-testid="page-head">
        <h1>{pageTitle}</h1>
        <p>{pageSubtitle}</p>
        {headerActions}
      </header>
      {children}
    </div>
  ),
}))
vi.mock('@tanstack/react-router', () => ({
  // Le vrai `Link` transmet ses attributs (rôle d'élément de menu, `aria-current`) : la doublure aussi.
  Link: ({ children, to: _to, params: _params, ...rest }: { children: ReactNode; to?: string; params?: unknown }) => (
    <a href="#" {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))
vi.mock('./EnrichThenPrepareButton', () => ({
  EnrichThenPrepareButton: ({ contact }: { contact: { id: string } }) => (
    <button type="button" data-contact={contact.id}>
      Enrichir puis préparer
    </button>
  ),
}))
vi.mock('@/features/contacts/hooks/useContact', () => ({
  useContact: () => ({ data: contact, isLoading: false, isError: false }),
}))
let rawAnalysis: Record<string, unknown> | undefined
let conversationArgs: { grounding?: unknown; draftHydrated?: boolean } | undefined
vi.mock('@/features/accounts/hooks/useAccountRawAnalysis', () => ({ useAccountRawAnalysis: () => rawAnalysis }))
vi.mock('@/features/accounts/hooks/useAccountSignalLines', () => ({
  useAccountSignalLines: () => ({ data: undefined }),
}))
vi.mock('@/features/actions/hooks/useTrackAction', () => ({ useTrackAction: () => ({ mutate: vi.fn() }) }))
vi.mock('@/features/message-style/hooks/useMessageStyle', () => ({ useMessageStyleTemplates: () => ({ data: [] }) }))
vi.mock('@/features/mailbox/api', () => ({
  useMailboxStatus: () => ({ data: { connected: true } }),
  useCreateDraft: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/contacts/hooks/useContactRanking', () => ({
  useContactRanking: () => ({ data: { ranked: [], excluded: [] } }),
}))
vi.mock('@/features/contacts/hooks/useContactSendability', () => ({
  useContactSendability: () => ({
    data: { can_send: !sendabilityReason, reason: sendabilityReason, sender: 'espace@bellum.test' },
  }),
}))
vi.mock('./approach-api', async () => {
  const actual = await vi.importActual<typeof ApproachApi>('./approach-api')
  return {
    ...actual,
    useDraftThread: () => ({ data: thread }),
    useApproachAccount: () => ({ companyName: 'Altiver', ready: accountReady }),
    useSaveDraft: () => ({ mutate: saveMutate, isPending: false }),
    useValidateDraft: () => ({ mutate: validateMutate, isPending: false, isError: false }),
  }
})
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useOptionalContactEngagement: () => undefined,
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/useEngagementDraftHydration', () => ({
  useEngagementDraftHydration: () => ({ hydrated: true }),
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/conversation', () => ({
  useEngagementConversation: (args: { grounding?: unknown; draftHydrated?: boolean }) => ({
    ...((conversationArgs = args), {}),
    entries: [
      {
        id: 'e1',
        role: 'assistant',
        channel: 'email',
        subject: 'Votre retour sur le profil SAP',
        text: 'Bonjour Paul, avez-vous pu regarder le parcours de Sophie ?',
        rationale: 'Le programme rend la reprise prioritaire.',
        specificity: {
          status: 'specifique',
          count: 1,
          minimum: 1,
          unavailable: [],
          elements: [{ kind: 'dated_signal', value: 'Note de rendez-vous du 16 octobre' }],
        },
      },
    ],
    generationStep: null,
    context: '',
    parameters: {},
    styleTemplateId: null,
    setContext: vi.fn(),
    setStyleTemplateId: vi.fn(),
    chooseParameters: vi.fn(),
    generateDraft,
    retryDraft: vi.fn(),
    useApprovedTemplate: vi.fn(),
    editEntry,
  }),
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/EngagementPanel', () => trackers)
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/EngagementMessage', () => ({
  previousMessage: () => ({ step: 1, daysSincePrevious: null }),
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/EngagementSendEmail', () => ({
  EngagementSendEmailAction: () => <button type="button">Envoyer</button>,
  identityDoubtBlockedReason: () => identityDoubtReason,
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/EngagementCreateTask', () => ({
  EngagementCreateTaskAction: () => <button type="button">Créer une tâche</button>,
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ComposerParameters', () => ({
  ComposerParameters: () => <span>paramètres</span>,
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ApprovedTemplatePicker', () => ({
  ApprovedTemplatePicker: () => <span>modèles</span>,
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ComposerDock', () => ({
  StyleSelector: () => <span>style</span>,
}))

const validatedVersion = {
  id: 'v1',
  contactId: 'c1',
  channel: 'email',
  subject: 'Votre retour sur le profil SAP',
  body: 'Bonjour Paul, avez-vous pu regarder le parcours de Sophie ?',
  editedSubject: null,
  editedBody: null,
  usedTemplateSource: null,
  usedTemplateVersion: null,
  usedStyleId: null,
  unchanged: false,
  angle: null,
  createdAt: '2026-10-22T08:00:00.000Z',
  validatedAt: '2026-10-22T09:00:00.000Z',
} as MessageDraftVersionItem

beforeEach(() => {
  accountReady = true
  identityDoubtReason = null
  rawAnalysis = undefined
  conversationArgs = undefined
  sendabilityReason = null
  thread = []
  vi.clearAllMocks()
})

describe('Théo C6 — page d’approche e-mail', () => {
  it('avant validation : ni « Envoyer » ni « Déposer dans ma boîte » — seulement « Valider le brouillon »', () => {
    render(<ApproachPage contactId="c1" channelParam="email" />)
    expect(screen.getByRole('heading', { name: 'Préparer ton e-mail' })).toBeInTheDocument()
    expect(screen.getByText('Non envoyé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Déposer dans ma boîte' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Valider le brouillon' })).toBeEnabled()
  })

  it('après validation de CE texte : l’envoi sur clic et le dépôt dans la boîte apparaissent, rien n’est parti', () => {
    thread = [validatedVersion]
    render(<ApproachPage contactId="c1" channelParam="email" />)
    expect(screen.getByText('Validé · pas encore envoyé')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Déposer dans ma boîte' })).toBeEnabled()
  })

  it('un texte différent de celui qui a été relu retombe en « Non envoyé » : modifier = nouvelle relecture', () => {
    thread = [{ ...validatedVersion, body: 'Un autre texte relu hier.' }]
    render(<ApproachPage contactId="c1" channelParam="email" />)
    expect(screen.getByText('Non envoyé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull()
  })

  it('« Valider le brouillon » ouvre la relecture ; la validation exige la case cochée et ne part pas toute seule', async () => {
    const user = userEvent.setup()
    render(<ApproachPage contactId="c1" channelParam="email" />)
    await user.click(screen.getByRole('button', { name: 'Valider le brouillon' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Relire avant de valider')).toBeInTheDocument()
    expect(within(dialog).getByText(/Elle ne déclenche aucun envoi/)).toBeInTheDocument()
    const submit = within(dialog).getByRole('button', { name: 'Valider le brouillon' })
    expect(submit).toBeDisabled()
    await user.click(within(dialog).getByRole('checkbox'))
    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(validateMutate).toHaveBeenCalledTimes(1)
  })

  it('« Voir la preuve » montre ce que Laura a cité, et la mise en garde', async () => {
    const user = userEvent.setup()
    render(<ApproachPage contactId="c1" channelParam="email" />)
    await user.click(screen.getByRole('button', { name: 'Voir la preuve' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Note de rendez-vous du 16 octobre')).toBeInTheDocument()
    expect(within(dialog).getByText('Le programme rend la reprise prioritaire.')).toBeInTheDocument()
    expect(within(dialog).getByText("Une recommandation n'est pas une preuve supplémentaire.")).toBeInTheDocument()
  })

  it('un contact désinscrit : bandeau d’avertissement, le brouillon reste préparable', () => {
    sendabilityReason = 'suppressed'
    render(<ApproachPage contactId="c1" channelParam="email" />)
    expect(screen.getByText('Paul Ferrer a demandé à ne plus être sollicité.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeEnabled()
  })

  it('un canal retiré (SMS) n’a pas de page', () => {
    render(<ApproachPage contactId="c1" channelParam="sms" />)
    expect(screen.getByText('Ce canal ne se prépare pas ici')).toBeInTheDocument()
  })
})

describe('Théo C6 — page d’approche LinkedIn', () => {
  it('« Canal non connecté » : rien ne part de Bellum, et la page dit comment faire', () => {
    render(<ApproachPage contactId="c1" channelParam="linkedin" />)
    expect(screen.getByRole('heading', { name: 'Préparer ton message LinkedIn' })).toBeInTheDocument()
    expect(screen.getByText(/Canal non connecté/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull()
  })
})

/** `a` précède `b` dans le document. */
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('Théo C6 — la structure de la maquette (`b/c6-approche-email-linkedin.html`)', () => {
  it('en-tête de la coque : titre, « personne · poste », « Retour au contact » — un seul h1', () => {
    render(<ApproachPage contactId="c1" channelParam="email" />)
    const head = screen.getByTestId('page-head')
    expect(within(head).getByRole('heading', { level: 1, name: 'Préparer ton e-mail' })).toBeInTheDocument()
    expect(within(head).getByText('Paul Ferrer · Responsable programme SAP')).toBeInTheDocument()
    expect(within(head).getByText('Retour au contact')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('colonne principale dans l’ordre de Théo : objectif | canal, précisions, modèle approuvé, brouillon, actions', () => {
    render(<ApproachPage contactId="c1" channelParam="email" />)
    const order = [
      screen.getByText('Ce que tu veux obtenir'),
      screen.getByText('Canal de préparation'),
      screen.getByText('Précisions facultatives'),
      screen.getByText("Partir d'un modèle approuvé"),
      screen.getByRole('heading', { name: 'Ton brouillon' }),
      screen.getByRole('button', { name: 'Enregistrer le brouillon' }),
      screen.getByRole('button', { name: 'Valider le brouillon' }),
      screen.getByText('Envoyé autrement ?'),
    ]
    order.slice(1).forEach((node, index) => expect(before(order[index]!, node)).toBe(true))
  })

  it('colonne de droite : « Le contexte à garder » puis « Éviter le message passe-partout »', () => {
    render(<ApproachPage contactId="c1" channelParam="email" />)
    const aside = screen.getByRole('complementary', { name: 'Le contexte à garder' })
    const titles = within(aside)
      .getAllByRole('heading', { level: 2 })
      .map(node => node.textContent)
    expect(titles).toEqual(['Le contexte à garder', 'Éviter le message passe-partout'])
    // #4524.4 — « Compte » dit le compte, pas le nom d'entité du poste.
    expect(within(aside).getByText('Altiver')).toBeInTheDocument()
    expect(within(aside).queryByText('Altiver Industries')).toBeNull()
    expect(within(aside).getByText('Note de rendez-vous du 16 octobre')).toBeInTheDocument()
  })

  it('le brouillon s’ouvre DÉJÀ RÉDIGÉ, éditable, avec « Régénérer » — jamais un champ vide', async () => {
    const user = userEvent.setup()
    render(<ApproachPage contactId="c1" channelParam="email" />)
    expect(screen.getByRole('textbox', { name: 'Corps du message' })).toHaveValue(
      'Bonjour Paul, avez-vous pu regarder le parcours de Sophie ?',
    )
    expect(screen.getByRole('textbox', { name: 'Objet' })).toHaveValue('Votre retour sur le profil SAP')
    await user.click(screen.getByRole('button', { name: 'Régénérer' }))
    expect(generateDraft).toHaveBeenCalledTimes(1)
  })

  it('l’e-mail du destinataire est écrit en clair sur la ligne « À »', () => {
    render(<ApproachPage contactId="c1" channelParam="email" />)
    expect(screen.getByText('paul.ferrer@altiver-industries.fr')).toBeInTheDocument()
  })

  it('« Choisir » ouvre « Partir d’un modèle approuvé » en modale', async () => {
    const user = userEvent.setup()
    render(<ApproachPage contactId="c1" channelParam="email" />)
    await user.click(screen.getByRole('button', { name: 'Choisir' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText("Partir d'un modèle approuvé")).toBeInTheDocument()
    expect(within(dialog).getByText('modèles')).toBeInTheDocument()
  })

  it('« … » (Plus de canaux) liste les autres objectifs — ni SMS, ni WhatsApp, ni vocal', async () => {
    const user = userEvent.setup()
    render(<ApproachPage contactId="c1" channelParam="email" />)
    await user.click(screen.getByRole('button', { name: 'Plus de canaux' }))
    const menu = await screen.findByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual([
      'E-mail de suivi',
      'Proposer un profil consultant',
      'Demander une introduction',
      'Message à un partenaire',
      'Note de connexion LinkedIn',
    ])
    expect(within(menu).queryByText(/SMS|WhatsApp|vocal/)).toBeNull()
  })
})

// #AM.36 (#4062) — le MÊME contact reste sélectionné entre « Préparer un message » et « Enrichir ».
describe('#AM.36 — enrichir le contact depuis sa page de préparation', () => {
  it('sans e-mail, le brouillon se prépare et « Enrichir puis préparer » porte sur le même contact, sans repasser par la fiche ni la liste', () => {
    const withoutEmail = contact as unknown as { email: string | null }
    const original = withoutEmail.email
    withoutEmail.email = null
    try {
      render(<ApproachPage contactId="c1" channelParam="email" />)
      const enrich = screen.getByRole('button', { name: 'Enrichir puis préparer' })
      expect(enrich).toHaveAttribute('data-contact', 'c1')
    } finally {
      withoutEmail.email = original
    }
  })

  it('NON : avec un e-mail connu, rien à enrichir ici', () => {
    render(<ApproachPage contactId="c1" channelParam="email" />)
    expect(screen.queryByRole('button', { name: 'Enrichir puis préparer' })).toBeNull()
  })
})

// #4524 — « Sur quoi Laura s'appuie » sur la page d'approche.
describe('#4524 — choisir sur quoi Laura s’appuie', () => {
  const withSignals = () => {
    rawAnalysis = {
      recent_signals: [
        { signal: 'Cession de la filiale Uptevia', date: '2026-10-01', source: 'Les Echos' },
        { signal: 'Recrutement de 12 ingénieurs data' },
        { signal: 'Nouveau directeur des achats' },
      ],
    }
  }

  it('le bloc est SOUS le corps du mail (#4980.2), les deux meilleurs signaux cochés, et ils partent à la génération', () => {
    withSignals()
    render(<ApproachPage contactId="c1" channelParam="email" />)
    const block = screen.getByTestId('approach-grounding')
    expect(within(block).getByText("Sur quoi Laura s'appuie")).toBeInTheDocument()
    expect(before(screen.getByLabelText('Corps du message'), block)).toBe(true)
    expect(conversationArgs?.grounding).toEqual({
      mode: 'facts',
      facts: [
        { kind: 'account_signal', label: 'Cession de la filiale Uptevia', proof: 'Les Echos · 2026-10-01' },
        { kind: 'account_signal', label: 'Recrutement de 12 ingénieurs data' },
      ],
    })
  })

  it('« Angle libre » : aucun fait imposé part à la génération', async () => {
    withSignals()
    const user = userEvent.setup()
    render(<ApproachPage contactId="c1" channelParam="email" />)
    await user.click(screen.getByRole('checkbox', { name: /^Angle libre/ }))
    expect(conversationArgs?.grounding).toEqual({ mode: 'free_angle' })
  })

  it('#4524.3 — le panneau nomme LE fait utilisé, jamais le nom du contact', () => {
    withSignals()
    render(<ApproachPage contactId="c1" channelParam="email" />)
    const aside = screen.getByRole('complementary', { name: 'Le contexte à garder' })
    expect(within(aside).getByText('Cession de la filiale Uptevia')).toBeInTheDocument()
    expect(within(aside).getByText('Les Echos · 2026-10-01')).toBeInTheDocument()
    expect(within(aside).queryByText('Paul Ferrer', { selector: 'dd' })).toBeNull()
  })

  it('#4524.5 — aucun signal : une ligne le dit, la génération part comme avant (clé omise)', () => {
    render(<ApproachPage contactId="c1" channelParam="email" />)
    expect(screen.getByText(/Aucun signal connu sur ce compte ni sur ce contact/)).toBeInTheDocument()
    expect(conversationArgs?.grounding).toBeUndefined()
  })

  // #4524.9 — le doute d'homonyme de la fiche atteint la liste cochable des onglets E-mail et LinkedIn.
  it('#4524.9 — doute d’homonyme : les faits du contact le disent et ne partent pas à la génération sans coche', () => {
    withSignals()
    identityDoubtReason = 'homonym_conflict'
    Object.assign(contact, { signals: [{ label: 'Prise de parole au salon Data Paris' }] })
    try {
      render(<ApproachPage contactId="c1" channelParam="email" />)
      expect(screen.getByText(/Peut concerner un homonyme/)).toBeInTheDocument()
      const sent = JSON.stringify(conversationArgs?.grounding)
      expect(sent).not.toContain('Prise de parole au salon Data Paris')
    } finally {
      Object.assign(contact, { signals: undefined })
    }
  })

  it('la rédaction automatique attend la lecture du compte', () => {
    accountReady = false
    render(<ApproachPage contactId="c1" channelParam="email" />)
    expect(conversationArgs?.draftHydrated).toBe(false)
  })
})

// #4525.1 — « Appel » est un ONGLET de la même page : même en-tête, mêmes blocs, même panneau de contexte.
// L'onglet Appel porte des fenêtres (consigner, planifier) qui ont besoin du client de requêtes.
const renderCall = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ApproachPage contactId="c1" channelParam="call" />
    </QueryClientProvider>,
  )

describe('#4525.1 — l’onglet Appel de la page d’approche', () => {
  it('même en-tête (titre, « personne · poste », « Retour au contact »), un seul h1', () => {
    renderCall()
    const head = screen.getByTestId('page-head')
    expect(within(head).getByRole('heading', { level: 1, name: 'Préparer ton appel' })).toBeInTheDocument()
    expect(within(head).getByText('Paul Ferrer · Responsable programme SAP')).toBeInTheDocument()
    expect(within(head).getByText('Retour au contact')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('même « Ce que tu veux obtenir » (un menu, pas des puces), même bloc « Sur quoi Laura s’appuie », même contexte', () => {
    renderCall()
    expect(screen.getByRole('combobox', { name: 'Ce que tu veux obtenir' })).toBeInTheDocument()
    expect(screen.getByTestId('approach-grounding')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Le contexte à garder' })).toBeInTheDocument()
  })

  it('l’onglet Appel est l’un des trois onglets de canal', () => {
    renderCall()
    const nav = screen.getByRole('navigation', { name: 'Canal de préparation' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map(link => link.textContent),
    ).toEqual(['E-mail', 'LinkedIn', 'Appel'])
  })
})

// #4525.5 — « Laura qui connaît l'écran » : la page d'approche déclare son titre et le contact ouvert, quel que soit l'onglet.
describe('#4525.5 — Laura connaît l’écran d’approche', () => {
  beforeEach(() => lauraContext.publish.mockClear())

  it.each([
    ['call', 'Préparer ton appel'],
    ['email', 'Préparer ton e-mail'],
  ])('l’onglet %s déclare « %s » et le contact ouvert', (channelParam, label) => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ApproachPage contactId="c1" channelParam={channelParam} />
      </QueryClientProvider>,
    )
    expect(lauraContext.publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'screen', label, entityId: 'c1', state: 'ready' }),
    )
  })
})

describe('#4980.2 — « Pourquoi ce mail est pertinent » sur la page d’approche', () => {
  it('replié par défaut : le corps est lisible, la justification n’est pas dans le DOM', () => {
    render(<ApproachPage contactId="c1" channelParam="email" />)
    expect(screen.getByLabelText('Corps du message')).toHaveValue(
      'Bonjour Paul, avez-vous pu regarder le parcours de Sophie ?',
    )
    const toggle = screen.getByRole('button', { name: 'Pourquoi ce mail est pertinent' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Le programme rend la reprise prioritaire.')).not.toBeInTheDocument()
  })

  it('un clic déplie la justification ; elle n’est pas supprimée', async () => {
    render(<ApproachPage contactId="c1" channelParam="email" />)
    await userEvent.click(screen.getByRole('button', { name: 'Pourquoi ce mail est pertinent' }))
    expect(screen.getByRole('button', { name: 'Pourquoi ce mail est pertinent' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText('Le programme rend la reprise prioritaire.')).toBeInTheDocument()
  })
})

describe('#4980.2 — le corps du mail se lit sans défiler plus d’un écran', () => {
  const manySignals = () => {
    rawAnalysis = {
      recent_signals: Array.from({ length: 30 }, (_, index) => ({ signal: `Signal numéro ${index + 1}` })),
    }
  }

  it('le corps vient AVANT les blocs de contexte (signaux sur lesquels Laura s’appuie)', () => {
    manySignals()
    render(<ApproachPage contactId="c1" channelParam="email" />)
    const body = screen.getByLabelText('Corps du message')
    expect(before(body, screen.getByTestId('approach-grounding'))).toBe(true)
  })

  it('les signaux sont REPLIÉS par défaut : rien n’est supprimé, un clic les rend', async () => {
    manySignals()
    render(<ApproachPage contactId="c1" channelParam="email" />)
    const block = screen.getByTestId('approach-grounding')
    expect(block.tagName).toBe('DETAILS')
    expect(block).not.toHaveAttribute('open')
    await userEvent.click(within(block).getByText("Sur quoi Laura s'appuie"))
    expect(block).toHaveAttribute('open')
    expect(within(block).getByRole('checkbox', { name: /Signal numéro 30/ })).toBeInTheDocument()
  })
})
