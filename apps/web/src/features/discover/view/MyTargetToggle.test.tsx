import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MyTargetToggle } from './MyTargetToggle'

afterEach(cleanup)

/**
 * #4530.10 — le bouton « Ma cible » se lit en clair comme en sombre (jetons seulement, aucune couleur écrite en dur)
 * et se touche au doigt : cible d'au moins 44 px (`min-h-11`). Le contraste des jetons est mesuré dans
 * `styles/contrast.test.ts`, les deux thèmes.
 */
describe('MyTargetToggle — #4530.10', () => {
  it('dit son état avec aria-pressed et appelle onToggle au clic', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<MyTargetToggle pressed={false} disabled={false} onToggle={onToggle} />)
    const button = screen.getByRole('button', { name: /^ma cible$/i })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(<MyTargetToggle pressed disabled={false} onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: /^ma cible$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('cible tactile d’au moins 44 px (min-h-11), les deux états', () => {
    for (const pressed of [false, true]) {
      const { unmount } = render(<MyTargetToggle pressed={pressed} disabled={false} onToggle={() => {}} />)
      expect(screen.getByTestId('discover-my-target').className).toContain('min-h-11')
      unmount()
    }
  })

  it('SAIT DIRE NON — aucune couleur hexadécimale ni jeton de thème figé dans le composant', () => {
    // Les commentaires citent des issues (`#4530.1`) : on ne lit que le code.
    const source = readFileSync(join(__dirname, 'MyTargetToggle.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toMatch(/\b(?:bg|text|border)-(?:white|black)\b/)
  })

  it('désactivé le temps que le profil se lit : un clic ne fait rien', () => {
    const onToggle = vi.fn()
    render(<MyTargetToggle pressed={false} disabled onToggle={onToggle} />)
    fireEvent.click(screen.getByTestId('discover-my-target'))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
