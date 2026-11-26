import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeadlineMission } from '../planning-deadlines'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)} {...rest}>
      {children}
    </a>
  ),
}))

const { PlanningDeadlines } = await import('./PlanningDeadlines')

const TODAY = '2026-10-22'

function mission(over: Partial<DeadlineMission> = {}): DeadlineMission {
  return {
    id: 'm1',
    label: 'Socle conteneurisé — run',
    accountName: 'SNCF',
    personNames: ['Hakim Barreau'],
    startedOn: '2026-03-02',
    endsOn: '2026-10-30',
    ...over,
  }
}

afterEach(cleanup)

describe('PlanningDeadlines — les échéances à préparer (Théo missions-planning.N1)', () => {
  it('une carte de fin nomme le délai et mène à Actions', () => {
    render(<PlanningDeadlines missions={[mission()]} today={TODAY} intercontractCount={0} />)
    const cards = screen.getByRole('region', { name: 'Les échéances à préparer' })
    expect(within(cards).getByText('Fin dans 8 jours')).toBeTruthy()
    expect(within(cards).getByText('Hakim Barreau')).toBeTruthy()
    expect(within(cards).getByText(/SNCF · Socle conteneurisé — run/)).toBeTruthy()
    expect(within(cards).getByRole('link', { name: 'Préparer la suite' }).getAttribute('href')).toBe('/actions')
    // La carte dit quoi faire en une phrase, et un lien mène à Actions (pas un second gestionnaire de tâches).
    expect(within(cards).getByText(/anticiper la suite/i)).toBeTruthy()
    expect(within(cards).getByRole('link', { name: 'Voir les actions' }).getAttribute('href')).toBe('/actions')
  })

  it('une carte de démarrage mène à la mission pour vérifier le démarrage', () => {
    render(
      <PlanningDeadlines
        missions={[mission({ id: 'm2', startedOn: '2026-11-03', endsOn: '2027-04-30' })]}
        today={TODAY}
        intercontractCount={0}
      />,
    )
    expect(screen.getByText(/Démarrage · 3 nov\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Vérifier le démarrage' }).getAttribute('href')).toBe('/missions/m2')
  })

  it('quatrième carte « Intercontrat » seulement quand quelqu’un l’est, vers le vivier', () => {
    const { rerender } = render(<PlanningDeadlines missions={[mission()]} today={TODAY} intercontractCount={0} />)
    expect(screen.queryByText(/Intercontrat/)).toBeNull()
    rerender(<PlanningDeadlines missions={[mission()]} today={TODAY} intercontractCount={2} />)
    expect(screen.getByText('Intercontrat · 2 personnes')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Trouver des missions' }).getAttribute('href')).toBe('/consultants')
  })

  it('aucune échéance : le dit, sans carte vide', () => {
    render(<PlanningDeadlines missions={[mission({ endsOn: '2027-04-30' })]} today={TODAY} intercontractCount={0} />)
    expect(screen.getByText('Aucune échéance à préparer dans les 30 prochains jours.')).toBeTruthy()
  })
})
