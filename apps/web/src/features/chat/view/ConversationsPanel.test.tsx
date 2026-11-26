import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Les conversations de Laura — la colonne repliable, dans l'écran du copilote.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER REPREND, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Il descend de `Chat.conversations.test.tsx` puis de
 * `SidebarConversations.test.tsx` — trois emplacements pour la même liste en un
 * mois : un panneau à colonne, la barre latérale du produit, et maintenant une
 * colonne REPLIABLE dans le chat. Les GARANTIES, elles, n'ont jamais changé et
 * sont reprises telles quelles : plusieurs fils par compte, chacun rouvrable, et
 * le compte qui voyage avec son fil.
 *
 * C'est le vrai risque de chacun de ces déplacements : jeter les tests avec le
 * composant, et perdre en silence la capacité qu'ils protégeaient (« un compte =
 * un fil unique, écrasé à chaque nouveau sujet » était le défaut d'origine).
 *
 * S'y ajoutent les garanties PROPRES au repli, en bas de fichier.
 */

const history = vi.hoisted(() => ({ list: vi.fn() }))
// `data` est volontairement large : le hook réel rend une page infinie typée,
// et l'inférer depuis le défaut `undefined` interdirait aux tests de fournir
// des lignes. C'est le mock d'une source, pas un contrat.
const accounts = vi.hoisted(() => ({ data: vi.fn((): { data: unknown } => ({ data: undefined })) }))
const self = vi.hoisted(() => ({
  author: vi.fn((): { firstName: string; avatarUrl: string | null } | null => ({
    firstName: 'Sarah',
    avatarUrl: null,
  })),
}))

/**
 * Le portefeuille, mocké.
 *
 * La ligne d'un fil montre le LOGO de son compte depuis le 27/08/2026 — sans
 * lui, « Utiliser ta connaissance sur AIRBUS… » et « Compare mes comptes
 * suivis… » se ressemblaient, alors que l'un est cadré sur un compte et l'autre
 * sur tout le portefeuille.
 *
 * `useAccounts` traverse `useSession` : le laisser passer ferait tomber les
 * dix tests de CE fichier, qui parlent des fils et pas des comptes. On mocke
 * donc la source, et un test dédié plus bas prouve que le logo sort quand le
 * compte est connu.
 */
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => accounts.data(),
}))

// #1910.8 — « moi », pour le filtre « Partagées ». Le hook réel lit le profil,
// donc la session : le mocker garde ce fichier sur son sujet (les fils).
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({
  useSelfChatAuthor: () => self.author(),
}))

// #1911.12 — le renommage, mocké à part : les tests du bas prouvent le geste,
// ceux du haut ne doivent pas en dépendre.
const renaming = vi.hoisted(() => ({ rename: vi.fn() }))

// #1955.2 — le champ « Rechercher… » interroge AUSSI le serveur depuis le
// 16/09/2026. Ces tests-ci parlent du filtre LOCAL : la lecture serveur est
// mockée sur une liste vide pour qu'elle n'ajoute rien — mais elle est mockée,
// et pas laissée `undefined`, sinon l'effet lèverait dans un minuteur, hors de
// portée de l'assertion, et le fichier serait vert par accident.
const searching = vi.hoisted(() => ({ search: vi.fn() }))

// #1910.8 — le filtre « Partagées » doit s'appuyer sur `isSharedScope` de
// `chat-scope.ts`, pas sur une copie locale de la même question. On garde
// l'implémentation RÉELLE par défaut (`importOriginal`) et on n'écrase que
// l'espion, pour qu'un seul test puisse la bloquer sans changer les autres.
const chatScope = vi.hoisted(() => ({
  isSharedScope: vi.fn(),
  real: null as unknown as (scope: import('@/features/chat/scope/chat-scope').ChatScope) => boolean,
}))
vi.mock('@/features/chat/scope/chat-scope', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/chat/scope/chat-scope')>()
  chatScope.real = actual.isSharedScope
  chatScope.isSharedScope.mockImplementation(actual.isSharedScope)
  return { ...actual, isSharedScope: chatScope.isSharedScope }
})

vi.mock('@/features/chat/api/agentChatApi', () => ({
  listAgentChatHistory: history.list,
  renameAgentChatThread: renaming.rename,
  // #1955.2 / #1911.11 — la recherche serveur, mockée ici par UN SEUL espion.
  // Les deux lots l'avaient chacun mocké de son côté (`searching.search` et
  // `searching.search`) : deux espions pour une même fonction, donc un test qui
  // arme l'un et lit l'autre serait vert sans rien prouver. Les tests qui ne
  // tapent rien ne l'appellent jamais ; ceux qui tapent la configurent.
  searchAgentChatThreads: (...args: unknown[]) => searching.search(...args),
}))

type LinkProps = { to: string; search?: Record<string, unknown>; children?: ReactNode } & Record<string, unknown>

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...props }: LinkProps) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {}).map(([key, value]) => [key, String(value)]),
    ).toString()
    return (
      <a href={query ? `${to}?${query}` : to} {...props}>
        {children}
      </a>
    )
  },
}))

const { ConversationsPanel } = await import('./ConversationsPanel')
const { SidebarConversations } = await import('./SidebarConversations')
const { CONVERSATIONS_PANEL_STORAGE_KEY, readConversationsPanelOpen } = await import('./conversations-panel-open')
const { CONVERSATIONS_GROUPING_STORAGE_KEY, readConversationsGrouping } = await import('./conversations-grouping')

const thread = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 't1',
  account_id: null,
  conversation_id: 'general',
  title: 'Quels comptes prioriser ?',
  created_at: '2026-08-20T10:00:00Z',
  last_message_at: '2026-08-25T10:00:00Z',
  ...over,
})

beforeEach(() => {
  searching.search.mockResolvedValue([])
  // #1910.8 — « moi » repart de Sarah : un test qui l'efface ne le laisse pas
  // aux suivants (ils échoueraient dans un ordre qui dépend de rien).
  self.author.mockReturnValue({ firstName: 'Sarah', avatarUrl: null })
  // Le repli est PERSISTÉ : sans ce nettoyage, un test qui referme la colonne
  // laisserait tous les suivants la trouver fermée — et ils échoueraient dans un
  // ordre qui dépend de l'ordre d'exécution, c'est-à-dire de rien.
  localStorage.clear()
  // #1910.8 — repart de la vraie implémentation à chaque test : seul le test
  // qui bloque l'espion doit voir un comportement différent.
  chatScope.isSharedScope.mockReset()
  chatScope.isSharedScope.mockImplementation(chatScope.real)
})

