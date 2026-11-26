import { z } from 'zod'

/**
 * #3754 — les postes cibles de l'ESN, avec leur NIVEAU décideur.
 *
 * L'ESN sait qui elle vise (intitulés + niveau 1 = signataire … 4 = influenceur).
 * Importés dans Réglages › Profil ESN, ils servent à ORDONNER les contacts d'un
 * compte — jamais à les filtrer (doctrine c76 : le rôle change l'ORDRE, jamais
 * le CONTENU). Le niveau se montre comme la RAISON de l'ordre, jamais comme un
 * score chiffré. Un seul endroit (GA-26) : les quatre niveaux et leurs
 * libellés de référence.
 */
export const ESN_TARGET_LEVELS = [1, 2, 3, 4] as const

export const esnTargetLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
export type EsnTargetLevel = z.infer<typeof esnTargetLevelSchema>

/** Les niveaux dont l'intitulé remonte aussi dans `decision_maker_personas` (#3754.2). */
export const ESN_TARGET_LEVELS_FED_TO_PERSONAS: readonly EsnTargetLevel[] = [1, 2]

/** Bornes de l'import : un fichier plus gros est refusé, pas coupé en silence. */
export const ESN_TARGET_PERSONAS_MAX_ROWS = 2000

export const esnTargetPersonaSchema = z.object({
  id: z.string(),
  category: z.string().nullable(),
  title: z.string(),
  decision_level: esnTargetLevelSchema,
})
export type EsnTargetPersona = z.infer<typeof esnTargetPersonaSchema>

/** Corps de `POST /esn-profile/target-personas/import` (csv en texte, xlsx en base64). */
export const importEsnTargetPersonasSchema = z
  .object({
    format: z.enum(['csv', 'xlsx']),
    content: z.string().min(1),
    // #4426.4 — l'onglet d'un classeur reconnu par le pack de contexte ; absent = le premier.
    sheet: z.string().min(1).max(255).optional(),
  })
  .strict()
export type ImportEsnTargetPersonasInput = z.infer<typeof importEsnTargetPersonasSchema>

/** Pourquoi une ligne n'a pas été importée — nommée, jamais inventée. */
export const ESN_TARGET_PERSONA_REJECT_REASONS = ['level_missing', 'level_invalid', 'title_missing'] as const
export const esnTargetPersonaRejectReasonSchema = z.enum(ESN_TARGET_PERSONA_REJECT_REASONS)
export type EsnTargetPersonaRejectReason = z.infer<typeof esnTargetPersonaRejectReasonSchema>

export const esnTargetPersonaRejectedRowSchema = z.object({
  /** Numéro de ligne dans le fichier (en-tête = ligne 1). */
  line: z.number().int().min(2),
  reason: esnTargetPersonaRejectReasonSchema,
  /** #4893 — la valeur lue dans la cellule fautive (niveau illisible) : l'écran la nomme au lieu d'un « — ». */
  value: z.string().max(80).optional(),
})
export type EsnTargetPersonaRejectedRow = z.infer<typeof esnTargetPersonaRejectedRowSchema>

export const esnTargetPersonasImportReportSchema = z.object({
  imported: z.number().int().min(0),
  rejected: z.array(esnTargetPersonaRejectedRowSchema),
  /** Intitulés de niveau 1-2 ajoutés à `decision_maker_personas` (sans doublon). */
  fed_to_personas: z.number().int().min(0),
  /** Colonnes obligatoires non reconnues dans l'en-tête (fichier refusé, rien remplacé). */
  missing_columns: z.array(z.enum(['title', 'level'])),
})
export type EsnTargetPersonasImportReport = z.infer<typeof esnTargetPersonasImportReportSchema>

export const esnTargetPersonasResponseSchema = z.object({
  personas: z.array(esnTargetPersonaSchema),
})
export type EsnTargetPersonasResponse = z.infer<typeof esnTargetPersonasResponseSchema>
