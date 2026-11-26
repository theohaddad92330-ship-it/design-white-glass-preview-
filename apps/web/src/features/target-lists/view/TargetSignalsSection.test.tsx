import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  countTargetListItems,
  deriveTargetListType,
  targetListsResponseSchema,
  type AccountSignalItem,
  type SessionUser,
} from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import fr from '@/i18n/locales/fr/targets.json'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #2151.60 — LA VEILLE REJOINT « MES CIBLES », ET C'EST LE PORTAGE QU'ON GARDE.
 *
 * Décision de Louis du 16/09/2026 : `/watchlist` doit finir par rediriger vers
 * `/mes-cibles`, **mais seulement après que son contenu y ait été porté**. La
 * mesure faite en production ce soir-là dit pourquoi l'ordre compte :
 * `/watchlist` rendait 8 250 caractères, 187 signaux, 30 lignes de tableau et
 * quatre compteurs ; `/mes-cibles` rendait 861 caractères, une ligne, zéro
 * signal, et le mot « signal » n'y apparaissait pas une seule fois. Rediriger
 * avant de porter aurait effacé le flux de signaux quotidien.
 *
 * Ce fichier est donc la garde du PORTAGE, et il tient les trois choses qu'une
 * garde doit prouver :
 *
 *  1. **Elle sait dire NON** — retirer `<TargetSignalsSection />` de
 *     `TargetListsContent` fait échouer les quatre tests d'écran. Vérifié le
 *     16/09 en remplaçant le montage par `{null}` : 4 rouges (« Unable to find
 *     … Facettes de la veille »), le double et le témoin restant verts.
 *  2. **Elle LIT un corpus non vide** — le premier test affirme le nombre de
 *     signaux et de comptes du double AVANT de lire l'écran. Un double vide
 *     rendrait l'état « aucun signal », qui est un écran juste : sans cette
 *     affirmation, la garde passerait au vert en ne regardant rien.
 *  3. **Elle n'attrape pas ce qu'elle ne vise pas** — le témoin vérifie que
 *     les listes de cibles, elles, sont toujours rendues, et que le plateau ne
 *     s'est pas substitué à l'écran qui l'accueille.
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
// #3901.p — ces tests ne portent pas sur le profil : « pas encore chargé » = aucune offre écartée (le motif de WatchlistBoard.test).
vi.mock('@/features/discover/hooks/useHiringDomainProfile', () => ({ useHiringDomainProfile: () => undefined }))
// #4340 — les Pistes montées sous la Veille ont leurs propres tests (`PortfolioLens`, `PipelineDetectionsBand`) :
// ce fichier tient la Veille, il n'a pas à servir leurs routes.
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { TargetListsContent } = await import('./TargetListsContent')

const LIST_ID = '11111111-1111-4111-8111-111111111111'
const STAMP = '2026-09-01T00:00:00.000Z'
const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10)

/** Deux comptes, trois signaux — un « nouveau » (compte de moins de 30 jours),
 *  un à requalifier (plus de 90 jours), un prioritaire (score ≥ 8). */
const SIGNALS: AccountSignalItem[] = [
  {
    id: 's-1',
    account_id: 'a-1',
    account_created_at: daysAgo(5),
    account_score: 9,
    company_name: 'Nordia',
    date: daysAgo(2),
    label: 'Programme data',
    sector: 'Services',
    source: 'Communiqué',
    type: 'Projet',
    freshness: 'current',
  },
  {
    id: 's-2',
    account_id: 'a-1',
    account_created_at: daysAgo(5),
    account_score: 9,
    company_name: 'Nordia',
    date: daysAgo(120),
    label: 'Refonte SI',
    sector: 'Services',
    source: 'Presse',
    type: 'Projet',
    freshness: 'stale',
  },
  {
    id: 's-3',
    account_id: 'a-2',
    account_created_at: daysAgo(200),
    account_score: 3,
    company_name: 'Velmore',
    date: daysAgo(10),
    label: 'Recrutement DSI',
    sector: 'Industrie',
    source: 'Offre',
    type: 'Recrutement',
    freshness: 'current',
  },
]

