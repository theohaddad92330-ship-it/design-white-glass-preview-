import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./NeedsMatchRail', () => ({ NeedsMatchRail: () => <div data-testid="rail" /> }))
vi.mock('./ConsultantMatchPanel', () => ({ ConsultantMatchPanel: () => <div data-testid="panel" /> }))
const { ConsultantMatchSection } = await import('./ConsultantMatchSection')

// #4433.8 — jamais deux panneaux de matching empilés.
describe('ConsultantMatchSection (#4433.8)', () => {
  it('sans besoin choisi : le rail propose, au-dessus du panneau', () => {
    render(<ConsultantMatchSection selectedId={null} onSelect={() => undefined} />)
    expect(screen.getByTestId('rail')).toBeInTheDocument()
    expect(screen.getByTestId('panel')).toBeInTheDocument()
  })

  it('avec un besoin choisi : le panneau du besoin reste SEUL', () => {
    render(<ConsultantMatchSection selectedId="need-1" onSelect={() => undefined} />)
    expect(screen.queryByTestId('rail')).not.toBeInTheDocument()
    expect(screen.getByTestId('panel')).toBeInTheDocument()
  })
})
