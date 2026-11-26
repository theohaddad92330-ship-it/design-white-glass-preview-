import { z } from 'zod'

/**
 * #2897 (#2091.36, #2091.37) — la bannière « BellumAI a été repensé » pour
 * les comptes dont l'onboarding s'est terminé AVANT la refonte de l'écran
 * Welcome.
 *
 * La « date de refonte » est une donnée RÉELLE, pas devinée : la date de
 * mise en production de l'écran Welcome personnalisé, telle qu'ANNONCÉE par
 * le changelog produit — entrée `2026-07-21-onboarding-bienvenue`
 * (`packages/contracts/src/changelog/labels.fr.ts`, titre « Un écran de
 * bienvenue après le questionnaire »). Citée par son id plutôt que recopiée
 * en texte libre : un changement de libellé du changelog ne peut pas faire
 * diverger silencieusement le seuil de la bannière.
 *
 * Comparée à la date de complétion RÉELLE de l'onboarding de chaque compte
 * (`user_onboarding_transitions`, la transition `to_status: 'completed'` la
 * plus ANCIENNE — la première fois que ce compte a fini le questionnaire,
 * jamais une reprise ultérieure après un `refresh_required`).
 */
export const WELCOME_REDESIGN_CHANGELOG_ID = '2026-07-21-onboarding-bienvenue'

/** ISO — le jour de l'entrée de changelog ci-dessus (« 21 juillet 2026 »), à minuit UTC. */
export const WELCOME_REDESIGN_DATE = '2026-07-21T00:00:00.000Z'

/**
 * `visible=false` couvre TROIS cas distincts qu'un booléen à lui seul ne
 * distingue pas pour l'appelant, mais qu'aucun écran n'a besoin de distinguer
 * (GA-18/19 : une bannière qui ne s'applique pas ne fait aucune ligne) :
 * onboarding terminé APRÈS la refonte, onboarding jamais terminé, ou déjà
 * fermée par l'utilisateur. Le serveur tranche les trois, l'écran ne fait
 * qu'afficher ou non.
 */
export const welcomeRedesignBannerStateSchema = z.object({
  visible: z.boolean(),
})
export type WelcomeRedesignBannerState = z.infer<typeof welcomeRedesignBannerStateSchema>
