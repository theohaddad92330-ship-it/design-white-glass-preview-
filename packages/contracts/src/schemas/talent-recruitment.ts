import { z } from 'zod'

/**
 * Théo C talents-recrutement — LE RECRUTEMENT D'UNE PERSONNE (Louis 22/10/2026).
 *
 * « La qualification de la personne, indépendamment de ses présentations chez les clients » : cinq étapes, rangées
 * dans un journal à part. L'étape de recrutement N'ALTÈRE NI les présentations sur les besoins NI les affectations de
 * mission (invariant N3, gardé par `talent-recruitment-independence.spec.ts`) — elle ne lit ni n'écrit ces tables.
 *
 * « Écartée » n'efface personne : on archive, on ne supprime pas — la personne se retrouve dans sa colonne. Seul
 * l'effacement RGPD à sa demande (c67) la supprime, et il emporte le journal avec elle.
 *
 * Le motif est un texte libre CONSIGNÉ, jamais lu pour classer : aucun critère protégé ne pèse dans le rang d'une
 * personne, et l'étape ne sert à aucun score ni classement de matching.
 */
export const RECRUITMENT_STAGES = ['to_qualify', 'call_planned', 'qualified', 'on_hold', 'discarded'] as const
export const recruitmentStageSchema = z.enum(RECRUITMENT_STAGES)
export type RecruitmentStage = z.infer<typeof recruitmentStageSchema>

/** Plafond du motif : une phrase de retour, pas un dossier. */
export const RECRUITMENT_REASON_MAX = 500

/**
 * Body de `PUT /talent/:id/recruitment`. Ni espace ni utilisateur : ils viennent du jeton. `plannedAt` (avec
 * décalage horaire, jamais une heure devinée) n'a de sens qu'à « Échange prévu ».
 */
export const changeRecruitmentStageSchema = z
  .object({
    stage: recruitmentStageSchema,
    reason: z
      .string()
      .trim()
      .max(RECRUITMENT_REASON_MAX)
      .transform(value => (value ? value : undefined))
      // `.optional()` APRÈS le `.transform()` : en zod 4, avant, la clé deviendrait obligatoire dans le type inféré.
      .optional(),
    plannedAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine(input => input.plannedAt === undefined || input.stage === 'call_planned', {
    message: 'plannedAt only applies to call_planned',
    path: ['plannedAt'],
  })
export type ChangeRecruitmentStage = z.infer<typeof changeRecruitmentStageSchema>

/** Une carte du kanban : la personne, jamais ses présentations. */
export const recruitmentCardSchema = z.object({
  talentId: z.string(),
  fullName: z.string().nullable(),
  title: z.string().nullable(),
  location: z.string().nullable(),
  /** Comment on la mobilise (`engagement_kind`), tel que stocké — `null` quand il est inconnu. */
  relation: z.string().nullable(),
  stage: recruitmentStageSchema,
  /** Depuis quand elle est à cette étape ; `null` = jamais rangée (à qualifier par défaut). */
  stageSince: z.string().nullable(),
  reason: z.string().nullable(),
  /** Le rendez-vous annoncé, à « Échange prévu » seulement. */
  plannedAt: z.string().nullable(),
})
export type RecruitmentCard = z.infer<typeof recruitmentCardSchema>

export type RecruitmentColumn = { stage: RecruitmentStage; cards: RecruitmentCard[] }

/** Une personne jamais rangée est « À qualifier » ; une valeur inconnue aussi, jamais « Écartée » par défaut. */
export function recruitmentStageOf(stored: string | null | undefined): RecruitmentStage {
  const parsed = recruitmentStageSchema.safeParse(stored)
  return parsed.success ? parsed.data : 'to_qualify'
}

/** Les cinq colonnes, TOUJOURS, vides comprises : une colonne absente se lit « il manque une étape ». */
export function groupRecruitmentBoard(cards: readonly RecruitmentCard[]): RecruitmentColumn[] {
  return RECRUITMENT_STAGES.map(stage => ({ stage, cards: cards.filter(card => card.stage === stage) }))
}

/** Le journal d'une personne : une ligne par changement, jamais réécrite. */
export const recruitmentHistoryEntrySchema = z.object({
  id: z.string(),
  stage: recruitmentStageSchema,
  reason: z.string().nullable(),
  plannedAt: z.string().nullable(),
  changedByName: z.string().nullable(),
  createdAt: z.string(),
})
export type RecruitmentHistoryEntry = z.infer<typeof recruitmentHistoryEntrySchema>
