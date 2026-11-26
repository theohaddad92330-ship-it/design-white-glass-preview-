import type { MailboxStatus } from '@bellum/contracts'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

/**
 * La messagerie, et son incohérence interne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le MÊME fichier savait déjà, avant sa liste, distinguer « pas connecté » de
 * « connecté sans le droit de lire », et ouvrir un chemin vers Intégrations pour
 * chacun. Son état d'erreur de RECHERCHE, lui, ne distinguait rien : une seule
 * phrase — « La recherche a échoué » — et un bouton « Réessayer » proposé même
 * quand réessayer ne peut rien donner.
 *
 * Deux écrans dans un seul, avec deux qualités différentes. Et le bouton
 * « Réessayer » sur une portée manquante est le mensonge coûteux : un jeton
 * OAuth ne gagne pas une portée toute seule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS GARDENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. la porte d'entrée garde ses deux états, et une SEULE orthographe de route ;
 *  2. l'erreur de recherche distingue les trois états, avec le même vocabulaire ;
 *  3. la phrase du serveur est affichée quand il en porte une ;
 *  4. une vraie panne garde « Réessayer » et n'a PAS de chemin vers Intégrations ;
 *  5. le nom de l'éditeur n'atteint jamais le JSX.
 */

const status = vi.fn()
const search = vi.fn()
// #2393.7 — les actions de classement (marquer traité / signaler non
// pertinent) : un seul espion partagé, réinitialisé à chaque test.
const setThreadMarkMutate = vi.fn()
const myDrafts = vi.fn()
const scheduledSends = vi.fn()

// #4406.4 — la section Beeper a sa propre spec (`BeeperConversations.test.tsx`) ; ici elle se tait.
vi.mock('@/features/beeper/view/BeeperConversations', () => ({ BeeperConversations: () => null }))
// Théo B m2-brouillons — les trois vues neuves ont leur propre suite (`m2/*.test.tsx`) ; ici le faux dit seulement
// LAQUELLE la page a ouverte, et si la liste « À traiter » est restée en place.
vi.mock('./m2/MailboxM2Views', () => ({
  MailboxViewTabs: ({ view, onChange }: { view: string; onChange: (view: string) => void }) => (
    <button type="button" data-testid="m2-tabs" data-view={view} onClick={() => onChange('drafts')}>
      tabs
    </button>
  ),
  MailboxM2Views: ({ view, sequenceId }: { view: string; sequenceId?: string }) => (
    <div data-testid="m2-view">
      {view}:{sequenceId ?? ''}
    </div>
  ),
}))
vi.mock('@/features/profiles/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
vi.mock('../api', () => ({
  useMailboxStatus: () => status(),
  // #2113.17/.18 — le PARAMÈTRE traverse jusqu'au faux : l'en-tête interroge
  // `positive_reply` et `no_reply` en plus du filtre choisi par l'écran, et un
  // faux qui l'ignorerait rendrait les trois résultats indiscernables.
  useMailSearch: (params: { intent: string }) => search(params),
  // Théo B m1 — multi-sélection d'intentions : une question par intention, chacune passe par le même faux.
  useMailSearches: (list: { intent: string }[]) => list.map(params => search(params)),
  // La signature a sa propre suite (`MailboxSignatureCard.test.tsx`). Ici elle
  // est muette : ce fichier teste la porte d'entrée et les trois refus.
  useMailboxSignature: () => ({ data: undefined, isLoading: false }),
  useSaveMailboxSignature: () => ({ mutate: vi.fn(), isPending: false }),
  useSetThreadMark: () => ({ mutate: setThreadMarkMutate, isPending: false }),
  // Reporter n'écrit qu'au clic sur « Reporter » du dialogue : ici, on vérifie seulement qu'il s'ouvre.
  useSnoozeThread: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  // Théo B m1.R2 — les compteurs « Brouillons » et « À venir » lisent les mêmes requêtes que leurs onglets.
  useMyMessageDrafts: () => myDrafts(),
  // Théo B m2 — « Tous les comptes » des autres vues lit les fils suivis (même cache que les compteurs).
  useTrackedThreads: () => ({ data: { threads: [] }, isLoading: false }),
  useScheduledSends: () => scheduledSends(),
}))

// #2104.6 — le rattachement manuel a sa propre suite
// (`LinkAccountDialog.test.tsx`). Ici, un faux LISIBLE : il reflète `open` et
// le fil reçu, sans tirer `useAccounts`/`useLinkThreadAccount`, qui ne sont pas
// le sujet de ce fichier.
vi.mock('./LinkAccountDialog', () => ({
  LinkAccountDialog: ({ thread, open }: { thread: { threadId: string } | null; open: boolean }) =>
    open && thread ? <div data-testid="link-account-dialog">{thread.threadId}</div> : null,
}))

vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    // ⚠️ Deux propriétés que ce faux DOIT avoir, sinon il laisse passer un défaut.
    //
    // 1. Il RECOPIE le `search` dans le `href`. Un faux qui le jette laisse
    //    passer le défaut du 28/08 — un lien juste, une recherche perdue — et
    //    le lien contextuel vers le copilote ne voyage QUE par là.
    // 2. Il TRANSMET la ref. Le vrai `Link` le fait, et `<Button asChild>` en
    //    passe une : un faux sans `forwardRef` fabrique un avertissement React
    //    que personne n'a écrit dans le produit.
    Link: forwardRef<
      HTMLAnchorElement,
      {
        children: ReactNode
        to: string
        params?: Record<string, string>
        search?: Record<string, unknown>
        className?: string
      }
    >(({ children, to, params, search, ...rest }, ref) => {
      // #2104.3 — la fiche contact rattachée à l'interlocuteur voyage par
      // `params.id` (`/contacts/$id`), comme le badge de compte le fait déjà
      // pour `/accounts/$id` : le faux doit l'interpoler, sinon un lien qui
      // pointe vraiment sur `/contacts/$id` littéral passerait inaperçu.
      const resolved = params
        ? Object.entries(params).reduce((acc, [key, value]) => acc.replace(`$${key}`, value), to)
        : to
      return (
        <a
          {...rest}
          ref={ref}
          href={
            search
              ? `${resolved}?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)]))}`
              : resolved
          }
        >
          {children}
        </a>
      )
    }),
  }
})

