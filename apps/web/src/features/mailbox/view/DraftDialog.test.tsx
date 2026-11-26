import type { MailThread, MailboxCapabilities, MailboxSender } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2104.5 — deux gestes distincts (« Répondre » / « Relancer »), chacun son
 * brouillon : DÉCISION Louis 17/09 matin. `DraftDialog` reçoit un `kind` qui
 * ne change que les mots — le mécanisme de dépôt reste unique (GA-26).
 *
 * #2104.32 — un bouton « Envoyer » derrière un clic humain explicite sur un
 * brouillon : DÉCISION Louis 17/09. Le copilote n'envoie jamais seul (D65) ;
 * l'envoi emprunte le chemin EXISTANT (`useSendMail` → `POST /mailbox/batch`,
 * déjà consommé par `ContactMailboxDialog`), jamais une route neuve.
 */

const createDraftMutate = vi.fn()
const draftReplyMutate = vi.fn()
const sendMutate = vi.fn()
let createDraftState: {
  mutate: typeof createDraftMutate
  data: { webUrl: string | null } | undefined
  isPending: boolean
  isError: boolean
  error?: Error
  reset: () => void
}
let sendState: {
  mutate: typeof sendMutate
  data: { outcomes: { to: string; status: string; reason: string | null; error: string | null }[] } | undefined
  isPending: boolean
  isError: boolean
  error?: Error
  reset: () => void
}

let draftReplyState: {
  mutate: typeof draftReplyMutate
  isPending: boolean
  isError: boolean
  error?: Error
  reset: () => void
}

let sendersData: MailboxSender[] | undefined

vi.mock('../api', () => ({
  useMailboxSenders: () => ({ data: sendersData }),
  useDraftReply: () => draftReplyState,
  useCreateDraft: () => createDraftState,
  useSendMail: () => sendState,
}))

const { DraftDialog } = await import('./DraftDialog')

const thread: MailThread = {
  threadId: 't1',
  subject: 'Point projet',
  counterpart: 'client@acme.example',
  lastMessageAt: null,
  lastDirection: 'inbound',
  messageCount: 2,
  awaitingReply: true,
  daysSinceLastMessage: 3,
  unread: false,
  hasAttachments: false,
  otherParticipants: [],
}

const capabilities: MailboxCapabilities = { read: true, draft: true, send: true, labels: true, outOfOffice: true }

beforeEach(() => {
  sendersData = undefined
  createDraftMutate.mockReset()
  draftReplyMutate.mockReset()
  draftReplyState = { mutate: draftReplyMutate, isPending: false, isError: false, reset: vi.fn() }
  sendMutate.mockReset()
  createDraftState = { mutate: createDraftMutate, data: undefined, isPending: false, isError: false, reset: vi.fn() }
  sendState = { mutate: sendMutate, data: undefined, isPending: false, isError: false, reset: vi.fn() }
})

describe('DraftDialog — #2104.5 deux gestes distincts', () => {
  it('titre "Répondre" pour kind=reply', () => {
    render(
      <DraftDialog
        thread={thread}
        kind="reply"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )
    expect(screen.getByText('Répondre à ce fil')).toBeInTheDocument()
  })

  it('titre "Relancer" pour kind=follow_up, un brouillon distinct', () => {
    render(
      <DraftDialog
        thread={thread}
        kind="follow_up"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )
    expect(screen.getByText('Relancer ce fil')).toBeInTheDocument()
  })
})

describe('DraftDialog — #2104.32 envoyer derrière un clic humain', () => {
  it('le bouton Envoyer est proposé quand la messagerie autorise l’envoi', () => {
    render(
      <DraftDialog
        thread={thread}
        kind="reply"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
  })

  it('absent sans la capacité d’envoi', () => {
    render(
      <DraftDialog
        thread={thread}
        kind="reply"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={{ ...capabilities, send: false }}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Envoyer' })).not.toBeInTheDocument()
  })

  it('un clic sur Envoyer passe par le lot EXISTANT (`sendBatch`), un seul destinataire', () => {
    render(
      <DraftDialog
        thread={thread}
        kind="reply"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Bonjour,' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(sendMutate).toHaveBeenCalledTimes(1)
    expect(sendMutate.mock.calls[0]?.[0]).toMatchObject({
      mode: 'send',
      items: [{ to: 'client@acme.example', threadId: 't1' }],
    })
  })
})

// #2104.30 — aucun bouton presse-papier n'existait sur le brouillon de
// messagerie (le panneau frère `DraftPanel`, pour `prepare_message`, en a un
// depuis longtemps). Copier ne dépose rien : c'est un geste 100% local.
describe('DraftDialog — #2104.30 copier le brouillon', () => {
  it('copie objet et corps dans le presse-papier', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <DraftDialog
        thread={thread}
        kind="reply"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Bonjour,' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copier' }))
    expect(writeText).toHaveBeenCalledWith('Re: Point projet\n\nBonjour,')
  })

  it('disparaît une fois le brouillon déposé, comme Déposer et Envoyer', () => {
    createDraftState = { ...createDraftState, data: { webUrl: null } }
    render(
      <DraftDialog
        thread={thread}
        kind="reply"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Copier' })).not.toBeInTheDocument()
  })
})

