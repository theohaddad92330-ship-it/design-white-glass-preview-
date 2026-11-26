import type { Contact } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CallApproachBody } from './CallApproachBody'

let contact = {} as Contact
const baseContact = {
  id: 'c1',
  full_name: 'Paul Ferrer',
  title: 'Responsable programme SAP',
  entity: 'Altiver Industries',
  phone: null,
  account_id: 'a1',
} as unknown as Contact

const render = (ui: ReactNode) =>
  rtlRender(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  )

const generateDraft = vi.fn()
const editEntry = vi.fn()
const createCall = vi.hoisted(() => vi.fn().mockResolvedValue({}))
let entries: unknown[] = []
let generationStep: string | null = null

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}))
let signals: unknown[] = []
let jobs: unknown[] = []
let dossierObjections: unknown[] | null = null
let conversationArgs: { grounding?: unknown } | undefined
let signalLines: unknown[] = []
vi.mock('@/features/accounts/hooks/useAccountSignalLines', () => ({
  useAccountSignalLines: () => ({ data: { lines: signalLines } }),
}))
vi.mock('./approach-api', () => ({ useApproachAccount: () => ({ companyName: 'Altiver', ready: true }) }))
vi.mock('@/features/accounts/hooks/useAccountRawAnalysis', () => ({
  useAccountRawAnalysis: () => ({
    recent_signals: signals,
    it_job_signals: jobs,
    objections: dossierObjections ?? [
      {
        objection: 'Nous avons déjà des prestataires.',
        response: 'Je ne cherche pas à remplacer une équipe en place.',
      },
      { objection: 'Envoyez-moi une présentation.', response: 'Quel sujet souhaitez-vous que je traite ?' },
      { objection: 'Une troisième.', response: 'Jamais affichée.' },
    ],
  }),
}))
vi.mock('@/features/actions/hooks/useTrackAction', () => ({ useTrackAction: () => ({ mutate: vi.fn() }) }))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useOptionalContactEngagement: () => undefined,
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/useEngagementDraftHydration', () => ({
  useEngagementDraftHydration: () => ({ hydrated: true }),
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/conversation', () => ({
  useEngagementConversation: (args: { grounding?: unknown }) => ({
    ...((conversationArgs = args), {}),
    entries,
    generationStep,
    generateDraft,
    retryDraft: vi.fn(),
    editEntry,
    parameters: {},
    chooseParameters: vi.fn(),
    setParameters: vi.fn(),
  }),
}))
vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/EngagementPanel', () => ({
  trackEngagementOpened: vi.fn(),
  trackMessageCopied: vi.fn(),
  trackMessageGenerated: vi.fn(),
}))
vi.mock('@/features/activities/view/ConsignCallDialog', () => ({
  ConsignCallDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">Consigner un échange</div> : null),
}))
vi.mock('@/features/outreach/api', () => ({ outreachMessagesApi: { createCall } }))
let timelineItems: unknown[] = []
let telephonyConnected = false
let rankingExcluded: { contact_id: string; reason: string }[] = []
vi.mock('@/features/activities/hooks/useTimeline', () => ({
  useTimeline: () => ({ data: { items: timelineItems } }),
}))
vi.mock('@/features/telephony/api', () => ({
  useTelephonyStatus: () => ({ data: { connected: telephonyConnected } }),
}))
vi.mock('@/features/contacts/hooks/useContactRanking', () => ({
  useContactRanking: () => ({ data: { ranked: [], excluded: rankingExcluded } }),
}))
vi.mock('@/features/laura/AiDisclosure', () => ({ AiDisclosure: () => null }))
vi.mock('./ApproachChannelNav', () => ({ ApproachChannelNav: () => <nav>canaux</nav> }))

const script =
  'Bonjour Paul, je vous appelle au sujet de la reprise des données. Est-ce toujours dans votre périmètre ? ' +
  'Comment votre équipe est-elle organisée aujourd’hui ? Quel serait le point le plus utile à faire avancer ?'

beforeEach(() => {
  vi.clearAllMocks()
  contact = baseContact
  signals = []
  jobs = []
  signalLines = []
  dossierObjections = null
  timelineItems = []
  telephonyConnected = false
  rankingExcluded = []
  conversationArgs = undefined
  generationStep = null
  entries = [{ id: 'e1', role: 'assistant', channel: 'phone', subject: '', text: script, rationale: 'Pourquoi.' }]
})

