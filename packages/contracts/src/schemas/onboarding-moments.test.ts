import { describe, expect, it } from 'vitest'
import { TEMPS1_REQUIRED_KEYS, onboardingMomentOf } from './onboarding.js'
import { TEMPS2_ANSWER_KEYS } from './onboarding.js'

/**
 * #2626.1 — « le Temps 1 sous cinq minutes ».
 *
 * La mesure qui a ouvert le sujet : 135 questions posées au Temps 1, dont 125
 * bloquaient « Continuer », pour une porte de complétion qui n'en exige que 10.
 * Louis a tranché le 20/09/2026 : les 125 basculent en Temps 2 — elles sortent
 * du Temps 1 et sont reposées quand le commercial a vu un dossier.
 *
 * Ce que ce fichier garde, et qui est le cœur de l'arbitrage : le moment est
 * DÉRIVÉ de la porte de complétion, jamais tenu à la main. Un second registre
 * divergerait à la première question ajoutée.
 */
describe('#2626.1 — un catalogue, deux moments', () => {
  it('les 10 clés exigées pour entrer sont, et restent, du Temps 1', () => {
    for (const key of TEMPS1_REQUIRED_KEYS) {
      expect(onboardingMomentOf(key)).toBe('temps1')
    }
    expect(TEMPS1_REQUIRED_KEYS).toHaveLength(10)
  })

  it('tout le reste est reposé au Temps 2 — y compris ce qui y vivait déjà', () => {
    // Les 5 questions du complément existant : elles étaient DÉJÀ au Temps 2,
    // et la règle ne les déplace pas. C'est ce qui prouve qu'on réutilise le
    // moment existant au lieu d'en inventer un second (GA-26).
    for (const key of TEMPS2_ANSWER_KEYS) {
      expect(onboardingMomentOf(key)).toBe('temps2')
    }
    // Un échantillon de ce qui BASCULE : trois questions du Temps 1 qui
    // bloquaient « Continuer » sans être exigées pour entrer.
    expect(onboardingMomentOf('revenue_recurrence')).toBe('temps2')
    expect(onboardingMomentOf('active_clients_band')).toBe('temps2')
    expect(onboardingMomentOf('sales_routine')).toBe('temps2')
  })

  it('la partition est TOTALE et DISJOINTE — aucune question ne disparaît', () => {
    // « On archive, on ne supprime pas » : une clé appartient à exactement un
    // moment, quelle qu'elle soit, y compris une clé qu'on ne connaît pas
    // encore (une question ajoutée demain est reposée au Temps 2, jamais
    // perdue).
    for (const key of [...TEMPS1_REQUIRED_KEYS, 'une_question_ajoutee_demain', '']) {
      expect(['temps1', 'temps2']).toContain(onboardingMomentOf(key))
    }
    expect(onboardingMomentOf('une_question_ajoutee_demain')).toBe('temps2')
  })

  it('SAIT DIRE NON — une clé qui RESSEMBLE à une clé exigée n’en est pas une', () => {
    expect(onboardingMomentOf('esn_name_2')).toBe('temps2')
    expect(onboardingMomentOf('ESN_NAME')).toBe('temps2')
    expect(onboardingMomentOf('positioning ')).toBe('temps2')
  })
})