describe('ConversationsPanel — la liste, telle qu’elle vivait dans la barre latérale', () => {
  it('liste les fils persistés de l’espace', async () => {
    history.list.mockResolvedValue([
      thread({ id: 't1', title: 'Quels comptes prioriser ?' }),
      thread({ id: 't2', title: 'Compare mes comptes suivis' }),
    ])
    render(<ConversationsPanel />)
    expect(await screen.findByText('Quels comptes prioriser ?')).toBeInTheDocument()
    expect(screen.getByText('Compare mes comptes suivis')).toBeInTheDocument()
  })

  it('garde PLUSIEURS fils sur le même compte — chacun rouvrable', async () => {
    // Le défaut d'origine : un compte portait UN fil (`account-<id>`), écrasé au
    // sujet suivant. Deux fils du même compte doivent produire deux entrées, et
    // deux liens DISTINCTS.
    history.list.mockResolvedValue([
      thread({ id: 't1', account_id: 'acc-1', conversation_id: 'c-1', title: 'Angle RSE' }),
      thread({ id: 't2', account_id: 'acc-1', conversation_id: 'c-2', title: 'Objections prix' }),
    ])
    render(<ConversationsPanel />)
    const first = (await screen.findByText('Angle RSE')).closest('a')
    const second = screen.getByText('Objections prix').closest('a')
    expect(first?.getAttribute('href')).toContain('conversationId=c-1')
    expect(second?.getAttribute('href')).toContain('conversationId=c-2')
    expect(first?.getAttribute('href')).not.toBe(second?.getAttribute('href'))
  })

  it('#3367 — la ligne « en attente » sans conversation_id ne double pas la ligne « reçu » du même titre', async () => {
    history.list.mockResolvedValue([
      thread({ id: 't-pending', conversation_id: null, title: 'Prépare un message pour ce contact' }),
      thread({ id: 't-received', conversation_id: 'c-real', title: 'Prépare un message pour ce contact' }),
    ])
    render(<ConversationsPanel />)
    const rows = await screen.findAllByText('Prépare un message pour ce contact')
    expect(rows).toHaveLength(1)
    expect(rows[0].closest('a')?.getAttribute('href')).toContain('conversationId=c-real')
  })

  it('le COMPTE voyage avec le fil — sinon la portée serait perdue', async () => {
    history.list.mockResolvedValue([thread({ account_id: 'acc-9', conversation_id: 'c-9' })])
    render(<ConversationsPanel />)
    const link = (await screen.findByText('Quels comptes prioriser ?')).closest('a')
    expect(link?.getAttribute('href')).toContain('accountId=acc-9')
    expect(link?.getAttribute('href')).toContain('conversationId=c-9')
  })

  it('un fil de PORTEFEUILLE n’invente pas de compte', async () => {
    history.list.mockResolvedValue([thread({ account_id: null, conversation_id: 'general' })])
    render(<ConversationsPanel />)
    const link = (await screen.findByText('Quels comptes prioriser ?')).closest('a')
    expect(link?.getAttribute('href')).not.toContain('accountId')
  })

  it('propose toujours d’ouvrir une conversation, même sans historique', async () => {
    history.list.mockResolvedValue([])
    render(<ConversationsPanel />)
    expect(await screen.findByText('Aucune conversation')).toBeInTheDocument()
    expect(screen.getByText('Nouvelle conversation')).toBeInTheDocument()
  })

  it('« Nouvelle conversation » porte `?new=` — sinon le clic ne fait RIEN', async () => {
    // Vécu : le lien pointait sur `/chat`. Depuis l'écran `/chat`, l'URL ne
    // changeait pas — aucun rendu, aucun effet, un bouton qui a l'air cassé.
    // Et depuis un fil ouvert il ramenait sur `general`, un fil DÉJÀ écrit.
    history.list.mockResolvedValue([])
    render(<ConversationsPanel />)
    const link = (await screen.findByText('Nouvelle conversation')).closest('a')
    expect(link?.getAttribute('href')).toContain('new=1')
  })

  it('sait dire NON — un historique illisible le DIT, il ne se rend pas vide', async () => {
    // Vide, la liste se lirait « tu n'as jamais parlé à Laura » : on rouvrirait
    // un fil qui existe déjà, et le précédent deviendrait introuvable.
    history.list.mockRejectedValue(new Error('boom'))
    render(<ConversationsPanel />)
    expect(await screen.findByText('Historique indisponible')).toBeInTheDocument()
    expect(screen.queryByText('Aucune conversation')).not.toBeInTheDocument()
  })

  it('la recherche n’apparaît qu’au-delà de cinq fils, et filtre', async () => {
    history.list.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => thread({ id: `t${i}`, conversation_id: `c${i}`, title: `Sujet ${i}` })),
    )
    render(<ConversationsPanel />)
    const search = await screen.findByRole('searchbox')
    await userEvent.type(search, 'Sujet 3')
    await waitFor(() => expect(screen.queryByText('Sujet 0')).not.toBeInTheDocument())
    expect(screen.getByText('Sujet 3')).toBeInTheDocument()
  })

  it('sous six fils, pas de champ de recherche — on lit plus vite qu’on ne tape', async () => {
    history.list.mockResolvedValue([thread()])
    render(<ConversationsPanel />)
    await screen.findByText('Quels comptes prioriser ?')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('classe les fils dans l’ordre servi par l’API — la dernière activité d’abord', async () => {
    history.list.mockResolvedValue([
      thread({ id: 't1', conversation_id: 'c-1', title: 'Le plus récent' }),
      thread({ id: 't2', conversation_id: 'c-2', title: 'Le plus ancien' }),
    ])
    render(<ConversationsPanel />)
    await screen.findByText('Le plus récent')
    const titles = screen.getAllByRole('link').map(node => node.textContent ?? '')
    // Le premier lien est « Nouvelle conversation » ; les fils suivent, dans l'ordre.
    expect(titles[1]).toContain('Le plus récent')
    expect(titles[2]).toContain('Le plus ancien')
  })
  // ── Le logo du compte (27/08/2026) ──────────────────────────────────────
  //
  // « Dans les conv à gauche faudrait aussi le logo du compte concerné, qu'on
  // sache ce qui correspond à ça. » Deux fils dont les titres commencent
  // pareil étaient impossibles à distinguer.

  it('montre le compte du fil quand on le connaît', async () => {
    accounts.data.mockReturnValue({
      data: { pages: [{ data: [{ id: 'a-1', company_name: 'LATECOERE', logo_url: null, website: null }] }] },
    })
    history.list.mockResolvedValue([thread({ account_id: 'a-1', title: 'Angle d’attaque' })])
    render(<ConversationsPanel />)
    await screen.findByText('Angle d’attaque')
    // Le lien porte le compte dans son nom ACCESSIBLE : l'avatar est
    // `aria-hidden`, donc sans ce texte un lecteur d'écran n'entendrait rien
    // de ce qui distingue deux fils aux titres voisins.
    // Théo B l1-laura.N1 — « Tes dossiers » nomme aussi le compte : la ligne du fil passe en premier.
    expect(screen.getAllByRole('link', { name: /LATECOERE/i })[0]).toBeInTheDocument()
  })

  it('n’invente AUCUN compte sur un fil de portefeuille', async () => {
    // Un fil sans compte n'est pas un fil cassé : une pastille grise s'y
    // lirait comme un compte qu'on n'arrive pas à charger.
    accounts.data.mockReturnValue({ data: { pages: [{ data: [] }] } })
    history.list.mockResolvedValue([thread({ account_id: null })])
    render(<ConversationsPanel />)
    await screen.findByText('Quels comptes prioriser ?')
    expect(screen.queryByRole('link', { name: /LATECOERE/i })).not.toBeInTheDocument()
  })

  it('ne montre rien quand le compte est hors de la page chargée ET que l’API n’en sert pas le nom', async () => {
    // Le portefeuille est paginé : un compte au-delà de la coupe dont l'API ne
    // sert AUCUN nom est INCONNU, pas absent. Afficher un marque-place ferait
    // croire à une panne.
    //
    // ⚠️ La condition « ET que l'API n'en sert pas le nom » est arrivée avec
    // #1911.2 : `account_name` voyage désormais sur chaque fil, et il n'y a
    // plus de raison de taire un compte dont on CONNAÎT le nom.
    accounts.data.mockReturnValue({ data: { pages: [{ data: [] }] } })
    history.list.mockResolvedValue([thread({ account_id: 'a-hors-page' })])
    render(<ConversationsPanel />)
    await screen.findByText('Quels comptes prioriser ?')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  // ── #1911.2 — le compte du fil se LIT, et il ne s'arrête pas à la page 1 ───
  //
  // Le retour : « Chaque fil affiche […] le compte ou l'objet associé ». Deux
  // défauts mesurés le 13/09/2026 sur `/chat` : le nom du compte n'était rendu
  // qu'en `sr-only` (un logo générique à initiales ne dit pas DE QUOI parle le
  // fil), et un fil dont le compte tombait hors des 25 premiers du portefeuille
  // n'avait NI logo NI nom — alors que l'API sert `account_name` sur chaque fil
  // depuis #1911.10, et que `thread-groups.ts` s'en sert déjà pour intituler ses
  // intercalaires. Du code juste, que cet écran-ci n'appelait pas.

  it('#1911.2 — le nom du compte est LISIBLE sur la ligne du fil, pas seulement annoncé', async () => {
    accounts.data.mockReturnValue({
      data: { pages: [{ data: [{ id: 'a-1', company_name: 'LATECOERE', logo_url: null, website: null }] }] },
    })
    history.list.mockResolvedValue([thread({ account_id: 'a-1', title: 'Angle d’attaque' })])
    render(<ConversationsPanel />)
    await screen.findByText('Angle d’attaque')
    // Un seul porteur du nom, et il n'est pas masqué aux yeux : `sr-only` sort
    // le texte du flux visuel, donc un nom qui ne vit QUE là ne se lit pas.
    const name = screen.getAllByText('LATECOERE')[0]!
    expect(name.className).not.toContain('sr-only')
    expect(name.closest('.sr-only')).toBeNull()
  })

  it('#1911.2 — un compte hors de la page chargée se nomme quand même, par le nom servi avec le fil', async () => {
    accounts.data.mockReturnValue({ data: { pages: [{ data: [] }] } })
    history.list.mockResolvedValue([
      thread({ account_id: 'a-hors-page', account_name: 'SAFRAN', title: 'Angle d’attaque' }),
    ])
    render(<ConversationsPanel />)
    await screen.findByText('Angle d’attaque')
    expect(screen.getByText('SAFRAN')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /SAFRAN/i })).toBeInTheDocument()
  })

  it('#1911.2 — un nom servi vide ne fabrique pas de compte', async () => {
    // `account_name: '  '` est un nom ILLISIBLE, pas un nom : le fil retombe
    // sur « on ne sait pas », jamais sur une pastille sans texte.
    accounts.data.mockReturnValue({ data: { pages: [{ data: [] }] } })
    history.list.mockResolvedValue([thread({ account_id: 'a-hors-page', account_name: '  ' })])
    render(<ConversationsPanel />)
    await screen.findByText('Quels comptes prioriser ?')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('#1911.2 — rangé PAR COMPTE, l’intercalaire porte déjà le nom : la ligne ne le redit pas (loi 4)', async () => {
    accounts.data.mockReturnValue({ data: { pages: [{ data: [] }] } })
    history.list.mockResolvedValue([thread({ account_id: 'a-1', account_name: 'LATECOERE', title: 'Angle d’attaque' })])
    localStorage.setItem(CONVERSATIONS_GROUPING_STORAGE_KEY, 'account')
    render(<ConversationsPanel />)
    await screen.findByText('Angle d’attaque')
    // Une seule occurrence VISIBLE du nom : celle de l'intercalaire.
    const visible = screen.getAllByText('LATECOERE').filter(node => !node.closest('.sr-only'))
    expect(visible).toHaveLength(1)
  })

  // ── #1911.4 / #1911.6 — l'auteur principal, sur la ligne MÉTA ──────────────
  //
  // « Chaque fil affiche : […] Auteur principal […] Petit avatar ». Dans un
  // espace partagé, deux fils aux titres voisins ouverts par deux collègues ne
  // se distinguaient que par… rien.

  it('#1911.4 — la ligne méta nomme qui a OUVERT le fil, avec ses initiales quand il n’a pas de photo', async () => {
    history.list.mockResolvedValue([thread({ author: { firstName: 'Théo', avatarUrl: null } })])
    render(<ConversationsPanel />)
    await screen.findByText('Quels comptes prioriser ?')
    // Le nom accessible du lien porte la phrase entière ; le prénom visible et
    // l'avatar sont décoratifs pour le lecteur d'écran (pas de doublon annoncé).
    expect(screen.getByRole('link', { name: /Ouverte par Théo/ })).toBeInTheDocument()
    expect(screen.getByText('Théo')).toBeInTheDocument()
    expect(screen.getByText('T')).toBeInTheDocument()
  })

  // ── #1910.8 — « Partagées » : retrouver les fils ouverts par un collègue ────
  //
  // Arbitré par Louis le 16/09/2026 : un filtre de LECTURE. Ce que Laura relit
  // n'y touche pas (`chat-scope-shared.test.ts` tient cette moitié-là).

  it('#1910.8 — le filtre « Partagées » ne garde que les fils ouverts par quelqu’un d’autre', async () => {
    history.list.mockResolvedValue([
      thread({ id: 't1', conversation_id: 'c-1', title: 'Mon fil', author: { firstName: 'Sarah', avatarUrl: null } }),
      thread({
        id: 't2',
        conversation_id: 'c-2',
        title: 'Le fil de Théo',
        author: { firstName: 'Théo', avatarUrl: null },
      }),
    ])
    render(<ConversationsPanel />)
    await screen.findByText('Mon fil')

    const filter = screen.getByRole('button', { name: 'Partagées' })
    expect(filter).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(filter)

    expect(screen.getByText('Le fil de Théo')).toBeInTheDocument()
    expect(screen.queryByText('Mon fil')).not.toBeInTheDocument()
    expect(filter).toHaveAttribute('aria-pressed', 'true')
  })

  it('#1910.8 — sans un seul fil ouvert par un collègue, le filtre n’apparaît pas', async () => {
    history.list.mockResolvedValue([
      thread({ id: 't1', conversation_id: 'c-1', title: 'Mon fil', author: { firstName: 'Sarah', avatarUrl: null } }),
    ])
    render(<ConversationsPanel />)
    await screen.findByText('Mon fil')
    expect(screen.queryByRole('button', { name: 'Partagées' })).not.toBeInTheDocument()
  })

  it('#1910.8 — sans mon prénom, aucun fil n’est déclaré partagé', async () => {
    self.author.mockReturnValue(null)
    history.list.mockResolvedValue([
      thread({
        id: 't2',
        conversation_id: 'c-2',
        title: 'Le fil de Théo',
        author: { firstName: 'Théo', avatarUrl: null },
      }),
    ])
    render(<ConversationsPanel />)
    await screen.findByText('Le fil de Théo')
    expect(screen.queryByRole('button', { name: 'Partagées' })).not.toBeInTheDocument()
  })

  it('#1910.8 — le filtre s’appuie sur `isSharedScope` de chat-scope.ts, pas sur une copie locale', async () => {
    // L'espion reste bloqué à `false` pour tout l'appui du bouton : si le
    // filtre gardait son propre état (un booléen local), le blocage n'aurait
    // aucun effet et le fil de Sarah disparaîtrait quand même.
    chatScope.isSharedScope.mockReturnValue(false)
    history.list.mockResolvedValue([
      thread({ id: 't1', conversation_id: 'c-1', title: 'Mon fil', author: { firstName: 'Sarah', avatarUrl: null } }),
      thread({
        id: 't2',
        conversation_id: 'c-2',
        title: 'Le fil de Théo',
        author: { firstName: 'Théo', avatarUrl: null },
      }),
    ])
    render(<ConversationsPanel />)
    await screen.findByText('Mon fil')

    const filter = screen.getByRole('button', { name: 'Partagées' })
    await userEvent.click(filter)

    expect(chatScope.isSharedScope).toHaveBeenCalled()
    // `isSharedScope` bloqué à `false` : rien ne doit plus être retiré.
    expect(screen.getByText('Mon fil')).toBeInTheDocument()
    expect(screen.getByText('Le fil de Théo')).toBeInTheDocument()
  })

  it('un fil sans auteur connu (compte effacé, API antérieure) n’invente personne', async () => {
    history.list.mockResolvedValue([
      thread({ id: 't1', conversation_id: 'c-1', title: 'Fil effacé', author: null }),
      thread({ id: 't2', conversation_id: 'c-2', title: 'Fil d’avant le déploiement' }),
    ])
    render(<ConversationsPanel />)
    await screen.findByText('Fil effacé')
    expect(screen.getByText('Fil d’avant le déploiement')).toBeInTheDocument()
    expect(screen.queryByText(/Ouverte par/)).not.toBeInTheDocument()
  })
})

/**
 * Le repli lui-même — la seule chose que le déplacement du 30/08/2026 AJOUTE.
 *
 * Les tests ci-dessus prouvent que la liste survit au déménagement ; ceux-ci
 * prouvent qu'elle se referme, qu'elle se retrouve, et qu'elle se souvient.
 */
describe('ConversationsPanel — le repli (Louis, 30/08/2026)', () => {
  it('s’ouvre DÉPLIÉ sur un poste neuf — un historique replié par défaut est un historique qu’on ne trouve plus', async () => {
    // La liste était TOUJOURS visible dans la barre latérale. La déplacer est un
    // déplacement ; la refermer serait un retrait, et personne ne cherche une
    // colonne dont il ignore l'existence (`/actions/sequences`, orpheline des
    // mois durant pour cette raison exacte).
    history.list.mockResolvedValue([thread({ title: 'Angle RSE' })])
    render(<ConversationsPanel />)
    expect(await screen.findByText('Angle RSE')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Replier les conversations' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('le défaut est OUVERT dans la fonction elle-même, pas seulement à l’écran', () => {
    // On exécute la porte, on ne relit pas une constante : ce qui compte est ce
    // que l'écran obtient quand rien n'est stocké.
    expect(readConversationsPanelOpen()).toBe(true)
  })

  it('le bouton de repli porte un nom, et son nom CHANGE avec son état', async () => {
    history.list.mockResolvedValue([])
    render(<ConversationsPanel />)
    await screen.findByText('Aucune conversation')
    await userEvent.click(screen.getByRole('button', { name: 'Replier les conversations' }))
    expect(screen.getByRole('button', { name: 'Déplier les conversations' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('replié, le rail garde son bouton — la colonne ne disparaît jamais tout à fait', async () => {
    history.list.mockResolvedValue([])
    render(<ConversationsPanel />)
    await screen.findByText('Aucune conversation')
    await userEvent.click(screen.getByRole('button', { name: 'Replier les conversations' }))
    // Le seul chemin de retour. S'il partait avec la liste, le repli serait une
    // suppression déguisée.
    expect(screen.getByRole('button', { name: 'Déplier les conversations' })).toBeVisible()
  })

  it('replié, un « + » reste dans le rail pour lancer une conversation SANS déplier (#2748.2)', async () => {
    // Avant ce point : le lien « Nouvelle conversation » ne vivait que dans le
    // corps de la liste (`ConversationList`), masqué EN CSS quand replié — en
    // rail, aucune cible n'était rendue en dehors de ce corps masqué. Un
    // utilisateur qui replie perd donc le raccourci tant qu'il n'a pas redéplié.
    history.list.mockResolvedValue([])
    render(<ConversationsPanel />)
    await screen.findByText('Aucune conversation')
    await userEvent.click(screen.getByRole('button', { name: 'Replier les conversations' }))
    const railNew = screen.getByTestId('conversations-panel-rail-new')
    expect(railNew).toBeVisible()
    expect(railNew).toHaveAttribute('href', '/chat?new=1')
  })

  it('déplié, le raccourci du rail ne se rend PAS — un seul « + » visible à la fois (#2748.2)', async () => {
    history.list.mockResolvedValue([])
    render(<ConversationsPanel />)
    await screen.findByText('Aucune conversation')
    expect(screen.queryByTestId('conversations-panel-rail-new')).not.toBeInTheDocument()
  })

  it('replié, la liste est masquée EN CSS — le même rendu, jamais un rendu conditionnel', async () => {
    // La règle mobile du dépôt : « une colonne masquée l'est en CSS dans le MÊME
    // rendu ». Un démontage perdrait la position de défilement et le filtre
    // tapé, et relancerait un appel réseau à chaque bascule.
    history.list.mockResolvedValue([thread({ title: 'Angle RSE' })])
    render(<ConversationsPanel />)
    const title = await screen.findByText('Angle RSE')
    await userEvent.click(screen.getByRole('button', { name: 'Replier les conversations' }))
    expect(title).toBeInTheDocument()
    expect(title.closest('div.hidden')).not.toBeNull()
  })

  it('le choix SURVIT au remontage — sinon ce n’est pas un repli, c’est une animation', async () => {
    history.list.mockResolvedValue([])
    const first = render(<ConversationsPanel />)
    await screen.findByText('Aucune conversation')
    await userEvent.click(screen.getByRole('button', { name: 'Replier les conversations' }))
    expect(localStorage.getItem(CONVERSATIONS_PANEL_STORAGE_KEY)).toBe('false')
    first.unmount()

    render(<ConversationsPanel />)
    // On attend que la liste ait fini de se charger AVANT d'assurer : le corps
    // est masqué mais bien monté, donc son `setState` arrive de toute façon —
    // hors de `act(…)` si on ne l'attend pas ici.
    await screen.findByText('Aucune conversation')
    expect(screen.getByRole('button', { name: 'Déplier les conversations' })).toBeInTheDocument()
    expect(readConversationsPanelOpen()).toBe(false)
  })

  it('un stockage indisponible ne fait pas d’écran blanc — on rend le défaut', () => {
    // Safari en navigation privée, un navigateur qui bloque le stockage, un
    // quota plein : l'ACCÈS lui-même lève. Une préférence d'interface ne
    // justifie jamais une page cassée.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    try {
      expect(readConversationsPanelOpen()).toBe(true)
    } finally {
      getItem.mockRestore()
    }
  })
})

describe('SidebarConversations — la coquille vide, à dessein', () => {
  it('ne rend PLUS rien : la barre latérale a récupéré ses 510 px', () => {
    // Son seul appelant (`CustomerNavbarBody`) appartenait à un lot en cours de
    // fusion ; le montage sera retiré là-bas (D314). En attendant, c'est ICI que
    // la liste cesse d'exister dans la barre — et GA-110 refuse qu'elle y
    // revienne, parce qu'elle serait alors rendue à deux endroits.
    history.list.mockClear()
    const { container } = render(<SidebarConversations />)
    expect(container).toBeEmptyDOMElement()
    // Et elle n'appelle plus l'API : la barre latérale tirait l'historique du
    // copilote à chaque ouverture de `/chat`.
    expect(history.list).not.toHaveBeenCalled()
  })
})

/**
 * #1911.12 / #1955.1 — renommer un fil, EN PLACE, depuis le menu de sa ligne.
 *
 * « Un commercial renommera un fil et le nouveau titre survivra au
 * rechargement. » Le rechargement est côté serveur (le titre est stocké) ; ce
 * qui se prouve ici est le geste : Entrée valide, Échap annule, rien d'inutile
 * ne part, et la liste montre le nouveau titre SANS se relire.
 */
describe('ConversationsPanel — renommer un fil (#1911.12, #1955.1)', () => {
  beforeEach(() => {
    renaming.rename.mockReset()
    history.list.mockReset()
    accounts.data.mockReturnValue({ data: undefined })
  })

  async function openRename(title = 'Quels comptes prioriser ?') {
    history.list.mockResolvedValue([thread({ title })])
    render(<ConversationsPanel />)
    await screen.findByText(title)
    await userEvent.click(screen.getByRole('button', { name: 'Options de la conversation' }))
    await userEvent.click(screen.getByRole('button', { name: 'Renommer' }))
    return screen.getByRole('textbox', { name: 'Titre de la conversation' })
  }

  it('« Renommer » ouvre la saisie en place, pré-remplie et prête à taper', async () => {
    const input = await openRename()
    expect(input).toHaveValue('Quels comptes prioriser ?')
    expect(input).toHaveFocus()
  })

  it('Entrée valide : le titre part au serveur, s’affiche, et la liste n’est PAS relue', async () => {
    renaming.rename.mockResolvedValue({ title: 'Prioriser mes comptes' })
    const input = await openRename()
    const reads = history.list.mock.calls.length
    await userEvent.clear(input)
    await userEvent.type(input, '  Prioriser   mes comptes {Enter}')
    expect(renaming.rename).toHaveBeenCalledWith(
      { conversationId: 'general', accountId: null },
      'Prioriser mes comptes',
    )
    expect(await screen.findByText('Prioriser mes comptes')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Titre de la conversation' })).not.toBeInTheDocument()
    expect(history.list.mock.calls.length).toBe(reads)
  })

  it('Échap annule : rien ne part, le titre d’origine revient', async () => {
    const input = await openRename()
    await userEvent.type(input, ' modifié{Escape}')
    expect(renaming.rename).not.toHaveBeenCalled()
    expect(screen.getByText('Quels comptes prioriser ?')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Titre de la conversation' })).not.toBeInTheDocument()
  })

  it('sait dire NON — un titre fait de blancs n’appelle pas le serveur', async () => {
    const input = await openRename()
    await userEvent.clear(input)
    await userEvent.type(input, '   {Enter}')
    expect(renaming.rename).not.toHaveBeenCalled()
    expect(screen.getByText('Quels comptes prioriser ?')).toBeInTheDocument()
  })

  it('sait dire NON — un titre inchangé n’appelle pas le serveur', async () => {
    const input = await openRename()
    await userEvent.type(input, '{Enter}')
    expect(renaming.rename).not.toHaveBeenCalled()
  })

  it('un échec garde l’ancien titre — jamais un titre affiché que le serveur n’a pas écrit', async () => {
    renaming.rename.mockRejectedValue(new Error('boom'))
    const input = await openRename()
    await userEvent.clear(input)
    await userEvent.type(input, 'Nouveau titre{Enter}')
    await waitFor(() => expect(screen.getByText('Quels comptes prioriser ?')).toBeInTheDocument())
    expect(screen.queryByText('Nouveau titre')).not.toBeInTheDocument()
  })
})

/**
 * #1911.1 — le titre rédigé par Laura arrive SANS recharger.
 *
 * Laura titre le fil en tâche de fond, APRÈS que sa réponse a été écrite — donc
 * après la relecture que déclenche un tour (`refreshKey`). Sans une seconde
 * lecture, le titre n'apparaîtrait qu'au tour suivant. Une seule, et seulement
 * quand le fil le plus récent n'a encore aucun titre stocké : c'est ce qui la
 * distingue d'une boucle réseau, le défaut que ce dépôt a déjà payé.
 */
describe('ConversationsPanel — le titre de Laura arrive sans recharger (#1911.1)', () => {
  beforeEach(() => {
    history.list.mockReset()
    accounts.data.mockReturnValue({ data: undefined })
  })
  afterEach(() => vi.useRealTimers())

  it('après un tour, relit la liste une fois, le temps que Laura titre le fil', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    history.list
      .mockResolvedValueOnce([thread({ title: 'Quels comptes prioriser ?', title_source: null })])
      .mockResolvedValueOnce([thread({ title: 'Quels comptes prioriser ?', title_source: null })])
      .mockResolvedValue([thread({ title: 'Prioriser mes comptes cette semaine', title_source: 'laura' })])
    const { rerender } = render(<ConversationsPanel refreshKey={0} />)
    await screen.findByText('Quels comptes prioriser ?')
    rerender(<ConversationsPanel refreshKey={1} />)
    await waitFor(() => expect(history.list).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await screen.findByText('Prioriser mes comptes cette semaine')).toBeInTheDocument()
    expect(history.list).toHaveBeenCalledTimes(3)
  })

  // ⚠️ Une liste NEUVE à chaque lecture, comme le réseau en rend une. Avec
  // `mockResolvedValue([…])`, chaque appel rendait le MÊME tableau : React ne
  // re-rendait pas, l'effet ne se réarmait jamais, et le test « jamais une
  // boucle » restait vert même garde retirée — vérifié en la retirant.
  const freshList = (over: Partial<Record<string, unknown>>) => async () => [thread(over)]

  it('sait dire NON — une seule relecture par tour, jamais une boucle', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    history.list.mockImplementation(freshList({ title_source: null }))
    const { rerender } = render(<ConversationsPanel refreshKey={0} />)
    await screen.findByText('Quels comptes prioriser ?')
    rerender(<ConversationsPanel refreshKey={1} />)
    await waitFor(() => expect(history.list).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(60_000)
    // La relecture part au minuteur, sa réponse arrive après : sur un runner chargé, l’attendre.
    await waitFor(() => expect(history.list).toHaveBeenCalledTimes(3))
    // … et aucune autre ensuite : une seule relecture par tour, jamais une boucle.
    await vi.advanceTimersByTimeAsync(120_000)
    expect(history.list).toHaveBeenCalledTimes(3)
  })

  it('n’attrape pas le voisin — un fil déjà titré ne relance aucune lecture', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    history.list.mockImplementation(freshList({ title_source: 'laura' }))
    const { rerender } = render(<ConversationsPanel refreshKey={0} />)
    await screen.findByText('Quels comptes prioriser ?')
    rerender(<ConversationsPanel refreshKey={1} />)
    await waitFor(() => expect(history.list).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(history.list).toHaveBeenCalledTimes(2)
  })

  it('à l’ouverture de l’écran, sans tour, aucune relecture', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    history.list.mockImplementation(freshList({ title_source: null }))
    render(<ConversationsPanel refreshKey={0} />)
    await screen.findByText('Quels comptes prioriser ?')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(history.list).toHaveBeenCalledTimes(1)
  })
})

/**
 * #1911.7 à #1911.10 — la liste se RANGE : par date (défaut) ou par compte.
 *
 * Décision de Louis du 13/09/2026 (batch 11), contre la liste plate du 30/08.
 * Les bornes de date se prouvent sans navigateur (`lib/thread-groups.test.ts`) ;
 * ici on prouve ce que l'écran en fait : les intercalaires, la bascule, le choix
 * qui survit au remontage, et un compte sans nom qui ne s'affiche jamais par son
 * identifiant.
 */
describe('ConversationsPanel — les fils rangés par date ou par compte (#1911.7-10)', () => {
  // Deux instants dont le rang ne dépend ni du fuseau ni du jour du test :
  // « maintenant » est aujourd'hui partout, 2020 est plus ancien partout.
  const today = () => new Date().toISOString()
  const older = '2020-03-02T10:00:00Z'

  beforeEach(() => {
    history.list.mockReset()
    accounts.data.mockReturnValue({ data: undefined })
  })

  /** Le groupe d'un intercalaire, par son nom accessible. */
  const groupNamed = (name: string) => screen.getByRole('group', { name })
  const titlesIn = (group: HTMLElement) =>
    within(group)
      .getAllByRole('link')
      .map(link => link.textContent ?? '')

  it('#1911.7 / #1911.9 — par défaut, des intercalaires de date ; un groupe vide ne s’affiche pas', async () => {
    history.list.mockResolvedValue([
      thread({ id: 't1', conversation_id: 'c-1', title: 'Fil du jour', last_message_at: today() }),
      thread({ id: 't2', conversation_id: 'c-2', title: 'Fil de mars 2020', last_message_at: older }),
    ])
    render(<ConversationsPanel />)
    await screen.findByText('Fil du jour')
    expect(titlesIn(groupNamed('Aujourd’hui'))).toEqual([expect.stringContaining('Fil du jour')])
    expect(titlesIn(groupNamed('Plus ancien'))).toEqual([expect.stringContaining('Fil de mars 2020')])
    // #1911.8 — aucun fil de la semaine : pas d'intercalaire « Cette semaine ».
    expect(screen.queryByRole('group', { name: 'Cette semaine' })).not.toBeInTheDocument()
  })

  it('la bascule dit son état, et « Par date » est le défaut', async () => {
    history.list.mockResolvedValue([
      thread({ id: 't1', conversation_id: 'c-1', last_message_at: today() }),
      thread({ id: 't2', conversation_id: 'c-2', title: 'Autre', last_message_at: older }),
    ])
    render(<ConversationsPanel />)
    await screen.findByText('Autre')
    const toggle = screen.getByRole('group', { name: 'Ranger les conversations' })
    expect(within(toggle).getByRole('button', { name: 'Par date' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(toggle).getByRole('button', { name: 'Par compte' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('#1911.10 — « Par compte » : un intercalaire par compte, ses fils dessous, « Sans compte » en dernier', async () => {
    history.list.mockResolvedValue([
      thread({ id: 't1', conversation_id: 'c-1', title: 'Portefeuille', account_id: null, last_message_at: today() }),
      thread({ id: 't2', conversation_id: 'c-2', title: 'Angle RSE', account_id: 'a-1', account_name: 'LATECOERE' }),
      thread({ id: 't3', conversation_id: 'c-3', title: 'Objections', account_id: 'a-2', account_name: 'SAFRAN' }),
      thread({ id: 't4', conversation_id: 'c-4', title: 'Relance DSI', account_id: 'a-1', account_name: 'LATECOERE' }),
    ])
    render(<ConversationsPanel />)
    await screen.findByText('Angle RSE')
    await userEvent.click(screen.getByRole('button', { name: 'Par compte' }))

    expect(screen.getByRole('button', { name: 'Par compte' })).toHaveAttribute('aria-pressed', 'true')
    expect(titlesIn(groupNamed('LATECOERE'))).toEqual([
      expect.stringContaining('Angle RSE'),
      expect.stringContaining('Relance DSI'),
    ])
    expect(titlesIn(groupNamed('SAFRAN'))).toEqual([expect.stringContaining('Objections')])
    expect(titlesIn(groupNamed('Sans compte'))).toEqual([expect.stringContaining('Portefeuille')])
    // L'ordre des intercalaires : les comptes, puis « Sans compte ».
    const headings = ['LATECOERE', 'SAFRAN', 'Sans compte'].map(groupNamed)
    for (let index = 1; index < headings.length; index += 1) {
      expect(
        headings[index - 1].compareDocumentPosition(headings[index]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
    // Les intercalaires de date ont disparu : un seul niveau à la fois.
    expect(screen.queryByRole('group', { name: 'Aujourd’hui' })).not.toBeInTheDocument()
  })

  it('le choix SURVIT au remontage — retenu sur ce navigateur', async () => {
    history.list.mockResolvedValue([
      thread({ id: 't1', conversation_id: 'c-1', title: 'Angle RSE', account_id: 'a-1', account_name: 'LATECOERE' }),
      thread({ id: 't2', conversation_id: 'c-2', title: 'Portefeuille' }),
    ])
    const first = render(<ConversationsPanel />)
    await screen.findByText('Angle RSE')
    await userEvent.click(screen.getByRole('button', { name: 'Par compte' }))
    expect(localStorage.getItem(CONVERSATIONS_GROUPING_STORAGE_KEY)).toBe('account')
    first.unmount()

    render(<ConversationsPanel />)
    await screen.findByText('Angle RSE')
    expect(screen.getByRole('button', { name: 'Par compte' })).toHaveAttribute('aria-pressed', 'true')
    expect(groupNamed('LATECOERE')).toBeInTheDocument()
    expect(readConversationsGrouping()).toBe('account')
  })

  it('sait dire NON — un compte sans nom lisible ne s’affiche ni par son identifiant, ni « undefined », ni « 0 »', async () => {
    localStorage.setItem(CONVERSATIONS_GROUPING_STORAGE_KEY, 'account')
    accounts.data.mockReturnValue({ data: { pages: [{ data: [] }] } })
    history.list.mockResolvedValue([
      thread({ id: 't1', conversation_id: 'c-1', title: 'Fil d’un compte effacé', account_id: 'a-efface-9' }),
      thread({ id: 't2', conversation_id: 'c-2', title: 'Portefeuille', account_id: null }),
    ])
    const { container } = render(<ConversationsPanel />)
    await screen.findByText('Fil d’un compte effacé')
    expect(titlesIn(groupNamed('Compte introuvable'))).toEqual([expect.stringContaining('Fil d’un compte effacé')])
    expect(container.textContent).not.toContain('a-efface-9')
    expect(container.textContent).not.toMatch(/undefined|null/)
  })

  it('retombe sur les comptes que l’écran connaît quand l’API ne sert pas encore le nom', async () => {
    localStorage.setItem(CONVERSATIONS_GROUPING_STORAGE_KEY, 'account')
    accounts.data.mockReturnValue({
      data: { pages: [{ data: [{ id: 'a-1', company_name: 'LATECOERE', logo_url: null, website: null }] }] },
    })
    history.list.mockResolvedValue([thread({ id: 't1', title: 'Angle RSE', account_id: 'a-1' })])
    render(<ConversationsPanel />)
    await screen.findByText('Angle RSE')
    expect(groupNamed('LATECOERE')).toBeInTheDocument()
  })

  it('un seul fil : pas de bascule — ranger une ligne n’apprend rien', async () => {
    history.list.mockResolvedValue([thread()])
    render(<ConversationsPanel />)
    await screen.findByText('Quels comptes prioriser ?')
    expect(screen.queryByRole('group', { name: 'Ranger les conversations' })).not.toBeInTheDocument()
  })

  it('la préférence : « date » sans rien de stocké, et une valeur inconnue ou un stockage en panne rendent le défaut', () => {
    expect(readConversationsGrouping()).toBe('date')
    localStorage.setItem(CONVERSATIONS_GROUPING_STORAGE_KEY, 'account')
    expect(readConversationsGrouping()).toBe('account')
    localStorage.setItem(CONVERSATIONS_GROUPING_STORAGE_KEY, 'par-couleur')
    expect(readConversationsGrouping()).toBe('date')
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    try {
      expect(readConversationsGrouping()).toBe('date')
    } finally {
      getItem.mockRestore()
    }
  })
})

/**
 * #1911.11 — LA RECHERCHE PORTE SUR TOUT L'HISTORIQUE, pas seulement la page
 * chargée.
 *
 * `filterThreads` (`conversation.ts`) ne voyait que les 20 fils rendus par
 * `GET chat/history` — chercher un fil plus ancien que la page ne rendait
 * rien, comme si le fil n'existait pas. La route serveur qui parcourt tout
 * l'historique (`GET chat/threads/search`, #1955.2) existait déjà, câblée
 * nulle part côté écran : « du code juste, calculé, testé, que personne
 * n'appelle ». Ces tests prouvent l'appel ET la fusion — un résultat déjà
 * trouvé localement ne doit jamais disparaître pendant l'attente du serveur.
 */
describe('ConversationsPanel — la recherche porte sur tout l’historique (#1911.11)', () => {
  beforeEach(() => {
    history.list.mockReset()
    searching.search.mockReset()
    accounts.data.mockReturnValue({ data: undefined })
  })

  it('un fil hors de la page chargée, trouvé par le serveur, apparaît', async () => {
    history.list.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => thread({ id: `t${i}`, conversation_id: `c${i}`, title: `Sujet ${i}` })),
    )
    // Le fil cherché n'est PAS dans la page chargée : seule la route serveur le connaît.
    searching.search.mockResolvedValue([
      thread({ id: 'old', conversation_id: 'c-old', title: 'PAYFIT — relance après le webinar' }),
    ])
    render(<ConversationsPanel />)
    const search = await screen.findByRole('searchbox')
    await userEvent.type(search, 'PAYFIT')
    expect(await screen.findByText('PAYFIT — relance après le webinar')).toBeInTheDocument()
    expect(searching.search).toHaveBeenCalledWith('PAYFIT', false)
  })

  it('un résultat local ne disparaît jamais pendant l’attente du serveur — fusion, jamais un remplacement', async () => {
    history.list.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => thread({ id: `t${i}`, conversation_id: `c${i}`, title: `Sujet ${i}` })),
    )
    // Le serveur ne renvoie PAS le fil que le filtre local trouve déjà : la
    // fusion doit le garder quand même.
    searching.search.mockResolvedValue([])
    render(<ConversationsPanel />)
    const search = await screen.findByRole('searchbox')
    await userEvent.type(search, 'Sujet 3')
    await waitFor(() => expect(searching.search).toHaveBeenCalled())
    expect(screen.getByText('Sujet 3')).toBeInTheDocument()
  })

  it('sait dire NON — un échec du serveur garde le résultat local, jamais un écran vide', async () => {
    history.list.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => thread({ id: `t${i}`, conversation_id: `c${i}`, title: `Sujet ${i}` })),
    )
    searching.search.mockRejectedValue(new Error('boom'))
    render(<ConversationsPanel />)
    const search = await screen.findByRole('searchbox')
    await userEvent.type(search, 'Sujet 3')
    await waitFor(() => expect(searching.search).toHaveBeenCalled())
    expect(screen.getByText('Sujet 3')).toBeInTheDocument()
  })

  it('le tiroir rangé se cherche aussi rangé — la recherche respecte `showArchived`', async () => {
    history.list.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => thread({ id: `t${i}`, conversation_id: `c${i}`, title: `Sujet ${i}` })),
    )
    searching.search.mockResolvedValue([])
    render(<ConversationsPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Voir les conversations rangées' }))
    const search = await screen.findByRole('searchbox')
    await userEvent.type(search, 'Sujet 3')
    await waitFor(() => expect(searching.search).toHaveBeenCalledWith('Sujet 3', true))
  })
})

// Théo B l1-laura.N1 — « Tes dossiers » : des raccourcis vers les comptes du portefeuille, sous les conversations.
describe('ConversationsPanel — Tes dossiers (Théo B l1-laura.N1)', () => {
  const rows = ['Altiver', 'Hélios', 'NovaSanté', 'Valmont'].map((name, i) => ({
    id: `a-${i}`,
    company_name: name,
    logo_url: null,
    website: null,
  }))

  it('montre trois comptes du portefeuille, chacun avec un lien vers sa fiche', async () => {
    accounts.data.mockReturnValue({ data: { pages: [{ data: rows }] } })
    history.list.mockResolvedValue([])
    render(<ConversationsPanel />)
    const group = await screen.findByRole('group', { name: 'Tes dossiers' })
    const links = within(group).getAllByRole('link')
    // Le logo (initiales, décoratif) précède le nom : c'est le NOM accessible qui se lit.
    expect(links.map(link => link.querySelector('span.truncate')?.textContent)).toEqual([
      'Altiver',
      'Hélios',
      'NovaSanté',
    ])
    expect(links[0]).toHaveAttribute('href', '/accounts/$id')
  })

  it('sans compte au portefeuille : la rubrique n’apparaît pas', async () => {
    accounts.data.mockReturnValue({ data: { pages: [{ data: [] }] } })
    history.list.mockResolvedValue([])
    render(<ConversationsPanel />)
    await screen.findByText(/Aucune conversation/)
    expect(screen.queryByRole('group', { name: 'Tes dossiers' })).toBeNull()
  })
})
