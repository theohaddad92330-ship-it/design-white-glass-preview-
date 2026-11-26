import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuditWeeklyPriority } from './AuditWeeklyPriority'

describe('AuditWeeklyPriority — #2090.31', () => {
  it('nomme honnêtement l’absence de priorité', () => {
    render(<AuditWeeklyPriority priority={null} />)
    expect(screen.getByText(/Aucune priorité ne peut être nommée/)).toBeInTheDocument()
  })

  it('rend l’action et sa confiance quand la priorité vient d’une rupture', () => {
    render(
      <AuditWeeklyPriority
        priority={{
          action: 'Combien de secteurs comptes-tu vraiment travailler ce trimestre ?',
          ruleId: 'tooManySimultaneousMarkets',
          confidence: 'deduced',
        }}
      />,
    )
    expect(screen.getByText('Combien de secteurs comptes-tu vraiment travailler ce trimestre ?')).toBeInTheDocument()
    expect(screen.getByText('Déduit')).toBeInTheDocument()
  })
})
