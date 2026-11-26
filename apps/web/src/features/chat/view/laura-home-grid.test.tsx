import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBackgroundTurnsStore } from '@/features/chat/lib/background-turns'
import type { LauraHomeSuggestion } from './laura-home-suggestions'

/**
 * #3773 (BEL-LAU-0610-002) — l'accueil de Laura : point de départ ET de reprise.
 * Le vrai FR est chargé par le setup des tests : on vérifie ce que la personne LIT.
 */
const history = vi.hoisted(() => ({ list: vi.fn() }))
const nav = vi.hoisted(() => ({ navigate: vi.fn() }))
const accounts = vi.hoisted(() => ({ data: vi.fn((): { data: unknown } => ({ data: undefined })) }))
const consultants = vi.hoisted(() => ({ data: vi.fn((): { data: unknown } => ({ data: undefined })) }))

vi.mock('@/features/accounts/hooks/useAccounts', () => ({ useAccounts: () => accounts.data() }))
vi.mock('@/features/consultants/hooks', () => ({ useConsultants: () => consultants.data() }))
vi.mock('@/features/chat/api/agentChatApi', () => ({ listAgentChatHistory: history.list }))
const progress = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => progress.fetch(...args) }))
vi.mock('@/lib/product-tracker', () => ({ trackSuggestionClicked: vi.fn() }))

type LinkProps = { to: string; search?: Record<string, unknown>; children?: ReactNode } & Record<string, unknown>
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => nav.navigate,
  Link: ({ to, search, children, ...props }: LinkProps) => {
    const query = new URLSearchParams(Object.entries(search ?? {}).map(([k, v]) => [k, String(v)])).toString()
    return (
      <a href={query ? `${to}?${query}` : to} {...props}>
        {children}
      </a>
    )
  },
}))

const { HomeSuggestionGrid } = await import('./laura-home-grid')
const { resetWorkspaceProgressCache } = await import('./WorkspaceNextSteps')

const card = (over: Partial<LauraHomeSuggestion> & Pick<LauraHomeSuggestion, 'id'>): LauraHomeSuggestion => ({
  kind: 'prompt',
  label: `Titre ${over.id}`,
  prompt: `Demande ${over.id}`,
  benefit: `Phrase complète ${over.id}, sans coupe.`,
  needs: null,
  promptFor: null,
  family: 'decide',
  familyLabel: 'Décider',
  ...over,
})

function renderGrid(props: Partial<Parameters<typeof HomeSuggestionGrid>[0]> = {}) {
  const onPrompt = vi.fn()
  const onOpenCatalog = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <HomeSuggestionGrid
        suggestions={[card({ id: 'a' }), card({ id: 'b' })]}
        settled
        activeConversationId={null}
        onPrompt={onPrompt}
        onOpenCatalog={onOpenCatalog}
        {...props}
      />
    </QueryClientProvider>,
  )
  return { onPrompt, onOpenCatalog }
}

beforeEach(() => {
  progress.fetch.mockReset()
  progress.fetch.mockResolvedValue({ accounts: 12, contacts: 30, actions: 4 })
  resetWorkspaceProgressCache()
  localStorage.clear()
  history.list.mockReset()
  nav.navigate.mockReset()
  history.list.mockResolvedValue([])
  accounts.data.mockReturnValue({ data: undefined })
  consultants.data.mockReturnValue({ data: undefined })
})

describe('#5042 — le sous-titre compte les cartes réellement montrées', () => {
  it('deux cartes : « 2 façons de commencer », jamais « Trois »', async () => {
    renderGrid({ suggestions: [card({ id: 'a' }), card({ id: 'b' })] })
    expect(await screen.findByText('2 façons de commencer')).toBeInTheDocument()
    expect(screen.queryByText(/Trois façons/)).not.toBeInTheDocument()
  })
})

describe('R33b — le guide « Ton audit est prêt » épargne les amorces', () => {
  it('l’accueil se déclare zone à ne pas recouvrir (data-guide-keep-clear), lue par le guide', async () => {
    renderGrid()
    await screen.findByText('Titre a')
    expect(screen.getByTestId('laura-home')).toHaveAttribute('data-guide-keep-clear')
  })
})

