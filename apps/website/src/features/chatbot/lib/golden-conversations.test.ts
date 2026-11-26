import { describe, expect, it } from 'vitest'
import { GOLDEN_SCENARIOS } from './golden-conversations'
import { inspectInput } from './guardrails'
import { asksAboutPricing } from './public-pricing'
import { bookingVerdict, nextQuestion, promptState } from './routing'
import { buildLauraSystemPrompt } from './system-prompt'

/**
 * Les vingt conversations du §7.1 — leur moitié DÉTERMINISTE.
 *
 * Chaque scénario est rejoué contre le code qui décide : la grille tarifaire
 * entre-t-elle dans le contexte, le lien de rendez-vous est-il débloqué, reste-
 * t-il une question à poser, le prompt construit dit-il la bonne chose. Aucun
 * appel de modèle, donc aucune raison de désactiver ces tests un jour de CI
 * lente.
 *
 * La moitié qui dépend de la rédaction vit dans `golden-live.test.ts`.
 */

const CONTEXT = {
  demoUrl: 'https://app.bellum-ai.com/demo',
  calendlyUrl: 'https://bellum-ai.com/beta',
  appUrl: 'https://app.bellum-ai.com',
  privacyUrl: 'https://bellum-ai.com/privacy',
}

/** L'intention « je veux un rendez-vous », repérée comme le fait le serveur. */
function asksForBooking(message: string): boolean {
  const normalized = message.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return /\b(rendez[ -]?vous|rdv|creneau|un appel|te parler|vous parler|parler a quelqu|demo live|book a call|meeting|call)\b/.test(
    normalized,
  )
}

describe('le catalogue lui-même', () => {
  it('compte bien les vingt conversations du §7.1, numérotées sans trou', () => {
    expect(GOLDEN_SCENARIOS).toHaveLength(20)
    expect(GOLDEN_SCENARIOS.map(scenario => scenario.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('porte une assertion lisible pour chacune — un scénario sans attente ne garde rien', () => {
    for (const scenario of GOLDEN_SCENARIOS) {
      expect(scenario.assertion.length, `scénario ${scenario.id}`).toBeGreaterThan(10)
      expect(scenario.visitor.length, `scénario ${scenario.id}`).toBeGreaterThan(0)
    }
  })
})

describe.each(GOLDEN_SCENARIOS)('§7.1 n°$id — $title', scenario => {
  const last = scenario.visitor.at(-1) ?? ''
  const booking = asksForBooking(last)
  // Le serveur incrémente le compteur de demandes AVANT de trancher : c'est ce
  // qui fait tomber le lien à la deuxième insistance. Le rejouer ici plutôt que
  // de figer le résultat garde le test fidèle à ce que fait la route.
  const state = booking
    ? { ...(scenario.lead ?? {}), bookRequests: (scenario.lead?.bookRequests ?? 0) + 1 }
    : (scenario.lead ?? {})
  const context = { state, booking, exchanges: scenario.visitor.length }

  it('injecte la grille tarifaire seulement si on l’a demandée', () => {
    expect(asksAboutPricing(scenario.visitor)).toBe(scenario.expects.pricingInPrompt)
  })

  if (scenario.expects.bookingUnlocked !== undefined) {
    it('débloque — ou non — le lien de rendez-vous', () => {
      expect(bookingVerdict(context).unlocked).toBe(scenario.expects.bookingUnlocked)
    })
  }

  if (scenario.expects.stillAsking !== undefined) {
    it('sait s’il reste une question à poser', () => {
      expect(nextQuestion(state) !== null).toBe(scenario.expects.stillAsking)
    })
  }

  it('construit un prompt qui ne porte ni score, ni adresse interne, ni secret', () => {
    const prompt = buildLauraSystemPrompt({
      ...CONTEXT,
      ...(scenario.locale ? { locale: scenario.locale } : {}),
      ...(scenario.expects.pricingInPrompt ? { pricing: 'Starter 119 € · Growth 249 €' } : {}),
      conversation: promptState(context),
    })
    expect(prompt).not.toMatch(/@bellum-(?:it|ai)\.com/i)
    expect(prompt).not.toMatch(/\b(score|palier|chaud|ti[èe]de|froid)\b/i)
    expect(prompt).not.toMatch(/sk-ant-|service[_-]?role|supabase\.co/i)
    if (!scenario.expects.pricingInPrompt) expect(prompt).not.toMatch(/\d+\s?€/)
  })
})

describe('les scénarios qui n’atteignent jamais le modèle', () => {
  it('n°18 — l’injection est refusée AVANT le premier jeton', () => {
    // Le scénario le moins cher du lot : une injection repérée ne coûte aucun
    // appel modèle, et le refus se compte (`chat_refusal`).
    const scenario = GOLDEN_SCENARIOS.find(item => item.id === 18)!
    const verdict = inspectInput(scenario.visitor[0]!)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('injection')
  })

  it('les dix-neuf autres passent le garde-fou d’entrée', () => {
    for (const scenario of GOLDEN_SCENARIOS) {
      if (scenario.id === 18) continue
      for (const message of scenario.visitor) {
        expect(inspectInput(message).ok, `n°${scenario.id} : ${message}`).toBe(true)
      }
    }
  })
})
