import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SprintBoard } from './SprintBoard'

type Row = Record<string, unknown>

let board: Record<string, Row[]> = { focus: [], extension: [], volume: [], no_go: [], watch: [], partner_route: [] }
let access: { data?: { accountId: string; accessClass: string | null }[]; isError: boolean } = {
  data: [],
  isError: false,
}

vi.mock('../api/sprints-api', () => ({
  SPRINT_BOARD_KEY: ['sprints', 'board'],
  fetchSprintBoard: () => Promise.resolve({ ...board, focus_capacity: focusCapacity }),
  moveAccountToSprint: vi.fn(),
}))

vi.mock('@/features/accounts/view/accounts-list/useAccessSummary', () => ({
  useAccessSummary: () => access,
}))

let focusCapacity = 8
const ACCOUNT = 'a1'

function account(overrides: Row = {}): Row {
  return {
    id: ACCOUNT,
    company_name: 'BlaBlaCar',
    sprint: 'focus',
    sprint_entered_at: '2026-09-01T10:00:00.000Z',
    sprint_exit_reason: null,
    priority_score: 7,
    commercial_status: null,
    logo_url: null,
    website: null,
    updated_at: '2026-09-02T10:00:00.000Z',
    without_next_action: true,
    sprint_reason: null,
    sprint_effort_estimate: null,
    sprint_review_at: null,
    sprint_promotion_condition: null,
    sprint_demotion_condition: null,
    owner: null,
    next_task_title: null,
    next_task_due_on: null,
    partner_name: null,
    ...overrides,
  }
}

beforeEach(() => {
  board = { focus: [], extension: [], volume: [], no_go: [], watch: [], partner_route: [] }
  access = { data: [], isError: false }
  focusCapacity = 8
})

/**
 * #3407 — « trop de comptes Focus par rapport à la capacité » : le compteur
 * dit le plafond de CET espace (celui que l'API applique, 8 par commercial),
 * jamais un « 8 » codé en dur qui contredit le refus du serveur.
 */
describe('SprintBoard — le plafond du Focus est celui de l’espace (#3407)', () => {
  it('une équipe de deux commerciaux voit 9/16, pas 9/8 en rouge', async () => {
    focusCapacity = 16
    board = {
      ...board,
      focus: Array.from({ length: 9 }, (_, index) => account({ id: `f${index}`, company_name: `Compte ${index}` })),
    }
    renderWithRouter(<SprintBoard />)
    expect(await screen.findByText('9/16')).toBeInTheDocument()
    expect(screen.queryByText('9/8')).not.toBeInTheDocument()
  })

  it('au-delà du plafond de l’espace, le compteur le dit (9/8)', async () => {
    board = {
      ...board,
      focus: Array.from({ length: 9 }, (_, index) => account({ id: `f${index}`, company_name: `Compte ${index}` })),
    }
    renderWithRouter(<SprintBoard />)
    expect(await screen.findByText('9/8')).toBeInTheDocument()
  })
})

/**
 * #1318.3 — « les cartes ne montrent quasiment que le nom du compte ».
 */
