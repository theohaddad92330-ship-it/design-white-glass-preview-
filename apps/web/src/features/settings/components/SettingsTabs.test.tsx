import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SettingsTabs } from './SettingsTabs'

const TABS = [
  { key: 'a', label: 'Premier', content: <p>Contenu A</p> },
  { key: 'b', label: 'Second', content: <p>Contenu B</p> },
] as const

/** Les onglets d'une page de Réglages : l'onglet actif vit dans l'adresse, le composant ne garde aucun état. */
describe('SettingsTabs', () => {
  it('ne monte que le contenu de l’onglet actif, et nomme sa barre', () => {
    render(<SettingsTabs label="Sections" tabs={TABS} value="a" onValueChange={vi.fn()} />)
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Premier', selected: true })).toBeInTheDocument()
    expect(screen.getByText('Contenu A')).toBeInTheDocument()
    expect(screen.queryByText('Contenu B')).not.toBeInTheDocument()
  })

  it('un clic demande l’onglet par sa clé — l’appelant (l’adresse) décide', async () => {
    const onValueChange = vi.fn()
    render(<SettingsTabs label="Sections" tabs={TABS} value="a" onValueChange={onValueChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Second' }))
    expect(onValueChange).toHaveBeenCalledWith('b')
  })

  it('#4605.6 — chaque onglet est une cible de 44 px au moins, à la souris comme au doigt (GA-35)', () => {
    render(<SettingsTabs label="Sections" tabs={TABS} value="a" onValueChange={vi.fn()} />)
    for (const tab of screen.getAllByRole('tab')) {
      const classes = tab.className.split(/\s+/)
      expect(classes, `${tab.textContent} : min-h-11 sans préfixe de pointeur`).toContain('min-h-11')
    }
  })
})
