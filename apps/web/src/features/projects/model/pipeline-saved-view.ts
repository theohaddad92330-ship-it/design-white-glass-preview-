/**
 * #2170.52 — Une vue enregistrable ↔ les filtres rapides du pipe.
 *
 * PUR, dans les deux sens, même raison que `needFiltersToSavedRecord`
 * (`open-needs/model/saved-view-filters.ts`) : une vue relue ne doit jamais
 * composer un état que l'écran ne connaît pas.
 *
 * On enregistre le CRITÈRE, jamais le résultat ni la page — `{}` quand rien
 * n'est filtré, exactement ce que le serveur refuse (« une vue sans critère
 * est la liste complète, elle existe déjà »).
 */
export type PipelineFilters = {
  q: string
  mine: boolean
  withoutNextAction: boolean
  stale: boolean
  withoutProfile: boolean
  toSign: boolean
  interviewThisWeek: boolean
}

export function emptyPipelineFilters(): PipelineFilters {
  return {
    q: '',
    mine: false,
    withoutNextAction: false,
    stale: false,
    withoutProfile: false,
    toSign: false,
    interviewThisWeek: false,
  }
}

const FLAG_KEYS = ['mine', 'withoutNextAction', 'stale', 'withoutProfile', 'toSign', 'interviewThisWeek'] as const

/** Les filtres de l'écran → ce qu'on enregistre. */
export function pipelineFiltersToSavedRecord(filters: PipelineFilters): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  const q = filters.q.trim()
  if (q.length > 0) record.q = q
  for (const key of FLAG_KEYS) {
    if (filters[key]) record[key] = true
  }
  return record
}

/** Ce qu'on a enregistré → les filtres de l'écran. Relu DÉFENSIVEMENT : ce
 *  qui n'est plus reconnu est ignoré plutôt que retransmis. */
export function savedRecordToPipelineFilters(record: unknown): PipelineFilters {
  const filters = emptyPipelineFilters()
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return filters
  const source = record as Record<string, unknown>

  if (typeof source.q === 'string') filters.q = source.q.trim()
  for (const key of FLAG_KEYS) {
    if (source[key] === true) filters[key] = true
  }
  return filters
}