// #4405.1 — « Préparer la réponse » ouvre un mail DÉJÀ rédigé par Laura (le
// générateur du serveur lit le fil de l'utilisateur), pas un brouillon vide.
describe('DraftDialog — #4405.1 la réponse arrive pré-remplie', () => {
  const renderReply = () =>
    render(
      <DraftDialog
        thread={thread}
        kind="reply"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )

  it('à l’ouverture, demande la réponse du fil au générateur', () => {
    renderReply()
    expect(draftReplyMutate).toHaveBeenCalledTimes(1)
    expect(draftReplyMutate.mock.calls[0]?.[0]).toMatchObject({ threadId: 't1', counterpart: 'client@acme.example' })
  })

  it('un fil sans interlocuteur demande quand même la réponse, sans `counterpart` vide', () => {
    render(
      <DraftDialog
        thread={{ ...thread, counterpart: null }}
        kind="reply"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )
    expect(draftReplyMutate).toHaveBeenCalledTimes(1)
    expect(draftReplyMutate.mock.calls[0]?.[0]).not.toHaveProperty('counterpart')
  })

  it('pré-remplit objet et corps, ensuite éditables', () => {
    draftReplyMutate.mockImplementation((_vars, options) =>
      options.onSuccess({ subject: 'Re: Point projet', body: 'Bonjour, jeudi 15 h me va.' }),
    )
    renderReply()
    expect(screen.getByLabelText('Message')).toHaveValue('Bonjour, jeudi 15 h me va.')
    expect(screen.getByLabelText('Objet')).toHaveValue('Re: Point projet')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Autre texte' } })
    expect(screen.getByLabelText('Message')).toHaveValue('Autre texte')
  })

  it('nomme l’attente : « Laura rédige ta réponse… »', () => {
    draftReplyState = { ...draftReplyState, isPending: true }
    renderReply()
    expect(screen.getByText('Laura rédige ta réponse…')).toBeInTheDocument()
  })

  it('rien ne part seul : ni dépôt ni envoi tant qu’on n’a pas cliqué', () => {
    draftReplyMutate.mockImplementation((_vars, options) =>
      options.onSuccess({ subject: 'Re: Point projet', body: 'Bonjour, jeudi 15 h me va.' }),
    )
    renderReply()
    expect(createDraftMutate).not.toHaveBeenCalled()
    expect(sendMutate).not.toHaveBeenCalled()
    // Prêt à l'envoi : les deux gestes existants sont activés.
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Déposer le brouillon' })).toBeEnabled()
  })

  it('« Régénérer » redemande à Laura et remplace le texte, sans rien envoyer', () => {
    draftReplyMutate.mockImplementationOnce((_vars, options) =>
      options.onSuccess({ subject: 'Re: Point projet', body: 'Première version.' }),
    )
    renderReply()
    draftReplyMutate.mockImplementationOnce((_vars, options) =>
      options.onSuccess({ subject: 'Re: Point projet', body: 'Seconde version.' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }))
    expect(draftReplyMutate).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Message')).toHaveValue('Seconde version.')
    expect(createDraftMutate).not.toHaveBeenCalled()
    expect(sendMutate).not.toHaveBeenCalled()
  })

  it('un clic sur Envoyer part avec le texte pré-généré', () => {
    draftReplyMutate.mockImplementation((_vars, options) =>
      options.onSuccess({ subject: 'Re: Point projet', body: 'Bonjour, jeudi 15 h me va.' }),
    )
    renderReply()
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(sendMutate.mock.calls[0]?.[0]).toMatchObject({
      items: [{ subject: 'Re: Point projet', body: 'Bonjour, jeudi 15 h me va.', threadId: 't1' }],
    })
  })

  it('échec : message d’erreur, champ vide éditable, aucun texte inventé', () => {
    draftReplyState = { ...draftReplyState, isError: true, error: new Error('mail_reply_failed') }
    renderReply()
    expect(screen.getByText(/Laura n’a pas pu rédiger la réponse/)).toBeInTheDocument()
    const body = screen.getByLabelText('Message')
    expect(body).toHaveValue('')
    fireEvent.change(body, { target: { value: 'Je rédige moi-même' } })
    expect(body).toHaveValue('Je rédige moi-même')
  })

  it('une relance (follow_up) s’ouvre AUSSI déjà rédigée — jamais un champ vide (décision Louis)', () => {
    render(
      <DraftDialog
        thread={thread}
        kind="follow_up"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )
    expect(draftReplyMutate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Régénérer/ })).toBeInTheDocument()
  })

  it('fermé, il n’appelle rien', () => {
    render(
      <DraftDialog
        thread={null}
        kind="reply"
        open={false}
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )
    expect(draftReplyMutate).not.toHaveBeenCalled()
  })
})