// L'entête est personnalisé depuis le PROFIL (#1397.1). Le hook tire la session
// entière, qui n'est pas le sujet de ce fichier — mais il rend une chaîne VIDE
// quand le prénom est inconnu, et cette branche-là est testée plus bas.
const firstName = vi.fn<() => string>(() => 'Louis')
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => firstName() }))

// La coque de page tire la barre latérale, la session et la coque mobile : rien
// de tout cela n'est le sujet ici.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

// #2113.18 — capture ce que le geste de l'en-tête ouvre RÉELLEMENT, sur le
// même principe que le faux `LinkAccountDialog` ci-dessus : un mock muet
// laisserait passer un CTA qui ouvre le mauvais fil, ou aucun.
vi.mock('./DraftDialog', () => ({
  DraftDialog: ({ thread, kind, open }: { thread: { threadId: string } | null; kind: string; open: boolean }) =>
    open && thread ? (
      <div data-testid="draft-dialog">
        {kind}:{thread.threadId}
      </div>
    ) : null,
}))

// « Nouveau message » a sa propre suite (`m1/NewMessageDialog.test.tsx`) : ici, un faux qui dit s'il est ouvert.
vi.mock('./m1/NewMessageDialog', () => ({
  NewMessageDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="new-message-dialog" /> : null),
}))

const { MailboxPage } = await import('./MailboxPage')

function mailboxStatus(over: Partial<MailboxStatus> = {}): MailboxStatus {
  return {
    connected: true,
    provider: 'google',
    address: 'louis@bellum-ai.com',
    // ⚠️ 04/09/2026 — les CINQ sont accordées dans le cas nominal.
    //
    // Elles ne l'étaient pas (`labels` et `outOfOffice` valaient `false`), et
    // c'était invisible parce que l'écran ne LISAIT pas ces champs. Depuis
    // #1398.3 il les lit, et un manque rend un bandeau — avec son chemin vers
    // Intégrations. Les tests d'échec de RECHERCHE ci-dessous comptent les liens
    // de la page : avec un statut partiel, ils auraient mesuré la somme de deux
    // choses différentes au lieu de ce qu'ils affirment.
    capabilities: { read: true, draft: true, send: true, labels: true, outOfOffice: true },
    // #2756 — une seule messagerie dans le cas nominal ; les tests dédiés
    // passent `connectedCount: 2` pour le cas « une autre est aussi branchée ».
    connectedCount: 1,
    ...over,
  } as MailboxStatus
}

const readable = { data: mailboxStatus(), isLoading: false }

const searchFailing = (error: unknown) => ({
  data: undefined,
  isLoading: false,
  isError: true,
  error,
  refetch: vi.fn(),
})

/** Le corps qu'un connecteur rend sur une portée manquante. */
const SERVER_MESSAGE =
  "Je n'ai pas le droit de regarder ta messagerie. Reconnecte cet outil : un accès déjà donné ne s'élargit pas tout seul."