describe('SprintBoard — #3296 les comptes non placés', () => {
  it('un espace sans aucun compte classé montre ses comptes À PLACER, avec le geste', async () => {
    board = {
      ...board,
      unplaced: [{ id: 'u1', company_name: 'SNCF', logo_url: null, website: null, priority_score: null }],
    }
    renderWithRouter(<SprintBoard />)

    expect(await screen.findByRole('heading', { name: /À placer/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'SNCF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Passer en priorité forte/ })).toBeInTheDocument()
  })

  it('aucun compte non placé → aucun bloc (une absence ne fait aucune ligne)', async () => {
    board = { ...board, unplaced: [] }
    renderWithRouter(<SprintBoard />)
    await screen.findByText(/Où concentrer/)
    await waitFor(() => expect(screen.queryByRole('heading', { name: /À placer/ })).not.toBeInTheDocument())
  })
})

describe('SprintBoard — ce que porte une carte', () => {
  it('affiche le score du compte, et un compte jamais analysé dit « non mesuré »', async () => {
    board = { ...board, focus: [account(), account({ id: 'a2', company_name: 'Acme', priority_score: null })] }
    renderWithRouter(<SprintBoard />)

    expect(await screen.findByRole('img', { name: 'Score du compte : 7/10' })).toBeInTheDocument()
    // `accountScoreColor` peint un 0 en rouge — « évalué, et il ne vaut pas la
    // peine ». Un compte jamais analysé ne dit pas ça.
    //
    // ⚠️ On vise le NOM ACCESSIBLE et non le texte « 0 » : le compteur d'une
    // file vide affiche légitimement « 0 » (elle a vraiment zéro compte), et
    // l'assertion attrapait ce badge-là.
    expect(screen.getByRole('img', { name: 'Score du compte : non mesuré' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Score du compte : 0/10' })).not.toBeInTheDocument()
  })

  /**
   * #3257.9 — le glisser-déposer réel, à côté des boutons « déplacer vers ».
   * Même retenue que `PipelineBoard.test.tsx` : « un glissement se simule mal
   * et se vérifie à la main », ce test tient la poignée NOMMÉE — un geste
   * sans nom est invisible au clavier — et le fait que les boutons restent là.
   */
  it('offre une poignée de glissement NOMMÉE, par-dessus les boutons « déplacer vers »', async () => {
    board = { ...board, focus: [account()] }
    renderWithRouter(<SprintBoard />)

    expect(await screen.findByRole('button', { name: 'Glisser ce compte vers un autre niveau' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mettre en pause' })).toBeInTheDocument()
  })

  it('nomme l’absence de prochaine action — le fait qui pèse le plus dans l’arbitrage', async () => {
    board = { ...board, focus: [account()] }
    renderWithRouter(<SprintBoard />)

    expect(await screen.findByText('Aucune prochaine action')).toBeInTheDocument()
  })

  it('ne l’affiche PAS quand une action est programmée — la garde sait dire non', async () => {
    board = { ...board, focus: [account({ without_next_action: false })] }
    renderWithRouter(<SprintBoard />)

    // ⚠️ `waitFor` et non une assertion synchrone après `findByText` : le
    // `QueryClient` de `renderWithRouter` est un SINGLETON de module, donc le
    // premier rendu sert le tableau du test PRÉCÉDENT avant que le refetch
    // n'arrive. Une assertion synchrone lirait l'ancien état et ce test
    // passerait — ou échouerait — pour la mauvaise raison.
    await waitFor(() => expect(screen.queryByText('Aucune prochaine action')).not.toBeInTheDocument())
  })

  it('#3509 — « Dernière activité » lit la dernière ACTIVITÉ, jamais updated_at (le semis)', async () => {
    const longAgo = new Date(Date.now() - 3 * 86_400_000).toISOString()
    // `updated_at` à l'instant (semis démo) : il ne doit PAS parler.
    board = { ...board, focus: [account({ updated_at: new Date().toISOString(), last_activity_at: longAgo })] }
    renderWithRouter(<SprintBoard />)

    expect(await screen.findByText(/Dernière activité il y a 3 jours/)).toBeInTheDocument()
    expect(screen.queryByText(/Dernière activité il y a (moins|\d+ ?min)/i)).not.toBeInTheDocument()
  })

  it('#3509 — aucune activité connue : aucune ligne, jamais la date du semis', async () => {
    board = { ...board, focus: [account({ updated_at: new Date().toISOString(), last_activity_at: null })] }
    renderWithRouter(<SprintBoard />)

    await screen.findByText('Aucune prochaine action')
    // `waitFor` : le QueryClient est un singleton de module (voir plus haut).
    await waitFor(() => expect(screen.queryByText(/Dernière activité/)).not.toBeInTheDocument())
  })

  it('#3257.7a — nomme le PORTEUR du compte, quand il y en a un', async () => {
    board = { ...board, focus: [account({ owner: { user_id: 'u1', name: 'Alice Martin' } })] }
    renderWithRouter(<SprintBoard />)

    expect(await screen.findByText('Porté par Alice Martin')).toBeInTheDocument()
  })

  it('#3257.7a — compte libre : aucune ligne, jamais « non attribué »', async () => {
    board = { ...board, focus: [account({ owner: null })] }
    renderWithRouter(<SprintBoard />)

    await waitFor(() => expect(screen.queryByText(/Porté par/)).not.toBeInTheDocument())
  })

  it('DIT que l’accessibilité n’est pas mesurée plutôt que de se taire', async () => {
    // Ne rien afficher se lirait « accessible ».
    board = { ...board, focus: [account()] }
    renderWithRouter(<SprintBoard />)

    expect(await screen.findByText('Accessibilité non mesurée')).toBeInTheDocument()
  })

  it('distingue une lecture EN ÉCHEC d’une accessibilité absente', async () => {
    // Les deux se ressemblent : sur un échec, les classes sont simplement
    // absentes. Sans le drapeau, une panne s'afficherait comme un vide.
    board = { ...board, focus: [account()] }
    access = { data: undefined, isError: true }
    renderWithRouter(<SprintBoard />)

    expect(await screen.findByText('Accessibilité illisible')).toBeInTheDocument()
    expect(screen.queryByText('Accessibilité non mesurée')).not.toBeInTheDocument()
  })

  it('rend la classe d’accès quand elle est lue, sans la recalculer', async () => {
    board = { ...board, focus: [account()] }
    access = { data: [{ accountId: ACCOUNT, accessClass: 'B' }], isError: false }
    renderWithRouter(<SprintBoard />)

    expect(await screen.findByText('Accès B')).toBeInTheDocument()
  })

  it('ne parle plus d’« Arbitrage » ni d’« Exécution » — c’était du vocabulaire interne (#1318.2)', async () => {
    board = { ...board, focus: [account()] }
    renderWithRouter(<SprintBoard />)

    expect(await screen.findByText(/Où concentrer/)).toBeInTheDocument()
    expect(screen.queryByText(/Arbitrage/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Exécution/)).not.toBeInTheDocument()
  })
})

/**
 * #3257.7b — la VRAIE prochaine action, avec son lien vers le dossier du compte.
 * #3257.4 — la route partenaire nomme son partenaire, ou dit « à désigner ».
 */
describe('SprintBoard — prochaine action et partenaire (#3257.7b, #3257.4)', () => {
  it('rend la prochaine tâche réelle, avec un lien vers le dossier du compte', async () => {
    board = {
      ...board,
      focus: [
        account({ without_next_action: false, next_task_title: 'Relancer la DSI', next_task_due_on: '2026-10-02' }),
      ],
    }
    renderWithRouter(<SprintBoard />)
    expect(await screen.findByText(/Relancer la DSI/)).toBeTruthy()
    const link = screen.getAllByRole('link').find(l => l.getAttribute('href') === `/accounts/${ACCOUNT}`)
    expect(link).toBeTruthy()
  })

  it('sans tâche à venir, propose de programmer une action, avec un lien', async () => {
    // Un nom PROPRE à ce test : le cache de requêtes survit d'un rendu à l'autre
    // et servirait d'abord le tableau du test précédent.
    board = { ...board, focus: [account({ company_name: 'Sans-Tâche SA', without_next_action: true })] }
    renderWithRouter(<SprintBoard />)
    await screen.findByText('Sans-Tâche SA')
    expect(screen.getAllByRole('link').some(l => l.getAttribute('href') === `/accounts/${ACCOUNT}`)).toBe(true)
    expect(screen.getByText('Programmer une prochaine action')).toBeTruthy()
  })

  it('en route partenaire, nomme le partenaire lié', async () => {
    board = { ...board, partner_route: [account({ sprint: 'partner_route', partner_name: 'Alten (exemple)' })] }
    renderWithRouter(<SprintBoard />)
    expect(await screen.findByText(/Alten \(exemple\)/)).toBeTruthy()
  })

  it('en route partenaire sans partenaire lié, dit « partenaire à désigner », jamais un vide', async () => {
    board = { ...board, partner_route: [account({ sprint: 'partner_route', partner_name: null })] }
    renderWithRouter(<SprintBoard />)
    expect(await screen.findByText('Partenaire à désigner')).toBeTruthy()
  })

  it('ne parle pas de partenaire sur un compte hors route partenaire', async () => {
    board = { ...board, focus: [account({ company_name: 'Hors-Route SA', partner_name: 'Alten (exemple)' })] }
    renderWithRouter(<SprintBoard />)
    await screen.findByText('Hors-Route SA')
    expect(screen.queryByText(/Alten/)).toBeNull()
    expect(screen.queryByText('Partenaire à désigner')).toBeNull()
  })

  it('#3296 (#3269.6) — montre la suggestion `partner_access_found`, lue depuis le board', async () => {
    board = {
      ...board,
      extension: [
        account({
          company_name: 'Thales',
          sprint: 'extension',
          suggested_switch: { to: 'partner_route', reason: 'Un partenaire ouvre la voie d’entrée.' },
        }),
      ],
    }
    renderWithRouter(<SprintBoard />)
    // `extension` vit dans la file « exécution » (`SPRINT_LANE_LEVELS`), pas
    // la file par défaut : il faut changer d'onglet pour la voir.
    fireEvent.click(await screen.findByRole('button', { name: /portefeuille/ }))
    expect(await screen.findByText('Thales')).toBeTruthy()
    expect(screen.getByText(/Un partenaire ouvre la voie d’entrée/)).toBeTruthy()
  })

  /**
   * #3296 — recette prod : la suggestion, rendue en pilule mono-ligne, était coupée
   * à droite (641 px dans 525 px). Une PHRASE passe à la ligne ; elle n'est pas une pilule.
   */
  it('#3296 — la suggestion est une phrase qui passe à la ligne, jamais une pilule mono-ligne coupée', async () => {
    board = {
      ...board,
      extension: [
        account({
          company_name: 'Thales',
          sprint: 'extension',
          suggested_switch: {
            to: 'partner_route',
            reason: 'Un partenaire ouvre la voie d’entrée, à confirmer avant tout effort direct sur le compte.',
          },
        }),
      ],
    }
    renderWithRouter(<SprintBoard />)
    fireEvent.click(await screen.findByRole('button', { name: /portefeuille/ }))
    const suggestion = await screen.findByTestId('sprint-suggested-switch')
    expect(suggestion.className).not.toMatch(/whitespace-nowrap/)
    expect(suggestion.className).toMatch(/min-w-0/)
    expect(suggestion.className).toMatch(/break-words/)
    expect(suggestion.textContent).toMatch(/^Suggestion : Route partenaire — Un partenaire/)
  })

  it('sans suggestion, ne montre rien', async () => {
    board = { ...board, focus: [account({ company_name: 'Retenue SA', suggested_switch: null })] }
    renderWithRouter(<SprintBoard />)
    await screen.findByText('Retenue SA')
    expect(screen.queryByText(/^Suggestion/)).toBeNull()
  })
})
