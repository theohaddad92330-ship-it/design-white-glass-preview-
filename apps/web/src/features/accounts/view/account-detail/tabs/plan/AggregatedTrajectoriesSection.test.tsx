import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AggregatedTrajectoriesSection } from './AggregatedTrajectoriesSection'
import type { TrajectoryDestination } from './planViewData'

const destinations: TrajectoryDestination[] = [
  { company: 'Sopra Steria', persons: 5 },
  { company: 'Atos', persons: 3 },
]

describe('AggregatedTrajectoriesSection (#1611.6)', () => {
  it('nomme les destinations et leur comptage, zéro identité individuelle', () => {
    render(<AggregatedTrajectoriesSection destinations={destinations} />)

    expect(screen.getByText('Ce que Bellum observe dans les trajectoires')).toBeInTheDocument()
    expect(screen.getByText('Sopra Steria')).toBeInTheDocument()
    expect(screen.getByText('Atos')).toBeInTheDocument()
    expect(screen.getByText('5 personnes')).toBeInTheDocument()
    expect(screen.getByText('3 personnes')).toBeInTheDocument()
  })

  it('renders nothing when there is no destination above the threshold', () => {
    const { container } = render(<AggregatedTrajectoriesSection destinations={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