describe('refonte Théo l1-laura — la silhouette de l’accueil', () => {
  it('« Commencer un travail » : trois tuiles en ligne, « Toutes les idées de demandes » en pied, aucune rubrique « Explorer les scénarios » (#5042)', async () => {
    renderGrid({ suggestions: ['a', 'b', 'c', 'd', 'e'].map(id => card({ id })) })
    await screen.findByText('Titre a')
    const start = screen.getByRole('group', { name: 'Commencer un travail' })
    expect(screen.queryByRole('group', { name: 'Explorer les scénarios' })).toBeNull()
    expect(within(start).getByText('3 façons de commencer')).toBeInTheDocument()
    expect(
      within(start)
        .getAllByRole('button')
        .map(b => b.textContent),
    ).toEqual([
      'Titre aPhrase complète a, sans coupe.',
      'Titre bPhrase complète b, sans coupe.',
      'Titre cPhrase complète c, sans coupe.',
    ])
    expect(screen.queryByText('Titre d')).toBeNull()
    // Le lien vers les idées de demandes vit en PIED, une seule fois, après les tuiles.
    const link = screen.getByRole('button', { name: 'Toutes les idées de demandes' })
    expect(screen.getAllByRole('button', { name: 'Toutes les idées de demandes' })).toHaveLength(1)
    expect(start.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('les cartes (#3773.2, .3)', () => {
  it('chaque carte montre son titre ET sa phrase entière, sans sur-titre de famille', async () => {
    renderGrid()
    expect(await screen.findByText('Titre a')).toBeInTheDocument()
    expect(screen.getByText('Phrase complète a, sans coupe.')).toBeInTheDocument()
    expect(screen.queryByText('Décider')).not.toBeInTheDocument()
  })

  it('ne rend que les cartes reçues — jamais complétées', async () => {
    renderGrid({ suggestions: [card({ id: 'a' })] })
    await screen.findByText('Titre a')
    expect(screen.getAllByRole('button').filter(b => b.textContent?.startsWith('Titre'))).toHaveLength(1)
  })

  it('un clic sur une question complète la passe à la saisie', async () => {
    const { onPrompt } = renderGrid()
    await userEvent.click(await screen.findByText('Titre a'))
    expect(onPrompt).toHaveBeenCalledWith('Demande a')
  })

  it('« Toutes les idées de demandes » ouvre le catalogue existant', async () => {
    const { onOpenCatalog } = renderGrid()
    await userEvent.click(await screen.findByRole('button', { name: 'Toutes les idées de demandes' }))
    expect(onOpenCatalog).toHaveBeenCalledTimes(1)
  })

  it('pendant la lecture des données, les cartes attendent — puis la liste est FIGÉE (#3773.5)', async () => {
    const view = (settled: boolean, ids: string[]) => (
      <QueryClientProvider client={new QueryClient()}>
        <HomeSuggestionGrid
          suggestions={ids.map(id => card({ id }))}
          settled={settled}
          activeConversationId={null}
          onPrompt={vi.fn()}
          onOpenCatalog={vi.fn()}
        />
      </QueryClientProvider>
    )
    const { rerender } = render(view(false, ['a']))
    expect(screen.queryByText('Titre a')).not.toBeInTheDocument()
    rerender(view(true, ['a', 'b']))
    await screen.findByText('Titre a')
    // Une donnée qui arrive APRÈS ne réordonne ni n'ajoute rien sous le pointeur.
    rerender(view(true, ['c', 'b', 'a']))
    const titles = screen.getAllByText(/^Titre /).map(node => node.textContent)
    expect(titles).toEqual(['Titre a', 'Titre b'])
  })

  it('#5042 R4 — une lecture LENTE (> délai) ne fige pas un jeu partiel : la liste se fige quand tout est arrivé', async () => {
    vi.useFakeTimers()
    try {
      const view = (settled: boolean, ids: string[]) => (
        <QueryClientProvider client={new QueryClient()}>
          <HomeSuggestionGrid
            suggestions={ids.map(id => card({ id }))}
            settled={settled}
            activeConversationId={null}
            onPrompt={vi.fn()}
            onOpenCatalog={vi.fn()}
          />
        </QueryClientProvider>
      )
      const { rerender } = render(view(false, ['a']))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      // La dernière lecture arrive très tard : le jeu FINAL est celui qui se fige, pas l'état partiel.
      rerender(view(true, ['x', 'y', 'z']))
      rerender(view(true, ['q', 'x', 'y']))
      const titles = screen.getAllByText(/^Titre /).map(node => node.textContent)
      expect(titles).toEqual(['Titre x', 'Titre y', 'Titre z'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('#5042 — le contexte qui rebascule APRÈS la fige ne vide pas l’accueil : les trois cartes restent', async () => {
    // Recette prod 01/11 : portefeuille lu (3 cartes), puis la lecture repasse à « nouvel utilisateur » — seule
    // `whereInvestTime` est commune aux deux listes ; la grille ne gardait plus QUE cette carte.
    const view = (ids: string[]) => (
      <QueryClientProvider client={new QueryClient()}>
        <HomeSuggestionGrid
          suggestions={ids.map(id => card({ id }))}
          settled
          activeConversationId={null}
          onPrompt={vi.fn()}
          onOpenCatalog={vi.fn()}
        />
      </QueryClientProvider>
    )
    const { rerender } = render(view(['whereInvestTime', 'prepareMeeting', 'findAccessPath']))
    await screen.findByText('Titre whereInvestTime')
    rerender(view(['findCompatibleAccounts', 'analyzeCompany', 'whereInvestTime']))
    const titles = screen.getAllByText(/^Titre /).map(node => node.textContent)
    expect(titles).toEqual(['Titre whereInvestTime', 'Titre prepareMeeting', 'Titre findAccessPath'])
  })
})

describe('un élément à choisir (#3773.5)', () => {
  const needy = card({ id: 'findAccessPath', needs: 'account', promptFor: name => `Entrer chez ${name}` })

  it('demande CE seul élément, puis prépare la demande avec son nom', async () => {
    accounts.data.mockReturnValue({
      data: {
        pages: [
          {
            data: [
              { id: 'x1', company_name: 'SNCF' },
              { id: 'x2', company_name: null },
            ],
          },
        ],
      },
    })
    const { onPrompt } = renderGrid({ suggestions: [needy] })
    await userEvent.click(await screen.findByText('Titre findAccessPath'))
    expect(onPrompt).not.toHaveBeenCalled()
    expect(screen.getByText('Quel compte ?')).toBeInTheDocument()
    // Un compte sans nom ne fait AUCUNE ligne.
    expect(screen.getAllByRole('button', { name: /SNCF|Annuler/ })).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'SNCF' }))
    expect(onPrompt).toHaveBeenCalledWith('Entrer chez SNCF')
  })

  it('sans aucun compte à proposer, retombe sur la demande générale — jamais un choix vide', async () => {
    const { onPrompt } = renderGrid({ suggestions: [needy] })
    await userEvent.click(await screen.findByText('Titre findAccessPath'))
    expect(onPrompt).toHaveBeenCalledWith('Demande findAccessPath')
  })

  it('« consultant disponible » ne propose que des consultants dont la disponibilité est RENSEIGNÉE', async () => {
    consultants.data.mockReturnValue({
      data: [
        { id: 'c1', full_name: 'Awa Diallo', availability: 'immediate' },
        { id: 'c2', full_name: 'Marc Lenoir', availability: 'inconnu' },
        { id: 'c3', full_name: 'Zoé Petit', availability: 'en_mission' },
      ],
    })
    renderGrid({
      suggestions: [card({ id: 'consultantAvailable', needs: 'consultant', promptFor: n => `Placer ${n}` })],
    })
    await userEvent.click(await screen.findByText('Titre consultantAvailable'))
    expect(screen.getByRole('button', { name: 'Awa Diallo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marc Lenoir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zoé Petit' })).not.toBeInTheDocument()
  })
})

describe('reprendre un travail (#3773.4)', () => {
  const item = {
    id: 't9',
    account_id: 'acc-9',
    conversation_id: 'conv-9',
    title: 'Préparer le rendez-vous SNCF',
    created_at: '2026-10-05T08:00:00Z',
    last_message_at: '2026-10-05T09:00:00Z',
  }

  // R2 #4962 — « Reprendre » ne propose qu'un tour RÉELLEMENT en cours (`background-turns`, #4967).
  beforeEach(() => {
    useBackgroundTurnsStore.getState().reset()
    useBackgroundTurnsStore.getState().begin('conv-9')
  })

  it('une conversation terminée (aucun tour en cours) n’est pas proposée à la reprise', async () => {
    useBackgroundTurnsStore.getState().reset()
    history.list.mockResolvedValue([item])
    renderGrid()
    await screen.findByText('Titre a')
    await waitFor(() => expect(history.list).toHaveBeenCalled())
    expect(screen.queryByTestId('laura-home-resume')).not.toBeInTheDocument()
  })

  it('montre UNE entrée compacte vers le bon fil — même compte, même conversation', async () => {
    history.list.mockResolvedValue([
      item,
      { ...item, id: 't8', conversation_id: 'conv-8', last_message_at: '2026-09-01T09:00:00Z' },
    ])
    renderGrid()
    const link = await screen.findByRole('link', { name: /Reprendre : Préparer le rendez-vous SNCF/ })
    expect(link).toHaveAttribute('href', '/chat?accountId=acc-9&conversationId=conv-9')
    expect(screen.getAllByTestId('laura-home-resume')).toHaveLength(1)
    // La reprise ouvre : aucune demande n'est envoyée ni préparée.
  })

  it('sans travail reprenable, aucune carte vide', async () => {
    renderGrid()
    await screen.findByText('Titre a')
    await waitFor(() => expect(history.list).toHaveBeenCalled())
    expect(screen.queryByTestId('laura-home-resume')).not.toBeInTheDocument()
  })

  it('une reprise écartée ne revient pas', async () => {
    history.list.mockResolvedValue([item])
    renderGrid()
    await userEvent.click(await screen.findByRole('button', { name: 'Ne plus proposer cette reprise' }))
    expect(screen.queryByTestId('laura-home-resume')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('bellum:chat:resume-dismissed') ?? '[]')).toEqual(['t9'])
  })

  /**
   * #3697 (vu en passant, recette prod 09/10) — rien ne réservait la place de
   * cette rangée pendant la lecture de l'historique : les cartes de
   * suggestion descendaient d'un bloc (~60 px) dès qu'une reprise était
   * trouvée, après coup — même défaut que #3490 (`ActivationChecklist`).
   */
  it('réserve la place de la reprise pendant la lecture, puis la retire sans la trouver', async () => {
    let resolve!: (value: unknown[]) => void
    history.list.mockReturnValue(new Promise(r => (resolve = r)))
    renderGrid()

    await screen.findByText('Titre a')
    expect(screen.queryByTestId('laura-home-resume')).not.toBeInTheDocument()
    const placeholder = document.querySelector('[aria-hidden].h-11')
    expect(placeholder).not.toBeNull()

    resolve([])
    await waitFor(() => expect(document.querySelector('[aria-hidden].h-11')).toBeNull())
    expect(screen.queryByTestId('laura-home-resume')).not.toBeInTheDocument()
  })

  it('réserve la place pendant la lecture, puis la remplace par la reprise trouvée', async () => {
    let resolve!: (value: unknown[]) => void
    history.list.mockReturnValue(new Promise(r => (resolve = r)))
    renderGrid()

    await screen.findByText('Titre a')
    expect(document.querySelector('[aria-hidden].h-11')).not.toBeNull()

    resolve([item])
    await screen.findByTestId('laura-home-resume')
    expect(document.querySelector('[aria-hidden].h-11')).toBeNull()
  })
})

// #5042 — revient sur Théo B l1-laura.R4 : « Explorer les scénarios » part (arbitrage Louis 31/10).
describe('#5042 — l’accueil ne garde que « Commencer un travail »', () => {
  it('trois cartes au plus, même si plus de cartes sont reçues', async () => {
    renderGrid({ suggestions: ['a', 'b', 'c', 'd', 'e'].map(id => card({ id })) })
    const start = await screen.findByRole('group', { name: 'Commencer un travail' })
    expect(within(start).getAllByRole('button', { name: /Titre/ })).toHaveLength(3)
  })

  it('« Toutes les idées de demandes » reste accessible et ouvre le catalogue', async () => {
    const { onOpenCatalog } = renderGrid({ suggestions: ['a', 'b', 'c', 'd'].map(id => card({ id })) })
    await userEvent.click(await screen.findByRole('button', { name: 'Toutes les idées de demandes' }))
    expect(onOpenCatalog).toHaveBeenCalled()
  })
})

describe('#4594.3 — la grille des amorces ne laisse pas de colonne vide à droite', () => {
  const columnsOf = (section: string) =>
    (
      screen
        .getByTestId('laura-home-suggestions')
        .querySelector(`[data-laura-home="${section}"] > div:last-child`) as HTMLElement
    ).className

  it('deux amorces → deux colonnes (la troisième, vide, prenait ≈ 22 % de la largeur)', async () => {
    renderGrid({ suggestions: [card({ id: 'a' }), card({ id: 'b' })] })
    await screen.findByText('Titre a')
    expect(columnsOf('start')).toContain('md:grid-cols-2')
    expect(columnsOf('start')).not.toContain('md:grid-cols-3')
  })

  it('sait dire NON : trois amorces gardent leurs trois colonnes', async () => {
    renderGrid({ suggestions: [card({ id: 'a' }), card({ id: 'b' }), card({ id: 'c' })] })
    await screen.findByText('Titre a')
    expect(columnsOf('start')).toContain('md:grid-cols-3')
  })
})

// #5011 + #5027 (arbitrage Louis 31/10) — UN SEUL chemin « J'ai un compte en tête » : il mène directement au compte
// choisi (un fil neuf cadré sur lui) et reprend le profil demandé dans la saisie préparée, sans rien envoyer.
describe('#5011 / #5027 — « J’ai un compte en tête »', () => {
  const withAccounts = () =>
    accounts.data.mockReturnValue({
      data: {
        pages: [
          {
            data: [
              { id: 'x1', company_name: 'EDF' },
              { id: 'x2', company_name: null },
            ],
          },
        ],
      },
    })

  it('un seul chemin visible dès l’accueil, sans passer par Découvrir', async () => {
    renderGrid()
    await screen.findByText('Titre a')
    expect(screen.getAllByRole('button', { name: 'J’ai un compte en tête' })).toHaveLength(1)
  })

  it('choisir le compte ouvre un fil neuf cadré sur lui, avec une saisie préparée qui demande le profil', async () => {
    withAccounts()
    const { onPrompt } = renderGrid()
    await userEvent.click(await screen.findByRole('button', { name: 'J’ai un compte en tête' }))
    expect(screen.getByText('Quel compte ?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'EDF' }))
    expect(onPrompt).not.toHaveBeenCalled()
    expect(nav.navigate).toHaveBeenCalledTimes(1)
    const call = nav.navigate.mock.calls[0]?.[0] as { to: string; search: Record<string, string> }
    expect(call.to).toBe('/chat')
    expect(call.search).toMatchObject({ accountId: 'x1', fresh: '1' })
    expect(call.search.prompt).toContain('EDF')
  })

  it('sait dire NON : sans aucun compte à proposer, pas de navigation vers un compte inventé', async () => {
    const { onPrompt } = renderGrid()
    await userEvent.click(await screen.findByRole('button', { name: 'J’ai un compte en tête' }))
    expect(nav.navigate).not.toHaveBeenCalled()
    expect(onPrompt).toHaveBeenCalledTimes(1)
  })
})

// #5011.1 — sur l'accueil de Laura (Louis 31/10) : la suite de l'espace, lue de GET /workspace-progress.
describe('#5011.1 — la suite de l’espace sur l’accueil', () => {
  it('espace sans compte : la carte cite le fait compté et son geste pose la demande (n’envoie rien d’autre)', async () => {
    progress.fetch.mockResolvedValue({ accounts: 0, contacts: 0, actions: 0 })
    const { onPrompt } = renderGrid()
    const home = await screen.findByTestId('laura-home')
    const next = await within(home).findByRole('group', { name: 'Pour avancer' })
    expect(progress.fetch).toHaveBeenCalledWith({ path: '/workspace-progress' })
    await userEvent.click(within(next).getAllByRole('button')[0]!)
    expect(onPrompt).toHaveBeenCalledTimes(1)
  })

  it('espace avancé (aucune étape) : aucune carte', async () => {
    renderGrid()
    await screen.findByText('Titre a')
    await waitFor(() => expect(progress.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('group', { name: 'Pour avancer' })).toBeNull()
  })
})