beforeEach(() => {
  status.mockReset()
  search.mockReset()
  setThreadMarkMutate.mockReset()
  myDrafts.mockReset()
  scheduledSends.mockReset()
  myDrafts.mockReturnValue({ data: { items: [], total: 0 } })
  scheduledSends.mockReturnValue({ data: { items: [] } })
  firstName.mockReturnValue('Louis')
  search.mockReturnValue({ data: { threads: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn() })
})

describe('MailboxPage — la porte d’entrée', () => {
  it('aucune messagerie connectée : invite à connecter, sur la route canonique', () => {
    status.mockReturnValue({ data: mailboxStatus({ connected: false }), isLoading: false })
    const { container } = render(<MailboxPage />)

    expect(container.textContent).toContain('Aucune messagerie connectée')
    expect(screen.getByRole('link', { name: /Connecter ma messagerie/ })).toHaveAttribute('href', '/integrations')
    // Théo B m1 — l'en-tête de la page reste : on sait où l'on est même sans boîte branchée.
    expect(screen.getByRole('heading', { level: 1, name: 'Messagerie' })).toBeInTheDocument()
  })

  it('connectée sans le droit de lire : un AUTRE message, la même route', () => {
    status.mockReturnValue({
      data: mailboxStatus({
        capabilities: { read: false, draft: true, send: true, labels: false, outOfOffice: false },
      }),
      isLoading: false,
    })
    const { container } = render(<MailboxPage />)

    expect(container.textContent).toContain('Autorisation de lecture manquante')
    expect(container.textContent).not.toContain('Aucune messagerie connectée')
    expect(screen.getByRole('link', { name: /Reconnecter/ })).toHaveAttribute('href', '/integrations')
  })
})

describe('MailboxPage — la recherche distingue les trois états', () => {
  it('portée manquante : la phrase du serveur, un chemin, et PAS de « Réessayer »', () => {
    status.mockReturnValue(readable)
    search.mockReturnValue(searchFailing(new ApiError(SERVER_MESSAGE, 503, 'scope_missing')))
    const { container } = render(<MailboxPage />)

    expect(container.textContent).toContain("Je n'ai pas le droit de regarder ta messagerie")
    // Réessayer ne peut rien donner : une portée ne s'accorde pas toute seule.
    expect(screen.queryByText('Réessayer')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Reconnecter/ })).toHaveAttribute('href', '/integrations')
  })

  it('déconnectée pendant la session : invite à connecter, pas à réessayer', () => {
    status.mockReturnValue(readable)
    search.mockReturnValue(searchFailing(new ApiError('Aucune messagerie connectée.', 412, 'not_connected')))
    const { container } = render(<MailboxPage />)

    expect(container.textContent).toContain('Aucune messagerie connectée')
    expect(screen.queryByText('Réessayer')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Connecter ma messagerie/ })).toHaveAttribute('href', '/integrations')
  })

  it('vraie panne : « Réessayer » reste, et AUCUN chemin vers Intégrations', () => {
    status.mockReturnValue(readable)
    search.mockReturnValue(searchFailing(new ApiError('boom', 500)))
    const { container } = render(<MailboxPage />)

    expect(container.textContent).toContain('La recherche a échoué')
    // « Cassé » et « non mesurable » ne se ressemblent pas.
    expect(container.textContent).toContain('c’est la lecture qui a échoué')
    expect(screen.getByText('Réessayer')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Reconnecter|Connecter ma messagerie/ })).not.toBeInTheDocument()
  })

  it('un corps sans `message` ne laisse pas l’écran muet', () => {
    status.mockReturnValue(readable)
    search.mockReturnValue(searchFailing(new ApiError('', 503, 'scope_missing')))
    const { container } = render(<MailboxPage />)
    expect(container.textContent).toContain('Reconnecte-la')
  })

  it('zéro fil n’est PAS une erreur — les deux phrases restent distinctes', () => {
    status.mockReturnValue(readable)
    const { container } = render(<MailboxPage />)
    expect(container.textContent).toContain('Aucun fil pour cette recherche')
    expect(container.textContent).not.toContain('La recherche a échoué')
  })
})

describe('MailboxPage — les quatre vues (Théo B m2-brouillons.R1)', () => {
  it('« À traiter » reste l’écran d’origine : la liste des fils est là, aucune vue neuve', () => {
    status.mockReturnValue(readable)
    const { container, queryByTestId } = render(<MailboxPage />)
    expect(queryByTestId('m2-tabs')?.getAttribute('data-view')).toBe('inbox')
    expect(queryByTestId('m2-view')).toBeNull()
    expect(container.textContent).toContain('Aucun fil pour cette recherche')
  })

  it('une autre vue remplace la liste « À traiter » — elle ne s’empile pas dessous', () => {
    status.mockReturnValue(readable)
    const { container, getByTestId } = render(<MailboxPage view="drafts" sequenceId="seq-1" />)
    expect(getByTestId('m2-view').textContent).toBe('drafts:seq-1')
    expect(container.textContent).not.toContain('Aucun fil pour cette recherche')
  })

  it('choisir un onglet le dit à la route (onViewChange), sans état caché dans la page', () => {
    status.mockReturnValue(readable)
    const onViewChange = vi.fn()
    const { getByTestId } = render(<MailboxPage onViewChange={onViewChange} />)
    getByTestId('m2-tabs').click()
    expect(onViewChange).toHaveBeenCalledWith('drafts')
  })
})

/**
 * #1398.3 — les CINQ capacités sont chargées ; deux étaient lues.
 *
 * `useMailboxStatus()` ramène `read`, `draft`, `send`, `labels` et
 * `outOfOffice`. L'écran ne lisait que `connected` et `read`, tous deux comme
 * portes d'entrée : les trois autres arrivaient dans la mémoire du navigateur et
 * n'atteignaient aucun pixel. Un commercial découvrait « je n'ai pas le droit
 * d'envoyer » APRÈS avoir rédigé.
 */
