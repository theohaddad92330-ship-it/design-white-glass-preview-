import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ImportsOverview } from './ImportsOverview'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

describe('Théo D settings-outils.R1 / N2 — la page Imports en trois blocs', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('le titre et la promesse : prévisualiser et rapprocher avant de créer', () => {
    render(<ImportsOverview />)
    expect(screen.getByRole('heading', { level: 1, name: 'Imports' })).toBeInTheDocument()
    expect(screen.getByText('Prévisualiser et rapprocher avant de créer.')).toBeInTheDocument()
  })

  it('« Depuis un outil connecté » mène aux connecteurs (jamais un second import)', () => {
    render(<ImportsOverview />)
    expect(screen.getByRole('link', { name: 'Ouvrir les connecteurs' })).toHaveAttribute('href', '/integrations')
  })

  it('« Exporter le vivier » est une porte vers l’export existant', () => {
    render(<ImportsOverview />)
    expect(screen.getByRole('link', { name: 'Préparer l’export' })).toHaveAttribute('href', '/settings/mes-donnees')
  })

  it('« Ce qui sera vérifié » : correspondance des champs, doublons et corrections, historique', () => {
    render(<ImportsOverview />)
    expect(screen.getByText('Correspondance des champs')).toBeInTheDocument()
    expect(screen.getByText('Doublons et corrections')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir le journal' })).toHaveAttribute('href', '#import-history')
    expect(screen.getByText(/n’est pas une synchronisation permanente/)).toBeInTheDocument()
  })

  it('le bloc vivier pointe l’assistant de reprise qui suit', () => {
    render(<ImportsOverview />)
    expect(screen.getByRole('link', { name: 'Importer dans le vivier' })).toHaveAttribute('href', '#import-launcher')
  })
})