const TARGET_ITEM = {
  id: 'i1',
  target_list_id: LIST_ID,
  kind: 'account',
  ref_id: 'acc-1',
  label: 'Banque Alpha',
  sublabel: null,
  selection_reason: null,
  priority: 'high',
  owner_user_id: null,
  work_status: 'to_review',
  provenance: 'discover',
  refreshed_at: null,
  removed_at: null,
  removal_reason: null,
  next_action: null,
  notes: null,
  created_at: STAMP,
  updated_at: STAMP,
} as const

const LISTS = {
  lists: [
    {
      id: LIST_ID,
      name: 'Banques régionales — T4',
      objective: 'Décrocher 3 rendez-vous DSI',
      // #2156 — LE DOUBLE SE DÉRIVE DU CONTRAT, IL NE LE RECOPIE PAS : la
      // réponse est parsée à la frontière, et un double approximatif vide
      // l'écran au lieu de faire échouer une assertion qui nomme la cause.
      type: deriveTargetListType([TARGET_ITEM]),
      owner_user_id: null,
      team: null,
      visibility: 'workspace',
      source: 'manual',
      source_query: null,
      status: 'in_progress',
      counts: countTargetListItems([TARGET_ITEM]),
      next_action: null,
      sequence_id: null,
      prospecting_session_id: null,
      created_by: 'u1',
      created_at: STAMP,
      updated_at: STAMP,
      items: [TARGET_ITEM],
    },
  ],
}

type FetchArgs = { path: string; method?: string; body?: unknown }

function mockApi(signals: AccountSignalItem[] = SIGNALS) {
  apiFetch.mockImplementation(async (args?: FetchArgs) => {
    const { path } = args ?? { path: '' }
    if (path === '/target-lists') return LISTS
    if (path === '/accounts/signals') return signals
    // Aucune règle de veille : la facette « Mes règles » ne se rend pas, et
    // c'est la bonne forme — un filtre qui ne peut rien retenir est un piège.
    if (path === '/watchlist/rules') return []
    if (path === '/workspaces/members') return []
    if (path === '/account-follows')
      return { max: 3, followed: [], archived: [], suggestion: null, migration_notice: false }
    return {}
  })
}

function renderContent(userId: string) {
  return renderWithRouter(
    <SessionContext.Provider value={{ user: { id: userId } as SessionUser, loading: false }}>
      <TargetListsContent />
    </SessionContext.Provider>,
    '/mes-cibles',
  )
}

beforeEach(() => apiFetch.mockReset())

