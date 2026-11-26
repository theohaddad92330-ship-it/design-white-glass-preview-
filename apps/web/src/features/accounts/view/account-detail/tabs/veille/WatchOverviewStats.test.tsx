import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WatchSignal } from '@/features/accounts/model/watch'
import { WatchOverviewStats } from './WatchOverviewStats'

function signal(id: string): WatchSignal {
  return {
    id,
    category: 'recrutement',
    date: '2026-09-04',
    freshness: 'current',
    temporalStatus: 'RECENT',
    type: 'Recrutement',
    signal: `Offre ${id}`,
    source: 'Offre d’emploi datée',
    angles: [],
    actionGate: { allowed: true },
    tags: [],
    perimeter: 'ACME',
  }
}

// #3680.2 — filtre actif : « X affichés sur Y ». #3995 revient sur #3720 : la liste montre désormais TOUS
// les signaux du filtre (pistes comprises), le numérateur est donc simplement le nombre de lignes affichées.
describe('WatchOverviewStats — « X affichés sur Y »', () => {
  const events = [signal('a'), signal('b'), signal('c'), signal('d')]

  it('le numérateur est le nombre de lignes de la liste', () => {
    render(<WatchOverviewStats signals={events} shownCount={2} narrowed onOpenCategory={vi.fn()} />)
    expect(screen.getByText('2 affichés sur 4')).toBeInTheDocument()
  })

  it('sans filtre actif, aucun compteur « affichés sur »', () => {
    render(<WatchOverviewStats signals={events} shownCount={4} narrowed={false} onOpenCategory={vi.fn()} />)
    expect(screen.queryByText(/affichés sur/)).not.toBeInTheDocument()
  })
})

// #4031 — DECATHLON-FIN : « Jobs IT » compte les signaux `recrutement` GARDÉS, toutes entités du groupe
// confondues (périmètres différents) ; sans offre, aucune ligne — jamais un « 0 » (GA-18 / GA-19).
describe('WatchOverviewStats — « Jobs IT »', () => {
  it('compte les offres de plusieurs entités d’un même groupe', () => {
    const offers = [
      { ...signal('a'), perimeter: 'Decathlon France' },
      { ...signal('b'), perimeter: 'Decathlon Technology' },
      { ...signal('c'), perimeter: 'Decathlon Digital' },
      { ...signal('d'), category: 'nomination' as const },
    ]
    render(<WatchOverviewStats signals={offers} shownCount={4} narrowed={false} onOpenCategory={vi.fn()} />)
    expect(screen.getByTestId('watch-stat-jobs')).toHaveTextContent('3')
  })

  it('sans offre gardée, la ligne n’existe pas (jamais « 0 »)', () => {
    const none = [{ ...signal('a'), category: 'nomination' as const }]
    render(<WatchOverviewStats signals={none} shownCount={1} narrowed={false} onOpenCategory={vi.fn()} />)
    expect(screen.queryByTestId('watch-stat-jobs')).not.toBeInTheDocument()
  })
})
