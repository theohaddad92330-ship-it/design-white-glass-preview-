import { z } from 'zod'

/**
 * #3262.24-28 (épopée #3262, lot R11 29/09) — LES SIGNAUX DE REVUE.
 *
 * Quatre faits qui attendent une décision sur le compte, jamais un score de
 * plus : chacun est déjà calculable ailleurs (`sprint`, `priority_gate`,
 * `assigned_to`, `relationship_memory`), ce contrat les nomme pour que
 * `DecisionStrip.tsx` les affiche sans les recalculer.
 *
 * `null` = la lecture a échoué — jamais un zéro deviné (GA-18/GA-19) : un
 * espace où personne n'a de compte en retard de revue a, lui, un VRAI zéro
 * qui mérite d'être lu, et les deux réponses ne peuvent pas partager le même
 * chiffre.
 */
export const reviewSignalsSchema = z.object({
  /** Comptes `sprint = 'focus'` depuis plus de `FOCUS_STALE_DAYS` (`sprint.ts`). */
  staleFocusCount: z.number().int().nonnegative().nullable(),
  /** Comptes écartés (`priority_gate = 'parked'`) dont le délai de réexamen est écoulé. */
  noGoToRevisitCount: z.number().int().nonnegative().nullable(),
  /** Comptes actifs sans propriétaire assigné (`assigned_to IS NULL`). */
  accountsWithoutOwnerCount: z.number().int().nonnegative().nullable(),
  /** Comptes actifs sans prochaine date de revue (`relationship_memory.nextReviewAt`). */
  accountsWithoutDateCount: z.number().int().nonnegative().nullable(),
  /**
   * #3277.5 (épopée #3277, lot E22 30/09) — comptes dont l'`AccountStrategy5P`
   * (`account-strategy-5p.ts`, même dérivation que la fiche Compte, jamais un
   * second calcul) rend `readiness = 'NO_GO'`. Distinct de `noGoToRevisitCount`
   * (écarté par `priority_gate`) : deux faits différents qui partagent le mot
   * « NO-GO » sans partager leur source.
   */
  strategyNoGoCount: z.number().int().nonnegative().nullable(),
  /** Même lecture, `readiness = 'BLOCKED'` (quatre trous sur cinq). */
  strategyBlockedCount: z.number().int().nonnegative().nullable(),
  /**
   * #3262.24 (épopée #3284) — comptes de la file EXÉCUTION (`sprint` = `extension`
   * ou `volume`, `SPRINT_LANE_LEVELS.execution`) sans activité (`activities.occurred_at`)
   * depuis plus de `FOCUS_STALE_DAYS`, ou sans aucune activité connue. Les comptes de la
   * file ARBITRAGE (`focus`/`no_go`/`watch`/`partner_route`) ne comptent pas ici — ils
   * sont déjà couverts par `staleFocusCount`/`noGoToRevisitCount`.
   */
  accountsWithoutMovementCount: z.number().int().nonnegative().nullable(),
  /**
   * #3407.5 (recette 30/09) — comptes en VEILLE (`sprint = 'watch'`) dont un
   * signal (`opportunities.kind = 'signal'`) est arrivé APRÈS leur entrée en
   * veille : la règle `shouldSwitch('watch', 'strong_signal')` (`sprint.ts`)
   * existait sans que rien ne la pose sur le portefeuille. C'est une
   * PROPOSITION — un compteur cliquable vers le board d'effort —, jamais une
   * bascule automatique. `.optional()` : additif (GA-08), une réponse d'avant
   * ce lot n'a pas la clé.
   */
  watchToWakeCount: z.number().int().nonnegative().nullable().optional(),
})
export type ReviewSignals = z.infer<typeof reviewSignalsSchema>
