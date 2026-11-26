import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissCollaborationPrompt, isCollaborationPromptDismissed } from './collaboration-prompt-dismissal'

const WORKSPACE_A = '11111111-1111-4111-8111-111111111111'
const WORKSPACE_B = '22222222-2222-4222-8222-222222222222'

/**
 * #2081.11 — « Permettre de REPORTER » : le report d'un espace ne doit ni
 * s'appliquer à un autre espace (garde GA-43, le cloisonnement vaut aussi
 * pour ce geste) ni planter quand `localStorage` est bloqué.
 */
describe('collaboration-prompt-dismissal — #2081.11', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('non reporté par défaut', () => {
    expect(isCollaborationPromptDismissed(WORKSPACE_A)).toBe(false)
  })

  it('reporté sur cet espace après dismissCollaborationPrompt', () => {
    dismissCollaborationPrompt(WORKSPACE_A)
    expect(isCollaborationPromptDismissed(WORKSPACE_A)).toBe(true)
  })

  it('le report d’un espace ne traverse jamais vers un autre espace', () => {
    dismissCollaborationPrompt(WORKSPACE_A)
    expect(isCollaborationPromptDismissed(WORKSPACE_B)).toBe(false)
  })

  it('un localStorage qui lève ne fait jamais planter la lecture — rend false', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(isCollaborationPromptDismissed(WORKSPACE_A)).toBe(false)
    spy.mockRestore()
  })

  it('un localStorage qui lève ne fait jamais planter l’écriture', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => dismissCollaborationPrompt(WORKSPACE_A)).not.toThrow()
    spy.mockRestore()
  })
})
