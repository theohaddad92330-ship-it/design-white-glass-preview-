import { z } from 'zod'

/**
 * #1957.5 / #1957.8 — LE PLAFOND QUOTIDIEN DE LAURA, DIT EN DONNÉES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CONTRAT, ET PAS UNE PHRASE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le refus au plafond était une phrase française (« Plafond du copilote atteint
 * (50 messages sur 24 h). Il se réouvre au fil des heures »), répétée telle
 * quelle par l'écran. Elle ne pouvait pas dire QUAND : l'heure de réouverture
 * dépend du FUSEAU de la personne, et l'API n'a ni fuseau ni langue.
 *
 * Le serveur rend donc l'INSTANT (ISO 8601, UTC), calculé sur la fenêtre
 * glissante réelle (`quotaReopensAt`, `apps/api/src/modules/ia-proxy/chat-quota.ts`) ;
 * le navigateur le formate dans son fuseau et sa langue.
 *
 * ⚠️ `reopensAt: null` = le serveur n'a pas pu le calculer (lecture en échec,
 * horodatage illisible). L'écran le dit alors sans heure — jamais une heure
 * devinée.
 */

/** Le code machine du refus au plafond — distinct de tout autre 429 (limiteur de débit). */
export const CHAT_QUOTA_REACHED_CODE = 'chat_quota_reached' as const

/**
 * D'OÙ VIENT LE PLAFOND — décision Louis 13/09 batch 13 : le plafond dépend du plan.
 *
 *  · `plan` — la valeur du plan de l'espace (`SHIPPED_PLAN_GRID`), sous le
 *    plafond opérateur ou à égalité : l'écran peut dire « c'est le plafond de
 *    ton plan » ;
 *  · `operator` — le plafond de SÉCURITÉ (`CHAT_DAILY_MESSAGE_LIMIT`), parce
 *    qu'il est plus bas que celui du plan, ou que le plan est inconnu ou
 *    illisible. L'écran ne prétend alors rien sur le plan. #4016 L7 (11/10) :
 *    la variable est OPTIONNELLE ; plan illisible sans elle → le plus bas de la
 *    grille, source `operator` aussi (ce n'est pas « ton plan »).
 *
 * OPTIONNEL : une API d'avant ne l'envoie pas — l'écran se tait sur le plan.
 */
const chatQuotaLimitSourceSchema = z.enum(['plan', 'operator'])
export type ChatQuotaLimitSource = z.infer<typeof chatQuotaLimitSourceSchema>

/** Le corps du 429 de `POST /ia/chat` au plafond. Les autres champs (message, statusCode) passent. */
export const chatQuotaRefusalSchema = z.object({
  code: z.literal(CHAT_QUOTA_REACHED_CODE),
  limit: z.number().int().positive(),
  reopensAt: z.string().datetime().nullable(),
  limitSource: chatQuotaLimitSourceSchema.optional(),
})
export type ChatQuotaRefusal = z.infer<typeof chatQuotaRefusalSchema>

/**
 * `GET /ia/chat/quota` — ce qui reste à CET utilisateur (jamais à l'espace : le
 * plafond borne un siège).
 *
 *  · `measured` — le compte est lu : ce qui reste, si c'est « peu » (décidé
 *    côté serveur, à un seul endroit — le web ne recalcule pas le seuil), et
 *    l'heure de réouverture quand il ne reste rien.
 *  · `unbounded` — plafond désactivé, ou espace de démonstration (fil scripté,
 *    aucun appel de modèle) : il n'y a rien à annoncer.
 *  · `unmeasured` — le compte n'a pas pu être lu. « Non mesuré » n'est jamais
 *    « 0 restant » : l'écran n'affiche rien.
 */
export const chatQuotaStatusSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('measured'),
    limit: z.number().int().positive(),
    remaining: z.number().int().min(0),
    low: z.boolean(),
    reopensAt: z.string().datetime().nullable(),
    limitSource: chatQuotaLimitSourceSchema.optional(),
  }),
  z.object({ state: z.literal('unbounded') }),
  z.object({ state: z.literal('unmeasured') }),
])
export type ChatQuotaStatus = z.infer<typeof chatQuotaStatusSchema>
