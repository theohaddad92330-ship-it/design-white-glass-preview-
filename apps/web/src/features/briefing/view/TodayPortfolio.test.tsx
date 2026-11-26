import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { TodayDealsCard, TodayFollowedProfiles, TodayPipeTile, useTodayPipe } from './TodayPortfolio'

// Louis 23/10 — portés depuis `view/day/DealsAndProfiles.test.tsx` et `DayTiles.test.tsx` (PR11) : ces blocs reviennent
// dans l'écran Théo de « Ta journée », dans sa forme.

const projects = vi.hoisted(() => ({ data: undefined as unknown }))
const consultants = vi.hoisted(() => ({ data: undefined as unknown }))
const pipeline = vi.hoisted(() => ({ data: undefined as unknown }))
const session = vi.hoisted(() => ({ user: { id: 'me' } as { id: string } | null }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children }: { to: string; params?: { id: string }; children: React.ReactNode }) => (
    <a href={params ? to.replace('$id', params.id) : to}>{children}</a>
  ),
}))
vi.mock('@/features/projects/hooks/useProjects', () => ({ useProjects: () => projects }))
vi.mock('@/features/consultants/hooks', () => ({ useConsultants: () => consultants }))
vi.mock('@/features/projects/hooks/usePipeline', () => ({ usePipeline: () => pipeline }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => session }))

describe('Théo A today-jour.R8 — « Les affaires à faire avancer »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    session.user = { id: 'me' }
    projects.data = undefined
  })

  it('montre mes affaires : compte, montant, responsable — chacune avec son lien', () => {
    projects.data = [
      {
        id: 'p1',
        label: 'Renfort plateforme cloud',
        company_name: 'Société Générale',
        stage: 'qualified',
        stage_entered_at: '2026-10-01T00:00:00Z',
        owner_id: 'me',
        owner_name: 'Maëlle Lorquin',
        amount_cents: 9_600_000,
        currency: 'EUR',
        next_action: null,
      },
    ]
    render(<TodayDealsCard />)
    const link = screen.getByRole('link', { name: /Renfort plateforme cloud/ })
    expect(link.getAttribute('href')).toBe('/projects/p1')
    expect(link.textContent).toMatch(/Société Générale · 96\s?000/)
    expect(link.textContent).toContain('responsable Maëlle Lorquin')
    expect(link.textContent).toContain('aucune prochaine action')
  })

  it('un montant non saisi se DIT, il n’est jamais écrit 0 €', () => {
    projects.data = [
      {
        id: 'p2',
        label: 'Cadrage data',
        company_name: 'Orange',
        stage: 'qualified',
        stage_entered_at: '2026-10-01T00:00:00Z',
        owner_id: 'me',
        owner_name: null,
        amount_cents: null,
        next_action: { title: 'x', due_on: '2026-10-30' },
      },
    ]
    render(<TodayDealsCard />)
    const text = screen.getByRole('link', { name: /Cadrage data/ }).textContent ?? ''
    expect(text).toContain('montant non saisi')
    expect(text).not.toMatch(/0\s?€/)
  })

  it('sait dire NON : rien de lu, ou aucune affaire à moi = aucun bloc', () => {
    const { container, rerender } = render(<TodayDealsCard />)
    expect(container.textContent).toBe('')
    projects.data = [{ id: 'x', owner_id: 'autre', stage: 'qualified', stage_entered_at: '2026-10-01T00:00:00Z' }]
    rerender(<TodayDealsCard />)
    expect(container.textContent).toBe('')
  })
})

describe('Théo A today-jour.N6 — « Les profils suivis »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    session.user = { id: 'me' }
    consultants.data = undefined
  })

  it('montre mes profils avec leurs compétences et la disponibilité DÉCLARÉE', () => {
    consultants.data = [
      {
        id: 'c1',
        full_name: 'Salomé Dufour',
        title: 'Data',
        stack: ['Python', 'MLOps', 'dbt', 'Airflow'],
        owner_user_id: 'me',
        available_from: '2026-10-27',
      },
    ]
    render(<TodayFollowedProfiles />)
    const link = screen.getByRole('link', { name: /Salomé Dufour/ })
    expect(link.getAttribute('href')).toBe('/consultants/c1')
    expect(link.textContent).toContain('Python · MLOps · dbt')
    expect(link.textContent).toContain('Disponibilité déclarée : 27 oct. 2026')
  })

  it('sait dire NON : un profil sans date de disponibilité ne fait aucune ligne', () => {
    consultants.data = [{ id: 'c2', full_name: 'X', title: null, stack: [], owner_user_id: 'me', available_from: null }]
    const { container } = render(<TodayFollowedProfiles />)
    expect(container.textContent).toBe('')
  })
})

function PipeTileOrNothing() {
  const pipe = useTodayPipe()
  return pipe ? <TodayPipeTile pipe={pipe} /> : null
}

describe('Théo A today-jour.N2 — la tuile « Affaires en cours », dans la rangée de Théo', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    pipeline.data = undefined
  })

  it('montre la somme non pondérée de mes affaires et mène au pipe', () => {
    pipeline.data = { total_count: 4, total_amount_cents: 23_100_000, total_without_amount: 1 }
    render(<PipeTileOrNothing />)
    const tile = screen.getByRole('link', { name: /Affaires en cours/ })
    expect(tile.getAttribute('href')).toBe('/projects')
    expect(tile.textContent).toMatch(/231\s?000/)
    expect(tile.textContent).toContain('dont 1 sans montant')
  })

  it('sait dire NON : tant que le pipe n’a pas répondu, aucune tuile — jamais un « 0 » (GA-18)', () => {
    const { container } = render(<PipeTileOrNothing />)
    expect(container.textContent).toBe('')
  })

  it('aucun montant saisi : « non mesuré », jamais « 0 € »', () => {
    pipeline.data = { total_count: 3, total_amount_cents: 0, total_without_amount: 3 }
    render(<PipeTileOrNothing />)
    const tile = screen.getByRole('link', { name: /Affaires en cours/ })
    expect(tile.textContent).not.toMatch(/0\s?€/)
    expect(tile.textContent).toContain('Aucun montant saisi sur tes 3 affaires')
  })
})
