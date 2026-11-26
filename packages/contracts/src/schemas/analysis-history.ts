import { z } from 'zod'
import { analysisRunDepthSchema } from './analysis.js'

/**
 * Théo B r2-mes-analyses.R5/A5 — « Mes analyses » : l'historique des analyses de compte LANCÉES dans l'espace.
 *
 * `scope=space` (défaut) rend celles de tout l'espace, `scope=me` les seules lancées par l'appelant. L'espace vient
 * de la session, jamais de la requête. « Retirer » masque la ligne pour l'appelant seul : le dossier du compte et
 * le run restent intacts (on archive, on ne supprime pas).
 */
export const ANALYSIS_HISTORY_SCOPES = ['space', 'me'] as const
export const analysisHistoryScopeSchema = z.enum(ANALYSIS_HISTORY_SCOPES)
export type AnalysisHistoryScope = z.infer<typeof analysisHistoryScopeSchema>

export const analysisHistoryQuerySchema = z.object({
  scope: analysisHistoryScopeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const ANALYSIS_HISTORY_STATUSES = ['analyzing', 'completed', 'error', 'canceled'] as const

export const analysisHistoryRowSchema = z.object({
  id: z.string().guid(),
  accountId: z.string().guid(),
  companyName: z.string().nullable(),
  /** Siège connu du compte, tel qu'enregistré — jamais deviné. */
  headquarters: z.string().nullable(),
  status: z.enum(ANALYSIS_HISTORY_STATUSES),
  scopeMode: z.string().nullable(),
  /** `null` = run antérieur au palier de profondeur : inconnu, pas « standard ». */
  depth: analysisRunDepthSchema.nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  startedBy: z.object({ userId: z.string().guid(), name: z.string().nullable() }),
  /** Vrai quand l'appelant a lancé ce run : seul cas où « Reprendre » et « Retirer » existent. */
  mine: z.boolean(),
})
export type AnalysisHistoryRow = z.infer<typeof analysisHistoryRowSchema>

export const analysisHistoryResponseSchema = z.object({
  runs: z.array(analysisHistoryRowSchema),
  /** Les deux effectifs mesurés sur le périmètre visible, pour « 6 analyses dans l'espace · 3 lancées par toi ». */
  counts: z.object({ space: z.number().int().min(0), mine: z.number().int().min(0) }),
})
export type AnalysisHistoryResponse = z.infer<typeof analysisHistoryResponseSchema>
