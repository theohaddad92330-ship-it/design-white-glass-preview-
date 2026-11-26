import { z } from 'zod'

/**
 * Typed payload of the Contact Hunter agent (Phase 2) — TypeScript mirror of
 * `apps/ia/app/models/contacts_data.py`. Convention: camelCase, English.
 *
 * Inner contacts use `.passthrough()` so per-field enrichment (e.g. Apollo's
 * raw shape) can flow through without breaking — the agent doesn't reshape
 * the records, it just counts and wraps them.
 */

export const apolloSearchHitSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    // #2755.1 — `_apollo_hit_to_seed`/`_fallback_contact_to_seed`
    // (apps/ia/app/routers/phase2_contacts.py:394-398, 427-429, 946-948)
    // posent ces quatre clés à `None` explicite (`hit.title or None`) quand
    // le champ est vide — jamais une clé absente. `.nullish()` accepte ce
    // `null` comme équivalent d'absent, même défaut que #2755.1 sur
    // `contactsFallbackOutcomeSchema`.
    title: z.string().nullish(),
    organizationName: z.string().optional(),
    linkedinUrl: z.string().nullish(),
    city: z.string().nullish(),
    country: z.string().nullish(),
  })
  .passthrough()
export type ApolloSearchHit = z.infer<typeof apolloSearchHitSchema>

/**
 * #2543.5a — l'état typé de la source de contacts pour UNE recherche.
 * Mirror de ``ApolloSearchStatus`` (`apps/ia/app/services/apollo.py`). Un
 * état non listé ici (une faute de frappe, une valeur future non encore
 * mappée) doit ÉCHOUER au lieu de se laisser passer en `string` libre — une
 * valeur inconnue affichée telle quelle serait pire qu'un « non mesuré ».
 *
 * 🔴 Ne JAMAIS nommer le fournisseur dans un libellé écran construit à partir
 * de cette valeur (« Apollo », « Brave ») — doctrine du dépôt : « on nomme ce
 * que l'espace a BRANCHÉ, jamais ce qui NOUS sert ».
 */
export const apolloSourceStatusSchema = z.enum([
  'ok',
  'empty',
  'unconfigured',
  'auth_failed',
  'plan_blocked',
  'rate_limited',
  'down',
])
export type ApolloSourceStatus = z.infer<typeof apolloSourceStatusSchema>

/**
 * #2543.5b — le repli web, tel qu'il s'est déroulé pour CETTE recherche.
 * ``foundCount`` reste absent tant que le repli n'a pas ABOUTI (pas tenté, ou
 * tenté et l'appel a levé) — jamais un ``0`` pour un geste qui n'a pas eu
 * lieu ou n'a pas fini (GA-18/19). ``failure`` est un message TECHNIQUE
 * (journal/diagnostic) — jamais affiché tel quel à l'écran, qui doit rester
 * générique (« repli indisponible »), sans nommer de fournisseur.
 */
export const contactsFallbackOutcomeSchema = z.object({
  attempted: z.boolean(),
  // #2755.1 — le producteur Python pose la clé avec `None` (pas `exclude_none`)
  // quand le repli n'a pas abouti : `.optional()` refuse `null`, `.nullish()`
  // l'accepte comme équivalent d'absent (jamais un `0`/message deviné).
  foundCount: z.number().int().min(0).nullish(),
  failure: z.string().nullish(),
})
export type ContactsFallbackOutcome = z.infer<typeof contactsFallbackOutcomeSchema>

/**
 * #2543.5g — la passe d'élargissement automatique, telle qu'elle s'est
 * déroulée pour CETTE recherche (décision Louis 18/09/2026) : quand le stock
 * reste mince même après le repli web et les amorces du registre légal, une
 * seule passe relance la recherche (personas élargis aux niveaux
 * hiérarchiques, ancres d'organisation suivantes). ``added`` est un nombre
 * dès que la passe a tourné, même ``0`` — une passe qui ne trouve rien le
 * DIT au lieu de se taire (GA-18/19).
 */
export const contactsWidenOutcomeSchema = z.object({
  attempted: z.boolean(),
  initialStock: z.number().int().min(0),
  added: z.number().int().min(0).optional(),
  failure: z.string().optional(),
})
export type ContactsWidenOutcome = z.infer<typeof contactsWidenOutcomeSchema>

export const contactsDataSchema = z
  .object({
    contacts: z.array(apolloSearchHitSchema).default([]),
    count: z.number().int().nonnegative().default(0),
    // #2543.5a — absent = non mesuré (aucune recherche live cette requête-ci),
    // jamais un statut "ok" deviné.
    sourceStatus: apolloSourceStatusSchema.optional(),
    sourceTotalEntries: z.number().int().min(0).optional(),
    // C.2 (Cédric 20/10) — d'où vient l'ancre d'organisation de la recherche.
    // ``none`` = recherche limitée au nom de l'entreprise. Absent = non mesuré.
    orgAnchorSource: z.enum(['enrichment', 'website', 'explicit', 'none']).optional(),
    // #2543.5b — toujours présent quand la recherche a réellement tourné
    // (``attempted`` est TOUJOURS connu, contrairement à ``sourceStatus``).
    fallback: contactsFallbackOutcomeSchema.optional(),
    // #2543.5g — présent SEULEMENT quand la passe d'élargissement a tourné.
    widened: contactsWidenOutcomeSchema.optional(),
  })
  .passthrough()
export type ContactsData = z.infer<typeof contactsDataSchema>