describe('DraftDialog — #4405.1 aucun bouton hors de la modale', () => {
  it('le pied de la fenêtre passe à la ligne : « Annuler » ne déborde jamais', () => {
    render(<DraftDialog thread={thread} open onOpenChange={() => {}} signature={null} capabilities={capabilities} />)
    const footer = screen.getByRole('button', { name: /annuler/i }).parentElement
    expect(footer?.className).toMatch(/flex-wrap/)
  })
})

/**
 * #4405.1 (recette prod 25/10) — « Annuler » sortait de 43 px hors de la modale à 468 px : cinq boutons sur UNE
 * ligne non repliable. jsdom ne mesure rien : on garde la CAUSE (la rangée se replie, aucun bouton ne garde sa
 * largeur, chaque cible fait ≥ 44 px) ; la mesure à 1512 px / 768 px reste celle de la recette.
 */
describe('DraftDialog — #4405.1 la rangée de boutons tient dans la modale', () => {
  it('la rangée se replie et chaque bouton est une cible de 44 px', () => {
    render(
      <DraftDialog
        thread={thread}
        kind="reply"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )
    const cancel = screen.getByRole('button', { name: 'Annuler' })
    const row = cancel.parentElement as HTMLElement
    expect(row.className).toMatch(/\bflex-wrap\b/)
    const buttons = Array.from(row.querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThanOrEqual(4)
    for (const button of buttons) {
      expect(button.className).toMatch(/\bmin-h-11\b/)
    }
  })
})

// #4546.5 — l'expéditeur se choisit parmi SES boîtes, et l'écran dit laquelle part.
const box = (connectionId: string, address: string | null, send = true): MailboxSender => ({
  connectionId,
  provider: 'google',
  address,
  capabilities: { read: true, draft: true, send },
})
const FIRST = '11111111-1111-4111-8111-111111111111'
const SECOND = '22222222-2222-4222-8222-222222222222'

describe('DraftDialog — #4546.5 l’expéditeur est dit et choisi', () => {
  const open = () =>
    render(
      <DraftDialog
        thread={thread}
        kind="reply"
        open
        onOpenChange={() => {}}
        signature={null}
        capabilities={capabilities}
      />,
    )

  it('plusieurs boîtes : un sélecteur nommé « Envoyer depuis », la première boîte qui peut envoyer part par défaut', () => {
    sendersData = [box(FIRST, 'nominative@esn.fr'), box(SECOND, 'prospection@marque.fr')]
    open()
    expect(screen.getByLabelText('Envoyer depuis')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Bonjour' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(sendMutate).toHaveBeenCalledWith(expect.objectContaining({ senderConnectionId: FIRST }))
  })

  it('une seule boîte : pas de choix, mais l’écran DIT laquelle part — et l’envoi la désigne', () => {
    sendersData = [box(FIRST, 'nominative@esn.fr')]
    open()
    expect(screen.getByText('Part de nominative@esn.fr')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Bonjour' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(sendMutate).toHaveBeenCalledWith(expect.objectContaining({ senderConnectionId: FIRST }))
  })

  it('une boîte sans la portée d’envoi n’est jamais proposée comme expéditeur', () => {
    sendersData = [box(FIRST, 'lecture@esn.fr', false), box(SECOND, 'prospection@marque.fr')]
    open()
    expect(screen.getByText('Part de prospection@marque.fr')).toBeInTheDocument()
    expect(screen.queryByText(/lecture@esn.fr/)).not.toBeInTheDocument()
  })

  it('aucune boîte connue : comportement d’avant, aucun expéditeur inventé', () => {
    sendersData = []
    open()
    expect(screen.queryByText(/^Part de/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Bonjour' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(sendMutate.mock.calls[0]?.[0]).not.toHaveProperty('senderConnectionId')
  })
})
