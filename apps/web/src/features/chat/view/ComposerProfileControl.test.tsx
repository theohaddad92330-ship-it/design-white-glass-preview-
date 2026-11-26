import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contextModeFor, useContextModeStore } from '@/features/work-contexts/contextModeStore'

vi.mock('@/features/work-contexts/useWorkspaceDefaultContextMode', () => ({
  useWorkspaceDefaultContextMode: () => undefined,
}))

const { ComposerProfileControl } = await import('./ComposerProfileControl')

function modeOf(conversationId: string) {
  const { modes, workspaceDefaultMode } = useContextModeStore.getState()
  return contextModeFor(modes, conversationId, workspaceDefaultMode)
}

/**
 * #5048 — arbitrage Louis 01/11/2026 (revient sur #5048 : menu à 3 choix) : « Mon profil » est un
 * INTERRUPTEUR binaire Mon activité ↔ Neutre. Il lit et écrit le même `contextModeStore` que
 * le reste ; « Mission ponctuelle » ne se règle que dans le panneau de portée.
 */
describe('ComposerProfileControl — interrupteur #5048', () => {
  beforeEach(() => {
    useContextModeStore.setState({ modes: {}, workspaceDefaultMode: 'my_activity' })
  })

  it('est un interrupteur nommé, allumé sur Mon activité', () => {
    render(<ComposerProfileControl conversationId="conv-1" />)
    const sw = screen.getByRole('switch', { name: /Mon profil/ })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(sw).toHaveTextContent('Mon activité')
  })

  it('l’éteindre écrit Neutre pour le FIL, le rallumer revient à Mon activité', () => {
    render(<ComposerProfileControl conversationId="conv-1" />)
    fireEvent.click(screen.getByRole('switch', { name: /Mon profil/ }))
    expect(modeOf('conv-1')).toBe('neutral')
    expect(modeOf('conv-2')).toBe('my_activity')
    const sw = screen.getByRole('switch', { name: /Mon profil/ })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw).toHaveTextContent('Neutre')
    fireEvent.click(sw)
    expect(modeOf('conv-1')).toBe('my_activity')
  })

  it('en Mission ponctuelle : éteint, le NOMME, et le basculer passe à Mon activité', () => {
    useContextModeStore.setState({ modes: { 'conv-1': 'one_off_mission' } })
    render(<ComposerProfileControl conversationId="conv-1" />)
    const sw = screen.getByRole('switch', { name: /Mon profil/ })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw).toHaveTextContent('Mission ponctuelle')
    fireEvent.click(sw)
    expect(modeOf('conv-1')).toBe('my_activity')
  })

  it('cible ≥ 44 px, jamais un menu à 3 choix', () => {
    render(<ComposerProfileControl conversationId="conv-1" />)
    expect(screen.getByRole('switch')).toHaveClass('min-h-11')
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('sans fil créé, le réglage est désactivé plutôt que sans effet', () => {
    render(<ComposerProfileControl conversationId={null} />)
    expect(screen.getByRole('switch', { name: /Mon profil/ })).toBeDisabled()
  })
})
