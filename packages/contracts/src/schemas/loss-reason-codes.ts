import { z } from 'zod'

/**
 * #3989.9 — Décision Louis 15/10/2026 : le motif de perte d'une affaire est une
 * LISTE FERMÉE COMMUNE à tous les espaces, plus une précision libre FACULTATIVE
 * (`opportunities.loss_reason`, le texte de l'espace, qui ne sort jamais).
 *
 * Commune parce que c'est ce qui rend la perte comparable d'un espace à l'autre
 * (la base commune ne savait pas agréger un texte libre — reste (2) de c92).
 * La contrainte SQL `opportunities_loss_reason_code_check` porte la même liste
 * (migration `1796546200000`, posée AVANT le code qui écrit — GA-11 / GA-12).
 */
export const LOSS_REASON_CODES = [
  'price',
  'competitor_won',
  'no_budget',
  'project_cancelled',
  'bad_timing',
  'no_profile_available',
  'other',
] as const
export const lossReasonCodeSchema = z.enum(LOSS_REASON_CODES)
export type LossReasonCode = z.infer<typeof lossReasonCodeSchema>
