import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { i18n } from '@/i18n'
import { ContactSignals } from './ContactSignals'

// Théo B c5 — « SOURCES CLIQUABLES, VISIBLES DIRECTEMENT » : le lien est sur la ligne, sans ouvrir de détail.
describe('ContactSignals — source visible sur la ligne', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('un signal avec URL porte un lien nommé par le site, en nouvel onglet sécurisé', () => {
    render(
      <ContactSignals
        signals={[
          { label: 'Nommé DSI du groupe', source_url: 'https://www.lemondeinformatique.fr/a?x=1', date: '2026-10-10' },
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: 'Ouvrir la source : lemondeinformatique.fr' })
    expect(link).toHaveAttribute('href', 'https://www.lemondeinformatique.fr/a?x=1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
    expect(link.className).toContain('min-h-11')
  })

  it('un signal sans URL n’a aucun lien (jamais inventé)', () => {
    render(<ContactSignals signals={[{ label: 'Prise de parole', source: 'Presse' }]} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('une URL qui n’est pas http(s) ne fait pas de lien', () => {
    render(<ContactSignals signals={[{ label: 'x', source_url: 'javascript:alert(1)' }]} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
