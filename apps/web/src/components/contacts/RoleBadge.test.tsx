import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { RoleBadge } from './RoleBadge'

// Recette 13/10/2026 — « Inconnu » répété sur presque toutes les personnes d'une liste : doctrine « on n'affiche
// pas ce qu'on n'a pas ». Un rôle inconnu ne fait AUCUNE pastille.
describe('RoleBadge', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('un rôle connu se nomme', () => {
    render(<RoleBadge role="champion" />)
    expect(screen.getByText('Champion')).toBeInTheDocument()
  })

  // Recette 13/10/2026 — « Décideur Éc… » coupé dans la colonne Rôle : la pastille passe à la ligne, jamais coupée.
  it('la pastille porte son libellé complet et n’est jamais coupée sans moyen de le lire', () => {
    render(<RoleBadge role="champion" />)
    const badge = screen.getByText('Champion')
    expect(badge).toHaveTextContent('Champion')
    const truncated = badge.className.split(/\s+/).includes('truncate')
    expect(truncated && badge.getAttribute('title') !== 'Champion').toBe(false)
    expect(badge.className).toContain('whitespace-normal')
    expect(badge.className).toContain('break-words')
  })

  it.each(['unknown', '-', ''])('un rôle absent (%j) ne fait aucune pastille', role => {
    const { container } = render(<RoleBadge role={role} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Inconnu')).not.toBeInTheDocument()
  })
})
