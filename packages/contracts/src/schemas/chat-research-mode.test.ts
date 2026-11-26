import { describe, expect, it } from 'vitest'
import { CHAT_RESEARCH_MODES, DEFAULT_CHAT_RESEARCH_MODE, chatResearchModeSchema } from './chat-research-mode.js'

/**
 * #2450.1 (reste partiel, épopée #2882) — les quatre modes de recherche
 * canoniques d'un tour de chat. Le service IA (`chat_model_routing.py`,
 * `RequestedMode`) en est le miroir — même ordre, mêmes quatre valeurs.
 */
describe('#2450.1 — modes de recherche canoniques', () => {
  it('quatre modes, « auto » par défaut', () => {
    expect(CHAT_RESEARCH_MODES).toEqual(['auto', 'rapide', 'verifie', 'approfondi'])
    expect(DEFAULT_CHAT_RESEARCH_MODE).toBe('auto')
  })

  it('le schéma accepte les quatre modes canoniques', () => {
    for (const mode of CHAT_RESEARCH_MODES) expect(chatResearchModeSchema.safeParse(mode).success).toBe(true)
  })

  it('le schéma refuse un mode inconnu (jamais un mode deviné)', () => {
    expect(chatResearchModeSchema.safeParse('rapides').success).toBe(false)
    expect(chatResearchModeSchema.safeParse('').success).toBe(false)
    expect(chatResearchModeSchema.safeParse(null).success).toBe(false)
  })
})
