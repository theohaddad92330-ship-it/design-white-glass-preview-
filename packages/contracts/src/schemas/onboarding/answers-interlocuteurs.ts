import { z } from 'zod'

/**
 * Interlocuteurs — lot L17 (#2043).
 *
 * #2043.1/.2 sont déjà là (`decision_maker_personas`, Temps 2 + profil
 * progressif). #2043.3/.4 ajoutent deux valeurs à ce catalogue existant, EN
 * FIN de liste (GA-08) — voir `TEMPS2_ANSWER_OPTIONS.decision_maker_personas`
 * dans `../onboarding.ts`, pas ici : un catalogue de valeurs ne se recopie pas
 * (GA-26).
 *
 * Les trois colonnes ci-dessous sont neuves : ce que les interlocuteurs
 * choisis à l'étape précédente RÉVÈLENT sur l'accès réel au compte. Toutes
 * optionnelles comme le reste du Temps 1.
 *
 * #2043.8/.9 sont déjà là (`personas` alimente déjà les prompts). #2043.10
 * (« adapter la stratégie top-down / bottom-up / multi-thread ») EST BRANCHÉE
 * depuis le 16/09/2026, et PAS par le prompt : l'axe se DÉRIVE de
 * `real_response_level` ci-dessous dans `../commercial-audit-signals.ts`
 * (`AUDIT_ENTRY_AXIS_BY_RESPONSE_LEVEL`), puis se compare à l'axe VISÉ que porte
 * `ProfileContext.idealAccountProfile.entryStrategy`. Un fait coché par la
 * personne n'a rien à gagner à traverser un modèle qui pourrait le reformuler.
 */
export const INTERLOCUTEURS_ANSWER_FIELDS = {
  // #2043.5 — à quel niveau les réponses arrivent RÉELLEMENT, pas seulement
  // celui qu'on vise.
  real_response_level: z.string().nullable().optional(),
  // #2043.6
  budget_validator: z.string().nullable().optional(),
  // #2043.7
  access_orienteur: z.string().nullable().optional(),
}
