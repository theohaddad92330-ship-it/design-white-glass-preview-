import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SourceBadge } from './ReplyCard'

// Théo B l1-laura — la source d'un fait cité porte son LIEN, visible sur la carte, sans ouvrir de détail.
describe('SourceBadge — le lien vers la page d’origine', () => {
  it('avec une URL https : un lien nommé, nouvel onglet, noopener, cible ≥ 44 px', () => {
    render(<SourceBadge source={{ label: 'Site carrière', as_of: '2026-10-14', url: 'https://www.sg.fr/carrieres' }} />)
    const link = screen.getByRole('link', { name: 'Ouvrir la source : Site carrière' })
    expect(link).toHaveAttribute('href', 'https://www.sg.fr/carrieres')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
    expect(link.className).toContain('min-h-11')
  })

  it('sait dire NON : un lien qui n’est pas https n’est jamais rendu en lien', () => {
    render(<SourceBadge source={{ label: 'Site carrière', url: 'javascript:alert(1)' }} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/Site carrière/)).toBeInTheDocument()
  })

  it('sans URL : le badge d’avant, sans lien ni ligne en plus', () => {
    render(<SourceBadge source={{ label: 'Registre public', as_of: '2026-07-03' }} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/Registre public/)).toBeInTheDocument()
  })
})
