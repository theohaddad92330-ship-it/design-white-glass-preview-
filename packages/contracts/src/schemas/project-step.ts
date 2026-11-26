import { z } from 'zod'
import { NEED_STEP_STATUSES, needStepStatusSchema } from './need-step.js'

/**
 * #2171.22 — Section « Actions et prochaines étapes » de la fiche opportunité,
 * COCHABLE — même objet que `NeedStep` (`need-step.ts`), porté par
 * l'opportunité plutôt que le besoin. Voir ce fichier pour pourquoi cet objet
 * existe À CÔTÉ de `ProjectRow.next_action` (une dérivation non persistée)
 * plutôt que de le remplacer : même raison, même distinction.
 *
 * Les trois statuts sont RÉUTILISÉS depuis `need-step.ts` (garde GA-26 : un
 * réglage vit à un seul endroit) — recopier `['todo', 'pending', 'done']`
 * ici divergerait le jour où un quatrième statut s'ajoute d'un seul côté.
 */
export const PROJECT_STEP_STATUSES = NEED_STEP_STATUSES
export const projectStepStatusSchema = needStepStatusSchema
export type ProjectStepStatus = (typeof PROJECT_STEP_STATUSES)[number]

export const projectStepSchema = z.object({
  id: z.string().guid(),
  projectId: z.string().guid(),
  label: z.string(),
  status: projectStepStatusSchema,
  position: z.number().int().min(0),
  /** Quand l'étape a été cochée. `null` tant qu'elle ne l'est pas — jamais une
   *  date inventée pour une étape non terminée. */
  doneAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ProjectStep = z.infer<typeof projectStepSchema>

export const projectStepsResponseSchema = z.object({ items: z.array(projectStepSchema) })
export type ProjectStepsResponse = z.infer<typeof projectStepsResponseSchema>

export const createProjectStepSchema = z
  .object({
    label: z.string().trim().min(1).max(300),
  })
  .strict()
export type CreateProjectStepInput = z.infer<typeof createProjectStepSchema>

/** Cocher, décocher, ou marquer « en attente » — le libellé ne se réécrit pas
 *  depuis cette route, même choix que côté besoin. */
export const updateProjectStepSchema = z
  .object({
    status: projectStepStatusSchema,
  })
  .strict()
export type UpdateProjectStepInput = z.infer<typeof updateProjectStepSchema>
