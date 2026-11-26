import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VoiceConversation } from './VoiceConversation'

/**
 * #3455 — « j'ai l'impression que la wave enregistre rien » : en écoute, l'écran
 * doit PROUVER que le micro tourne (chronomètre qui avance), jamais un point fixe.
 */
const conversation = vi.hoisted(() => ({
  phase: 'listening',
  elapsedMs: 4200,
  level: null as number | null,
  peak: null as number | null,
}))

vi.mock('./useVoiceAvailability', () => ({ useVoiceAvailability: () => true }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('./useVoiceConversation', () => ({
  useVoiceConversation: () => ({
    active: true,
    phase: conversation.phase,
    elapsedMs: conversation.elapsedMs,
    level: conversation.level,
    peak: conversation.peak,
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

describe('#3455 — la conversation vocale montre qu’elle enregistre', () => {
  it('en écoute, le chronomètre du micro est affiché', () => {
    conversation.phase = 'listening'
    render(<VoiceConversation {...props} />)
    expect(screen.getByTestId('voice-conversation-clock')).toHaveTextContent('0:04')
  })

  it('hors écoute (transcription), aucun chronomètre figé', () => {
    conversation.phase = 'transcribing'
    render(<VoiceConversation {...props} />)
    expect(screen.queryByTestId('voice-conversation-clock')).not.toBeInTheDocument()
  })

  it('#3455 — le niveau du micro se lit : la jauge bouge avec la voix', () => {
    conversation.phase = 'listening'
    conversation.level = 0.5
    conversation.peak = 0.5
    render(<VoiceConversation {...props} />)
    const meter = screen.getByRole('meter')
    expect(Number(meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    expect(screen.queryByTestId('voice-level-silent')).not.toBeInTheDocument()
  })

  it('#3455 — niveau non mesuré (pas de Web Audio) : AUCUNE jauge, jamais une jauge à 0', () => {
    conversation.phase = 'listening'
    conversation.level = null
    conversation.peak = null
    render(<VoiceConversation {...props} />)
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByTestId('voice-level-silent')).not.toBeInTheDocument()
  })

  it('#3455 — 4 s sans le moindre son : l’écran DIT que le micro ne capte rien', () => {
    conversation.phase = 'listening'
    conversation.elapsedMs = 4200
    conversation.level = 0
    conversation.peak = 0
    render(<VoiceConversation {...props} />)
    expect(screen.getByTestId('voice-level-silent')).toBeInTheDocument()
  })

  it('#3455 — un pic de voix passé suffit : plus d’avertissement de silence', () => {
    conversation.phase = 'listening'
    conversation.elapsedMs = 9000
    conversation.level = 0
    conversation.peak = 0.4
    render(<VoiceConversation {...props} />)
    expect(screen.queryByTestId('voice-level-silent')).not.toBeInTheDocument()
  })
})
