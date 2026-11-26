import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revealTarget } from '@/lib/reveal-target'
import type { CockpitFigures } from './useCockpitFigures'

/** Les états cliquables du Cockpit de Théo : le pli, la fenêtre « toutes les décisions », l'export. */

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ routesByPath: {} }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const cards = vi.fn()
vi.mock('../DecisionStrip', () => ({
  useDecisionCards: () => cards(),
  DecisionCardView: ({ card }: { card: { key: string; label: string } }) => (
    <article data-testid={`card-${card.key}`}>{card.label}</article>
  ),
}))
vi.mock('../DataToComplete', () => ({ DataToComplete: () => <div data-testid="data-to-complete" /> }))
const interventions = vi.fn()
vi.mock('@/features/playbooks/api', () => ({ useInterventions: () => interventions() }))
vi.mock('@/features/playbooks/view/InterventionsBlock', () => ({
  InterventionsBlock: () => <div data-testid="interventions-block" />,
}))

const dataExit = vi.fn()
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => dataExit() }))
const downloadCSV = vi.fn()
vi.mock('@/lib/export-csv', () => ({ downloadCSV: (...args: unknown[]) => downloadCSV(...args) }))

const { CockpitDecisions } = await import('./CockpitDecisions')
const { CockpitExportButton } = await import('./CockpitExportButton')
const { CockpitFold } = await import('./cockpit-ui')

const card = (key: string) => ({ key, label: `Décision ${key}`, hint: 'x', tone: 'neutral' as const })

beforeEach(() => {
  vi.clearAllMocks()
  cards.mockReturnValue([card('a'), card('b'), card('c'), card('d'), card('e')])
  interventions.mockReturnValue({ data: [{ id: 1 }, { id: 2 }] })
})

describe('Trois décisions à prendre', () => {
  it('montre les trois premières décisions, et le compte de toutes les autres', () => {
    render(<CockpitDecisions levels={[]} loading={false} />)
    const region = screen.getByTestId('cockpit-decisions')
    expect(within(region).getByRole('heading', { name: '3 décisions à prendre' })).toBeInTheDocument()
    expect(within(region).getAllByTestId(/^card-/)).toHaveLength(3)
    // 5 cartes de la chaîne + 2 de la file d'arbitrage : une seule somme.
    expect(within(region).getByRole('button', { name: 'Voir toutes les décisions · 7' })).toBeInTheDocument()
  })

  it('« Voir toutes les décisions » ouvre la file d’arbitrage complète dans une fenêtre', async () => {
    render(<CockpitDecisions levels={[]} loading={false} />)
    expect(screen.queryByTestId('interventions-block')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Voir toutes les décisions/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Toutes les décisions' })
    expect(within(dialog).getByTestId('interventions-block')).toBeInTheDocument()
    // Le bouton compte 5 + 2 : la fenêtre montre AUSSI les 5 décisions de la chaîne.
    expect(within(within(dialog).getByTestId('cockpit-decisions-all-cards')).getAllByTestId(/^card-/)).toHaveLength(5)
  })

  it('rien n’attend : ni titre à trois zéros, ni bouton — « Données à compléter » reste', () => {
    cards.mockReturnValue([])
    interventions.mockReturnValue({ data: [] })
    render(<CockpitDecisions levels={[]} loading={false} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Voir toutes les décisions/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('data-to-complete')).toBeInTheDocument()
  })

  it('une seule décision : le titre est au singulier', () => {
    cards.mockReturnValue([card('a')])
    interventions.mockReturnValue({ data: [] })
    render(<CockpitDecisions levels={[]} loading={false} />)
    expect(screen.getByRole('heading', { name: 'Une décision à prendre' })).toBeInTheDocument()
  })
})

describe('Un pli du Cockpit', () => {
  it('s’ouvre au clic sur son résumé et dit son contenu', async () => {
    render(
      <CockpitFold title="La chaîne" testId="fold">
        <p>Huit maillons</p>
      </CockpitFold>,
    )
    const fold = screen.getByTestId('fold') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    await userEvent.click(screen.getByText('La chaîne'))
    expect(fold.open).toBe(true)
  })

  it('un chemin vers une destination repliée OUVRE le pli, sinon il mènerait à un endroit invisible', () => {
    render(
      <CockpitFold title="La chaîne" testId="fold">
        <p id="maillon" tabIndex={-1}>
          Conversation
        </p>
      </CockpitFold>,
    )
    const fold = screen.getByTestId('fold') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    expect(revealTarget('maillon')).toBe(true)
    expect(fold.open).toBe(true)
  })
})

describe('Exporter la synthèse', () => {
  const figures: CockpitFigures = {
    month: '2026-10',
    objectiveLoading: false,
    objectiveFailed: false,
    stagesLoaded: true,
    cashLoading: false,
    objective: { target: 150_000 } as CockpitFigures['objective'],
    pipeOpen: 417_000,
    won: 71_000,
    bench: 3,
    actions: { open: 9, overdue: 1 },
    stages: [{ stage: 'qualified', count: 2 }],
    cash: { collected: 15_800, toFollow: null, drafts: 15_200, draftCount: 1 },
  }

  it('sans l’autorisation de l’espace, le bouton n’existe pas', () => {
    dataExit.mockReturnValue({ allowed: false, grant: null })
    render(<CockpitExportButton figures={figures} />)
    expect(screen.queryByRole('button', { name: 'Exporter la synthèse' })).not.toBeInTheDocument()
  })

  it('recopie les chiffres de l’écran, « Non mesuré » pour ce qui n’a pas pu être lu', async () => {
    const grant = Object.freeze({})
    dataExit.mockReturnValue({ allowed: true, grant })
    render(<CockpitExportButton figures={figures} />)

    await userEvent.click(screen.getByRole('button', { name: 'Exporter la synthèse' }))

    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const [csv, filename, passedGrant] = downloadCSV.mock.calls[0] as [string, string, unknown]
    expect(filename).toBe('synthese-pilotage-2026-10.csv')
    expect(passedGrant).toBe(grant)
    expect(csv).toContain('Pipe ouvert')
    expect(csv).toContain('Qualifié')
    // « à suivre » n'a pas pu être lu : le fichier le dit, il n'écrit pas 0.
    expect(csv).toMatch(/"à suivre","Non mesuré"/)
  })
})
