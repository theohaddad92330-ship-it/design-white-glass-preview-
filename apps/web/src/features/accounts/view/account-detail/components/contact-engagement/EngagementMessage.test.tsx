import { OUTREACH_PERSONA_PROFILES, type Contact } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { EngagementMessage } from './EngagementMessage'

const SENT_AT = '2026-07-19T10:00:00.000Z'

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) } }))

const sendEmail = vi.fn()
const getSendability = vi.fn()
const resolveSendAttempt = vi.fn()
const declareSent = vi.fn()
const getCadence = vi.fn()
// #3694.8 — `EngagementSendEmailAction` lit désormais `useContactRanking` (même
// source que `ContactRecommendationAuthorizationCard`) pour bloquer l'envoi sur
// un doute d'identité non levé ; vide par défaut ⇒ aucune de ces lignes n'est
// bloquée par ce doute dans les tests existants, qui ne testent pas ce point.
const declareTouch = vi.fn().mockResolvedValue({ contact_id: 'c1' })
const rankByAccount = vi.fn().mockResolvedValue({ ranked: [], excluded: [] })
vi.mock('@/features/contacts/api', () => ({
  contactsApi: {
    sendEmail: (...args: unknown[]) => sendEmail(...args),
    getSendability: (...args: unknown[]) => getSendability(...args),
    resolveSendAttempt: (...args: unknown[]) => resolveSendAttempt(...args),
    declareSent: (...args: unknown[]) => declareSent(...args),
    getCadence: (...args: unknown[]) => getCadence(...args),
    rankByAccount: (...args: unknown[]) => rankByAccount(...args),
    declareTouch: (...args: unknown[]) => declareTouch(...args),
  },
  contactKeys: {
    detail: (id: string) => ['contact', id],
    byAccount: (id: string) => ['contacts', id],
    cadence: (id: string) => ['cadence', id],
    sendability: (id: string) => ['contact', id, 'sendability'],
    ranking: (accountId: string, query: unknown) => ['contacts', accountId, 'ranking', query],
  },
}))
vi.mock('@/features/accounts/api', () => ({ accountKeys: { detail: (id: string) => ['account', id] } }))
// #4546.5 — l'écran de confirmation lit les boîtes qui peuvent envoyer ; ici une seule boîte, aucun choix à faire.
vi.mock('@/features/mailbox/api', () => ({ useMailboxSenders: () => ({ data: undefined }) }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' }, loading: false }) }))

const createPlanItem = vi.fn()
vi.mock('@/features/actions/planItems.api', () => ({
  planItemsApi: { create: (...args: unknown[]) => createPlanItem(...args) },
}))

const createCall = vi.fn()
vi.mock('@/features/outreach/api', () => ({
  outreachMessagesApi: { createCall: (...args: unknown[]) => createCall(...args) },
}))

const writeText = vi.fn()
const openWindow = vi.fn()

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

beforeEach(() => {
  createPlanItem.mockReset().mockResolvedValue({ id: 'task-1' })
  createCall.mockReset().mockResolvedValue({ id: 'call-1' })
  sendEmail.mockReset().mockResolvedValue({
    contact_id: 'c1',
    sent_to: 'jean@corp.fr',
    email_sent_at: SENT_AT,
    channel: 'workspace',
    sent_from: 'contact@acme-esn.fr',
    state: 'handed_off',
  })
  resolveSendAttempt.mockReset().mockResolvedValue({ contact_id: 'c1', state: 'failed' })
  declareSent.mockReset().mockResolvedValue({ contact_id: 'c1', declared: true })
  getSendability.mockReset().mockResolvedValue({ contact_id: 'c1', can_send: true, reason: null })
  // #2714 — pas de relance programmée par défaut ; les tests qui en veulent une
  // la posent eux-mêmes (`getCadence.mockResolvedValueOnce`).
  getCadence.mockReset().mockResolvedValue({
    contact_id: 'c1',
    scenario: { state: 'froid', template: 'standard', citation: null },
    contacted: false,
    anchor_date: null,
    scheduled: false,
    steps: [],
    next_step: null,
  })
  toastError.mockReset()
  writeText.mockReset().mockResolvedValue(undefined)
  openWindow.mockReset()
  vi.stubGlobal('open', openWindow)
})

const contact = (over: Partial<Contact> = {}): Contact =>
  ({
    id: 'c1',
    account_id: 'acc-1',
    full_name: 'Jean Dupont',
    email: 'jean@corp.fr',
    linkedin_url: 'https://www.linkedin.com/in/jean-dupont',
    email_sent_at: null,
    ...over,
  }) as Contact

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

// `userEvent.setup()` installs its own `navigator.clipboard` stub — re-pin ours
// afterwards so the assertions observe what the component actually copied.
function user() {
  const session = userEvent.setup({ pointerEventsCheck: 0 })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return session
}

function renderEmail(over: Partial<Contact> = {}, text = 'Corps relu à l’écran.', isCurrentDraft = true) {
  return wrap(
    <EngagementMessage
      channel="email"
      contact={contact(over)}
      isCurrentDraft={isCurrentDraft}
      subject="Objet relu"
      text={text}
      onLinkedinDeclaredSent={vi.fn()}
      onLinkedinOpen={vi.fn()}
      onMessageCopy={vi.fn()}
      onDismiss={vi.fn()}
    />,
  )
}

// #4418.1 — « Marquer envoyé » : le commercial a envoyé lui-même ; déclaratif, jamais une preuve.
describe('EngagementMessage — Marquer envoyé (#4418.1)', () => {
  it('appelle la route de déclaration puis affiche un compte rendu DÉCLARÉ, sans envoi Bellum', async () => {
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Marquer envoyé' }))

    await waitFor(() => expect(declareSent).toHaveBeenCalledWith('c1', 'email'))
    expect(sendEmail).not.toHaveBeenCalled()
    expect(await screen.findByText(/Déclaré/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marquer envoyé' })).not.toBeInTheDocument()
  })

  it('reste un geste du brouillon courant : absent d’une version précédente du fil', () => {
    renderEmail({}, 'Ancien corps.', false)
    expect(screen.queryByRole('button', { name: 'Marquer envoyé' })).not.toBeInTheDocument()
  })

  it('dit l’échec et garde le bouton quand la déclaration échoue', async () => {
    declareSent.mockRejectedValueOnce(new Error('boom'))
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Marquer envoyé' }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Marquer envoyé' })).toBeInTheDocument()
  })
})

describe('EngagementMessage — envoi email depuis le panneau', () => {
  it('ne déclenche aucun envoi tant que la confirmation n’est pas validée', async () => {
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(screen.getByText('Envoyer cet email ?')).toBeInTheDocument()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('affiche le destinataire et l’objet dans la confirmation', async () => {
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(screen.getByText('Jean Dupont · jean@corp.fr')).toBeInTheDocument()
    expect(screen.getAllByText('Objet relu').length).toBeGreaterThan(0)
  })

  // #3699.1 — la confirmation dit la vérité sur l'expéditeur : celui que le
  // serveur utilisera (jamais un nom de marque supposé), les réponses et le corps relu.
  it('affiche l’expéditeur réel, l’adresse de réponse et le corps relu (#3699.1)', async () => {
    getSendability.mockResolvedValue({
      contact_id: 'c1',
      can_send: true,
      reason: null,
      sender: 'contact@acme-esn.fr',
      reply_to: 'rep@esn.fr',
    })
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText('contact@acme-esn.fr')).toBeInTheDocument()
    expect(screen.getByText('rep@esn.fr')).toBeInTheDocument()
    expect(screen.getByText('De')).toBeInTheDocument()
  })

  // Le cœur du piège : le brouillon affiché n'est jamais persisté, donc l'envoi
  // doit transporter le texte à l'écran — pas l'état serveur.
  it('envoie EXACTEMENT le brouillon affiché, pas le brouillon stocké', async () => {
    const u = user()
    renderEmail({ email_message: { subject: 'Vieil objet', body: 'Vieux corps de l’analyse.' } } as Partial<Contact>)

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    await u.click(screen.getByRole('button', { name: "Envoyer l'email" }))

    await waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1))
    expect(sendEmail).toHaveBeenCalledWith('c1', { subject: 'Objet relu', body: 'Corps relu à l’écran.' }, 'workspace')
  })

  it('#2714 — affiche le compte rendu VÉRIFIÉ après l’envoi et retire le bouton', async () => {
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    await u.click(screen.getByRole('button', { name: "Envoyer l'email" }))

    await waitFor(() => expect(screen.getByText(/Pris en charge par le service d.envoi/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument()
  })

  it('un double-clic sur la confirmation n’envoie qu’une fois', async () => {
    const u = user()
    let resolve: ((value: unknown) => void) | undefined
    sendEmail.mockImplementationOnce(() => new Promise(r => (resolve = r)))
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    const confirm = screen.getByRole('button', { name: "Envoyer l'email" })
    await u.click(confirm)
    await u.click(confirm)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    resolve?.({ contact_id: 'c1', sent_to: 'jean@corp.fr', email_sent_at: SENT_AT })
  })

  it('n’offre pas l’envoi à un contact déjà contacté', () => {
    renderEmail({ email_sent_at: SENT_AT } as Partial<Contact>)

    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument()
    expect(screen.getByText(/Pris en charge par le service d.envoi/)).toBeInTheDocument()
  })

  it('désactive l’envoi quand le contact n’a pas d’adresse email', () => {
    renderEmail({ email: null } as Partial<Contact>)

    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })

  it('désactive l’envoi quand le brouillon est vide', () => {
    renderEmail({}, '   ')

    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })

  it('remonte un désabonnement en clair, jamais le code brut', async () => {
    const u = user()
    sendEmail.mockRejectedValueOnce(new ApiError('Ce contact s’est désabonné', 409, 'suppressed'))
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    await u.click(screen.getByRole('button', { name: "Envoyer l'email" }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const description = toastError.mock.calls[0]?.[1]?.description as string
    expect(description).toContain('désinscrit')
    expect(description).not.toContain('suppressed')
    // L'échec ne doit pas faire croire à un envoi réussi.
    expect(screen.queryByText(/Pris en charge par le service d.envoi/)).not.toBeInTheDocument()
  })
})

/**
 * #2714 — « quand on envoie un mail, manque d'un compte rendu après avoir
 * envoyé un email » (SKAIZen Group, 22/09/2026). Avant : un « Envoyé le … »
 * isolé, rien de plus. Le récapitulatif (partagé, `SendReceipt`, avec la
 * déclaration LinkedIn — GA-26) nomme le destinataire, le canal,
 * l'horodatage, sa NATURE (vérifié — Bellum l'a réellement expédié, jamais
 * confondu avec un « déclaré » LinkedIn — `c73_fait_ne_porte_pas_preuve_denvoi`),
 * l'action d'où l'envoi est parti (propre à l'email) et la suite prévue si
 * la cadence en porte une (propre à l'email). Il ne montre JAMAIS le corps
 * du message (hors périmètre, issue sœur #2716).
 */
describe('EngagementMessage — #2714 le compte rendu après envoi', () => {
  it('nomme le destinataire, le canal, l’horodatage et l’action d’origine', async () => {
    renderEmail({ email_sent_at: SENT_AT } as Partial<Contact>)

    const summary = await screen.findByTestId('engagement-sent-summary')
    expect(within(summary).getByText('Jean Dupont · jean@corp.fr')).toBeInTheDocument()
    expect(within(summary).getByText('E-mail')).toBeInTheDocument()
    expect(within(summary).getByText('Date')).toBeInTheDocument()
    expect(within(summary).getByText(/message individuel/)).toBeInTheDocument()
  })

  it('dit la NATURE — vérifié, jamais confondu avec une déclaration', async () => {
    renderEmail({ email_sent_at: SENT_AT } as Partial<Contact>)

    expect(await screen.findByText(/Pris en charge par le service d.envoi/)).toBeInTheDocument()
  })

  it('le compte rendu ne reprend JAMAIS le corps du message envoyé', async () => {
    // Le corps reste affiché ailleurs sur le panneau (c'est le message
    // lui-même, relu avant envoi) — #2714 porte sur le récapitulatif, qui ne
    // doit pas le RÉPÉTER (hors périmètre, issue sœur #2716).
    renderEmail({ email_sent_at: SENT_AT } as Partial<Contact>, 'Corps confidentiel — jamais affiché.')

    const summary = await screen.findByTestId('engagement-sent-summary')
    expect(within(summary).queryByText('Corps confidentiel — jamais affiché.')).not.toBeInTheDocument()
  })

  it('nomme la suite prévue quand la cadence en porte une', async () => {
    getCadence.mockResolvedValueOnce({
      contact_id: 'c1',
      scenario: { state: 'froid', template: 'standard', citation: null },
      contacted: true,
      anchor_date: '2026-07-19',
      scheduled: true,
      steps: [],
      next_step: {
        key: 'relance',
        label: 'Relance',
        offset_days: 3,
        due_date: '2026-07-22',
        done: false,
        item_id: 'item-1',
        body: null,
      },
    })
    renderEmail({ email_sent_at: SENT_AT } as Partial<Contact>)

    const summary = await screen.findByTestId('engagement-sent-summary')
    expect(await within(summary).findByText(/Prochaine étape : Relance/)).toBeInTheDocument()
  })

  it('ne nomme AUCUNE suite quand la cadence n’en porte pas', async () => {
    renderEmail({ email_sent_at: SENT_AT } as Partial<Contact>)

    await screen.findByText(/Pris en charge par le service d.envoi/)
    expect(screen.queryByText(/Prochaine étape/)).not.toBeInTheDocument()
  })
})

describe('EngagementMessage — LinkedIn en un geste', () => {
  const onLinkedinOpen = vi.fn()
  const onMessageCopy = vi.fn()

  beforeEach(() => {
    onLinkedinOpen.mockClear()
    onMessageCopy.mockClear()
  })

  function renderLinkedin(over: Partial<Contact> = {}) {
    return wrap(
      <EngagementMessage
        channel="linkedin"
        contact={contact(over)}
        isCurrentDraft
        subject=""
        text="Bonjour Jean, ..."
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={onLinkedinOpen}
        onMessageCopy={onMessageCopy}
        onDismiss={vi.fn()}
      />,
    )
  }

  it('copie le message ET ouvre LinkedIn en un seul clic', async () => {
    const u = user()
    renderLinkedin()

    await u.click(screen.getByRole('button', { name: 'Copier et ouvrir LinkedIn' }))

    expect(writeText).toHaveBeenCalledWith('Bonjour Jean, ...')
    expect(openWindow).toHaveBeenCalledWith('https://www.linkedin.com/in/jean-dupont', '_blank', 'noopener,noreferrer')
  })

  it('trace les deux actions (message copié + LinkedIn ouvert)', async () => {
    const u = user()
    renderLinkedin()

    await u.click(screen.getByRole('button', { name: 'Copier et ouvrir LinkedIn' }))

    expect(onLinkedinOpen).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onMessageCopy).toHaveBeenCalledTimes(1))
  })

  // Aucune URL de messagerie n'est dérivable d'un slug public : on ouvre le
  // profil plutôt qu'une URL fabriquée qui tomberait sur une page d'erreur.
  it('ouvre le profil, jamais une URL de messagerie fabriquée', async () => {
    const u = user()
    renderLinkedin()

    await u.click(screen.getByRole('button', { name: 'Copier et ouvrir LinkedIn' }))

    expect(openWindow.mock.calls[0]?.[0]).not.toContain('/messaging')
  })

  it('retombe sur une simple copie quand le contact n’a pas de LinkedIn', async () => {
    const u = user()
    renderLinkedin({ linkedin_url: null } as Partial<Contact>)

    await u.click(screen.getByRole('button', { name: 'Copier le message' }))

    expect(writeText).toHaveBeenCalledWith('Bonjour Jean, ...')
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('n’expose aucun envoi LinkedIn programmatique', () => {
    renderLinkedin()

    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument()
  })
})

// Un email part chez un vrai prospect : une version périmée du fil ne doit pas
// rester expédiable d'un clic. On retire le contrôle (plutôt que d'avertir) et
// on explique l'absence par un badge.
describe('EngagementMessage — un seul point d’envoi dans le fil', () => {
  it('n’offre ni envoi ni édition sur une version antérieure', () => {
    renderEmail({}, 'Ancien brouillon.', false)

    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Éditer' })).not.toBeInTheDocument()
  })

  it('marque explicitement la version antérieure', () => {
    renderEmail({}, 'Ancien brouillon.', false)

    expect(screen.getByText('Version antérieure')).toBeInTheDocument()
  })

  it('laisse la copie disponible sur une version antérieure', async () => {
    const u = user()
    renderEmail({}, 'Ancien brouillon.', false)

    await u.click(screen.getByRole('button', { name: 'Copier le message' }))

    expect(writeText).toHaveBeenCalledWith('Ancien brouillon.')
  })

  it('ne marque pas le brouillon courant comme périmé', () => {
    renderEmail()

    expect(screen.queryByText('Version antérieure')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
  })
})

describe('EngagementMessage — édition du brouillon avant envoi', () => {
  async function edit(u: ReturnType<typeof user>, body: string, subject?: string) {
    await u.click(screen.getByRole('button', { name: 'Éditer' }))
    const bodyField = screen.getByLabelText('Corps du message')
    await u.clear(bodyField)
    await u.type(bodyField, body)
    if (subject !== undefined) {
      const subjectField = screen.getByLabelText("Objet de l'email")
      await u.clear(subjectField)
      await u.type(subjectField, subject)
    }
  }

  // LE cœur du chantier : l'édition ne doit pas rouvrir l'écart entre ce que le
  // commercial lit et ce que Bellum expédie.
  it('envoie EXACTEMENT le texte édité à la main, pas le brouillon d’origine', async () => {
    const u = user()
    renderEmail()

    await edit(u, 'Version retouchée par le commercial.', 'Objet retouché')
    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    await u.click(screen.getByRole('button', { name: "Envoyer l'email" }))

    await waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1))
    expect(sendEmail).toHaveBeenCalledWith(
      'c1',
      { subject: 'Objet retouché', body: 'Version retouchée par le commercial.' },
      'workspace',
    )
  })

  it('affiche le texte édité une fois l’édition terminée', async () => {
    const u = user()
    renderEmail()

    await edit(u, 'Version retouchée.')
    await u.click(screen.getByRole('button', { name: 'Terminer' }))

    expect(screen.getByText('Version retouchée.')).toBeInTheDocument()
    expect(screen.queryByText('Corps relu à l’écran.')).not.toBeInTheDocument()
  })

  it('copie le texte édité, pas l’original', async () => {
    const u = user()
    renderEmail()

    await edit(u, 'Version retouchée.')
    await u.click(screen.getByRole('button', { name: 'Copier le message' }))

    expect(writeText).toHaveBeenCalledWith('Version retouchée.')
  })

  it('reprend l’objet et le corps générés comme point de départ', async () => {
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Éditer' }))

    expect(screen.getByLabelText('Corps du message')).toHaveValue('Corps relu à l’écran.')
    expect(screen.getByLabelText("Objet de l'email")).toHaveValue('Objet relu')
  })

  it('vider le corps désactive l’envoi', async () => {
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Éditer' }))
    await u.clear(screen.getByLabelText('Corps du message'))

    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })

  it('permet d’éditer un message LinkedIn (sans champ objet)', async () => {
    const u = user()
    renderLinkedinCurrent()

    await u.click(screen.getByRole('button', { name: 'Éditer' }))

    expect(screen.getByLabelText('Corps du message')).toBeInTheDocument()
    expect(screen.queryByLabelText("Objet de l'email")).not.toBeInTheDocument()
  })
})

describe('EngagementMessage — désinscription visible avant rédaction', () => {
  it('désactive l’envoi quand le serveur signale une désinscription', async () => {
    getSendability.mockResolvedValue({ contact_id: 'c1', can_send: false, reason: 'suppressed' })
    renderEmail()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled())
  })

  it('n’affirme rien tant que la réponse serveur n’est pas là', () => {
    getSendability.mockImplementation(() => new Promise(() => {}))
    renderEmail()

    // Aucune allégation de désinscription par défaut — le serveur reste juge.
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeEnabled()
  })

  // #3699.5 — le serveur n'est plus interrogé pour savoir SI l'on peut envoyer, mais
  // pour relire d'où et par où l'envoi précédent est parti (compte rendu fidèle).
  it('relit au serveur le canal et l’expéditeur d’un envoi plus ancien (#3699.5)', async () => {
    getSendability.mockResolvedValue({
      contact_id: 'c1',
      can_send: false,
      reason: 'already_sent',
      last_send: { state: 'handed_off', channel: 'mailbox', from: 'rep@boite.fr', at: SENT_AT, observed_at: SENT_AT },
    })
    renderEmail({ email_sent_at: SENT_AT } as Partial<Contact>)

    const summary = await screen.findByTestId('engagement-sent-summary')
    await waitFor(() => expect(within(summary).getByText('rep@boite.fr')).toBeInTheDocument())
    expect(within(summary).getByText('Envoyé depuis ta messagerie')).toBeInTheDocument()
    expect(within(summary).getByText('Dans les éléments envoyés de ta messagerie')).toBeInTheDocument()
  })

  it('#4179.2 — SAIT DIRE NON : sans observation, « éléments envoyés » n’est jamais promis', async () => {
    getSendability.mockResolvedValue({
      contact_id: 'c1',
      can_send: false,
      reason: 'already_sent',
      last_send: { state: 'handed_off', channel: 'mailbox', from: 'rep@boite.fr', at: SENT_AT },
    })
    renderEmail({ email_sent_at: SENT_AT } as Partial<Contact>)

    const summary = await screen.findByTestId('engagement-sent-summary')
    await waitFor(() => expect(within(summary).getByText('rep@boite.fr')).toBeInTheDocument())
    expect(within(summary).queryByText('Dans les éléments envoyés de ta messagerie')).not.toBeInTheDocument()
  })

  it('n’interroge pas le serveur quand le contact n’a pas d’email', () => {
    renderEmail({ email: null } as Partial<Contact>)

    expect(getSendability).not.toHaveBeenCalled()
  })
})

/**
 * #3699.4/.5 — le canal est CHOISI, l'expéditeur affiché est l'expéditeur utilisé,
 * un envoi incertain se vérifie avant de se renvoyer, et « livré » ne s'écrit jamais.
 */
describe('EngagementMessage — canal d’envoi et sort de la tentative (#3699)', () => {
  const MAILBOX_READY = { connected: true, provider: 'google', address: 'rep@boite.fr', can_send: true }
  const sendable = (extra: Record<string, unknown> = {}) => ({
    contact_id: 'c1',
    can_send: true,
    reason: null,
    sender: 'contact@acme-esn.fr',
    reply_to: 'rep@esn.fr',
    ...extra,
  })

  it('propose la boîte connectée par défaut quand elle peut envoyer, et l’envoi part par elle', async () => {
    getSendability.mockResolvedValue(sendable({ mailbox: MAILBOX_READY }))
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(await screen.findByRole('button', { name: /Ma messagerie/ })).toHaveAttribute('aria-pressed', 'true')
    // L'expéditeur affiché est celui de la boîte — et l'adresse de réponse de l'espace n'a plus lieu d'être.
    expect(screen.getAllByText('rep@boite.fr').length).toBeGreaterThan(0)
    expect(screen.queryByText('rep@esn.fr')).not.toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: "Envoyer l'email" }))
    await waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1))
    expect(sendEmail).toHaveBeenCalledWith('c1', expect.anything(), 'mailbox')
  })

  it('#4179.3 — depuis la boîte connectée, la confirmation dit AVANT envoi que la signature n’est pas ajoutée', async () => {
    getSendability.mockResolvedValue(sendable({ mailbox: MAILBOX_READY }))
    const u = user()
    renderEmail()
    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(await screen.findByText(/Signature/)).toBeInTheDocument()
    expect(screen.getByText('Non ajoutée : le message part tel que relu ci-dessous')).toBeInTheDocument()
  })

  it('#4179.3 — SAIT DIRE NON : l’envoi par l’espace n’affiche pas cette ligne (autre chemin, autre promesse)', async () => {
    getSendability.mockResolvedValue(sendable())
    const u = user()
    renderEmail()
    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    await screen.findByRole('button', { name: "Envoyer l'email" })
    expect(screen.queryByText(/Signature/)).not.toBeInTheDocument()
  })

  // #3699.6 — les pièces jointes : la personne choisit, voit ce qui part, et le reçu les nomme.
  const DOCS = [
    {
      asset_id: '11111111-1111-4111-8111-111111111111',
      title: 'Fiche offre — audit data',
      file_name: 'fiche-offre.pdf',
      content_type: 'application/pdf',
      byte_size: 2048,
      blocked_reason: null,
    },
    {
      asset_id: '22222222-2222-4222-8222-222222222222',
      title: 'CV consultant senior',
      file_name: 'cv.pdf',
      content_type: 'application/pdf',
      byte_size: 4096,
      blocked_reason: 'interest_not_confirmed',
    },
  ]

  it('rien n’est coché d’office : sans choix, l’envoi part sans pièce et la confirmation dit « Aucune » (#3699.6)', async () => {
    getSendability.mockResolvedValue(sendable({ attachable_documents: DOCS }))
    const u = user()
    renderEmail()
    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(await screen.findByRole('checkbox', { name: /Fiche offre/ })).not.toBeChecked()
    expect(screen.getByText('Aucune')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: "Envoyer l'email" }))
    await waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1))
    expect(sendEmail).toHaveBeenCalledWith('c1', expect.anything(), 'workspace')
  })

  it('la pièce choisie s’affiche avant validation, part avec l’envoi, et le reçu la nomme (#3699.6)', async () => {
    getSendability.mockResolvedValue(sendable({ attachable_documents: DOCS }))
    sendEmail.mockResolvedValueOnce({
      contact_id: 'c1',
      sent_to: 'jean@corp.fr',
      email_sent_at: SENT_AT,
      channel: 'workspace',
      sent_from: 'contact@acme-esn.fr',
      state: 'handed_off',
      attachments: [{ name: 'fiche-offre.pdf', byte_size: 2048, sha256: 'ab'.repeat(32) }],
    })
    const u = user()
    renderEmail()
    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    await u.click(await screen.findByRole('checkbox', { name: /Fiche offre/ }))
    expect(screen.getByText('fiche-offre.pdf (2 KB)')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: "Envoyer l'email" }))
    await waitFor(() =>
      expect(sendEmail).toHaveBeenCalledWith('c1', expect.anything(), 'workspace', [
        '11111111-1111-4111-8111-111111111111',
      ]),
    )
    const receipt = await screen.findByTestId('engagement-sent-summary')
    expect(within(receipt).getByText('fiche-offre.pdf (2 KB)')).toBeInTheDocument()
  })

  it('SAIT DIRE NON — un document retenu par son droit d’usage reste nommé mais ne se coche pas (#3699.6)', async () => {
    getSendability.mockResolvedValue(sendable({ attachable_documents: DOCS }))
    const u = user()
    renderEmail()
    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    const blocked = await screen.findByRole('checkbox', { name: /CV consultant senior/ })
    expect(blocked).toBeDisabled()
    expect(screen.getByText(/se joint après un intérêt confirmé/)).toBeInTheDocument()
  })

  it('retirer une pièce la sort de ce qui part (#3699.6)', async () => {
    getSendability.mockResolvedValue(sendable({ attachable_documents: DOCS }))
    const u = user()
    renderEmail()
    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    const box = await screen.findByRole('checkbox', { name: /Fiche offre/ })
    await u.click(box)
    await u.click(box)
    expect(screen.getByText('Aucune')).toBeInTheDocument()
  })

  it('un choix explicite de l’adresse de l’espace change l’expéditeur affiché ET utilisé', async () => {
    getSendability.mockResolvedValue(sendable({ mailbox: MAILBOX_READY }))
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    await u.click(await screen.findByRole('button', { name: /L'adresse de l'espace/ }))
    expect(screen.getByText('rep@esn.fr')).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: "Envoyer l'email" }))
    await waitFor(() => expect(sendEmail).toHaveBeenCalledWith('c1', expect.anything(), 'workspace'))
  })

  it('une boîte connectée SANS droit d’envoi ne bascule jamais en silence : le choix est à faire', async () => {
    getSendability.mockResolvedValue(sendable({ mailbox: { ...MAILBOX_READY, can_send: false } }))
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(await screen.findByText(/ne peut pas envoyer pour l'instant/)).toBeInTheDocument()
    // Tant que la personne n'a rien choisi, la confirmation reste fermée à l'envoi.
    expect(screen.getByRole('button', { name: "Envoyer l'email" })).toBeDisabled()

    await u.click(screen.getByRole('button', { name: /L'adresse de l'espace/ }))
    expect(screen.getByRole('button', { name: "Envoyer l'email" })).toBeEnabled()
  })

  it('sans messagerie connectée, le parcours d’avant est inchangé (adresse de l’espace)', async () => {
    getSendability.mockResolvedValue(
      sendable({ mailbox: { connected: false, provider: null, address: null, can_send: false } }),
    )
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(await screen.findByText('contact@acme-esn.fr')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ma messagerie/ })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: "Envoyer l'email" }))
    await waitFor(() => expect(sendEmail).toHaveBeenCalledWith('c1', expect.anything(), 'workspace'))
  })

  it('dit qu’aucune pièce jointe ne part (le parcours n’en porte pas)', async () => {
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(screen.getByText('Pièces jointes')).toBeInTheDocument()
    expect(screen.getByText('Aucune')).toBeInTheDocument()
  })

  it('en démo, le dialogue se montre mais rien ne peut partir', async () => {
    getSendability.mockResolvedValue(sendable({ demo: true }))
    const u = user()
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(await screen.findByText(/aucun message ne part depuis une salle de démo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Envoyer l'email" })).toBeDisabled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('une tentative INCERTAINE remplace « Envoyer » par la vérification — jamais un renvoi', async () => {
    getSendability.mockResolvedValue({
      contact_id: 'c1',
      can_send: false,
      reason: 'send_uncertain',
      last_send: { state: 'uncertain', channel: 'workspace', from: 'contact@acme-esn.fr', at: SENT_AT },
    })
    const u = user()
    renderEmail()

    expect(await screen.findByTestId('engagement-send-uncertain')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: /Rien n'est parti/ }))
    await waitFor(() => expect(resolveSendAttempt).toHaveBeenCalledWith('c1', 'not_sent'))
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('un envoi dont la réponse n’arrive pas est dit INCERTAIN, pas « échec »', async () => {
    const u = user()
    sendEmail.mockRejectedValueOnce(new ApiError('x', 409, 'send_uncertain'))
    renderEmail()

    await u.click(screen.getByRole('button', { name: 'Envoyer' }))
    await u.click(screen.getByRole('button', { name: "Envoyer l'email" }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastError.mock.calls[0]?.[1]?.description).toContain('peut-être parti')
  })

  it('« livré » ou « lu » ne s’écrit jamais sur le compte rendu d’un envoi', async () => {
    renderEmail({ email_sent_at: SENT_AT } as Partial<Contact>)

    const summary = await screen.findByTestId('engagement-sent-summary')
    expect(within(summary).queryByText(/livré|\blu\b|delivered|\bread\b/i)).not.toBeInTheDocument()
  })

  it('un rebond CONNU s’ajoute à part, sans réécrire « pris en charge »', async () => {
    renderEmail({ email_sent_at: SENT_AT, email_bounced_at: '2026-07-19T11:00:00.000Z' } as Partial<Contact>)

    const summary = await screen.findByTestId('engagement-sent-summary')
    expect(within(summary).getByText('Non délivré')).toBeInTheDocument()
    expect(within(summary).getByText(/Pris en charge par le service d.envoi/)).toBeInTheDocument()
  })
})

function renderLinkedinCurrent(onLinkedinDeclaredSent = vi.fn()) {
  return wrap(
    <EngagementMessage
      channel="linkedin"
      contact={contact()}
      isCurrentDraft
      subject=""
      text="Bonjour Jean, ..."
      onLinkedinDeclaredSent={onLinkedinDeclaredSent}
      onLinkedinOpen={vi.fn()}
      onMessageCopy={vi.fn()}
      onDismiss={vi.fn()}
    />,
  )
}

/**
 * Bellum ne peut pas envoyer sur LinkedIn. Le commercial peut le DÉCLARER —
 * jamais Bellum le déduire. Ces tests verrouillent les deux moitiés de la règle.
 */
describe('EngagementMessage — déclaration d’envoi LinkedIn', () => {
  it('n’offre pas de déclarer tant que LinkedIn n’a pas été ouvert', () => {
    renderLinkedinCurrent()

    expect(screen.queryByRole('button', { name: 'J’ai envoyé ce message' })).not.toBeInTheDocument()
  })

  it('propose de déclarer une fois LinkedIn ouvert', async () => {
    const u = user()
    renderLinkedinCurrent()

    await u.click(screen.getByRole('button', { name: 'Copier et ouvrir LinkedIn' }))

    expect(screen.getByRole('button', { name: 'J’ai envoyé ce message' })).toBeInTheDocument()
  })

  // La règle centrale : ouvrir un profil n'est pas envoyer un message.
  it('ne déclare RIEN au simple fait d’ouvrir LinkedIn', async () => {
    const u = user()
    const declared = vi.fn()
    renderLinkedinCurrent(declared)

    await u.click(screen.getByRole('button', { name: 'Copier et ouvrir LinkedIn' }))

    expect(declared).not.toHaveBeenCalled()
  })

  it('déclare l’envoi sur geste explicite du commercial', async () => {
    const u = user()
    const declared = vi.fn()
    renderLinkedinCurrent(declared)

    await u.click(screen.getByRole('button', { name: 'Copier et ouvrir LinkedIn' }))
    await u.click(screen.getByRole('button', { name: 'J’ai envoyé ce message' }))

    expect(declared).toHaveBeenCalledTimes(1)
  })

  it('ne permet pas de déclarer deux fois le même envoi', async () => {
    const u = user()
    const declared = vi.fn()
    renderLinkedinCurrent(declared)

    await u.click(screen.getByRole('button', { name: 'Copier et ouvrir LinkedIn' }))
    await u.click(screen.getByRole('button', { name: 'J’ai envoyé ce message' }))

    expect(screen.queryByRole('button', { name: 'J’ai envoyé ce message' })).not.toBeInTheDocument()
    expect(declared).toHaveBeenCalledTimes(1)
  })

  // #2714 — le compte rendu APRÈS déclaration : `nature="declared"`, jamais
  // confondu avec un envoi VÉRIFIÉ (c73_fait_ne_porte_pas_preuve_denvoi).
  it('#2714 — affiche le compte rendu DÉCLARÉ, jamais confondu avec un envoi vérifié', async () => {
    const u = user()
    renderLinkedinCurrent()

    await u.click(screen.getByRole('button', { name: 'Copier et ouvrir LinkedIn' }))
    await u.click(screen.getByRole('button', { name: 'J’ai envoyé ce message' }))

    expect(screen.getByText(/Déclaré par toi/)).toBeInTheDocument()
    expect(screen.queryByText(/Pris en charge par le service d.envoi/)).not.toBeInTheDocument()
  })

  it('n’offre pas la déclaration sur le canal email (Bellum envoie vraiment)', async () => {
    const u = user()
    renderEmail()

    expect(screen.queryByRole('button', { name: 'J’ai envoyé ce message' })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Copier le message' }))
    expect(screen.queryByRole('button', { name: 'J’ai envoyé ce message' })).not.toBeInTheDocument()
  })
})

/**
 * #2396.12 — le quatrième choix sur une action externe : écarter, sans
 * prétendre à un envoi ni à une déclaration.
 */
describe('EngagementMessage — écarter un brouillon (#2396.12)', () => {
  it('propose « Écarter » sur le brouillon courant, quel que soit le canal', () => {
    renderLinkedinCurrent()
    expect(screen.getByRole('button', { name: 'Écarter' })).toBeInTheDocument()
  })

  it('appelle onDismiss au clic, sans toucher à la déclaration LinkedIn', async () => {
    const u = user()
    const onDismiss = vi.fn()
    const declared = vi.fn()
    wrap(
      <EngagementMessage
        channel="linkedin"
        contact={contact()}
        isCurrentDraft
        subject=""
        text="Bonjour Jean, ..."
        onLinkedinDeclaredSent={declared}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={onDismiss}
      />,
    )

    await u.click(screen.getByRole('button', { name: 'Écarter' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(declared).not.toHaveBeenCalled()
  })

  it('ne s’affiche pas sur une version antérieure du fil (isCurrentDraft=false)', () => {
    wrap(
      <EngagementMessage
        channel="linkedin"
        contact={contact()}
        isCurrentDraft={false}
        subject=""
        text="Bonjour Jean, ..."
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Écarter' })).not.toBeInTheDocument()
  })
})

/**
 * Ce que le contrôle avant envoi SAIT du destinataire.
 *
 * Il tournait aveugle : `step: 1` en dur, aucun persona, aucune date de message
 * précédent. Les trois viennent du contact que ce composant tient déjà —
 * personne n'avait fait le fil. Ces tests gardent le fil, pas le calcul.
 */
describe('EngagementMessage — le contrôle avant envoi sait à qui l’on écrit', () => {
  /** Un corps qui échoue sur le jargon : la checklist s'ouvre alors d'elle-même,
   *  ce qui est la condition dans laquelle elle est réellement lue. */
  const JARGON = 'Bonjour, notre méthodologie éprouvée pourrait vous aider. Un avis ?'

  it('dérive le persona du titre du contact et affiche le levier attendu', () => {
    renderEmail({ title: 'Directrice Générale' } as Partial<Contact>, JARGON)

    expect(screen.getByText(new RegExp(OUTREACH_PERSONA_PROFILES.decideur.lever, 'i'))).toBeInTheDocument()
  })

  it('un titre de management donne le levier du manager', () => {
    renderEmail({ title: 'Responsable des opérations' } as Partial<Contact>, JARGON)

    expect(screen.getByText(new RegExp(OUTREACH_PERSONA_PROFILES.manager.lever, 'i'))).toBeInTheDocument()
  })

  it('sans titre lisible, il n’invente AUCUN persona', () => {
    renderEmail({ title: null } as Partial<Contact>, JARGON)

    expect(screen.getByText(/n’est pas établi/)).toBeInTheDocument()
  })

  it('sans envoi précédent : premier message, et jamais « 0 jour »', () => {
    renderEmail({ email_sent_at: null } as Partial<Contact>, JARGON)

    expect(screen.getByText(/Premier message/)).toBeInTheDocument()
    expect(screen.queryByText(/0 jour/)).not.toBeInTheDocument()
  })

  it('avec un envoi précédent daté : ce n’est plus le premier message, et le délai est dit', () => {
    // Quatre jours après `SENT_AT`, horloge figée — le nombre affiché est une
    // mesure, pas une estimation.
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-23T10:00:00.000Z'))
    try {
      renderEmail({ email_sent_at: SENT_AT } as Partial<Contact>, JARGON)

      expect(screen.getByText(/4 jours depuis le message précédent/)).toBeInTheDocument()
      // L'étape a bougé : la règle du premier message ne s'applique plus.
      expect(screen.getByText(/Ne s’applique qu’au premier message/)).toBeInTheDocument()
    } finally {
      now.mockRestore()
    }
  })

  it('une date d’envoi illisible ne devient PAS « 0 jour »', () => {
    renderEmail({ email_sent_at: 'pas-une-date' } as Partial<Contact>, JARGON)

    expect(screen.getByText(/date du message précédent n’est pas connue/)).toBeInTheDocument()
    expect(screen.queryByText(/0 jour/)).not.toBeInTheDocument()
  })

  it('nomme l’erreur qui tue sous le point qui l’a détectée', () => {
    renderEmail({}, 'Bonjour {{Prénom}}, un avis ?')

    expect(screen.getByText(/Envoyer le même message à tout le monde/)).toBeInTheDocument()
  })
})

// #1926.28-.31, #1925 — l'écran qui montre pourquoi CE message, sous le
// brouillon. Les gestes de régénération (angle alternatif, changement de ton)
// ne sont offerts que sur le brouillon COURANT, comme l'édition et l'envoi.
describe('EngagementMessage — pourquoi ce message (#1926.28-.31, #1925)', () => {
  it('n’affiche rien sans `insight` — brouillon initial, jamais issu de /message/generate', () => {
    renderEmail()

    expect(screen.queryByRole('button', { name: 'Pourquoi ce mail est pertinent' })).not.toBeInTheDocument()
  })

  it('affiche la raison du choix et les données utilisées sur le brouillon courant', async () => {
    const u = user()
    wrap(
      <EngagementMessage
        channel="email"
        contact={contact()}
        isCurrentDraft
        subject="Objet relu"
        text="Corps relu à l’écran."
        insight={{
          rationale: 'Recrutement récent sur la cybersécurité.',
          specificity: {
            status: 'specifique',
            count: 2,
            minimum: 2,
            elements: [{ kind: 'precise_contact', value: 'Camille Martin' }],
            unavailable: [],
          },
        }}
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    await u.click(screen.getByRole('button', { name: 'Pourquoi ce mail est pertinent' }))
    expect(screen.getByText('Recrutement récent sur la cybersécurité.')).toBeInTheDocument()
    expect(screen.getByText('Camille Martin')).toBeInTheDocument()
  })

  it('offre « Utiliser cet angle » et les boutons de ton SEULEMENT sur le brouillon courant', () => {
    const insight = {
      alternativeAngle: 'Le renouvellement du contrat cloud.',
      toneOptions: [{ id: 'tutoiement', instruction: 'tutoiement' }],
    }
    wrap(
      <EngagementMessage
        channel="email"
        contact={contact()}
        isCurrentDraft={false}
        subject="Objet relu"
        text="Ancien brouillon."
        insight={insight}
        onUseAlternativeAngle={vi.fn()}
        onChangeTone={vi.fn()}
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    // Le texte de l'angle reste visible même sur une version antérieure...
    expect(screen.getByText(/Le renouvellement du contrat cloud\./)).toBeInTheDocument()
    // ...mais aucun geste de régénération n'est offert dessus.
    expect(screen.queryByRole('button', { name: 'Utiliser cet angle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tutoiement' })).not.toBeInTheDocument()
  })

  it('« Utiliser cet angle » et « Tutoiement » régénèrent depuis le brouillon courant', async () => {
    const u = user()
    const onUseAlternativeAngle = vi.fn()
    const onChangeTone = vi.fn()
    wrap(
      <EngagementMessage
        channel="email"
        contact={contact()}
        isCurrentDraft
        subject="Objet relu"
        text="Corps relu à l’écran."
        insight={{
          alternativeAngle: 'Le renouvellement du contrat cloud.',
          toneOptions: [{ id: 'tutoiement', instruction: 'tutoiement' }],
        }}
        onUseAlternativeAngle={onUseAlternativeAngle}
        onChangeTone={onChangeTone}
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    await u.click(screen.getByRole('button', { name: 'Utiliser cet angle' }))
    expect(onUseAlternativeAngle).toHaveBeenCalledWith('Le renouvellement du contrat cloud.')

    await u.click(screen.getByRole('button', { name: 'Tutoiement' }))
    expect(onChangeTone).toHaveBeenCalledWith({ id: 'tutoiement', instruction: 'tutoiement' })
  })

  it('avertit sur un brouillon générique', () => {
    wrap(
      <EngagementMessage
        channel="email"
        contact={contact()}
        isCurrentDraft
        subject="Objet relu"
        text="Corps relu à l’écran."
        insight={{ specificity: { status: 'generique', count: 0, minimum: 2, elements: [], unavailable: [] } }}
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('Message peu personnalisé')).toBeInTheDocument()
  })

  it('n’avertit jamais sur un dossier non évaluable', () => {
    wrap(
      <EngagementMessage
        channel="email"
        contact={contact()}
        isCurrentDraft
        subject="Objet relu"
        text="Corps relu à l’écran."
        insight={{ specificity: { status: 'non_evaluable', count: 0, minimum: 2, elements: [], unavailable: [] } }}
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.queryByText('Message peu personnalisé')).not.toBeInTheDocument()
  })
})

/**
 * #2123.72 — le quatrième canal : « Tâche de prise de contact ». Elle se rédige
 * comme un message, mais ne s'ENVOIE pas : elle se CRÉE dans les actions du
 * commercial — la ligne `action_plan_items` que `/actions` liste (#2123.46).
 */
describe('EngagementMessage — la tâche de prise de contact se crée, elle ne s’envoie pas (#2123.72)', () => {
  function renderTask(over: Partial<Contact> = {}, subject = 'Appeler Jean Dupont') {
    return wrap(
      <EngagementMessage
        channel="task"
        contact={contact(over)}
        isCurrentDraft
        subject={subject}
        text="Qualifier le programme DORA avant le comité. Méthodologie éprouvée."
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
  }

  it('« Créer la tâche » écrit UNE action visant le contact, avec sa consigne', async () => {
    renderTask()

    await user().click(screen.getByRole('button', { name: /créer la tâche/i }))

    await waitFor(() => expect(createPlanItem).toHaveBeenCalledTimes(1))
    expect(createPlanItem).toHaveBeenCalledWith({
      account_id: 'acc-1',
      label: 'Appeler Jean Dupont',
      reason: 'Qualifier le programme DORA avant le comité. Méthodologie éprouvée.',
      // #2395.8 — le résultat attendu est requis à la création d'une action.
      expected_outcome: 'Une réponse de Jean Dupont, ou un prochain échange fixé',
      target: { kind: 'contact', id: 'c1', label: 'Jean Dupont' },
      owner_name: null,
      // #2901 (#2395.4) — canal non choisi ⇒ `null`, comportement inchangé.
      channel: null,
    })
    // #2123.47 — une fois créée, pas de seconde copie d'un double clic.
    expect(await screen.findByRole('button', { name: /tâche créée/i })).toBeDisabled()
  })

  it('SAIT DIRE NON — ni envoi, ni contrôle avant envoi sur une tâche', () => {
    renderTask({ title: 'Directrice Générale' } as Partial<Contact>)

    expect(screen.queryByRole('button', { name: /^envoyer/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Premier message/)).not.toBeInTheDocument()
    expect(screen.queryByText(new RegExp(OUTREACH_PERSONA_PROFILES.decideur.lever, 'i'))).not.toBeInTheDocument()
  })

  it('sans intitulé, la première phrase de la consigne devient le libellé', async () => {
    renderTask({}, '')

    await user().click(screen.getByRole('button', { name: /créer la tâche/i }))

    await waitFor(() =>
      expect(createPlanItem).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Qualifier le programme DORA avant le comité.' }),
      ),
    )
  })

  it('un contact rattaché à aucun compte ne crée rien — la tâche n’aurait nulle part où vivre', () => {
    renderTask({ account_id: null } as Partial<Contact>)

    expect(screen.getByRole('button', { name: /créer la tâche/i })).toBeDisabled()
    expect(createPlanItem).not.toHaveBeenCalled()
  })

  // #2901 (#2395.4) — le canal choisi dans le composer voyage jusqu'au
  // contrat, jamais deviné depuis le libellé libre.
  it('le canal choisi dans le composer voyage jusqu’au contrat', async () => {
    renderTask()

    await user().click(screen.getByRole('combobox', { name: /canal/i }))
    await user().click(await screen.findByRole('option', { name: 'LinkedIn' }))
    await user().click(screen.getByRole('button', { name: /créer la tâche/i }))

    await waitFor(() => expect(createPlanItem).toHaveBeenCalledTimes(1))
    expect(createPlanItem).toHaveBeenCalledWith(expect.objectContaining({ channel: 'linkedin' }))
  })
})

// #2366.5 — l'appel a sa propre machine d'états (12 statuts, section « Appels à
// passer » de /actions/sequences) mais RIEN ne créait jamais de tâche d'appel :
// le script d'appel préparé ici est ce qui la crée, sur un geste du commercial.
describe('EngagementMessage — le script d’appel devient une tâche d’appel (#2366.5)', () => {
  const SCRIPT = 'Bonjour Jean, vu votre migration Kubernetes. Comment gérez-vous la montée en charge ?'
  function renderPhone(isCurrentDraft = true, insight: { rationale?: string | null } = {}) {
    return wrap(
      <EngagementMessage
        channel="phone"
        contact={contact()}
        isCurrentDraft={isCurrentDraft}
        subject=""
        text={SCRIPT}
        insight={insight}
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
  }

  it('« Ajouter aux appels à passer » crée UNE tâche d’appel, raison et objectif tirés du script', async () => {
    renderPhone(true, { rationale: 'Migration Kubernetes annoncée en juin.' })

    await user().click(screen.getByRole('button', { name: /planifier cet appel/i }))

    await waitFor(() => expect(createCall).toHaveBeenCalledTimes(1))
    expect(createCall).toHaveBeenCalledWith({
      contact_id: 'c1',
      source: 'contacts',
      reason: 'Migration Kubernetes annoncée en juin.',
      objective: 'Comment gérez-vous la montée en charge ?',
      pitch: SCRIPT,
      // #2395.8 (fusion vague 36 ← main, 24/09) — expected_outcome est devenu
      // requis par le contrat ; ce SEUL autre créateur (ContactCallTaskDialog.tsx
      // portait déjà le champ, celui-ci non) n'a aucun input libre à offrir
      // sans casser le geste unique — l'objectif EST déjà « ce qu'on attend de
      // l'appel » (la question que le script pose), jamais un texte inventé.
      expected_outcome: 'Comment gérez-vous la montée en charge ?',
    })
    expect(await screen.findByRole('button', { name: /appel ajouté/i })).toBeDisabled()
    // #4979.2 — le bouton figé dit où retrouver l'appel.
    expect(screen.getByRole('button', { name: 'Voir dans Appels à passer' })).toBeEnabled()
  })

  it('#4979.1 — avant le geste, le bouton dit « Planifier cet appel », pas le geste de consignation', () => {
    renderPhone(true)
    expect(screen.getByRole('button', { name: 'Planifier cet appel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Voir dans Appels à passer' })).toBeNull()
  })

  it('sans raison rédigée, la première phrase du script en tient lieu — jamais un texte inventé', async () => {
    renderPhone()

    await user().click(screen.getByRole('button', { name: /planifier cet appel/i }))

    await waitFor(() =>
      expect(createCall).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Bonjour Jean, vu votre migration Kubernetes.' }),
      ),
    )
  })

  it('SAIT DIRE NON — une version remplacée du script ne crée rien', () => {
    renderPhone(false)

    expect(screen.queryByRole('button', { name: /planifier cet appel/i })).not.toBeInTheDocument()
    expect(createCall).not.toHaveBeenCalled()
  })
})

describe('EngagementMessage — la trace de la version (#3695.4-.6)', () => {
  function renderTraced(trace: React.ComponentProps<typeof EngagementMessage>['trace'], insight = {}) {
    return wrap(
      <EngagementMessage
        channel="email"
        contact={contact()}
        isCurrentDraft
        subject="Objet"
        text="Texte généré."
        insight={insight}
        trace={trace}
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
  }

  it('un modèle approuvé affiche sa source et sa version', () => {
    renderTraced({ usedTemplate: { source: 'Playbook ESN', version: 3 } })
    expect(screen.getByText(/Modèle approuvé : Playbook ESN, version 3/)).toBeInTheDocument()
  })

  it('un texte inchangé le dit, au lieu de se présenter comme adapté', () => {
    renderTraced({ unchanged: true })
    expect(screen.getByText(/Texte identique à la version précédente/)).toBeInTheDocument()
  })

  it('SAIT DIRE NON — sans trace, aucune ligne de trace ni bouton « revenir »', () => {
    renderTraced({})
    expect(screen.queryByText(/Modèle approuvé|Style de message|identique à la version/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Revenir à la version générée/ })).toBeNull()
  })

  it('l’objectif lu par le moteur figure sur la version', () => {
    renderTraced({}, { brief: { objective: 'relance', objectiveSource: 'formulaire', missing: [] } })
    expect(screen.getByText(/Objectif : Relancer/)).toBeInTheDocument()
  })

  it('#3695.6 — après une correction, on revient à la version générée puis on reprend la sienne, sans rien perdre', async () => {
    const u = user()
    renderTraced({})
    await u.click(screen.getByRole('button', { name: 'Éditer' }))
    const body = screen.getByLabelText('Corps du message')
    await u.clear(body)
    await u.type(body, 'Ma version.')
    await u.click(screen.getByRole('button', { name: 'Terminer' }))
    expect(screen.getByText('Ma version.')).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Revenir à la version générée' }))
    expect(screen.getByText('Texte généré.')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Reprendre ma version corrigée' }))
    expect(screen.getByText('Ma version.')).toBeInTheDocument()
  })
})

// #3695 (recette 10/10) — « Relancer » et « Faire connaître une expertise » sur la carte « Email suggéré ».
describe('EngagementMessage — #3695 objectifs rapides sur la carte', () => {
  function renderWith(props: { channel?: 'email' | 'linkedin'; isCurrentDraft?: boolean; withHandler?: boolean }) {
    const onChooseObjective = vi.fn()
    wrap(
      <EngagementMessage
        channel={props.channel ?? 'email'}
        contact={contact()}
        isCurrentDraft={props.isCurrentDraft ?? true}
        subject="Objet relu"
        text="Corps relu."
        onChooseObjective={props.withHandler === false ? undefined : onChooseObjective}
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    return onChooseObjective
  }

  it('propose les deux objectifs sur le brouillon e-mail courant et les transmet', async () => {
    const onChoose = renderWith({})
    const u = user()
    await u.click(screen.getByRole('button', { name: 'Relancer' }))
    await u.click(screen.getByRole('button', { name: 'Faire connaître une expertise' }))
    expect(onChoose).toHaveBeenNthCalledWith(1, 'relance')
    expect(onChoose).toHaveBeenNthCalledWith(2, 'positionnement_expertise')
  })

  it('SAIT DIRE NON : rien sur une version remplacée, un autre canal, ou sans régénération disponible', () => {
    renderWith({ isCurrentDraft: false })
    expect(screen.queryByRole('button', { name: 'Relancer' })).toBeNull()
  })

  it('SAIT DIRE NON : pas sur LinkedIn', () => {
    renderWith({ channel: 'linkedin' })
    expect(screen.queryByRole('button', { name: 'Relancer' })).toBeNull()
  })

  it('SAIT DIRE NON : sans gestionnaire, aucun bouton mort', () => {
    renderWith({ withHandler: false })
    expect(screen.queryByRole('button', { name: 'Relancer' })).toBeNull()
  })
})

// #4418.1 / #4418.3 — le panneau d'un message préparé depuis le plan d'un contact porte « Marquer envoyé ».
describe('EngagementMessage — « Marquer envoyé » (#4418.1)', () => {
  beforeEach(() => declareTouch.mockClear())

  it('pose les relances par le MÊME chemin api, sur un geste déclaratif', async () => {
    const session = user()
    renderEmail()
    await session.click(screen.getByRole('button', { name: 'Marquer envoyé' }))
    await waitFor(() => expect(declareSent).toHaveBeenCalledWith('c1', 'email'))
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('reste DÉCLARATIF : le compte rendu dit « déclaré », jamais une preuve d’envoi', async () => {
    const session = user()
    renderEmail()
    await session.click(screen.getByRole('button', { name: 'Marquer envoyé' }))
    await waitFor(() => expect(screen.getByText('Déclaré par toi, non vérifié')).toBeInTheDocument())
    expect(screen.queryByText(/Expédié par/)).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON : absent d’une version antérieure et d’un contact déjà contacté par Bellum', () => {
    renderEmail({}, 'Corps', false)
    expect(screen.queryByRole('button', { name: 'Marquer envoyé' })).not.toBeInTheDocument()
  })
})

// #4980.2 — « Il y a trop de blabla » : la justification est repliée derrière « Pourquoi ce mail est pertinent ».
describe('EngagementMessage — Pourquoi ce mail est pertinent (#4980.2)', () => {
  function renderWithInsight(insight: { rationale?: string | null }, over: Partial<Contact> = {}) {
    return wrap(
      <EngagementMessage
        channel="email"
        contact={contact(over)}
        isCurrentDraft
        subject="Objet relu"
        text="Corps relu à l’écran."
        insight={insight}
        onLinkedinDeclaredSent={vi.fn()}
        onLinkedinOpen={vi.fn()}
        onMessageCopy={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
  }

  it('replié par défaut : le corps est lu, la justification n’est pas dans le DOM', () => {
    renderWithInsight({ rationale: 'Recrutement récent sur la cybersécurité.' })
    expect(screen.getByText('Corps relu à l’écran.')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Pourquoi ce mail est pertinent' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Recrutement récent sur la cybersécurité.')).not.toBeInTheDocument()
  })

  it('un clic déplie la justification, rien n’est supprimé', async () => {
    const u = user()
    renderWithInsight({ rationale: 'Recrutement récent sur la cybersécurité.' })
    await u.click(screen.getByRole('button', { name: 'Pourquoi ce mail est pertinent' }))
    expect(screen.getByRole('button', { name: 'Pourquoi ce mail est pertinent' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText('Recrutement récent sur la cybersécurité.')).toBeInTheDocument()
  })

  it('un message relu depuis le dossier (sans analyse de génération) garde le pourquoi connu du contact', async () => {
    const u = user()
    renderWithInsight({}, { why_contact: 'Responsable du programme data, au cœur du projet.' })
    expect(screen.queryByText('Responsable du programme data, au cœur du projet.')).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Pourquoi ce mail est pertinent' }))
    expect(screen.getByText('Responsable du programme data, au cœur du projet.')).toBeInTheDocument()
  })

  it('aucune justification connue : aucun bouton mort', () => {
    renderWithInsight({})
    expect(screen.queryByRole('button', { name: /Pourquoi ce mail/ })).not.toBeInTheDocument()
  })
})
