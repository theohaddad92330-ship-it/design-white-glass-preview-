import { impersonationReasonCodeSchema, impersonationReasonDetailSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Body for `POST /internal/admin/users/:userId/impersonate`.
 *
 * ⚠️ LE MOTIF EST UN CODE DE CATALOGUE, PLUS UN TEXTE LIBRE (#1670).
 * « Trois motifs au catalogue : support demandé · incident constaté ·
 * vérification technique. Pas de texte libre — un catalogue se lit. » L'ancien
 * champ acceptait 3 à 500 caractères : le motif était donc obligatoire mais
 * illisible en masse. Le libellé enregistré dans le journal est DÉRIVÉ du code
 * (`IMPERSONATION_REASON_LABELS`), il n'est pas saisi — un libellé recopié à la
 * main diverge à la première correction.
 *
 * `admin_actor` est l'étiquette d'attribution que la console transmet (son nom
 * d'utilisateur authentifié) — enregistrée comme administrateur agissant. Elle
 * rejette les CRLF pour garder les lignes de journal propres.
 */
export const startImpersonationSchema = z.object({
  reason_code: impersonationReasonCodeSchema,
  // LUDOVIC-D LC.10 — une précision libre FACULTATIVE à côté du code (le catalogue reste ce qui se compte).
  reason_detail: impersonationReasonDetailSchema.optional(),
  admin_actor: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(value => !/[\r\n]/.test(value), 'Identifiant opérateur invalide.'),
})

export class StartImpersonationDto extends createZodDto(startImpersonationSchema) {}

/** LUDOVIC-D LC.10 — Body for `POST /internal/admin/impersonations/:jti/terminate` : qui termine. */
export const terminateImpersonationSchema = z.object({
  admin_actor: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(value => !/[\r\n]/.test(value), 'Identifiant opérateur invalide.'),
})

export class TerminateImpersonationDto extends createZodDto(terminateImpersonationSchema) {}
