import { z } from 'zod'

/**
 * #4016 L11 — L'EXPORT DE MASSE DES BESOINS, gouverné par la règle de sortie
 * de données de l'espace (`@DataExit()`).
 *
 * ⚠️ RENVERSEMENT DATÉ — DÉCISION LOUIS 11/10/2026 de `c43_actions_de_masse`
 * (« aucune action de masse sur les besoins ne SORT de l'entreprise »). La
 * sélection du tableau « Besoins ouverts » s'exporte désormais en fichier
 * (CSV ou JSON), pour être reprise dans un outil tiers. Ce qui N'EST PAS levé :
 * le fichier ne sort que si la règle d'espace « qui peut exporter » le permet
 * (`WorkspacePermissionGuard` lit `@DataExit()` côté API, `useDataExit()` côté
 * écran) — un export de masse qui contournerait la règle serait exactement la
 * sortie en un clic que c43 redoutait.
 *
 * Un FICHIER téléchargé, jamais une POUSSÉE : le versement au CRM reste la
 * route unitaire `POST /projects/:id/export-crm`, et rien ici n'écrit chez un
 * tiers.
 */

/** La même borne que la page du tableau (`openNeedsQuerySchema.limit`). */
export const NEED_EXPORT_MAX = 200

export const NEED_EXPORT_FORMATS = ['csv', 'json'] as const

/** Pour qui part le fichier : l'équipe (tout), ou un partenaire (sans tarif ni porteur). */
export const NEED_EXPORT_AUDIENCES = ['team', 'partner'] as const
export type NeedExportAudience = (typeof NEED_EXPORT_AUDIENCES)[number]

/** #4295.14 — la langue des en-têtes du fichier : celle de l'interface. Absent = français (le fichier d'avant). */
export const NEED_EXPORT_LANGS = ['fr', 'en'] as const
export type NeedExportLang = (typeof NEED_EXPORT_LANGS)[number]

export const needExportRequestSchema = z
  .object({
    needIds: z.array(z.string().guid()).min(1).max(NEED_EXPORT_MAX),
    format: z.enum(NEED_EXPORT_FORMATS),
    audience: z.enum(NEED_EXPORT_AUDIENCES).optional(),
    lang: z.enum(NEED_EXPORT_LANGS).optional(),
  })
  .strict()
export type NeedExportRequest = z.infer<typeof needExportRequestSchema>