describe('« Mes cibles » accueille la Veille — #2151.60', () => {
  /** La garde du DOUBLE, avant celles de l'écran : un double hors contrat vide
   *  l'écran et ferait tomber les quatre tests sur une cause qui n'est pas la leur. */
  it('le double de réponse est au contrat — sinon le parse de frontière vide l’écran', () => {
    expect(() => targetListsResponseSchema.parse(LISTS)).not.toThrow()
    expect(targetListsResponseSchema.parse(LISTS).lists[0]?.items).toHaveLength(1)
  })

  it('porte la bibliothèque : une carte par signal, à plat (Théo signaux)', async () => {
    // LE CORPUS, AFFIRMÉ AVANT L'ÉCRAN : trois signaux, deux comptes.
    expect(SIGNALS).toHaveLength(3)
    expect(new Set(SIGNALS.map(s => s.account_id)).size).toBe(2)

    mockApi()
    renderContent('u-signals')

    const cards = await screen.findAllByTestId('signal-card')
    expect(cards).toHaveLength(3)
    expect(screen.getByText('3 signaux')).toBeInTheDocument()
    expect(screen.getByText('Programme data')).toBeInTheDocument()
    expect(screen.getByText('Recrutement DSI')).toBeInTheDocument()
    // « Recrutement salarié ≠ mission ouverte » ne s'écrit que sur un recrutement.
    expect(screen.getAllByText('Recrutement salarié ≠ mission ouverte')).toHaveLength(1)
  })

  it('« Par compte » rouvre le plateau regroupé, avec ses facettes (#3658)', async () => {
    mockApi()
    renderContent('u-bycompte')

    await screen.findAllByTestId('signal-card')
    fireEvent.click(screen.getByRole('button', { name: 'Par compte' }))
    expect(await screen.findByRole('group', { name: 'Facettes de la veille' })).toBeInTheDocument()
    expect(screen.queryByTestId('signal-card')).not.toBeInTheDocument()
  })

  it('l’en-tête dit « Signaux », « Mes veilles » ouvre la sous-page, et rien de mort', async () => {
    mockApi()
    renderContent('u-promise')

    expect(await screen.findByRole('heading', { level: 1, name: 'Signaux' })).toBeInTheDocument()
    expect(screen.getByText('Ce qui bouge sur tes comptes, au même endroit.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mes veilles' }).getAttribute('href')).toBe('/signals/watches')
    expect(screen.getByRole('button', { name: 'Ajouter un signal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'En savoir plus' })).not.toBeInTheDocument()
  })

  it('quatre onglets : enregistrer, mettre à la corbeille, restaurer', async () => {
    mockApi()
    renderContent('u-tabs')

    await screen.findAllByTestId('signal-card')
    for (const name of [/Tous les signaux/, /Enregistrés/, /Écartés/, /Corbeille/]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }

    // Mettre le premier signal à la corbeille : il quitte « Tous », il apparaît dans « Corbeille ».
    const [first] = screen.getAllByRole('button', { name: /Plus d’actions pour/ })
    await userEvent.click(first!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mettre à la corbeille' }))
    expect(screen.getAllByTestId('signal-card')).toHaveLength(2)

    await userEvent.click(screen.getByRole('tab', { name: /Corbeille/ }))
    expect(screen.getAllByTestId('signal-card')).toHaveLength(1)

    const [trashed] = screen.getAllByRole('button', { name: /Plus d’actions pour/ })
    await userEvent.click(trashed!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restaurer' }))
    expect(screen.getByText('La corbeille est vide.')).toBeInTheDocument()
  })

  it('SAIT DIRE NON : un onglet sans signal dit son état vide, jamais « 0 »', async () => {
    mockApi()
    renderContent('u-empty-tab')

    await screen.findAllByTestId('signal-card')
    await userEvent.click(screen.getByRole('tab', { name: /Enregistrés/ }))
    expect(screen.getByText('Aucun signal enregistré.')).toBeInTheDocument()
    expect(screen.queryByTestId('signal-card')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Enregistrés/ }).textContent).not.toMatch(/0/)
  })

  it('« Filtres » : la date du fait retient les signaux récents, multi-sélection par nature', async () => {
    mockApi()
    renderContent('u-filters')

    await screen.findAllByTestId('signal-card')
    await userEvent.click(screen.getByRole('button', { name: /Filtres/ }))
    await userEvent.click(screen.getByRole('button', { name: '30 jours' }))
    await userEvent.click(screen.getByRole('button', { name: 'Voir les signaux' }))
    // Le signal de 120 jours sort ; les deux autres restent.
    expect(screen.getAllByTestId('signal-card')).toHaveLength(2)
    expect(screen.queryByText('Refonte SI')).not.toBeInTheDocument()
  })

  it('« Mes veilles » : trois onglets, chacun son contenu', async () => {
    mockApi()
    renderWithRouter(
      <SessionContext.Provider value={{ user: { id: 'u-w' } as SessionUser, loading: false }}>
        <TargetListsContent />
      </SessionContext.Provider>,
      '/mes-cibles?view=veilles',
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'Les sujets que tu suis.' })).toBeInTheDocument()
    for (const name of [/Règles transverses/, /Comptes suivis/, /Alertes de recherche/]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('tab', { name: /Alertes de recherche/ }))
    expect(await screen.findByTestId('watches-alerts')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /Comptes suivis/ }))
    expect(await screen.findByTestId('watches-follows')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Préférences de notification' }).getAttribute('href')).toBe(
      '/settings/notifications',
    )
  })

  /**
   * LE TÉMOIN — #4088.8 : les listes de cibles ont quitté `/mes-cibles` (elles
   * vivent sur /accounts?lens=lists) ; l'écran ne garde que les signaux.
   */
  it('témoin : les listes de cibles ne sont plus rendues ici (#4088.8)', async () => {
    mockApi()
    renderContent('u-witness')

    await screen.findAllByTestId('signal-card')
    expect(screen.queryByText('Objectif : Décrocher 3 rendez-vous DSI')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importer une liste' })).not.toBeInTheDocument()
  })
})
