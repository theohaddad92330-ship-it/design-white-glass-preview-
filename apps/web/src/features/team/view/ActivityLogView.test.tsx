import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * LE JOURNAL D'ACTIVITÉ DIT LEQUEL DES DEUX VIDES IL EST (PDF 1 §2.2).
 *
 * Avant : `states.empty` = « Aucune activité sur cette période », rendu dans
 * LES DEUX CAS. Sur un espace neuf, la phrase envoie chercher une période —
 * alors qu'il n'y a jamais rien eu à journaliser, et que le geste utile est
 * simplement d'utiliser le produit. Sur un espace actif filtré, elle est juste
 * mais ne propose rien.
 *
 * Ce test tient les deux bords : le vide initial n'emprunte pas les mots du
 * vide filtré, et le vide filtré propose de RETIRER les filtres.
 */

const useTeam = vi.fn()
const useWorkspaceActivity = vi.fn()
const dataExit = vi.hoisted(() => ({ value: { allowed: false, grant: null as object | null } }))
const getActivity = vi.hoisted(() => vi.fn())
const downloadCSV = vi.hoisted(() => vi.fn())

vi.mock('@/lib/data-exit', () => ({ useDataExit: () => dataExit.value }))
vi.mock('@/lib/export-csv', () => ({ downloadCSV: (...args: unknown[]) => downloadCSV(...args) }))
vi.mock('@/features/team/api', () => ({ teamApi: { getActivity: (...args: unknown[]) => getActivity(...args) } }))

vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => useTeam() }))
vi.mock('@/features/team/hooks/useWorkspaceActivity', () => ({
  useWorkspaceActivity: (...args: unknown[]) => useWorkspaceActivity(...args),
}))

const TEAM = { workspace: { role: 'owner' }, members: [] }

function page(total: number, rows: number) {
  return {
    data: Array.from({ length: rows }, (_, index) => ({
      id: `a-${index}`,
      event: 'analysis_started',
      actor: { name: 'Alix', email: null },
      target: null,
      detail: null,
      occurredAt: '2026-09-01T08:00:00.000Z',
    })),
    pagination: { currentPage: 1, totalPages: 1, totalItems: total, pageSize: 25 },
  }
}

async function view() {
  const { ActivityLogView } = await import('./ActivityLogView')
  return renderWithRouter(<ActivityLogView />)
}

describe('ActivityLogView — les deux vides', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTeam.mockReturnValue({ team: TEAM, isLoading: false })
  })

  it('un espace où rien n’a jamais été journalisé rend `empty_never`', async () => {
    useWorkspaceActivity.mockReturnValue({ data: page(0, 0), isLoading: false, isError: false, refetch: vi.fn() })
    await view()

    const region = await screen.findByRole('status')
    expect(region.getAttribute('data-screen-state')).toBe('empty_never')
    // Aucun geste de FILTRE : il n'y a rien à assouplir.
    expect(screen.queryByRole('button', { name: /retirer les filtres|clear filters/i })).toBeNull()
  })

  /**
   * ⚠️ Le pendant `empty_true` de CET écran n'est pas piloté ici : ses trois
   * filtres sont des `Select` Radix, et jsdom n'implémente pas
   * `hasPointerCapture` — les ouvrir jette. Le vide FILTRÉ est prouvé sur la
   * Veille (`WatchlistBoard.test.tsx`), dont le filtre est un
   * bouton ordinaire, et la dérivation elle-même est tenue par
   * `ui-state.test.ts`. Écrire ici un test qui ne peut pas cliquer produirait
   * une garde borgne de plus.
   */

  it('un échec de lecture est ANNONCÉ, et nomme le geste de reprise', async () => {
    const refetch = vi.fn()
    useWorkspaceActivity.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch })
    await view()

    const alert = await screen.findByRole('alert')
    expect(alert.getAttribute('data-screen-state')).toBe('error')
    await userEvent.click(screen.getByRole('button', { name: /réessayer/i }))
    expect(refetch).toHaveBeenCalled()
  })

  it('un rôle sans le droit voit `permission`, jamais un vide', async () => {
    useTeam.mockReturnValue({ team: { workspace: { role: 'viewer' }, members: [] }, isLoading: false })
    useWorkspaceActivity.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() })
    await view()

    const region = await screen.findByRole('status')
    expect(region.getAttribute('data-screen-state')).toBe('permission')
  })

  /**
   * #3057 — le panneau rendait à 0 px de haut dans son parent flex (698 px)
   * alors que son contenu faisait ~13 500 px : un enfant flex sans hauteur
   * bornée ni défilement propre. La liste de lignes doit porter SA PROPRE
   * borne de hauteur et défiler DANS son conteneur — `dvh`, jamais `vh`
   * (mobile = le produit, jamais un repli, gardes GA-28/29/30) — plutôt que
   * de compter sur la hauteur (parfois non bornée) de ses ancêtres.
   */
  it('#3057 — la liste des lignes est bornée en hauteur et défile dans son propre conteneur', async () => {
    useWorkspaceActivity.mockReturnValue({ data: page(5, 5), isLoading: false, isError: false, refetch: vi.fn() })
    const { container } = await view()
    await screen.findAllByText('Alix')

    const scrollBox = container.querySelector('[data-slot="activity-log-scroll"]')
    expect(scrollBox).not.toBeNull()
    expect(scrollBox?.className).toMatch(/overflow-y-auto/)
    // Une borne de hauteur en `dvh` (jamais `vh`) — un plafond, pas une
    // revendication du viewport entier, donc innocent pour GA-256.
    expect(scrollBox?.className).toMatch(/max-h-\[[^\]]*dvh\]/)
    expect(scrollBox?.className).not.toMatch(/(?<!d)vh\]/)
  })

  it('Théo D settings-outils — le journal est un tableau Changement · Par · Date', async () => {
    useWorkspaceActivity.mockReturnValue({ data: page(2, 2), isLoading: false, isError: false, refetch: vi.fn() })
    await view()
    await screen.findAllByText('Alix')
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Changement', 'Par', 'Date'])
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })
})

