import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrgKnownMarker } from './OrgKnownMarker'

// #4072.1
describe('OrgKnownMarker', () => {
  it('dit la nature et la date : CRM, mission passée, ou les deux', () => {
    const { rerender } = render(<OrgKnownMarker known={{ reasons: ['crm'], lastDate: '2025-03-01' }} />)
    expect(screen.getByTestId('org-person-known').textContent).toMatch(/CRM/)
    expect(screen.getByTestId('org-person-known').textContent).toMatch(/2025/)
    rerender(<OrgKnownMarker known={{ reasons: ['mission'], lastDate: '2024-01-08' }} />)
    expect(screen.getByTestId('org-person-known').textContent).toMatch(/mission passée/)
    rerender(<OrgKnownMarker known={{ reasons: ['crm', 'mission'], lastDate: null }} />)
    const text = screen.getByTestId('org-person-known').textContent ?? ''
    expect(text).toMatch(/CRM/)
    expect(text).toMatch(/mission passée/)
    // Date inconnue : rien d'inventé, pas de parenthèses vides.
    expect(text).not.toMatch(/\(\s*\)/)
  })

  it('une absence ne fait aucune ligne', () => {
    const { container } = render(<OrgKnownMarker known={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('ne nomme jamais un fournisseur de données', () => {
    render(<OrgKnownMarker known={{ reasons: ['crm', 'mission'], lastDate: '2025-03-01' }} />)
    expect(screen.getByTestId('org-person-known').textContent).not.toMatch(
      /hubspot|salesforce|pipedrive|apollo|dataforge/i,
    )
  })
})
