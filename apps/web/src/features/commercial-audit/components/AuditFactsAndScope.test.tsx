import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuditFactsAndScope } from './AuditFactsAndScope'

/**
 * #2061.2 / #2061.3 — réouverture du 24/09/2026.
 *
 * Ces tests disent NON à un bloc qui redeviendrait `null` en dur sans le
 * NOMMER, et à un fait rendu qui ne viendrait pas du profil réel.
 */
describe('AuditFactsAndScope — #2061.2 / #2061.3', () => {
  it('NOMME l’absence quand le périmètre n’est pas établi', () => {
    render(<AuditFactsAndScope scope={null} facts={null} />)
    expect(screen.getByText(/périmètre n’a pas encore été établi/)).toBeInTheDocument()
    expect(screen.queryByTestId('audit-scope-value')).not.toBeInTheDocument()
  })

  it('rend le périmètre établi tel quel', () => {
    render(<AuditFactsAndScope scope="Cible : comptes eti, décideurs manager, entrée bottomUp" facts={null} />)
    expect(screen.getByTestId('audit-scope-value')).toHaveTextContent('Cible : comptes eti, décideurs manager')
  })

  it('NOMME l’absence quand aucun fait n’a pu être établi (`null`, source manquante)', () => {
    render(<AuditFactsAndScope scope={null} facts={null} />)
    expect(screen.getByText(/Aucun fait n’a encore pu être établi/)).toBeInTheDocument()
    expect(screen.queryByTestId('audit-facts-list')).not.toBeInTheDocument()
  })

  it('distingue `null` (source manquante) de `[]` (mesuré, vide) — jamais la même phrase', () => {
    render(<AuditFactsAndScope scope={null} facts={[]} />)
    expect(screen.getByText(/aucun fait n’en ressort encore/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucun fait n’a encore pu être établi/)).not.toBeInTheDocument()
  })

  it('rend chaque fait ÉTABLI, avec sa confiance', () => {
    render(
      <AuditFactsAndScope
        scope={null}
        facts={[
          { statement: 'Taille de compte visée : eti', provenance: null, confidence: 'single_source' },
          { statement: 'Type d’ESN déclaré : boutiqueExpert', provenance: null, confidence: 'single_source' },
        ]}
      />,
    )
    expect(screen.getByTestId('audit-facts-list')).toBeInTheDocument()
    expect(screen.getByText('Taille de compte visée : eti')).toBeInTheDocument()
    expect(screen.getByText('Type d’ESN déclaré : boutiqueExpert')).toBeInTheDocument()
  })
})