/**
 * Théo D settings-outils.A4 — « Exporter » : le journal filtré en CSV, derrière la règle d'espace sur la sortie de données.
 */
describe('ActivityLogView — l’export du journal (Théo D settings-outils.A4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTeam.mockReturnValue({ team: TEAM, isLoading: false })
    useWorkspaceActivity.mockReturnValue({ data: page(1, 1), isLoading: false, isError: false, refetch: vi.fn() })
    getActivity.mockResolvedValue({ ...page(1, 1), pagination: { hasNext: false } })
  })

  it('⚠️ SAIT DIRE NON — la règle d’espace refuse la sortie : pas de bouton « Exporter »', async () => {
    dataExit.value = { allowed: false, grant: null }
    await view()
    expect(screen.queryByRole('button', { name: 'Exporter' })).toBeNull()
  })

  it('la règle l’autorise : le bouton exporte le journal et passe la preuve de sortie', async () => {
    const grant = {}
    dataExit.value = { allowed: true, grant }
    await view()
    await userEvent.setup({ pointerEventsCheck: 0 }).click(await screen.findByRole('button', { name: 'Exporter' }))
    await vi.waitFor(() => expect(downloadCSV).toHaveBeenCalledTimes(1))
    expect(downloadCSV.mock.calls[0]?.[2]).toBe(grant)
    expect(String(downloadCSV.mock.calls[0]?.[0])).toContain('Alix')
  })
})

/**
 * Refonte Théo V22 (`settings-outils#journal`) — l'eyebrow et le titre, trois filtres NOMMÉS dans l'ordre de la
 * maquette (Type, Membre, Période), puis le tableau commun (Changement · Par · Date).
 */
describe('Journal d’activité — structure Théo V22', () => {
  it('titre, filtres nommés dans l’ordre, tableau à trois colonnes', async () => {
    useTeam.mockReturnValue({ team: TEAM, isLoading: false })
    useWorkspaceActivity.mockReturnValue({ data: page(2, 2), isLoading: false, isError: false, refetch: vi.fn() })
    await view()
    expect(await screen.findByRole('heading', { level: 1, name: "Journal d'activité" })).toBeInTheDocument()
    const filters = screen.getByRole('group', { name: 'Filtres du journal' })
    expect([...filters.querySelectorAll('label')].map(label => label.textContent)).toEqual([
      'Type',
      'Membre',
      'Période',
    ])
    const table = screen.getByRole('table', { name: "Journal d'activité" })
    expect([...table.querySelectorAll('th')].map(th => th.textContent)).toEqual(['Changement', 'Par', 'Date'])
    // Deux lignes de données, l'en-tête exclu.
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('NON : sans droit de lecture, ni filtres ni tableau', async () => {
    useTeam.mockReturnValue({ team: { ...TEAM, workspace: { role: 'member' } }, isLoading: false })
    useWorkspaceActivity.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() })
    await view()
    expect(await screen.findByText('Accès réservé')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filtres du journal' })).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