describe('MailboxPage — ce que la messagerie autorise (#1398.3)', () => {
  const partiel = (over: Partial<MailboxStatus['capabilities']>) => ({
    data: mailboxStatus({
      capabilities: { read: true, draft: true, send: true, labels: true, outOfOffice: true, ...over },
    }),
    isLoading: false,
  })

  it('NOMME ce qui manque, au lieu de le laisser découvrir après la rédaction', () => {
    status.mockReturnValue(partiel({ send: false }))
    const { container } = render(<MailboxPage />)
    expect(container.textContent).toContain('envoyer après ton clic')
    expect(container.textContent).toContain('Ce qui manque')
  })

  it('nomme AUSSI ce qui marche — « une partie est indisponible » envoie chercher partout', () => {
    status.mockReturnValue(partiel({ send: false }))
    const { container } = render(<MailboxPage />)
    expect(container.textContent).toContain('lire tes fils')
    expect(container.textContent).toContain('préparer des brouillons')
  })

  it('lit les cinq, pas seulement celles qui commandent un bouton', () => {
    status.mockReturnValue(partiel({ labels: false, outOfOffice: false }))
    const { container } = render(<MailboxPage />)
    expect(container.textContent).toContain('poser des étiquettes')
    expect(container.textContent).toContain('voir ta réponse d’absence')
  })

  it('se tait quand les cinq sont accordées — un bandeau permanent ne se lit plus', () => {
    status.mockReturnValue(readable)
    const { container } = render(<MailboxPage />)
    expect(container.textContent).not.toContain('Ce qui manque')
    expect(container.textContent).not.toContain('pas entièrement autorisée')
  })

  it('mène à Intégrations, le seul écran qui a le droit de nommer l’outil', () => {
    status.mockReturnValue(partiel({ send: false }))
    render(<MailboxPage />)
    expect(screen.getByRole('link', { name: /Revoir les autorisations/ })).toHaveAttribute('href', '/integrations')
  })

  it('n’annonce AUCUNE heure de synchronisation — aucun champ n’en porte', () => {
    status.mockReturnValue(partiel({ send: false }))
    const { container } = render(<MailboxPage />)
    expect(container.textContent ?? '').not.toMatch(/synchronis|il y a \d|dernière mise à jour/i)
  })

  it('ne nomme jamais l’éditeur, même en annonçant un manque', () => {
    status.mockReturnValue(partiel({ send: false, labels: false }))
    const { container } = render(<MailboxPage />)
    expect(container.textContent ?? '').not.toMatch(/google|gmail|outlook|microsoft/i)
  })
})

describe('doctrine — le nom de l’éditeur n’atteint pas cet écran', () => {
  it('le statut porte « google », le DOM ne le porte jamais', () => {
    status.mockReturnValue(readable)
    search.mockReturnValue(searchFailing(new ApiError(SERVER_MESSAGE, 503, 'scope_missing')))
    const { container } = render(<MailboxPage />)
    expect(container.textContent ?? '').not.toMatch(/google|gmail|outlook|microsoft/i)
    expect(container.textContent).toMatch(/ta messagerie/i)
  })
})

/** Un fil complet — c'est le CORPUS des suites ci-dessous. */
function thread(over: Record<string, unknown> = {}) {
  return {
    threadId: 'fil-1',
    subject: 'Refonte du parcours commande',
    counterpart: 'claire.vasseur@verdal.example',
    lastMessageAt: '2026-08-23T09:00:00.000Z',
    lastDirection: 'outbound',
    messageCount: 3,
    awaitingReply: true,
    daysSinceLastMessage: 11,
    unread: false,
    hasAttachments: false,
    otherParticipants: [],
    account: { id: 'compte-1', name: 'Verdal Distribution', via: 'domain' },
    messages: [
      {
        id: 'm1',
        threadId: 'fil-1',
        subject: 'Refonte du parcours commande',
        from: 'Claire Vasseur <claire.vasseur@verdal.example>',
        to: [],
        cc: [],
        date: '2026-08-20T09:00:00.000Z',
        snippet: 'Merci pour le point de la semaine dernière',
        unread: false,
        hasAttachments: false,
        direction: 'inbound',
      },
    ],
    ...over,
  }
}

const searchOk = (threads: unknown[] = [thread()]) => ({
  data: { threads, truncated: false },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  dataUpdatedAt: Date.parse('2026-09-04T11:21:00.000Z'),
})

function renderWith(threads: unknown[] = [thread()], props: Parameters<typeof MailboxPage>[0] = {}) {
  status.mockReturnValue(readable)
  search.mockReturnValue(searchOk(threads))
  return render(<MailboxPage {...props} />)
}

const reader = () => screen.getByTestId('mailbox-reader')
const list = () => screen.getByRole('list', { name: 'Échanges à suivre' })

/**
 * Théo B m1 — LA STRUCTURE de la page appliquée, dans son ordre. Ce test dit NON si un bloc manque, change de place,
 * ou si l'ancienne grille (une colonne de cartes + un tiroir) revient.
 */
