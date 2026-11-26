import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SettingsBlock, SettingsPageHeader, SettingsRows } from './SettingsBlocks'

describe('SettingsBlocks — la grammaire des Réglages de l’espace', () => {
  it('l’en-tête de page porte UN h1, l’eyebrow et la phrase', () => {
    render(<SettingsPageHeader eyebrow="Paramètres · Espace" title="Règles métier" description="Quelques règles." />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Règles métier' })).toBeInTheDocument()
    expect(screen.getByText('Paramètres · Espace')).toBeInTheDocument()
  })

  it('un bloc a un h2, sa phrase, son action et son contenu — jamais un second h1', () => {
    render(
      <SettingsBlock title="Charge" description="Des repères." action={<button type="button">Ajouter</button>}>
        <p>contenu</p>
      </SettingsBlock>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Charge' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
    expect(screen.getByText('contenu')).toBeInTheDocument()
  })

  it('sans titre, le bloc ne montre aucun en-tête vide', () => {
    render(
      <SettingsBlock>
        <p>seul</p>
      </SettingsBlock>,
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('un groupe de rangées est nommé ; avec une phrase il montre son h3', () => {
    render(
      <SettingsRows label="Visibilité" description="Qui voit quoi.">
        <p>rangée</p>
      </SettingsRows>,
    )
    expect(screen.getByRole('group', { name: 'Visibilité' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Visibilité' })).toBeInTheDocument()
  })
})
