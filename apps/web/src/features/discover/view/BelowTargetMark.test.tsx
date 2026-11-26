import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BelowTargetMark } from './BelowTargetMark'

// #5006 — la marque DIT sa raison ; un effectif inconnu n'affiche rien (on ne devine pas).
describe('BelowTargetMark (#5006)', () => {
  it('« 10 à 19 salariés » : badge « hors cible » avec la raison', () => {
    render(<BelowTargetMark candidate={{ headcountRange: '10 à 19 salariés' }} />)
    expect(screen.getByTestId('candidate-below-target')).toHaveTextContent(/hors cible.*moins de 20 salariés/i)
  })
  it.each([null, '50 à 99 salariés', '0 salarié'])('« %s » : aucun badge', headcountRange => {
    render(<BelowTargetMark candidate={{ headcountRange }} />)
    expect(screen.queryByTestId('candidate-below-target')).toBeNull()
  })
})
