import { z } from 'zod'
import { SPRINT_EVENTS, SPRINT_LEVELS } from './sprint.js'

/**
 * #3262.23 (épopée #3284, lot P05 29/09) — LA PHRASE DE LAURA sur un compte
 * Focus qui stagne.
 *
 * `PilotageService.reviewSignals` (#3262.25) COMPTE déjà les comptes
 * `sprint = 'focus'` depuis plus de `FOCUS_STALE_DAYS` (`sprint.ts`), pour la
 * bande de pilotage. Ce contrat porte la MÊME règle, appliquée à UN compte
 * nommé plutôt qu'agrégée — ce qu'un commercial demande dans le chat
 * (« ce compte traîne-t-il ? ») n'est pas ce qu'un manager lit sur le tableau
 * de bord (« combien de comptes traînent ? »). Aucune seconde règle de
 * stagnation : `stale`/`recommendation` viennent de `shouldSwitch('focus',
 * 'thirty_days_idle')`, relayé tel quel — jamais un second seuil recopié.
 *
 * `applicable: false` = le compte n'est pas actuellement en Focus (ou sa date
 * d'entrée n'est pas connue) : la question ne se pose pas, ce n'est ni un
 * zéro ni une stagnation niée.
 */
export const focusReviewSignalSchema = z.object({
  /** `false` = pas en Focus, ou date d'entrée inconnue — la question ne se pose pas. */
  applicable: z.boolean(),
  companyName: z.string().min(1),
  /** `null` uniquement quand `applicable` est `false`. */
  stale: z.boolean().nullable(),
  /** Jours passés en Focus. `null` uniquement quand `applicable` est `false`. */
  daysInFocus: z.number().int().nonnegative().nullable(),
  /** La phrase de `shouldSwitch('focus', 'thirty_days_idle').reason` — `null` tant que `stale` n'est pas `true`. */
  recommendation: z.string().nullable(),
  /** Le niveau proposé par `shouldSwitch` — `null` tant que `stale` n'est pas `true`. */
  suggestedLevel: z.enum(SPRINT_LEVELS).nullable(),
  /**
   * #3262.20 — LA PROCHAINE CONDITION DE REVUE du compte (`nextReviewCondition`) :
   * une date posée à la main gagne sur le délai calculé de la porte. `null` =
   * aucune date, ni posée ni calculable — jamais une date devinée.
   */
  nextReview: z
    .object({
      dueAt: z.string(),
      source: z.enum(['relationship_memory', 'priority_gate']),
    })
    .nullable()
    .optional(),
  /**
   * #3262.21 — LES ÉVÈNEMENTS QUI PEUVENT RÉACTIVER le compte (`reactivationOptions`),
   * seulement pour un compte écarté (porte `parked`) ou au niveau `no_go`/`watch`.
   * Vide = aucun évènement connu ne le réactive. Jamais appliqué : une réouverture se PROPOSE.
   */
  reactivation: z
    .array(
      z.object({
        event: z.enum(SPRINT_EVENTS),
        suggestedLevel: z.enum(SPRINT_LEVELS).nullable(),
        reason: z.string().nullable(),
        reopensGate: z.boolean(),
      }),
    )
    .optional(),
})
export type FocusReviewSignal = z.infer<typeof focusReviewSignalSchema>