describe('Théo C7 — la page « Préparer ton appel »', () => {
  it('s’ouvre DÉJÀ RÉDIGÉE : ouverture, questions tirées du script, deux objections du compte', () => {
    render(<CallApproachBody contact={contact} />)
    expect(screen.getByRole('textbox', { name: 'Ton ouverture' })).toHaveValue(script)
    expect(screen.getByText('Comment votre équipe est-elle organisée aujourd’hui ?')).toBeInTheDocument()
    expect(screen.getByText('« Nous avons déjà des prestataires. »')).toBeInTheDocument()
    expect(screen.getByText('« Envoyez-moi une présentation. »')).toBeInTheDocument()
    expect(screen.queryByText('« Une troisième. »')).toBeNull()
  })

  it('#4525 — les gestes de l’appel sont rangés sous « Prochaine étape »', () => {
    render(<CallApproachBody contact={contact} />)
    const next = screen.getByRole('group', { name: 'Prochaine étape' })
    expect(within(next).getByRole('button', { name: /consigner/i })).toBeInTheDocument()
    expect(within(next).getByRole('button', { name: /Planifier/ })).toBeInTheDocument()
  })

  it('sans numéro, le support se prépare quand même et le dit', () => {
    render(<CallApproachBody contact={contact} />)
    expect(screen.getByText(/Aucun numéro enregistré/)).toBeInTheDocument()
  })

  it('« Régénérer le support » relance la rédaction ; modifier l’ouverture édite le brouillon courant', async () => {
    render(<CallApproachBody contact={contact} />)
    await userEvent.click(screen.getByRole('button', { name: 'Régénérer le support' }))
    expect(generateDraft).toHaveBeenCalledTimes(1)
    await userEvent.type(screen.getByRole('textbox', { name: 'Ton ouverture' }), '!')
    expect(editEntry).toHaveBeenCalledWith('e1', { subject: '', body: `${script}!` })
  })

  it('« Consigner le résultat » ouvre la fenêtre de consignation', async () => {
    render(<CallApproachBody contact={contact} />)
    await userEvent.click(screen.getByRole('button', { name: 'J’ai passé cet appel — consigner' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Consigner un échange')
  })

  it('« Planifier cet appel » ouvre sa fenêtre et ajoute aux appels à passer avec le jour et l’heure — rien n’est appelé', async () => {
    render(<CallApproachBody contact={contact} />)
    await userEvent.click(screen.getByRole('button', { name: 'Planifier cet appel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter aux appels à passer' }))
    expect(createCall).toHaveBeenCalledTimes(1)
    expect(createCall.mock.calls[0]?.[0]).toMatchObject({ contact_id: 'c1', source: 'contacts', pitch: script })
  })

  it('pendant la rédaction : l’état est dit, jamais un champ vide muet', () => {
    generationStep = 'writing'
    entries = []
    render(<CallApproachBody contact={contact} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Régénérer le support' })).toBeDisabled()
  })
})

/** `a` précède `b` dans le document. */
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('#4978 — le script se lit à la taille de l’ouverture', () => {
  it('questions et objections portent la même taille de texte que l’ouverture (text-lg)', () => {
    render(<CallApproachBody contact={contact} />)
    const opening = screen.getByRole('textbox', { name: 'Ton ouverture' })
    expect(opening.className).toContain('text-lg')
    const question = screen.getByText('Comment votre équipe est-elle organisée aujourd’hui ?')
    expect(question.className).toContain('text-lg')
    expect(question.className).not.toContain('text-sm')
    const objection = screen.getByText('« Nous avons déjà des prestataires. »').closest('li')
    expect(objection?.className).toContain('text-lg')
    expect(objection?.className).not.toContain('text-sm')
  })
})

describe('Théo C7 — la structure de la maquette (`b/c7-approche-appel.html`)', () => {
  it('ordre de Théo : objectif | canal, « Ce qu’il faut savoir », « Ton ouverture », questions, objections, actions', () => {
    contact = {
      ...baseContact,
      phone: '+33465711040',
      email_sent_at: '2026-10-16T09:00:00.000Z',
      key_points: ['Répond avant 10 h'],
    } as unknown as Contact
    telephonyConnected = true // #4525.5 — « Appeler » n'existe qu'avec un outil d'appel branché
    render(<CallApproachBody contact={contact} />)
    const order = [
      screen.getByText('Ce que tu veux obtenir'),
      screen.getByText('Canal de préparation'),
      screen.getByRole('heading', { name: "Ce qu'il faut savoir avant d'appeler" }),
      screen.getByRole('heading', { name: 'Ton ouverture' }),
      screen.getByRole('heading', { name: 'Trois questions pour qualifier' }),
      screen.getByRole('heading', { name: "Si l'on te répond…" }),
      screen.getByRole('link', { name: 'Appeler' }),
      screen.getByRole('button', { name: 'J’ai passé cet appel — consigner' }),
      screen.getByRole('button', { name: 'Planifier cet appel' }),
      screen.getByRole('button', { name: 'Copier le support' }),
    ]
    order.slice(1).forEach((node, index) => expect(before(order[index]!, node)).toBe(true))
    // Le point clé figure aussi, cochable, dans « Sur quoi Laura s'appuie » (#4524) : deux usages, une même donnée.
    expect(screen.getAllByText('Répond avant 10 h').length).toBeGreaterThan(0)
  })

  it('colonne de droite : « Le contexte à garder » puis « Éviter le message passe-partout »', () => {
    render(<CallApproachBody contact={contact} />)
    const aside = screen.getByRole('complementary', { name: 'Le contexte à garder' })
    expect(
      within(aside)
        .getAllByRole('heading', { level: 2 })
        .map(node => node.textContent),
    ).toEqual(['Le contexte à garder', 'Éviter le message passe-partout'])
  })

  it('rien de connu sur la personne : la carte « Ce qu’il faut savoir » n’existe pas (jamais « 0 »)', () => {
    render(<CallApproachBody contact={contact} />)
    expect(screen.queryByRole('heading', { name: "Ce qu'il faut savoir avant d'appeler" })).toBeNull()
  })

  it('numéro connu : écrit EN CLAIR, « Appeler » ouvre le téléphone (tel:) — rien n’est composé par Bellum', () => {
    contact = { ...baseContact, phone: '+33465711040' } as unknown as Contact
    telephonyConnected = true // #4525.5 — « Appeler » n'existe qu'avec un outil d'appel branché
    render(<CallApproachBody contact={contact} />)
    expect(screen.getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:+33465711040')
    expect(screen.getByText(/04 65 71 10 40|\+33 4 65 71 10 40/)).toBeInTheDocument()
    expect(createCall).not.toHaveBeenCalled()
  })

  it('sans numéro : pas de « Appeler », « Consigner le résultat » redevient l’action principale', () => {
    render(<CallApproachBody contact={contact} />)
    expect(screen.queryByRole('link', { name: 'Appeler' })).toBeNull()
    expect(screen.getByRole('button', { name: 'J’ai passé cet appel — consigner' })).toBeInTheDocument()
  })
})

// #4524 / #4525.1 — l'onglet Appel porte le MÊME bloc « Sur quoi Laura s'appuie » que E-mail et LinkedIn.
describe('#4524 — l’onglet Appel : sur quoi Laura s’appuie', () => {
  it('même bloc, au-dessus du support : les deux meilleurs signaux cochés partent à la génération', () => {
    signals = [
      { signal: 'Cession de la filiale Uptevia', source: 'Les Echos' },
      { signal: 'Recrutement data' },
      { signal: 'Autre' },
    ]
    render(<CallApproachBody contact={contact} />)
    const block = screen.getByTestId('approach-grounding')
    expect(before(block, screen.getByRole('heading', { name: 'Ton ouverture' }))).toBe(true)
    expect(conversationArgs?.grounding).toEqual({
      mode: 'facts',
      facts: [
        { kind: 'account_signal', label: 'Cession de la filiale Uptevia', proof: 'Les Echos' },
        { kind: 'account_signal', label: 'Recrutement data' },
      ],
    })
  })

  it('#4977 — une offre d’emploi du compte est cochée d’emblée, part avec son sujet, et l’écran dit que l’appel s’ouvre dessus', () => {
    signals = [
      { signal: 'Cession de la filiale Uptevia' },
      { signal: 'Expert OpenShift à Toulouse', type: 'recrutement', date: '2026-10-20' },
    ]
    render(<CallApproachBody contact={contact} />)
    expect(screen.getByTestId('call-offer-state')).toHaveTextContent(
      'L’appel s’ouvre sur l’offre : Expert OpenShift à Toulouse',
    )
    expect(conversationArgs?.grounding).toMatchObject({
      mode: 'facts',
      facts: [{ label: 'Cession de la filiale Uptevia' }, { label: 'Expert OpenShift à Toulouse', topic: 'job_offer' }],
    })
  })

  it('#4977 — aucune offre liée : l’écran le dit, le script reste général', () => {
    signals = [{ signal: 'Cession de la filiale Uptevia' }]
    render(<CallApproachBody contact={contact} />)
    expect(screen.getByTestId('call-offer-state')).toHaveTextContent(
      'Aucune offre d’emploi liée à cet appel : le script reste général.',
    )
  })

  it('aucun signal : le bloc le dit, la génération part comme avant', () => {
    render(<CallApproachBody contact={contact} />)
    expect(screen.getByText(/Aucun signal connu sur ce compte ni sur ce contact/)).toBeInTheDocument()
    expect(conversationArgs?.grounding).toBeUndefined()
  })

  it('#4524.4 — « Compte » dit le compte, pas l’entité du poste', () => {
    render(<CallApproachBody contact={contact} />)
    const aside = screen.getByRole('complementary', { name: 'Le contexte à garder' })
    expect(within(aside).getByText('Altiver')).toBeInTheDocument()
    expect(within(aside).queryByText('Altiver Industries')).toBeNull()
  })
})

// #4525.1/.2 — l'onglet Appel est un onglet comme les autres : rien de vide, rien de « non préparé ».
describe('#4525.2 — le support se génère DANS l’onglet', () => {
  it('jamais le bloc vide « Aucun support préparé » : sans brouillon encore, la rédaction est dite', () => {
    generationStep = 'writing'
    entries = []
    render(<CallApproachBody contact={contact} />)
    expect(screen.queryByText(/Aucun support préparé/)).toBeNull()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('« pourquoi ce contact » est lu dans « Ce qu’il faut savoir avant d’appeler »', () => {
    contact = { ...baseContact, why_contact: 'Pilote la reprise des données SAP' } as unknown as Contact
    render(<CallApproachBody contact={contact} />)
    expect(screen.getByRole('heading', { name: "Ce qu'il faut savoir avant d'appeler" })).toBeInTheDocument()
    expect(screen.getByText('Pilote la reprise des données SAP')).toBeInTheDocument()
  })
})

// #4525.5 — ce que la page dédiée retirée apportait : dernier échange, question du rôle, « Appeler » selon l'outil.
describe('#4525.5 — l’onglet Appel garde ce que la page dédiée apportait', () => {
  it('le dernier échange de la timeline est dit, avec son objet', () => {
    timelineItems = [
      { kind: 'note', occurredAt: '2026-10-25T09:00:00.000Z', subject: 'Pour moi' },
      { kind: 'call', occurredAt: '2026-10-20T09:00:00.000Z', subject: 'Point reprise des données' },
    ]
    render(<CallApproachBody contact={contact} />)
    expect(screen.getByText(/Dernier échange le 20 octobre : Point reprise des données\./)).toBeInTheDocument()
    expect(screen.queryByText(/Pour moi/)).toBeNull()
  })

  it('aucun échange : aucune ligne « dernier échange »', () => {
    render(<CallApproachBody contact={contact} />)
    expect(screen.queryByText(/Dernier échange/)).toBeNull()
  })

  it('la question du rôle de décision ouvre les questions pour qualifier, avant celles du script', () => {
    contact = { ...baseContact, decision_role: 'economic' } as unknown as Contact
    render(<CallApproachBody contact={contact} />)
    const questions = screen.getByRole('heading', { name: 'Trois questions pour qualifier' }).parentElement!
    const items = within(questions)
      .getAllByRole('listitem')
      .map(item => item.textContent)
    expect(items[0]).toBe('Comment le budget de ce sujet est-il arbitré, et sur quel calendrier ?')
    expect(items).toHaveLength(3)
  })

  it('sans rôle établi, aucune question de rôle : seules celles du script', () => {
    render(<CallApproachBody contact={contact} />)
    expect(screen.queryByText(/budget de ce sujet/)).toBeNull()
  })

  it('« Appeler » : numéro connu mais aucun outil d’appel branché → absent, « Consigner » reprend la place', () => {
    contact = { ...baseContact, phone: '+33 6 12 34 56 78' } as unknown as Contact
    render(<CallApproachBody contact={contact} />)
    const next = screen.getByRole('group', { name: 'Prochaine étape' })
    expect(within(next).queryByRole('link', { name: /Appeler/ })).toBeNull()
    expect(screen.queryByText(/n'appelle jamais à ta place/)).toBeNull()
  })

  it('« Appeler » : outil branché ET numéro connu → présent ; outil branché sans numéro → absent', () => {
    telephonyConnected = true
    contact = { ...baseContact, phone: '+33 6 12 34 56 78' } as unknown as Contact
    const { unmount } = render(<CallApproachBody contact={contact} />)
    expect(screen.getByRole('link', { name: /Appeler/ })).toHaveAttribute('href', 'tel:+33612345678')
    unmount()
    contact = baseContact
    render(<CallApproachBody contact={contact} />)
    expect(screen.queryByRole('link', { name: /Appeler/ })).toBeNull()
  })
})

// #4524.9 — le doute d'homonyme de la fiche traverse jusqu'à la liste cochable de l'onglet Appel.
describe('#4524.9 — l’onglet Appel dit le doute d’homonyme sur les faits du contact', () => {
  it('doute non levé : les faits du contact portent la mention et ne sont pas cochés d’emblée', () => {
    rankingExcluded = [{ contact_id: 'c1', reason: 'homonym_conflict' }]
    contact = { ...baseContact, signals: [{ label: 'Prise de parole au salon', date: null }] } as unknown as Contact
    render(<CallApproachBody contact={contact} />)
    expect(screen.getByText(/Peut concerner un homonyme/)).toBeInTheDocument()
  })

  it('pas de doute : aucune mention', () => {
    contact = { ...baseContact, signals: [{ label: 'Prise de parole au salon', date: null }] } as unknown as Contact
    render(<CallApproachBody contact={contact} />)
    expect(screen.queryByText(/homonyme/)).toBeNull()
  })
})

// #4977 — l'offre collectée (it_job_signals) suit le même mécanisme que les signaux de recrutement.
describe('#4977 — l’offre d’emploi collectée', () => {
  it('avec une offre : elle part au moteur (poste, ville, topic) et l’écran le dit une fois', () => {
    jobs = [{ title: 'Data Engineer Senior', city: 'Lyon', date: '2026-10-20' }]
    render(<CallApproachBody contact={contact} />)
    expect(conversationArgs?.grounding).toMatchObject({
      mode: 'facts',
      facts: [
        { kind: 'account_signal', label: expect.stringContaining('Data Engineer Senior — Lyon'), topic: 'job_offer' },
      ],
    })
    expect(screen.getAllByTestId('call-offer-state')).toHaveLength(1)
    expect(screen.getByTestId('call-offer-state')).toHaveTextContent(/L’appel s’ouvre sur l’offre : Data Engineer/)
  })

  it('sans offre : une seule phrase dit que le script reste général', () => {
    render(<CallApproachBody contact={contact} />)
    expect(screen.getAllByTestId('call-offer-state')).toHaveLength(1)
    expect(screen.getByTestId('call-offer-state')).toHaveTextContent(/le script reste général/i)
  })
})

// #4975 / #4976 — l'ouverture et les objections sont deux blocs ; « Autre approche » régénère.
describe('#4975 / #4976 — ouverture et objections séparées, « Autre approche »', () => {
  it('deux blocs distincts : l’ouverture ne contient pas les objections', () => {
    render(<CallApproachBody contact={contact} />)
    const opening = screen.getByTestId('call-opening-block')
    const objections = screen.getByTestId('call-objections-block')
    expect(opening).not.toContainElement(objections)
    expect(objections).toHaveTextContent('Nous avons déjà des prestataires.')
    expect(opening).not.toHaveTextContent('Nous avons déjà des prestataires.')
  })

  it('« Autre approche » régénère le support', async () => {
    render(<CallApproachBody contact={contact} />)
    await userEvent.click(screen.getByRole('button', { name: 'Autre approche' }))
    expect(generateDraft).toHaveBeenCalledTimes(1)
  })

  it('« Autre approche » est inerte pendant la rédaction', () => {
    generationStep = 'writing'
    render(<CallApproachBody contact={contact} />)
    expect(screen.getByRole('button', { name: 'Autre approche' })).toBeDisabled()
  })

  // #4975.1 — recette démo 03/11 : « Objection — … Réponse — … » se lisait DANS l'ouverture, le bloc restait vide.
  it('le script de démo porte l’objection : elle quitte l’ouverture et remplit « Si l’on te répond… »', () => {
    dossierObjections = []
    entries = [
      {
        id: 'e1',
        role: 'assistant',
        channel: 'phone',
        subject: '',
        text: 'Accroche — « Bonjour Paul. »\nObjection — « Nous avons déjà un prestataire. » Réponse — « Je viens compléter. »\nDemande — « Vingt minutes ? »',
        rationale: 'Pourquoi.',
      },
    ]
    render(<CallApproachBody contact={contact} />)
    const opening = screen.getByRole('textbox', { name: 'Ton ouverture' }) as HTMLTextAreaElement
    expect(opening.value).not.toContain('Objection')
    expect(opening.value).toContain('Accroche')
    expect(opening.value).toContain('Demande')
    const block = screen.getByTestId('call-objections-block')
    expect(block).toHaveTextContent('Nous avons déjà un prestataire.')
    expect(block).toHaveTextContent('Je viens compléter.')
  })
})

describe('#4977.1 — l’ouverture part de l’offre récente que « Signaux & besoins » montre', () => {
  const offerLine = {
    id: 'l1',
    date: '2026-10-28',
    date_precision: 'day',
    period: 'now',
    type: 'recrutement',
    title: 'Joaillier (H/F)',
    detail: null,
    url: null,
    people_hints: { names: [], roles: [], location: 'Paris' },
  }

  it('l’offre (poste, ville, date) part au moteur comme fait déclencheur, cochée d’emblée', () => {
    signalLines = [offerLine]
    render(<CallApproachBody contact={contact} />)
    expect(conversationArgs?.grounding).toMatchObject({
      mode: 'facts',
      facts: expect.arrayContaining([
        { kind: 'account_signal', label: 'Joaillier (H/F) — Paris', proof: '2026-10-28', topic: 'job_offer' },
      ]),
    })
  })

  it('aucune offre : aucun fait « job_offer » n’est inventé', () => {
    render(<CallApproachBody contact={contact} />)
    expect(JSON.stringify(conversationArgs?.grounding ?? null)).not.toContain('job_offer')
  })
})

describe('#4975.1 / #4976.1 — l’objection n’est pas dans l’ouverture ; sans objection au dossier, on le dit', () => {
  const withObjectionInScript =
    'Bonjour Laurent, je vous appelle au sujet de la reprise des données.\n' +
    'Objection — « Nous avons déjà un prestataire. » Réponse — « Justement : je complète. »\n' +
    'Demande — « Vingt minutes la semaine prochaine ? »'

  it('#4975.1 — « Ton ouverture » ne porte aucune objection, même si le script rédigé en contient une', () => {
    entries = [{ id: 'e1', role: 'assistant', channel: 'phone', subject: '', text: withObjectionInScript }]
    render(<CallApproachBody contact={contact} />)
    const opening = screen.getByRole('textbox', { name: 'Ton ouverture' }) as HTMLTextAreaElement
    expect(opening.value).toContain('Bonjour Laurent')
    expect(opening.value).toContain('Vingt minutes')
    expect(opening.value).not.toMatch(/Objection|Réponse —|prestataire/)
  })

  it('#4975.1 — le bloc « Si l’on te répond… » existe, séparé de l’ouverture', () => {
    render(<CallApproachBody contact={contact} />)
    const block = screen.getByTestId('call-objections-block')
    expect(within(block).getByRole('heading', { name: "Si l'on te répond…" })).toBeInTheDocument()
    expect(block.contains(screen.getByRole('textbox', { name: 'Ton ouverture' }))).toBe(false)
  })

  // #4975.1 (main, recette démo 03/11) : sans objection au dossier, celles du SCRIPT remplissent le bloc ;
  // le constat « aucune » ne vaut donc que pour un dossier ET un script sans objection.
  it('#4976.1 — ni dossier ni script ne portent d’objection : le bloc le DIT, n’invente rien, « Autre approche » reste offert', async () => {
    dossierObjections = []
    entries = [
      {
        id: 'e1',
        role: 'assistant',
        channel: 'phone',
        subject: '',
        text: 'Bonjour Laurent.\nDemande — « Vingt minutes ? »',
      },
    ]
    render(<CallApproachBody contact={contact} />)
    const block = screen.getByTestId('call-objections-block')
    expect(block).toHaveTextContent('aucune relevée dans le dossier de ce compte')
    expect(block).not.toHaveTextContent('Nous avons déjà un prestataire')
    await userEvent.click(within(block).getByRole('button', { name: 'Autre approche' }))
    expect(generateDraft).toHaveBeenCalledTimes(1)
  })
})
