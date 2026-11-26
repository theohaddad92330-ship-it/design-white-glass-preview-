import { z } from 'zod'

/**
 * Boucle de feedback dossier (chantier A2) — un retour utilisateur sur un
 * élément du dossier (« ce play est hors sujet », « ce contact n'est plus là »,
 * « bonne lecture ») capturé de façon STRUCTURÉE puis condensé en directives de
 * correction réinjectées dans les runs suivants du même compte.
 *
 * Vocabulaires fermés (le verdict pilote la directive déterministe côté API) :
 * - target : la surface du dossier visée par le retour.
 * - verdict : `obsolete` est stocké sans accent (token wire/DB stable ASCII,
 *   comme `beta_feedback.category`) — l'UI affiche « obsolète ».
 */
export const ACCOUNT_FEEDBACK_TARGETS = ['play', 'contact', 'signal', 'section', 'global'] as const
export const accountFeedbackTargetSchema = z.enum(ACCOUNT_FEEDBACK_TARGETS)
export type AccountFeedbackTarget = z.infer<typeof accountFeedbackTargetSchema>

/**
 * #2076.9-.13 — tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md
 * §1, reco appliquée) : « juste »/« partiel »/« manquant » portent un verdict
 * de JUSTESSE (la première preuve, sur un compte que l'utilisateur connaît
 * déjà) — un axe différent de « utile »/« inutile » (utilité), mais le MÊME
 * vocabulaire partagé (GA-26 : un réglage vit à un seul endroit), ajouté EN
 * FIN (GA-08 : jamais réordonné). « faux » coïncide déjà, il n'est pas
 * dupliqué.
 */
export const ACCOUNT_FEEDBACK_VERDICTS = [
  'utile',
  'inutile',
  'faux',
  'obsolete',
  'juste',
  'partiel',
  'manquant',
] as const
export const accountFeedbackVerdictSchema = z.enum(ACCOUNT_FEEDBACK_VERDICTS)
export type AccountFeedbackVerdict = z.infer<typeof accountFeedbackVerdictSchema>

/**
 * #2076.9-.13 — les quatre verdicts de la « première preuve » (un compte que
 * l'utilisateur connaît déjà), posés en `target: 'global'` par l'écran compte
 * ET lus par la recette produit (`FirstProofRecetteService`, API). Un seul
 * endroit pour les deux lecteurs (GA-26).
 */
export const FIRST_PROOF_VERDICTS = [
  'juste',
  'partiel',
  'faux',
  'manquant',
] as const satisfies readonly AccountFeedbackVerdict[]

/**
 * Body de `POST /accounts/:id/feedback`. Ni `userId` ni `workspaceId` — le
 * contrôleur les dérive du JWT + du workspace actif (jamais du body). Les
 * champs libres sont bornés : ils finissent CITÉS dans un prompt Claude, un cap
 * bloque l'injection de prompt / les payloads géants.
 */
export const createAccountFeedbackSchema = z.object({
  target: accountFeedbackTargetSchema,
  // Ce que le retour désigne, cité tel quel (titre du play, nom du contact,
  // intitulé du signal…). Vide toléré pour un retour `global` sur le dossier.
  targetRef: z.string().max(300).default(''),
  verdict: accountFeedbackVerdictSchema,
  // Précision libre de l'utilisateur — citée, jamais réinterprétée.
  note: z.string().min(1).max(1000).optional(),
})
export type CreateAccountFeedback = z.infer<typeof createAccountFeedbackSchema>

/** Wire shape d'un retour stocké (GET /accounts/:id/feedback) — pas de fuite
 *  `user_id`/`workspace_id`, comme les pinned facts de la mémoire copilote. */
export const accountFeedbackItemSchema = z.object({
  id: z.string().guid(),
  target: accountFeedbackTargetSchema,
  targetRef: z.string(),
  verdict: accountFeedbackVerdictSchema,
  note: z.string().nullable().optional(),
  createdAt: z.string(),
})
export type AccountFeedbackItem = z.infer<typeof accountFeedbackItemSchema>