describe('MailboxPage — la structure de la page appliquée (Théo B m1)', () => {
  it('en-tête → ligne d’état → quatre vues → barre d’outils → intentions → liste + volet de lecture', () => {
    const { container } = renderWith()
    const order = [
      screen.getByRole('heading', { level: 1, name: 'Messagerie' }),
      screen.getByTestId('mailbox-status-line'),
      screen.getByTestId('m2-tabs'),
      screen.getByTestId('mailbox-toolbar'),
      screen.getByRole('group', { name: 'Filtrer par intention' }),
      screen.getByTestId('mailbox-workspace'),
    ]
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // Le tiroir latéral d'avant n'existe plus : le fil se lit dans le volet, à côté de la liste.
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(within(screen.getByTestId('mailbox-workspace')).getByTestId('mailbox-reader')).toBeInTheDocument()
  })

  it('l’en-tête porte Demander à Laura, Sources et Nouveau message — Nouveau message ouvre « À qui veux-tu écrire ? »', () => {
    renderWith()
    expect(screen.getByRole('link', { name: 'Sources' })).toHaveAttribute('href', '/integrations')
    expect(screen.getAllByText(/Demander à/).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('new-message-dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau message' }))
    expect(screen.getByTestId('new-message-dialog')).toBeInTheDocument()
  })

  it('la liste s’intitule « Échanges à suivre », avec son compte ; le pied dit la fenêtre de 30 jours', () => {
    renderWith([thread({ threadId: 'a' }), thread({ threadId: 'b', subject: 'Second' })])
    const title = screen.getByRole('heading', { level: 2, name: 'Échanges à suivre' })
    expect(title.parentElement).toHaveTextContent('2')
    expect(screen.getByText(/30 derniers jours/)).toBeInTheDocument()
  })

  it('la barre d’outils : recherche toujours visible, « Tous les comptes », « Filtres »', () => {
    renderWith()
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans la messagerie' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Filtrer les messages par compte : Tous les comptes/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filtres' })).toBeInTheDocument()
  })

  it('« Filtres » ouvre « Filtrer les échanges » : interlocuteur, silence minimum, seulement les non lus', () => {
    renderWith()
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }))
    const dialog = screen.getByRole('dialog', { name: 'Filtrer les échanges' })
    expect(within(dialog).getByText('Interlocuteur ou domaine')).toBeInTheDocument()
    expect(within(dialog).getByText('Silence minimum')).toBeInTheDocument()
    expect(within(dialog).getByText('Voir seulement les échanges non lus')).toBeInTheDocument()
  })

  it('appliquer un interlocuteur le transmet à la recherche ; « seulement les non lus » filtre la liste', () => {
    renderWith([
      thread({ threadId: 'lu', subject: 'Déjà lu' }),
      thread({ threadId: 'nl', subject: 'Pas lu', unread: true }),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }))
    const dialog = screen.getByRole('dialog', { name: 'Filtrer les échanges' })
    expect(within(dialog).getByRole('combobox', { name: 'Silence minimum' })).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'verdal.example' } })
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Appliquer' }))
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ counterpart: 'verdal.example' }))
    expect(screen.getByRole('button', { name: 'Filtres · 2' })).toBeInTheDocument()
    expect(within(list()).getAllByRole('button')).toHaveLength(1)
    expect(within(list()).getByRole('button', { name: /Pas lu/ })).toBeInTheDocument()
  })

  it('Théo B m2 — la barre d’outils reste sur les autres vues ; « Filtres » et les intentions sont ceux de « À traiter »', () => {
    status.mockReturnValue(readable)
    render(<MailboxPage view="drafts" />)
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans la messagerie' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Filtrer les messages par compte/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Filtres' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Filtrer par intention' })).toBeNull()
  })

  it('la recherche part à la validation, avec le mot-clé', () => {
    renderWith()
    const box = screen.getByRole('searchbox', { name: 'Rechercher dans la messagerie' })
    fireEvent.change(box, { target: { value: 'TJM' } })
    fireEvent.submit(box)
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ intent: 'free', query: 'TJM' }))
  })
})

// #3533 (recette Y20, /mailbox en démo) — un fil sans objet ne fait AUCUNE ligne de titre ; l'interlocuteur le désigne.
describe('MailboxPage — un fil sans objet ne s’écrit jamais « (sans objet) » (#3533)', () => {
  it.each([[null], ['   ']])('objet %j : aucun « (sans objet) », l’interlocuteur tient la place', subject => {
    const { container } = renderWith([thread({ subject })])
    expect(container.textContent).not.toContain('(sans objet)')
    expect(within(list()).getByRole('button', { name: /Claire Vasseur/ })).toBeInTheDocument()
  })

  it('un fil AVEC objet garde son objet, en entier en infobulle', () => {
    renderWith()
    const row = within(list()).getByRole('button', { name: /Refonte du parcours commande/ })
    expect(row).toHaveAttribute('title', 'Refonte du parcours commande')
  })
})

describe('MailboxPage — la ligne de fil (Théo B m1, doctrine c96)', () => {
  it('nom de l’interlocuteur, objet, état et compte — JAMAIS un extrait du message', () => {
    renderWith([thread({ unread: true, priorityReason: 'unread' })])
    const row = within(list()).getByRole('button', { name: /Refonte du parcours commande/ })
    expect(row).toHaveTextContent('Claire Vasseur')
    expect(row).toHaveTextContent('Message non lu')
    expect(row).toHaveTextContent('Verdal Distribution')
    // Le contenu du message ne sort pas du fil courant : la liste ne le porte pas.
    expect(row).not.toHaveTextContent('Merci pour le point de la semaine dernière')
    expect(within(reader()).getByText(/Merci pour le point de la semaine dernière/)).toBeInTheDocument()
  })

  it('un fil silencieux dit son silence en jours', () => {
    renderWith()
    expect(within(list()).getByText('Silencieux depuis 11 jours')).toBeInTheDocument()
  })

  it('cliquer une ligne l’affiche dans le volet ; la ligne choisie porte `aria-current`', () => {
    renderWith([thread({ threadId: 'a', subject: 'Premier' }), thread({ threadId: 'b', subject: 'Second' })])
    expect(within(reader()).getByRole('heading', { level: 2 })).toHaveTextContent('Premier')
    const second = within(list()).getByRole('button', { name: /Second/ })
    fireEvent.click(second)
    expect(within(reader()).getByRole('heading', { level: 2 })).toHaveTextContent('Second')
    expect(second).toHaveAttribute('aria-current', 'true')
  })

  it('le fil désigné par « Aujourd’hui » est mis en avant et affiché — rien n’est préparé d’office', () => {
    renderWith([thread({ threadId: 'a', subject: 'Premier' }), thread({ threadId: 'b', subject: 'Visé' })], {
      highlightThreadId: 'b',
    })
    expect(within(reader()).getByRole('heading', { level: 2 })).toHaveTextContent('Visé')
    expect(document.querySelector('[data-highlighted="true"]')).toHaveTextContent('Visé')
    expect(screen.queryByTestId('draft-dialog')).toBeNull()
  })
})

