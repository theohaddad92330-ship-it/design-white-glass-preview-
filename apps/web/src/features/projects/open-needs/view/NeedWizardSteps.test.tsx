import { act, cleanup, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { NeedWizardSteps } from './NeedWizardSteps'

/**
 * #4339 — « Créer un besoin » : les libellés des 5 étapes étaient tronqués (« Ty… », « Inf… », « D… »).
 * Un libellé d'étape est lu en entier : il passe à la ligne, il ne se coupe pas — et sous `md`, l'étape courante
 * garde son libellé pendant que les autres se réduisent à leur numéro (leur nom reste lisible par un lecteur d'écran).
 */
describe('NeedWizardSteps', () => {
  beforeEach(async () => {
    cleanup()
    await act(async () => {
      await i18n.changeLanguage('fr')
    })
  })

  it('porte les cinq libellés en entier, sans troncature', () => {
    render(<NeedWizardSteps current={2} />)
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    for (const item of items) expect(item.innerHTML).not.toMatch(/\btruncate\b/)
    expect(screen.getByText('Informations clés')).toBeInTheDocument()
  })

  it('l’étape courante garde son libellé visible en mobile ; les autres ne se réduisent qu’à leur numéro', () => {
    render(<NeedWizardSteps current={2} />)
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    const current = items.find(item => item.getAttribute('aria-current') === 'true')
    expect(current).toBeDefined()
    expect(current?.innerHTML).not.toMatch(/max-md:sr-only/)
    const others = items.filter(item => item !== current)
    expect(others).toHaveLength(4)
    for (const item of others) expect(item.innerHTML).toMatch(/max-md:sr-only/)
    // sait dire NON : le libellé complet reste dans le DOM (nommé pour un lecteur d'écran, titre au survol)
    for (const item of others) expect(item.getAttribute('title')).toMatch(/^\d · .{3,}/)
  })
})
