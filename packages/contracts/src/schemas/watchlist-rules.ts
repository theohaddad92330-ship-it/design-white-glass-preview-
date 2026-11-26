import { z } from 'zod'

/**
 * Règles PERSONNELLES de veille (restitution V2 §11 — « tout ce qui manque »
 * pour que la Veille soit personnalisée). Un commercial déclare ce qu'il veut
 * suivre : des SECTEURS, des TECHNOLOGIES, des COMPTES, des BESOINS ou des
 * PERSONNES. Chaque règle est une paire (type, valeur) portée par le workspace :
 * la veille de l'équipe peut alors mettre en avant les signaux qui matchent.
 *
 * Volontairement déterministe et sans IA : une règle est un libellé libre saisi
 * par l'utilisateur, comparé aux signaux par simple correspondance normalisée
 * (cf. {@link watchlistRuleMatches}). Aucun sens n'est inventé, aucun signal
 * fabriqué — une règle qui ne matche rien n'ajoute rien.
 */
export const watchlistRuleKindSchema = z.enum(['sector', 'techno', 'account', 'need', 'person'])
export type WatchlistRuleKind = z.infer<typeof watchlistRuleKindSchema>

/** Les 5 types de règle, dans l'ordre d'affichage de l'écran. */
export const watchlistRuleKinds = watchlistRuleKindSchema.options

/** Borne haute du libellé — assez pour « Directeur des Systèmes d'Information
 *  France & International », trop court pour coller un paragraphe. */
export const WATCHLIST_RULE_VALUE_MAX = 120

/** Corps POST /watchlist/rules — le serveur dérive `id`/`created_at`. La valeur
 *  est trimée puis bornée ; une saisie vide (ou d'espaces) est rejetée. */
export const createWatchlistRuleSchema = z.object({
  kind: watchlistRuleKindSchema,
  value: z.string().trim().min(1).max(WATCHLIST_RULE_VALUE_MAX),
})
export type CreateWatchlistRuleInput = z.infer<typeof createWatchlistRuleSchema>

/** Une règle telle que renvoyée par l'API (jamais le `user_id`/`workspace_id`
 *  internes — le scoping est une affaire serveur). */
export const watchlistRuleSchema = z.object({
  id: z.string().guid(),
  kind: watchlistRuleKindSchema,
  value: z.string(),
  created_at: z.string(),
})
export type WatchlistRule = z.infer<typeof watchlistRuleSchema>

/**
 * Normalisation partagée pour la comparaison règle ↔ signal : minuscules, accents
 * repliés (é→e, ç→c…), espaces compactés. Le MÊME repli est appliqué des deux
 * côtés, sinon « Cybersécurité » ne matcherait jamais « cybersecurite ».
 */
export function normalizeWatchlistText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Vrai si `ruleValue` (normalisé) apparaît comme sous-chaîne de l'un des textes
 * fournis (normalisés) — le signal « correspond à la règle ». Déterministe, sans
 * IA. Une règle vide après normalisation ne matche rien (garde-fou : un libellé
 * d'espaces ne doit pas taguer tous les signaux).
 */
export function watchlistRuleMatches(ruleValue: string, ...haystacks: Array<string | null | undefined>): boolean {
  const needle = normalizeWatchlistText(ruleValue)
  if (!needle) return false
  return haystacks.some(hay => {
    if (!hay) return false
    return normalizeWatchlistText(hay).includes(needle)
  })
}
