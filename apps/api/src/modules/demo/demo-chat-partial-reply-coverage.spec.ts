import { DEMO_CHAT_PARTIAL_REPLY_COVERAGE } from './demo-coverage'

/**
 * #2840 (#2441.13) — « et un tour arrêté avant la fin, la démonstration le
 * montre comment ? »
 *
 * Jamais, et c'est une réponse ÉCRITE, pas un oubli : le moteur de
 * démonstration du copilote (`demo-turn.ts`) ne parle jamais au réseau, donc
 * ne peut jamais essuyer le plafond de temps ni la panne qui posent
 * `context.partial`.
 *
 * ⚠️ La moitié « ça ne peut pas exister » vit côté web
 * (`apps/web/src/features/chat/api/demo-turn.network.test.ts`) : elle garde en
 * SOURCE qu'aucun appel réseau ne traverse le moteur de démonstration — elle ne
 * peut pas vivre ici, `demo-turn.ts` est un module du navigateur.
 */
describe('#2840 — le mode dégradé annoncé, en démonstration', () => {
  it('est classé vide à dessein, avec sa raison', () => {
    expect(DEMO_CHAT_PARTIAL_REPLY_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_CHAT_PARTIAL_REPLY_COVERAGE.reason).toContain('#2840')
  })

  it('la raison NOMME ce qui empêche structurellement un partiel en démo', () => {
    // Une raison qui ne citerait pas le mécanisme serait une opinion.
    expect(DEMO_CHAT_PARTIAL_REPLY_COVERAGE.reason).toContain('_partial_response')
    expect(DEMO_CHAT_PARTIAL_REPLY_COVERAGE.reason).toContain('demo-turn.ts')
  })
})
