import { z } from 'zod'
import type { WorkspacePermission } from './workspace.js'

/**
 * #4421.15 / #4421.16 (décision Louis 25/10) — « Obtenir l'e-mail » sous une personne que Laura propose HORS de
 * l'espace (nom masqué « Inès D. », sans adresse). Au CLIC seulement, une personne à la fois : le compte est
 * retrouvé (ou ajouté au portefeuille par le chemin de Découvrir, sans analyse), la personne devient un contact
 * du compte, puis l'enrichissement EXISTANT part — même file, même débit que `POST contacts/:id/enrich`, débité
 * seulement si une coordonnée est trouvée, jamais en démo. Rien n'est envoyé : le commercial envoie.
 */

/** Les deux droits du geste : il ÉCRIT une fiche (compte, contact) ET déclenche un enrichissement payant. */
export const OUTSIDE_PERSON_REVEAL_PERMISSIONS = [
  'contacts:enrich',
  'records:write',
] as const satisfies readonly WorkspacePermission[]

/** La référence OPAQUE de la personne chez la source — jamais affichée, jamais un nom de fournisseur. */
export const outsidePersonRefSchema = z.string().trim().min(1).max(64)

/** Un SIREN, quand le compte en porte un : neuf chiffres, rien d'autre. */
const sirenSchema = z
  .string()
  .trim()
  .regex(/^\d{9}$/)

export const outsidePersonRevealRequestSchema = z.object({
  /** Le compte déjà retrouvé ou créé par un premier clic sur la même carte : il doit être dans l'espace actif. */
  account_id: z.string().guid().optional(),
  company_name: z.string().trim().min(1).max(200),
  siren: sirenSchema.optional(),
  person_ref: outsidePersonRefSchema,
  /** Le nom tel que la source le publie (masqué) — le contact le porte jusqu'à ce que l'enrichissement le complète. */
  name: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120).optional(),
  linkedin_url: z.string().trim().url().max(300).optional(),
})
export type OutsidePersonRevealRequest = z.infer<typeof outsidePersonRevealRequestSchema>

/** Le contact créé (ou retrouvé) et le job d'enrichissement, suivi par `GET contacts/:id/enrichment`. */
export const outsidePersonRevealResponseSchema = z.object({
  account_id: z.string().guid(),
  contact_id: z.string().guid(),
  job_id: z.string().min(1),
  state: z.enum(['queued', 'running']),
})
export type OutsidePersonRevealResponse = z.infer<typeof outsidePersonRevealResponseSchema>

/** Sur la carte `account_ranking` : une personne révélable (trois au plus, comme l'outil). */
export const outsidePersonRevealItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  title: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .nullable()
    .transform(value => value ?? undefined)
    .optional(),
  person_ref: outsidePersonRefSchema,
  /** Le mail préparé par Laura s'adresse à cette personne : l'adresse révélée le remplit. */
  mail_to: z
    .boolean()
    .nullable()
    .transform(value => value ?? undefined)
    .optional(),
})

export const outsidePersonRevealCardSchema = z.object({
  siren: sirenSchema
    .nullable()
    .transform(value => value ?? undefined)
    .optional(),
  people: z.array(outsidePersonRevealItemSchema).min(1).max(3),
})
