/**
 * #3455 — « la wave enregistre rien » : la jauge de niveau du micro, partagée
 * par la conversation vocale ET la dictée (même preuve, un seul composant).
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VoiceLevelMeter } from './VoiceLevelMeter'

describe('VoiceLevelMeter', () => {
  it('niveau mesuré : une jauge nommée, à la valeur du niveau', () => {
    render(<VoiceLevelMeter level={0.1} peak={0.1} elapsedMs={500} />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveAttribute('aria-valuenow', '40')
    expect(meter).toHaveAccessibleName()
  })

  it('niveau non mesuré (pas de Web Audio) : AUCUNE jauge — jamais une jauge à 0', () => {
    render(<VoiceLevelMeter level={null} peak={null} elapsedMs={9000} />)
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByTestId('voice-level-silent')).not.toBeInTheDocument()
  })

  it('rien au-dessus du bruit de fond après quelques secondes : l’écran le dit', () => {
    render(<VoiceLevelMeter level={0} peak={0} elapsedMs={4000} />)
    expect(screen.getByTestId('voice-level-silent')).toBeInTheDocument()
  })

  it('le test qui dit NON : un pic récent, ou moins de trois secondes, ne déclenche pas « aucun son »', () => {
    const { rerender } = render(<VoiceLevelMeter level={0} peak={0} elapsedMs={1000} />)
    expect(screen.queryByTestId('voice-level-silent')).not.toBeInTheDocument()
    rerender(<VoiceLevelMeter level={0} peak={0.2} elapsedMs={9000} />)
    expect(screen.queryByTestId('voice-level-silent')).not.toBeInTheDocument()
  })
})
