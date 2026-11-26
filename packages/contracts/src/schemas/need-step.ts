import { z } from 'zod'

/**
 * Les « prochaines étapes » d'un besoin, COCHABLES (dossier du 26/08, image
 * 02 — fiche besoin).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DISTINCTE DE `needNextAction`, ET C'EST DÉLIBÉRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `needNextAction` (`need-next-action.ts`) rend UNE étiquette DÉRIVÉE — jamais
 * persistée, jamais cochable, recalculée à chaque lecture de la ligne. C'est
 * une dérivation, elle vit à un seul endroit (garde GA-26), et ce fichier ne
 * la remplace pas : les deux coexistent, l'une à côté de l'autre sur l'écran.
 *
 * Ce que la maquette demande est un second objet : une LISTE de tâches
 * qu'un recruteur écrit et coche lui-même — « organiser les entretiens »,
 * « envoyer la proposition commerciale ». Rien ne le portait avant ce lot.
 */

/**
 * Trois statuts, pas un booléen. La maquette montre un badge « À faire » ET un
 * badge « En attente » sur deux étapes NON cochées — un simple `done boolean`
 * perdrait cette distinction : une étape qui attend une réponse du client
 * n'est pas la même chose qu'une étape qu'on n'a pas encore commencée.
 */
export const NEED_STEP_STATUSES = ['todo', 'pending', 'done'] as const
export const needStepStatusSchema = z.enum(NEED_STEP_STATUSES)
export type NeedStepStatus = (typeof NEED_STEP_STATUSES)[number]

export const needStepSchema = z.object({
  id: z.string().guid(),
  needId: z.string().guid(),
  label: z.string(),
  status: needStepStatusSchema,
  position: z.number().int().min(0),
  /** Quand l'étape a été cochée. `null` tant qu'elle ne l'est pas — jamais une
   *  date inventée pour une étape non terminée. */
  doneAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type NeedStep = z.infer<typeof needStepSchema>

export const needStepsResponseSchema = z.object({ items: z.array(needStepSchema) })
export type NeedStepsResponse = z.infer<typeof needStepsResponseSchema>

export const createNeedStepSchema = z
  .object({
    label: z.string().trim().min(1).max(300),
  })
  .strict()
export type CreateNeedStepInput = z.infer<typeof createNeedStepSchema>

/** Cocher, décocher, ou marquer « en attente » — les trois seuls gestes que la
 *  fiche offre. Le libellé ne se réécrit pas depuis cette route : renommer une
 *  étape n'est pas le geste que la maquette montre. */
export const updateNeedStepSchema = z
  .object({
    status: needStepStatusSchema,
  })
  .strict()
export type UpdateNeedStepInput = z.infer<typeof updateNeedStepSchema>
