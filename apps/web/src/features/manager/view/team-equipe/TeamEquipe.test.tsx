/**
 * Théo D team-plans / team-recherches / team-member — les trois écrans de
 * l'espace Équipe qui lisent la file d'actions et les recherches partagées.
 * Chaque état cliquable (lentille, mode, filtre de compte, fiche membre) a son test.
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerTeamStats } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'
import { filterActions } from './TeamPlansView'
import { TeamMemberView } from './TeamMemberView'
import { TeamPlansView } from './TeamPlansView'
import { TeamSearchesView } from './TeamSearchesView'

const statsMock = vi.fn()
vi.mock('@/features/manager/hooks/useManagerStats', () => ({ useManagerStats: () => statsMock() }))
const viewsMock = vi.fn()
vi.mock('@/features/governance/api', () => ({ useSavedViews: () => viewsMock() }))
const objectivesMock = vi.fn()
vi.mock('@/features/manager/hooks/useObjectives', () => ({ useTeamObjectives: () => objectivesMock() }))
const createMock = vi.fn()
vi.mock('@/features/actions/planItems.api', () => ({ planItemsApi: { create: (input: unknown) => createMock(input) } }))

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const item = (id: string, label: string, account: string, company: string, owner: string, extra = {}) => ({
  id,
  label,
  account_id: account,
  company_name: company,
  due_date: null as string | null,
  overdue: false,
  owner_user_id: owner,
  assigned_to: null as string | null,
  ...extra,
})

const ITEMS = [
  item('i1', 'Obtenir le bon de commande', A1, 'SNCF Voyageurs', 'u1', { due_date: '2020-01-01', overdue: true }),
  item('i2', 'Relancer Paul', A2, 'Airbus', 'u1', { due_date: todayIso() }),
  item('i3', 'Valider les conditions', A2, 'Airbus', 'u1', { assigned_to: 'u2' }),
]

const member = (user_id: string, name: string) => ({
  user_id,
  name,
  email: `${user_id}@esn.fr`,
  role: 'sales',
  accounts: 2,
  contacts: 0,
  emails_sent: 0,
  analyses: 0,
  last_activity_at: null,
})

const STATS = {
  workspace: { id: 'w', name: 'Skaizen', member_count: 2 },
  totals: { accounts: 2, contacts: 0, emails_sent: 0, analyses: 0 },
  pipeline: [],
  members: [member('u1', 'Maëlle Lorquin'), member('u2', 'Léa Marchand')],
  shared_actions: { open: 3, overdue: 1, delegated: 1, items: ITEMS },
} as unknown as ManagerTeamStats

beforeEach(async () => {
  statsMock.mockReset()
  viewsMock.mockReset()
  resetTestQueryClient()
  statsMock.mockReturnValue({ data: STATS, isLoading: false, error: null })
  objectivesMock.mockReset()
  objectivesMock.mockReturnValue({ data: { period_month: '2026-10-01', members: [] } })
  createMock.mockReset()
  createMock.mockResolvedValue({ added: true })
  await i18n.changeLanguage('fr')
})

describe('filterActions', () => {
  it('chaque lentille ne garde que ses actions', () => {
    const today = todayIso()
    expect(filterActions(ITEMS, 'todo', today, '', [])).toHaveLength(3)
    expect(filterActions(ITEMS, 'late', today, '', []).map(i => i.id)).toEqual(['i1'])
    expect(filterActions(ITEMS, 'today', today, '', []).map(i => i.id)).toEqual(['i2'])
    expect(filterActions(ITEMS, 'delegated', today, '', []).map(i => i.id)).toEqual(['i3'])
  })
  it('la recherche et les comptes se cumulent, et plusieurs comptes valent « ou »', () => {
    const today = todayIso()
    expect(filterActions(ITEMS, 'todo', today, 'paul', []).map(i => i.id)).toEqual(['i2'])
    expect(filterActions(ITEMS, 'todo', today, '', [A1, A2])).toHaveLength(3)
    expect(filterActions(ITEMS, 'todo', today, '', [A1]).map(i => i.id)).toEqual(['i1'])
  })
})

describe('Plans & actions', () => {
  it('liste les actions de l’équipe avec leur responsable, sans bouton mort', async () => {
    renderWithRouter(<TeamPlansView />, '/team')
    expect(await screen.findByRole('heading', { level: 1, name: /Du plan à l’action/ })).toBeInTheDocument()
    expect(screen.getByText('Obtenir le bon de commande')).toBeInTheDocument()
    expect(screen.getAllByText('En retard').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Préparer' })).toHaveLength(3)
  })

  it('la lentille « En retard » ne garde que le retard ; « Déléguées » que le délégué', async () => {
    renderWithRouter(<TeamPlansView />, '/team')
    await screen.findByText('Obtenir le bon de commande')
    fireEvent.click(screen.getByRole('button', { name: 'En retard' }))
    expect(screen.queryByText('Relancer Paul')).not.toBeInTheDocument()
    expect(screen.getByText('Obtenir le bon de commande')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Déléguées' }))
    expect(screen.getByText('Valider les conditions')).toBeInTheDocument()
    expect(screen.queryByText('Obtenir le bon de commande')).not.toBeInTheDocument()
  })

  it('« Répartition » range par responsable (le délégué à Léa passe chez Léa)', async () => {
    renderWithRouter(<TeamPlansView />, '/team')
    await screen.findByText('Relancer Paul')
    fireEvent.click(screen.getByRole('button', { name: 'Répartition' }))
    const lea = screen.getByRole('region', { name: 'Léa' })
    expect(within(lea).getByText('Valider les conditions')).toBeInTheDocument()
    const maelle = screen.getByRole('region', { name: 'Maëlle' })
    expect(within(maelle).queryByText('Valider les conditions')).not.toBeInTheDocument()
  })

  it('« Semaine » range par échéance', async () => {
    renderWithRouter(<TeamPlansView />, '/team')
    await screen.findByText('Relancer Paul')
    fireEvent.click(screen.getByRole('button', { name: 'Semaine' }))
    expect(within(screen.getByRole('region', { name: 'Aujourd’hui' })).getByText('Relancer Paul')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Sans échéance' })).getByText('Valider les conditions'),
    ).toBeInTheDocument()
  })

  it('le filtre de comptes est multiple', async () => {
    renderWithRouter(<TeamPlansView />, '/team')
    await screen.findByText('Relancer Paul')
    fireEvent.click(screen.getByRole('button', { name: 'Tous les comptes' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'SNCF Voyageurs' }))
    expect(screen.queryByText('Relancer Paul')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Airbus' }))
    expect(screen.getByText('Relancer Paul')).toBeInTheDocument()
    expect(screen.getByText('Obtenir le bon de commande')).toBeInTheDocument()
  })
})

describe('Recherches', () => {
  it('une absence ne fait aucune carte, et le titre le dit', async () => {
    viewsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderWithRouter(<TeamSearchesView />, '/team')
    expect(await screen.findByText('Aucune recherche conservée.')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('montre les recherches partagées de l’équipe avec leur auteur, et mène à Découvrir', async () => {
    viewsMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          id: 's1',
          name: 'Banque & assurance · Lyon',
          filters: { query: 'banque' },
          objective: 'Clients finaux',
          alertFrequency: 'manual',
          alertChannel: null,
          resultType: null,
          newItems: 2,
          sourceKinds: [],
          lastRunAt: '2026-10-19T08:00:00.000Z',
          ownerId: 'u2',
          ownerName: 'Léa Marchand',
          shared: true,
          createdAt: '2026-10-01T08:00:00.000Z',
        },
      ],
    })
    renderWithRouter(<TeamSearchesView />, '/team')
    expect(await screen.findByText('1 recherche conservée.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Banque & assurance · Lyon' })).toBeInTheDocument()
    expect(screen.getByText('Léa')).toBeInTheDocument()
    expect(screen.getByText('nouveautés depuis la dernière lecture')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Examiner Banque & assurance · Lyon' }))
    const dialog = await screen.findByRole('dialog', { name: 'Banque & assurance · Lyon' })
    expect(within(dialog).getByText('2 nouveautés depuis la dernière lecture')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Reprendre dans Découvrir' })).toHaveAttribute('href', '/discover')
  })
})

describe('Fiche membre', () => {
  it('montre le travail de la personne — ses actions, y compris celles qu’on lui a confiées', async () => {
    renderWithRouter(<TeamMemberView memberId="u2" />, '/team')
    expect(await screen.findByRole('heading', { level: 1, name: /Léa Marchand/ })).toBeInTheDocument()
    expect(screen.getAllByText('Valider les conditions').length).toBeGreaterThan(0)
    expect(screen.queryByText('Obtenir le bon de commande')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Revenir à toute l’équipe/ })).toHaveAttribute('href', '/team')
  })

  it('une personne hors de l’espace est dite inconnue, sans fiche vide', async () => {
    renderWithRouter(<TeamMemberView memberId="zz" />, '/team')
    expect(await screen.findByText('Cette personne ne fait pas partie de l’espace.')).toBeInTheDocument()
  })

  it('aucune colonne d’activité ni de « dernier passage » (l’analytique mesure le produit)', async () => {
    renderWithRouter(<TeamMemberView memberId="u1" />, '/team')
    await screen.findByRole('heading', { level: 1, name: /Maëlle Lorquin/ })
    expect(screen.queryByText(/dernier passage/i)).not.toBeInTheDocument()
  })
})

describe('Structure Théo — l’en-tête commun de l’espace Équipe', () => {
  it('surtitre, titre, « Préparer le point d’équipe », barre des espaces puis portée, dans cet ordre', async () => {
    const { container } = renderWithRouter(<TeamPlansView />, '/team')
    const h1 = await screen.findByRole('heading', { level: 1, name: /Du plan à l’action/ })
    const prepare = screen.getByRole('link', { name: 'Préparer le point d’équipe' })
    expect(prepare).toHaveAttribute('href', '/team/review/1')
    const nav = screen.getByRole('navigation', { name: 'Espaces de l’équipe' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map(link => link.textContent?.replace(/\d+$/, '')),
    ).toEqual(['Vue d’ensemble', 'Plans & actions', 'Recherches', 'Administration'])
    expect(within(nav).getByRole('link', { name: /Plans & actions/ })).toHaveAttribute('aria-current', 'page')
    const control = screen.getByRole('group', { name: 'Portée et objectifs' })
    const order = [h1, prepare, nav, control].map(node => [...container.querySelectorAll('*')].indexOf(node))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('« Objectifs » (le mois) n’apparaît que sur la fiche d’un membre', async () => {
    renderWithRouter(<TeamPlansView />, '/team')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('combobox', { name: 'Objectifs' })).not.toBeInTheDocument()
  })
})

describe('Une action de l’équipe', () => {
  it('la case et le titre ouvrent le contexte : responsable, échéance, dossier', async () => {
    renderWithRouter(<TeamPlansView />, '/team')
    await screen.findByText('Relancer Paul')
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir : Relancer Paul' }))
    const dialog = await screen.findByRole('dialog', { name: 'Relancer Paul' })
    expect(within(dialog).getByText('Responsable')).toBeInTheDocument()
    expect(within(dialog).getByText('Maëlle')).toBeInTheDocument()
    expect(within(dialog).getByText('Airbus')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Ouvrir le dossier' })).toHaveAttribute('href', `/accounts/${A2}`)
  })

  it('« Créer une action » ouvre le formulaire et écrit par la porte du plan, objectif obligatoire', async () => {
    renderWithRouter(<TeamPlansView />, '/team')
    await screen.findByText('Relancer Paul')
    fireEvent.click(screen.getByRole('button', { name: 'Créer une action' }))
    const dialog = await screen.findByRole('dialog', { name: 'Une prochaine action, un responsable' })
    const submit = within(dialog).getByRole('button', { name: 'Créer l’action' })
    fireEvent.change(within(dialog).getByLabelText('Action à réaliser'), { target: { value: 'Appeler Paul' } })
    expect(submit).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Objectif'), { target: { value: 'Obtenir un retour' } })
    // #2395.8 — sans résultat attendu, l'action reste bloquée et l'écran le NOMME.
    expect(submit).toBeDisabled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Le résultat attendu est obligatoire')
    fireEvent.change(within(dialog).getByLabelText('Résultat attendu'), { target: { value: 'Un retour écrit' } })
    fireEvent.click(submit)
    await vi.waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    expect(createMock.mock.calls[0]?.[0]).toMatchObject({
      label: 'Appeler Paul',
      reason: 'Obtenir un retour',
      expected_outcome: 'Un retour écrit',
      account_id: A2,
      channel: 'email',
      owner_name: 'Maëlle Lorquin',
    })
  })
})

describe('Fiche membre — maquette Théo', () => {
  it('le bandeau dit le signé du mois face à la cible, « Rien de signé » quand rien ne l’est', async () => {
    objectivesMock.mockReturnValue({
      data: {
        period_month: '2026-10-01',
        members: [
          {
            user_id: 'u2',
            period_month: '2026-10-01',
            targets: { meetings: null, accounts: null, revenue: 60000 },
            achieved: { meetings: 0, accounts: 0, revenue: 0 },
          },
        ],
      },
    })
    renderWithRouter(<TeamMemberView memberId="u2" />, '/team')
    const hero = await screen.findByRole('region', { name: 'En un coup d’œil' })
    expect(within(hero).getByRole('heading', { name: 'Léa, au bon endroit.' })).toBeInTheDocument()
    expect(within(hero).getByText('Rien de signé')).toBeInTheDocument()
    expect(within(hero).getByText(/cible du mois : 60\s000\s€/)).toBeInTheDocument()
    expect(within(hero).getByRole('link', { name: 'Plan de travail' })).toHaveAttribute('href', '/team?vue=plans')
  })

  it('sans cible déclarée, aucun montant n’est inventé', async () => {
    renderWithRouter(<TeamMemberView memberId="u2" />, '/team')
    const hero = await screen.findByRole('region', { name: 'En un coup d’œil' })
    expect(within(hero).queryByText(/signé|cible/i)).not.toBeInTheDocument()
  })

  it('l’ordre des blocs : actions, portefeuille, puis le rôle dans l’équipe', async () => {
    renderWithRouter(<TeamMemberView memberId="u2" />, '/team')
    await screen.findByRole('heading', { level: 1, name: /Léa Marchand/ })
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(headings).toEqual([
      'Léa, au bon endroit.',
      'Les prochaines actions',
      'Le portefeuille',
      'Le rôle dans l’équipe',
    ])
  })

  it('« Attribuer » ouvre la fenêtre de passation du compte', async () => {
    renderWithRouter(<TeamMemberView memberId="u2" />, '/team')
    await screen.findByRole('heading', { level: 1, name: /Léa Marchand/ })
    fireEvent.click(screen.getByRole('button', { name: 'Attribuer Airbus' }))
    const dialog = await screen.findByRole('dialog', { name: 'Attribuer Airbus' })
    expect(within(dialog).getByRole('button', { name: 'Attribuer' })).toBeDisabled()
  })
})
