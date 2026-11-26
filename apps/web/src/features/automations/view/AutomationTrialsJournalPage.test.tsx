import type { AutomationTrialView } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/page/CustomerPage', () => import('./customerPageDouble'))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: ({ label }: { label: string }) => <button type="button">{label}</button>,
}))
const trials = vi.fn()
const rules = vi.fn()
vi.mock('../api', () => ({
  useAutomationTrials: () => trials(),
  useAutomationRules: () => rules(),
}))
vi.mock('@/features/routines/api', () => ({ useRoutines: () => ({ data: undefined }) }))

const { AutomationTrialsJournalPage } = await import('./AutomationTrialsJournalPage')

const trial = (over: Partial<AutomationTrialView> = {}): AutomationTrialView => ({
  id: 't1',
  rule_id: 'r1',
  rule_name: 'Une fin de mission approche',
  signal: 'mission_end',
  target: 'draft',
  outcome: 'ok',
  situations_read: 2,
  situation_labels: ['EDF', 'Thales'],
  would_act: 2,
  reason: null,
  created_at: '2026-10-22T08:02:00Z',
  ...over,
})

beforeEach(() => {
  rules.mockReturnValue({ data: undefined })
})

// Théo C automations-bibliotheque.N3 — « Le journal de tes essais ».
describe('AutomationTrialsJournalPage', () => {
  it('titre, sous-titre : « un essai n’est jamais une preuve d’envoi réel »', () => {
    trials.mockReturnValue({ data: [trial()], isLoading: false, isError: false })
    render(<AutomationTrialsJournalPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Le journal de tes essais' })).toBeInTheDocument()
    expect(screen.getByText(/n’est jamais une preuve d’envoi réel/)).toBeInTheDocument()
    expect(screen.getByText(/ne crée ni tâche, ni message/)).toBeInTheDocument()
  })

  it('une ligne : la règle, le genre d’essai, les situations lues avec leurs comptes, ce qu’elle aurait préparé', () => {
    trials.mockReturnValue({ data: [trial()], isLoading: false, isError: false })
    render(<AutomationTrialsJournalPage />)

    const row = within(screen.getByRole('list', { name: 'Essais récents' })).getByRole('listitem')
    expect(row).toHaveTextContent('Une fin de mission approche')
    expect(row).toHaveTextContent('Essai du brouillon')
    expect(row).toHaveTextContent('2 situations lues (EDF, Thales)')
    expect(row).toHaveTextContent('Aurait préparé 2 actions à valider')
    expect(within(row).getByRole('link', { name: 'Ouvrir la règle : Une fin de mission approche' })).toHaveAttribute(
      'href',
      '/actions/automatisations/r1',
    )
  })

  it('Théo C — en-tête déclaré à la coque (« Mes automatisations » à droite), puis sous-onglets, liste dense, note', () => {
    trials.mockReturnValue({ data: [trial()], isLoading: false, isError: false })
    render(<AutomationTrialsJournalPage />)
    const head = screen.getByTestId('page-head')
    expect(within(head).getByRole('link', { name: 'Mes automatisations' })).toHaveAttribute(
      'href',
      '/actions/automatisations',
    )
    const tabs = screen.getByRole('navigation', { name: 'Automatisations' })
    const list = screen.getByRole('list', { name: 'Essais récents' })
    const note = screen.getByText(/ne crée ni tâche, ni message/)
    expect(Boolean(tabs.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(Boolean(list.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('un essai en échec se NOMME et ne compte rien — jamais « 0 situation » quand rien n’a été lu', () => {
    trials.mockReturnValue({
      data: [
        trial({
          outcome: 'failed',
          situations_read: null,
          would_act: null,
          situation_labels: [],
          reason: 'La source de cette règle n’a pas pu être lue.',
        }),
      ],
      isLoading: false,
      isError: false,
    })
    render(<AutomationTrialsJournalPage />)

    expect(screen.getByText(/Impossible : La source de cette règle n’a pas pu être lue\./)).toBeInTheDocument()
    expect(screen.queryByText(/situation/)).not.toBeInTheDocument()
  })

  it('un essai qui a lu mais n’aurait rien préparé le dit — c’est une mesure, pas un trou', () => {
    trials.mockReturnValue({
      data: [trial({ situations_read: 1, would_act: 0, situation_labels: ['SNCF'] })],
      isLoading: false,
      isError: false,
    })
    render(<AutomationTrialsJournalPage />)

    expect(screen.getByText(/1 situation lue \(SNCF\)/)).toBeInTheDocument()
    expect(screen.getByText(/N’aurait rien préparé/)).toBeInTheDocument()
  })

  it('une règle supprimée depuis ne laisse pas de lien mort', () => {
    trials.mockReturnValue({ data: [trial({ rule_id: null })], isLoading: false, isError: false })
    render(<AutomationTrialsJournalPage />)
    expect(screen.queryByRole('link', { name: /Ouvrir la règle/ })).not.toBeInTheDocument()
  })

  it('journal vide : l’état vide dit quoi faire, avec Laura', () => {
    trials.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<AutomationTrialsJournalPage />)

    expect(screen.getByText(/Aucun essai enregistré/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer avec Laura' })).toBeInTheDocument()
  })

  it('lecture impossible : le dit, ne montre pas un journal vide', () => {
    trials.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<AutomationTrialsJournalPage />)
    expect(screen.getByText('Le journal n’a pas pu être lu.')).toBeInTheDocument()
    expect(screen.queryByText(/Aucun essai enregistré/)).not.toBeInTheDocument()
  })

  it('N4 — le sous-onglet « Journal des essais » est la page courante et porte son compteur', () => {
    trials.mockReturnValue({ data: [trial(), trial({ id: 't2' })], isLoading: false, isError: false })
    render(<AutomationTrialsJournalPage />)

    const current = within(screen.getByRole('navigation', { name: 'Automatisations' })).getByRole('link', {
      name: /Journal des essais/,
    })
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current).toHaveTextContent('2')
  })
})
