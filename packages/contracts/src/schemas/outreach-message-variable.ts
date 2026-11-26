import { z } from 'zod'

/**
 * #3419.1 (épopée #2947) — chaque VARIABLE d'un message porte sa valeur, sa
 * source, sa date, sa confiance et son autorisation d'usage externe.
 *
 * Une variable est un fait que le message avance (« utilise Snowflake »,
 * « 400 consultants »). Sans ces cinq attributs, impossible de dire d'où vient
 * un fait ni si on a le droit de le dire à l'extérieur. Annotation DÉCLARÉE par
 * le relecteur, rattachée à la VERSION du message qu'il relit (append-only, la
 * version suivante repart à zéro). Jamais déduite en lisant le corps.
 *
 * Deux inconnues restent des valeurs nommées, jamais un défaut deviné :
 * confiance `unverified` et usage externe `unknown` (« non mesuré » ≠ autorisé).
 *
 * Listes fermées : élargies par la contrainte SQL AVANT le code (GA-11/12).
 */
export const OUTREACH_VARIABLE_CONFIDENCES = ['confirmed', 'probable', 'unverified'] as const
export type OutreachVariableConfidence = (typeof OUTREACH_VARIABLE_CONFIDENCES)[number]

export const OUTREACH_VARIABLE_EXTERNAL_USES = ['allowed', 'forbidden', 'unknown'] as const
export type OutreachVariableExternalUse = (typeof OUTREACH_VARIABLE_EXTERNAL_USES)[number]

/**
 * #2877 / #3419.4 — « la mémoire marché ne produit jamais seule une
 * affirmation nominative » : un extrait de mémoire marché (`market_memory_*`)
 * cité comme source d'une variable s'écrit « Mémoire marché : <extrait> »
 * dans le champ `source` existant — même mécanisme que la source documentaire
 * de l'espace (#3752.7, `OUTREACH_DOCUMENT_SOURCE_PREFIX`), jamais une colonne
 * de plus (GA-26). C'est un corpus AGRÉGÉ, partagé entre espaces concurrents
 * (GA-43) : il ne confirme jamais, seul, un fait sur une personne identifiée —
 * la contrainte ci-dessous le NO-GO ci-dessous.
 */
export const OUTREACH_MARKET_MEMORY_SOURCE_PREFIX = 'Mémoire marché : '

const outreachMessageVariableFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    value: z.string().trim().min(1).max(500),
    /** D'où vient le fait, en clair (« site client », « appel du 12/09 »). */
    source: z.string().trim().min(1).max(200),
    /** Date du fait (jour calendaire), pas celle de la saisie. */
    as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'as_of must be an ISO calendar date (YYYY-MM-DD)'),
    confidence: z.enum(OUTREACH_VARIABLE_CONFIDENCES),
    external_use: z.enum(OUTREACH_VARIABLE_EXTERNAL_USES),
  })
  .strict()

/**
 * #2877 / #3419.4 — LE NO-GO : la mémoire marché, seule, ne lave jamais une
 * variable pour l'usage externe. Pas une affaire de phrase « nominative »
 * deviné par une lecture du texte (jamais de donnée fictive) : TOUTE variable
 * sourcée sur ce corpus agrégé reste `forbidden`/`unknown` — sans source
 * PERSONNE (CRM, appel, site) qui la corrobore, elle ne sort jamais. La MÊME
 * garde ci-dessous, sur les DEUX schémas (la demande ET la ligne relue) :
 * jamais réinventée côté lecture (GA-26) — une fonction générique perdrait
 * les champs propres à chaque schéma à l'inférence (zod), d'où la répétition.
 */
const MARKET_MEMORY_NO_GO_MESSAGE =
  'La mémoire marché ne produit jamais seule une affirmation autorisée à l’usage externe : ' +
  'déclare une source PERSONNE (CRM, appel, site) avant d’autoriser cette variable, ou laisse-la `forbidden`/`unknown`.'