describe('MailboxPage — le rôle de la page (#1397)', () => {
  it('titre « Messagerie », surtitre et phrase d’usage de la page appliquée, sans prénom ni donnée du profil', () => {
    renderWith()
    expect(screen.getByRole('heading', { level: 1, name: 'Messagerie' })).toBeInTheDocument()
    expect(screen.getByText('Répondre, relire, suivre. Chaque échange reste lié au bon dossier.')).toBeInTheDocument()
    expect(screen.getByText('Conversations & validations')).toBeInTheDocument()
  })

  it('#1397.2 — la SAISIE de signature a quitté l’écran ; il en reste l’état et un lien, dans la ligne d’état', () => {
    const { container } = renderWith()
    expect(container.querySelector('textarea')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ce que Laura peut y faire' }))
    expect(screen.getByRole('link', { name: 'Gérer' })).toHaveAttribute('href', '/settings/profile/identity')
  })
})

/**
 * L'EN-TÊTE — le résumé et le geste (#2113.17, #2113.18). Les requêtes se différencient par `params.intent`.
 */
describe('MailboxPage — le résumé et le geste de l’en-tête (#2113.17, #2113.18)', () => {
  const byIntent = (per: Record<string, ReturnType<typeof searchOk>>) => (params: { intent: string }) =>
    per[params.intent] ?? searchOk([])

  it('compte les réponses à traiter et les relances dues — jamais un zéro (GA-18/19)', () => {
    status.mockReturnValue(readable)
    search.mockImplementation(
      byIntent({
        no_reply: searchOk([thread({ threadId: 'follow-1' }), thread({ threadId: 'follow-2' })]),
        positive_reply: searchOk([thread({ threadId: 'positive-1' })]),
      }),
    )
    const { getByTestId } = render(<MailboxPage />)
    const summary = getByTestId('mailbox-hero-summary')
    expect(summary).toHaveTextContent('1 réponse à traiter')
    expect(summary).toHaveTextContent('2 relances dues')
  })

  it('rien à traiter et rien à relancer : ni résumé, ni geste', () => {
    status.mockReturnValue(readable)
    search.mockImplementation(byIntent({}))
    const { queryByTestId } = render(<MailboxPage />)
    expect(queryByTestId('mailbox-hero-summary')).not.toBeInTheDocument()
    expect(queryByTestId('mailbox-hero-cta')).not.toBeInTheDocument()
  })

  it('« Traiter la première réponse » ouvre directement son brouillon — la réponse favorable avant la relance', () => {
    status.mockReturnValue(readable)
    search.mockImplementation(
      byIntent({
        no_reply: searchOk([thread({ threadId: 'follow-1' })]),
        positive_reply: searchOk([thread({ threadId: 'positive-1' })]),
      }),
    )
    render(<MailboxPage />)
    expect(screen.getByTestId('mailbox-hero-cta')).toHaveTextContent('Traiter la première réponse')
    fireEvent.click(screen.getByTestId('mailbox-hero-cta'))
    expect(screen.getByTestId('draft-dialog')).toHaveTextContent('reply:positive-1')
  })
})

describe('MailboxPage — d’où viennent les fils (#1398.1, Théo B m1.A5)', () => {
  it('annonce l’ADRESSE de la boîte lue — la vraie réponse à « d’où viennent ces mails »', () => {
    renderWith()
    expect(screen.getByTestId('mailbox-status-line')).toHaveTextContent('louis@bellum-ai.com')
  })

  it('ne PRÉTEND aucune synchronisation : il date la LECTURE, ce qui est vrai', () => {
    const { container } = renderWith()
    expect(container.textContent ?? '').not.toMatch(/synchronis|dernière mise à jour/i)
    expect(container.textContent).toMatch(/Fils relus à/)
  })

  it('tant qu’aucune lecture n’a abouti, il ne date rien', () => {
    status.mockReturnValue(readable)
    search.mockReturnValue({ ...searchOk(), dataUpdatedAt: 0 })
    const { container } = render(<MailboxPage />)
    expect(container.textContent ?? '').not.toMatch(/Fils relus à/)
  })

  it('« Ce que Laura peut y faire » liste les cinq droits et mène à Intégrations', () => {
    renderWith()
    fireEvent.click(screen.getByRole('button', { name: 'Ce que Laura peut y faire' }))
    for (const label of ['lire tes fils', 'préparer des brouillons', 'envoyer après ton clic']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Revoir les autorisations' })).toHaveAttribute('href', '/integrations')
  })

  it('#2756 — deux messageries branchées : le dit ; une seule : rien de plus', () => {
    status.mockReturnValue({ data: mailboxStatus({ connectedCount: 2 }), isLoading: false })
    search.mockReturnValue(searchOk())
    const { container, unmount } = render(<MailboxPage />)
    expect(container.textContent).toMatch(/autre messagerie/i)
    unmount()
    const again = renderWith()
    expect(again.container.textContent ?? '').not.toMatch(/autre messagerie/i)
  })

  it('la réponse d’absence renvoie vers Intégrations (Théo B m1.A8)', () => {
    renderWith()
    expect(screen.getByRole('link', { name: /Réponse d’absence/ })).toHaveAttribute('href', '/integrations')
  })
})

describe('MailboxPage — chercher par intention, en multi-sélection (Théo B m1.A1)', () => {
  it('six intentions visibles dans l’ordre de la page, les autres sous « + N intentions » — aucune retirée', () => {
    renderWith()
    const group = screen.getByRole('group', { name: 'Filtrer par intention' })
    const visible = within(group)
      .getAllByRole('button', { pressed: false })
      .map(button => button.textContent)
    expect(visible).toEqual(['Non lus', 'Sans réponse', 'Budget', 'TJM', 'CV reçus', "Appels d'offres"])
    fireEvent.click(within(group).getByRole('button', { name: '+ 7 intentions' }))
    for (const label of ['Réponses favorables', 'Fiches de poste', 'Contrats & signatures', 'Factures', 'Absences']) {
      expect(within(group).getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('aucune intention choisie : tous les échanges récents (intention libre)', () => {
    renderWith()
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ intent: 'free', limit: 40 }))
  })

  it('deux intentions choisies : deux questions, réunies dans UNE liste sans doublon', () => {
    status.mockReturnValue(readable)
    search.mockImplementation((params: { intent: string }) =>
      params.intent === 'budget'
        ? searchOk([thread({ threadId: 'x', subject: 'Budget 2027' })])
        : params.intent === 'tjm'
          ? searchOk([thread({ threadId: 'x', subject: 'Budget 2027' }), thread({ threadId: 'y', subject: 'TJM' })])
          : searchOk([]),
    )
    render(<MailboxPage />)
    const group = screen.getByRole('group', { name: 'Filtrer par intention' })
    fireEvent.click(within(group).getByRole('button', { name: 'Budget' }))
    fireEvent.click(within(group).getByRole('button', { name: 'TJM' }))
    expect(within(group).getByRole('button', { name: 'Budget' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'TJM' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(list()).getAllByRole('button')).toHaveLength(2)
  })

  it('arriver sur une intention (depuis « Aujourd’hui ») la pré-sélectionne, même repliée', () => {
    renderWith([thread()], { initialIntent: 'tender' })
    expect(screen.getByRole('button', { name: "Appels d'offres" })).toHaveAttribute('aria-pressed', 'true')
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ intent: 'tender' }))
  })

  // #3718.1 — « Traiter la réponse » (fiche contact) : la recherche est DÉJÀ restreinte à l'interlocuteur, et le filtre
  // le montre (jamais un filtre invisible).
  it('#3718.1 — arriver avec un interlocuteur filtre la recherche et l’affiche', () => {
    renderWith([thread()], { initialCounterpart: 'claire.vasseur@verdal.example' })
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'free', counterpart: 'claire.vasseur@verdal.example' }),
    )
    expect(screen.getByRole('button', { name: 'Filtres · 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Filtres · 1' }))
    expect(screen.getByDisplayValue('claire.vasseur@verdal.example')).toBeInTheDocument()
  })

  it('zéro fil avec un filtre posé : « Retirer les filtres » remet la liste entière', () => {
    status.mockReturnValue(readable)
    search.mockImplementation((params: { intent: string }) => (params.intent === 'free' ? searchOk() : searchOk([])))
    render(<MailboxPage initialIntent="invoice" />)
    expect(screen.getByTestId('mailbox-empty')).toHaveTextContent('Aucun fil pour cette recherche')
    fireEvent.click(screen.getByRole('button', { name: 'Retirer les filtres' }))
    expect(screen.queryByTestId('mailbox-empty')).toBeNull()
    expect(within(list()).getByRole('button', { name: /Refonte du parcours commande/ })).toBeInTheDocument()
  })
})

