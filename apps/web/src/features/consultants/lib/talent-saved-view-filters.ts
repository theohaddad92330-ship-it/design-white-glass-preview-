import { partialWithoutDefaults, talentSearchQuerySchema, type TalentSearchQuery } from '@bellum/contracts'

/**
 * #2152.37 — UNE VUE ENREGISTRÉE DU VIVIER ↔ `TalentSearchQuery`.
 *
 * Même contrat que `open-needs/model/saved-view-filters.ts` (I-34) : on
 * enregistre le CRITÈRE, jamais la page ni la limite — une vue relue des mois
 * plus tard ne doit pas composer une requête que le serveur (`strict()` sur
 * `talentSearchQuerySchema`) refuserait avec une clé de pagination périmée.
 *
 * ⚠️ Relecture DÉFENSIVE, à un cran de granularité plus grossier que celle des
 * besoins : `saved-view-filters.ts` ignore chaque clé DEVENUE inconnue une par
 * une (une vieille vue continue de filtrer sur ce qu'elle reconnaît encore).
 * Ici, un enregistrement dont NE SERAIT-CE QU'UNE clé ne validerait plus
 * (énumération retirée du contrat) relit un filtre VIDE en entier — jamais une
 * exception, jamais une clé periméee retransmise au serveur (qui la
 * refuserait en 400, donc une liste vide sans explication). Le prix : une vue
 * très ancienne perd TOUS ses critères d'un coup plutôt que ceux devenus
 * invalides seulement. Documenté ici plutôt que corrigé en silence, pour ne
 * pas laisser croire à une parité qui n'existe pas encore.
 */

const PAGINATION_KEYS = ['page', 'limit'] as const

/** Les clés que le CONTRAT porte, hors pagination — jamais une liste recopiée. */
const RECORD_KEYS = Object.keys(talentSearchQuerySchema.shape).filter(
  key => !(PAGINATION_KEYS as readonly string[]).includes(key),
) as ReadonlyArray<Exclude<keyof TalentSearchQuery, 'page' | 'limit'>>

/**
 * Les filtres de l'écran → ce qu'on enregistre.
 *
 * Rend `{}` quand rien n'est filtré : c'est exactement ce que le serveur
 * refuse (« une vue sans critère est la liste complète — elle existe déjà »).
 */
export function talentFiltersToSavedRecord(filters: Partial<TalentSearchQuery>): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  for (const key of RECORD_KEYS) {
    const value = filters[key]
    if (value !== undefined) record[key] = value
  }
  return record
}

/**
 * `partialWithoutDefaults` et pas `.partial()` : en zod 4 un `.default()` SURVIT
 * au `.partial()`, et `skills` reviendrait à `[]` sur une vue qui n'a jamais
 * filtré sur une compétence. Un défaut n'est pas un critère enregistré.
 */
const savedFiltersSchema = partialWithoutDefaults(talentSearchQuerySchema.omit({ page: true, limit: true }))

/** Ce qu'on a enregistré → les filtres de l'écran. Défensif : voir le docblock. */
export function savedRecordToTalentFilters(record: unknown): Partial<TalentSearchQuery> {
  const parsed = savedFiltersSchema.safeParse(record)
  return parsed.success ? parsed.data : {}
}