export const setOutreachMessageVariableRequestSchema = outreachMessageVariableFieldsSchema.refine(
  value => !(value.source.startsWith(OUTREACH_MARKET_MEMORY_SOURCE_PREFIX) && value.external_use === 'allowed'),
  { message: MARKET_MEMORY_NO_GO_MESSAGE, path: ['external_use'] },
)
export type SetOutreachMessageVariableRequest = z.infer<typeof outreachMessageVariableFieldsSchema>

export const outreachMessageVariableSchema = outreachMessageVariableFieldsSchema
  .extend({
    id: z.string().guid(),
    message_id: z.string().guid(),
    /** La version du message annotée (`outreach_messages.current_version` au moment du geste). */
    version: z.number().int().positive(),
    declared_by: z.string().guid(),
    declared_at: z.string(),
  })
  .refine(
    value => !(value.source.startsWith(OUTREACH_MARKET_MEMORY_SOURCE_PREFIX) && value.external_use === 'allowed'),
    { message: MARKET_MEMORY_NO_GO_MESSAGE, path: ['external_use'] },
  )
export type OutreachMessageVariable = z.infer<typeof outreachMessageVariableSchema>

/** Les variables dont l'usage externe n'est PAS autorisé : à nommer au relecteur avant l'envoi. */
export function variablesNotClearedForExternalUse<T extends { external_use: OutreachVariableExternalUse }>(
  variables: readonly T[],
): T[] {
  return variables.filter(variable => variable.external_use !== 'allowed')
}

/**
 * #3752.7 — une variable dont la SOURCE est un document de la base de l'espace
 * s'écrit « Document de l’espace : <titre exact> » dans le champ `source` (le
 * même champ en démo et en production : aucune colonne de plus, aucune source
 * inventée — une variable sans ce préfixe ne produit AUCUNE ligne).
 */
export const OUTREACH_DOCUMENT_SOURCE_PREFIX = 'Document de l’espace : '

/** Les titres de documents cités par les variables d'un message, sans doublon, dans l'ordre. */
export function documentSourceTitles(variables: readonly { source: string }[]): string[] {
  const titles: string[] = []
  for (const variable of variables) {
    if (!variable.source.startsWith(OUTREACH_DOCUMENT_SOURCE_PREFIX)) continue
    const title = variable.source.slice(OUTREACH_DOCUMENT_SOURCE_PREFIX.length).trim()
    if (title && !titles.includes(title)) titles.push(title)
  }
  return titles
}

/**
 * #4074 — l'extrait de mémoire marché qu'une source persistée cite, SANS le préfixe, ou `null` si la source n'en
 * cite pas. Le préfixe est une DONNÉE (le no-go « la mémoire marché ne lave jamais une variable » s'y appuie) :
 * il reste en base et ne se rend jamais — l'écran dit la nature (« Observé sur le marché »), pas le nom interne.
 */
export function marketMemorySourceRef(source: string): string | null {
  if (!source.startsWith(OUTREACH_MARKET_MEMORY_SOURCE_PREFIX)) return null
  const ref = source.slice(OUTREACH_MARKET_MEMORY_SOURCE_PREFIX.length).trim()
  return ref === '' ? null : ref
}

/**
 * #2877 / #3419.4 — les extraits de mémoire marché cités par les variables
 * d'un message, sans doublon, dans l'ordre. Même lecture que
 * `documentSourceTitles` ci-dessus — aucune variable sourcée sur la mémoire
 * marché → AUCUNE ligne (on n'affiche pas ce qu'on n'a pas).
 */
export function marketMemorySourcedVariables(variables: readonly { source: string }[]): string[] {
  const refs: string[] = []
  for (const variable of variables) {
    const ref = marketMemorySourceRef(variable.source)
    if (ref && !refs.includes(ref)) refs.push(ref)
  }
  return refs
}