describe('MailboxPage — le volet de lecture (#1400, Théo B m1)', () => {
  it('objet, interlocuteur, adresse en clair, dossier, et les échanges déjà transportés', () => {
    renderWith()
    const pane = reader()
    expect(within(pane).getByRole('heading', { level: 2 })).toHaveTextContent('Refonte du parcours commande')
    expect(pane).toHaveTextContent('Claire Vasseur')
    expect(pane).toHaveTextContent('claire.vasseur@verdal.example')
    expect(within(pane).getByRole('link', { name: /Ouvrir le dossier Verdal Distribution/ })).toHaveAttribute(
      'href',
      '/accounts/compte-1',
    )
    expect(pane).toHaveTextContent('Lu depuis ta boîte, jamais conservé')
    expect(within(pane).getByText('Derniers échanges')).toBeInTheDocument()
    expect(within(pane).getByText('Origine & visibilité')).toBeInTheDocument()
  })

  it('un fil sans messages détaillés le DIT, au lieu d’une liste vide', () => {
    renderWith([thread({ messages: undefined })])
    expect(within(reader()).getByText(/pas disponible pour ce fil/)).toBeInTheDocument()
  })

  it('#2104.3 — l’interlocuteur et « Fiche contact » mènent à sa fiche quand contactId est connu', () => {
    renderWith([thread({ contactId: 'contact-1' })])
    expect(within(reader()).getByRole('link', { name: 'Claire Vasseur' })).toHaveAttribute(
      'href',
      '/contacts/contact-1',
    )
    expect(within(reader()).getByRole('link', { name: 'Fiche contact' })).toHaveAttribute('href', '/contacts/contact-1')
  })

  it('sans contactId : du texte simple, pas de lien mort', () => {
    renderWith([thread({ contactId: null })])
    expect(within(reader()).queryByRole('link', { name: 'Claire Vasseur' })).toBeNull()
    expect(within(reader()).queryByRole('link', { name: 'Fiche contact' })).toBeNull()
  })

  it('« ← Retour aux messages » existe pour le mobile', () => {
    renderWith()
    expect(within(reader()).getByRole('button', { name: /Retour aux messages/ })).toBeInTheDocument()
  })
})

