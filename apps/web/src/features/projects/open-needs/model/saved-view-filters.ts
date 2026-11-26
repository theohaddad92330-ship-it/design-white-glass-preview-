import {
  CONTRACT_KINDS,
  NEED_FILTER_KEYS,
  NEED_SOURCES,
  NEED_THEO_STATUSES,
  NEED_URGENCIES,
  PROJECT_NEED_STATUSES,
  emptyNeedFilters,
  needFiltersToQuery,
  type NeedFilters,
  isNeedCandidateStage,
} from '@bellum/contracts'

/**
 * Une vue enregistrable ↔ les filtres de l'écran des besoins (I-34).
 *
 * PUR, dans les deux sens, et pour la même raison que `needFiltersToQuery` : la
 * propriété qui compte — **une vue relue ne peut pas composer une requête que le
 * serveur refuserait** — se garantit par un test, pas par relecture.
 *
 * Deux règles portent ce module, et chacune ferme un défaut connu.
 *
 * 1. **On enregistre le CRITÈRE, jamais le RÉSULTAT ni la page.** C'est déjà
 *    écrit dans le contrat de `savedViewSchema` ; ici c'est APPLIQUÉ — le
 *    dossier passe par `needFiltersToQuery` puis ne retient que les clés que le
 *    contrat déclare comme critères. La pagination ne peut donc pas s'y glisser :
 *    une vue qui aurait gardé `offset: 100` s'ouvrirait page 3 d'une liste qui a
 *    changé depuis, et afficherait « aucun besoin » sur un écran plein.
 * 2. **On relit DÉFENSIVEMENT.** Une vue vit des mois ; un critère peut
 *    disparaître du serveur, une valeur d'énumération peut être retirée. Ce qui
 *    n'est plus reconnu est IGNORÉ plutôt que retransmis : le prix est qu'un
 *    vieux critère cesse silencieusement de filtrer, l'inverse serait un 400 au
 *    clic sur une vue enregistrée — c'est-à-dire une liste vide sans explication.
 */

/** Les clés qui portent du texte libre. */
const TEXT_KEYS = ['q', 'account_id', 'skill', 'seniority', 'location'] as const

/** Les clés qui portent une question fermée. Un `false` n'est pas une question,
 *  donc il ne s'enregistre pas et ne se relit pas. */
const FLAG_KEYS = ['without_shortlist', 'stale', 'deadline_passed', 'include_closed'] as const

/** Les bornes du serveur, les mêmes que celles de `needFiltersToQuery`. */
const STARTING_WITHIN_MIN = 1
const STARTING_WITHIN_MAX = 365

/**
 * Les filtres de l'écran → ce qu'on enregistre.
 *
 * Rend `{}` quand rien n'est filtré : c'est exactement ce que le serveur refuse
 * (« une vue sans critère est la liste complète — elle existe déjà »), et c'est
 * ce que l'écran doit dire AVANT le clic plutôt que de récolter un 400.
 */
export function needFiltersToSavedRecord(filters: NeedFilters): Record<string, unknown> {
  const query = needFiltersToQuery(filters, { offset: 0, limit: 1 }) as Record<string, unknown>
  const record: Record<string, unknown> = {}
  // Piloté par la liste du CONTRAT, et non par une liste recopiée : un treizième
  // critère ajouté là-bas devient enregistrable sans qu'on y revienne, et la
  // pagination — qui n'y figure pas — ne peut pas s'y glisser.
  for (const key of NEED_FILTER_KEYS) {
    if (key in query) record[key] = query[key]
  }
  return record
}

/** Ce qu'on a enregistré → les filtres de l'écran. */
export function savedRecordToNeedFilters(record: unknown): NeedFilters {
  const filters = emptyNeedFilters()
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return filters
  const source = record as Record<string, unknown>

  for (const key of TEXT_KEYS) {
    const value = source[key]
    if (typeof value === 'string') filters[key] = value.trim()
  }
  for (const key of FLAG_KEYS) {
    if (source[key] === true) filters[key] = true
  }

  filters.urgency = knownValue(NEED_URGENCIES, source.urgency)
  // #4343 — une vue enregistrée sur une étape candidat n'a plus de filtre statut.
  filters.status = knownValue(
    PROJECT_NEED_STATUSES.filter(value => !isNeedCandidateStage(value)),
    source.status,
  )
  filters.theo_status = knownValue(NEED_THEO_STATUSES, source.theo_status)
  filters.contract_kind = knownValue(CONTRACT_KINDS, source.contract_kind)
  // L'ORIGINE (§7.2), relue comme les trois autres listes fermées. Le nom local
  // `source` désigne ici l'enregistrement relu, pas le critère : d'où
  // `source.source`, qui se lit mal et qu'on ne renomme pas — le paramètre
  // porte ce nom dans tout le module.
  filters.source = knownValue(NEED_SOURCES, source.source)

  const days = source.starting_within_days
  filters.starting_within_days =
    typeof days === 'number' && Number.isInteger(days) && days >= STARTING_WITHIN_MIN && days <= STARTING_WITHIN_MAX
      ? days
      : null

  return filters
}

/** La valeur si le serveur la connaît encore, sinon « pas de critère ». */
function knownValue<T extends string>(allowed: readonly T[], value: unknown): T | '' {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : ''
}
