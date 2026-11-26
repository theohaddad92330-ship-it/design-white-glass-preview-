import { deriveChatTurnCostUsd, extractChatTier } from './chat-turn-cost'

/**
 * #2448.8 / #2882.11 (épopée #2882) — logique PURE de ce que `chat()` écrit
 * dans `chat_turn_cost_samples` : le palier RÉELLEMENT choisi (déjà calculé
 * par le service IA, jamais recalculé ici) et le coût du tour dérivé du MÊME
 * registre que `ProviderCostService` (jamais une seconde lecture du header).
 */
describe('extractChatTier', () => {
  it('lit context.mode_explanation.tier quand il est un palier connu', () => {
    expect(extractChatTier({ context: { mode_explanation: { tier: 'deep' } } })).toBe('deep')
    expect(extractChatTier({ context: { mode_explanation: { tier: 'fast' } } })).toBe('fast')
  })

  it('rend null sans mode_explanation, sans context, ou sans data', () => {
    expect(extractChatTier({ context: {} })).toBeNull()
    expect(extractChatTier({})).toBeNull()
    expect(extractChatTier(undefined)).toBeNull()
  })

  it('rend null sur une valeur de palier inconnue — jamais devinée', () => {
    expect(extractChatTier({ context: { mode_explanation: { tier: 'ultra' } } })).toBeNull()
  })
})

describe('deriveChatTurnCostUsd', () => {
  it('rend 0 (vrai zéro) quand aucun fournisseur n’a été appelé ce tour', () => {
    expect(deriveChatTurnCostUsd([])).toBe(0)
  })

  it('additionne les lignes TARIFÉES seulement', () => {
    expect(deriveChatTurnCostUsd([{ cost_usd: 0.02 }, { cost_usd: null }, { cost_usd: 0.04 }])).toBe(0.06)
  })

  it('rend null quand des fournisseurs ont été appelés mais AUCUN n’est tarifé — jamais 0', () => {
    expect(deriveChatTurnCostUsd([{ cost_usd: null }, { cost_usd: null }])).toBeNull()
  })
})
