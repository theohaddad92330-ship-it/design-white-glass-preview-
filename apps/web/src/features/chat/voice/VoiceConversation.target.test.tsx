import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VoiceConversation } from './VoiceConversation'

/**
 * #4536.4 — la cible du bouton « conversation vocale » reste ≥ 44 px (GA-35) : le bouton retiré (🔁) a quitté la
 * zone de saisie, celui-ci garde son plancher. La LARGEUR RÉELLE à 390 px se mesure sur un appareil (recette), pas ici.
 * #4536.5 — démonstration : aucun bouton vocal (la disponibilité vaut `false`, le composant ne rend rien).
 */
const availability = vi.hoisted(() => ({ available: true }))
vi.mock('./useVoiceAvailability', () => ({ useVoiceAvailability: () => availability.available }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => !availability.available }))
vi.mock('./useVoiceConversation', () => ({
  useVoiceConversation: () => ({
    active: false,
    phase: 'idle',
    elapsedMs: 0,
    level: null,
    peak: null,
    start: vi.fn(),
    stop: vi.fn(),
    interrupt: vi.fn(),
  }),
}))

const props = {
  conversationKey: 'c1',
  sending: false,
  lastAssistantText: null,
  lastTurnFailed: false,
  onSend: vi.fn(),
  onUncertain: vi.fn(),
}

describe('VoiceConversation — cible tactile et démonstration', () => {
  beforeEach(() => {
    availability.available = true
  })

  it('#4536.4 — le bouton de départ porte min-h-11 et min-w-11', () => {
    render(<VoiceConversation {...props} />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('min-h-11')
    expect(button.className).toContain('min-w-11')
  })

  it('#4536.5 — en démonstration (capacité fausse) : aucun bouton vocal', () => {
    availability.available = false
    render(<VoiceConversation {...props} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
