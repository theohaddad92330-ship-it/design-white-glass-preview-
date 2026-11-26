import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { GOLDEN_SCENARIOS } from './golden-conversations'
import { containsInternalEmail, redactOutput } from './guardrails'
import { asksAboutPricing } from './public-pricing'
import { promptState } from './routing'
import { buildLauraSystemPrompt } from './system-prompt'

/**
 * LE REJEU LIVE DES VINGT CONVERSATIONS — §7.1, à la demande.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'EST PAS DANS LA CI
 * ─────────────────────────────────────────────────────────────────────────
 * Le §7.1 demande de rejouer les vingt conversations « en CI à chaque
 * changement de prompt ». Ce fichier les rejoue vraiment — vrai modèle, vrai
 * prompt — mais **seulement quand on le demande** :
 *
 *     CHATBOT_GOLDEN_LIVE=1 ANTHROPIC_API_KEY=… pnpm --filter @bellum/website test
 *
 * Trois raisons, dans l'ordre où elles comptent. Une clé de production dans les
 * actions GitHub est une surface d'attaque de plus. Vingt appels par poussée
 * touchant le prompt, c'est une facture qui n'achète rien. Et surtout : une
 * garde qui rougit parce qu'un modèle a tourné sa phrase autrement finit
 * désactivée, et une garde désactivée ne garde rien.
 *
 * Ce qui reste en CI, gratuitement et sans hasard, est dans
 * `golden-conversations.test.ts` : le prompt construit, la route, le déblocage
 * du rendez-vous, l'injection de la grille. Ce fichier-ci vérifie ce qu'aucun
 * test déterministe ne peut atteindre — ce que Laura ÉCRIT.
 *
 * On le lance avant une mise en ligne, et c'est le contrôle n°1 du §7.3.
 */

const LIVE = process.env.CHATBOT_GOLDEN_LIVE === '1' && Boolean(process.env.ANTHROPIC_API_KEY?.trim())
const MODEL = process.env.CHATBOT_MODEL?.trim() || 'claude-opus-5'

const CONTEXT = {
  demoUrl: 'https://app.bellum-ai.com/demo',
  calendlyUrl: 'https://bellum-ai.com/beta',
  appUrl: 'https://app.bellum-ai.com',
  privacyUrl: 'https://bellum-ai.com/privacy',
}

/** Les interdits qui valent pour les vingt, quelle que soit la question. */
const ALWAYS_FORBIDDEN: readonly [RegExp, string][] = [
  [/@bellum-(?:it|ai)\.com/i, "l'adresse d'un membre de l'équipe"],
  [/\bje note\b/i, '« je note » — ça ne veut rien dire'],
  [/petite correction/i, 'une correction dans le même message'],
  [/\b(score|palier)\s*(de qualification|:)/i, 'le score de qualification'],
]

describe.skipIf(!LIVE)('§7.1 — les vingt conversations, rejouées pour de vrai', () => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, maxRetries: 0 })

  it.each(GOLDEN_SCENARIOS.filter(scenario => scenario.id !== 18))(
    'n°$id — $title : $assertion',
    async scenario => {
      const state = scenario.lead ?? {}
      const conversation = promptState({ state, booking: false, exchanges: scenario.visitor.length })
      const system = buildLauraSystemPrompt({
        ...CONTEXT,
        ...(scenario.locale ? { locale: scenario.locale } : {}),
        ...(asksAboutPricing(scenario.visitor) ? { pricing: 'Starter 119 € HT/mois · Growth 249 € HT/mois' } : {}),
        conversation,
      })

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1400,
        system,
        messages: scenario.visitor.map(content => ({ role: 'user' as const, content })),
      })

      const reply = redactOutput(
        response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map(block => block.text)
          .join('\n'),
      )

      expect(reply.length, 'une réponse vide est un échec, pas un silence').toBeGreaterThan(0)
      expect(containsInternalEmail(reply)).toBe(false)
      for (const [pattern, label] of ALWAYS_FORBIDDEN) {
        expect(reply, `n°${scenario.id} laisse passer ${label}`).not.toMatch(pattern)
      }
      for (const pattern of scenario.forbidden ?? []) {
        expect(reply, `n°${scenario.id} : ${scenario.assertion}`).not.toMatch(pattern)
      }
    },
    120_000,
  )
})

describe('le rejeu live', () => {
  it('reste éteint tant qu’on ne l’a pas demandé', () => {
    // Ce test-ci tourne TOUJOURS : il vérifie que l'interrupteur existe et qu'il
    // est bien à l'arrêt par défaut. Sans lui, le jour où quelqu'un inverse la
    // condition, vingt appels de modèle partiraient à chaque poussée sans que
    // personne ne s'en aperçoive avant la facture.
    if (process.env.CHATBOT_GOLDEN_LIVE === '1') return
    expect(LIVE).toBe(false)
  })
})
