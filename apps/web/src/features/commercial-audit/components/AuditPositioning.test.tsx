import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuditPositioning } from './AuditPositioning'

/**
 * #2061.7 / #2061.8 — réouverture du 24/09/2026.
 *
 * Ce test dit NON à la récidive explicitement refusée en #2072.1-.3 :
 * `messaging.avoid`/`differentiationPoints` rendus sous « Contraintes »/
 * « Atouts » (voir le docblock d'`AuditPositioning.tsx`).
 */
describe('AuditPositioning — #2061.7 / #2061.8', () => {
  it('NOMME l’absence des deux colonnes quand rien n’est établi', () => {
    render(<AuditPositioning assets={null} constraints={null} />)
    expect(screen.getByText(/Aucun atout n’a encore été établi/)).toBeInTheDocument()
    expect(screen.getByText(/Aucune contrainte n’a encore été établie/)).toBeInTheDocument()
  })

  it('rend les atouts NOMMÉS, jamais une puce identique à celles de « Garder »', () => {
    render(
      <AuditPositioning
        assets={[
          {
            label: 'Vivier de consultants',
            detail: '12 au total, dont 3 disponibles maintenant',
            provenance: null,
            confidence: 'single_source',
          },
        ]}
        constraints={null}
      />,
    )
    expect(screen.getByTestId('audit-assets')).toBeInTheDocument()
    expect(screen.getByText('Vivier de consultants')).toBeInTheDocument()
    expect(screen.getByText('12 au total, dont 3 disponibles maintenant')).toBeInTheDocument()
    // #2072.1-.3 — jamais un point de différenciation rendu ici.
    expect(screen.queryByText('Crédibilité technique')).not.toBeInTheDocument()
  })

  it('rend les contraintes NOMMÉES, jamais une puce identique à celles d’« Arrêter »', () => {
    render(
      <AuditPositioning
        assets={null}
        constraints={[
          {
            label: "Cadence recommandée — plafond d'activité",
            detail: '3 analyses/semaine · 5 messages/jour · 4 relances/semaine',
            provenance: null,
            confidence: 'single_source',
          },
        ]}
      />,
    )
    expect(screen.getByTestId('audit-constraints')).toBeInTheDocument()
    expect(screen.getByText("Cadence recommandée — plafond d'activité")).toBeInTheDocument()
    // #2072.1-.3 — jamais un point d'évitement rendu ici.
    expect(screen.queryByText('Ouvrir dix fronts sans responsable')).not.toBeInTheDocument()
  })
})
