import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EntityHypothesisNotice } from './EntityHypothesisNotice'

afterEach(cleanup)

describe('EntityHypothesisNotice', () => {
  it('affiche le titre « hypothèse » et le message complet', () => {
    render(
      <EntityHypothesisNotice
        data={{
          message:
            'SIREN 552120222 (SOCIETE GENERALE) retenu parmi 3 homonymes (confiance 82%, écart de score décisif vs 2ᵉ à 41%).',
        }}
      />,
    )
    expect(screen.getByText(/Hypothèse retenue/i)).toBeInTheDocument()
    expect(screen.getByText(/SIREN 552120222/)).toBeInTheDocument()
  })
})