/**
 * #2393.7 — LES GESTES DU FIL, dans le volet. Rien ne part sans clic : chaque geste ouvre un dialogue ou classe.
 */
describe('MailboxPage — les gestes du fil (#2393.7, Théo B m1)', () => {
  it('« Préparer la réponse » ouvre le brouillon de réponse (rédigé par Laura) — rien n’est envoyé', () => {
    renderWith()
    fireEvent.click(within(reader()).getByRole('button', { name: 'Préparer la réponse' }))
    expect(screen.getByTestId('draft-dialog')).toHaveTextContent('reply:fil-1')
  })

  it('un fil sans réponse propose « Relancer », son propre brouillon', () => {
    renderWith()
    fireEvent.click(within(reader()).getByRole('button', { name: 'Relancer' }))
    expect(screen.getByTestId('draft-dialog')).toHaveTextContent('follow_up:fil-1')
  })

  it('« Marquer traité » classe ce fil', () => {
    renderWith()
    fireEvent.click(within(reader()).getByRole('button', { name: 'Marquer traité' }))
    expect(setThreadMarkMutate).toHaveBeenCalledWith({ threadId: 'fil-1', mark: 'treated' })
  })

  it('« Signaler non pertinent » classe ce fil', () => {
    renderWith()
    fireEvent.click(within(reader()).getByRole('button', { name: 'Signaler non pertinent' }))
    expect(setThreadMarkMutate).toHaveBeenCalledWith({ threadId: 'fil-1', mark: 'irrelevant' })
  })

  it('« Archiver cet échange » range le fil (il part dans l’Historique)', () => {
    renderWith()
    fireEvent.click(within(reader()).getByRole('button', { name: 'Archiver cet échange' }))
    expect(setThreadMarkMutate).toHaveBeenCalledWith({ threadId: 'fil-1', mark: 'archived' })
  })

  it('« Reporter » ouvre « Reprendre cet échange plus tard »', () => {
    renderWith()
    fireEvent.click(within(reader()).getByRole('button', { name: 'Reporter' }))
    expect(screen.getByRole('dialog', { name: 'Reprendre cet échange plus tard' })).toBeInTheDocument()
  })

  it('« Associer » n’apparaît que sans compte certain, et ouvre le rattachement AVEC ce fil', () => {
    renderWith([thread({ account: undefined })])
    fireEvent.click(within(reader()).getByRole('button', { name: 'Associer' }))
    expect(screen.getByTestId('link-account-dialog')).toHaveTextContent('fil-1')
  })

  it('un fil déjà rattaché ne propose plus « Associer »', () => {
    renderWith()
    expect(within(reader()).queryByRole('button', { name: 'Associer' })).toBeNull()
  })
})

describe('MailboxPage — la raison du classement est visible (#2393.5)', () => {
  it('affiche la RAISON du niveau, pas seulement « non lu »', () => {
    renderWith([thread({ unread: false, awaitingReply: true, priorityReason: 'awaiting_reply_late' })])
    expect(within(list()).getByText('Sans réponse depuis longtemps — une relance serait utile')).toBeInTheDocument()
  })

  it('un fil sans `priorityReason` (API antérieure au champ) retombe sur le badge non-lu', () => {
    renderWith([thread({ unread: true, priorityReason: undefined })])
    expect(within(list()).getByText('Non lu', { selector: '[class*="badge"], span' })).toBeInTheDocument()
  })
})

// Un fil traité vit dans « Historique » (vue m2) : il ne reste pas dans « À traiter ».
describe('MailboxPage — « À traiter » ne garde que ce qui reste à faire', () => {
  it('un fil traité ou non pertinent n’est pas listé', () => {
    renderWith([
      thread({ threadId: 'a', subject: 'Ouvert' }),
      thread({ threadId: 'b', subject: 'Clos', state: 'treated' }),
      thread({ threadId: 'c', subject: 'Écarté', state: 'irrelevant' }),
    ])
    expect(within(list()).getByRole('button', { name: /Ouvert/ })).toBeInTheDocument()
    expect(within(list()).queryByRole('button', { name: /Clos/ })).toBeNull()
    expect(within(list()).queryByRole('button', { name: /Écarté/ })).toBeNull()
  })
})
