import type { MatchNeed } from '@bellum/contracts'

/**
 * #4059.1-.3 — CE QUE CHANGE UN CV AJOUTÉ (ou une exigence modifiée) DANS UN
 * CLASSEMENT. Fonction PURE : compare le classement qui vient d'être calculé au
 * DERNIER classement journalisé du même besoin (`match_runs` / `match_run_entries`,
 * déjà écrits à chaque exécution — aucune table neuve).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Les règles qui la tiennent
 * ─────────────────────────────────────────────────────────────────────────
 *  - L'IDENTITÉ d'un candidat est son `consultantId`, jamais un fichier : une
 *    nouvelle version du CV d'une même personne la fait BOUGER, elle n'en fait
 *    pas un candidat de plus (#4059.3).
 *  - Aucun SCORE ici, encore moins une probabilité : des rangs et des paniers
 *    (recommended / borderline / …), tels que l'écran les montre déjà.
 *  - Une absence ne fait AUCUNE ligne : une liste vide reste vide.
 *  - Un journal TRONQUÉ (500 lignes) ne se compare pas : un profil au-delà de la
 *    coupe se lirait « nouveau » alors qu'il ne l'est pas — `comparable: false`,
 *    dit, jamais deviné.
 */

export interface PreviousRunSnapshot {
  runId: string
  createdAt: string
  truncated: boolean
  criteria: MatchNeed
  entries: { consultantId: string; rank: number; bucket: string; exclusions: string[] }[]
}

export interface CurrentRunView {
  runId: string
  truncated: boolean
  need: MatchNeed
  /** Dans l'ordre du journal : recommended, borderline, notEvaluable, excluded. */
  ordered: { consultantId: string; bucket: string; exclusions: string[] }[]
}

export interface RunChanges {
  previousRunId: string
  previousRunAt: string
  comparable: boolean
  criteria: { field: string; before: string | null; after: string | null }[]
  newCandidates: { consultantId: string; rank: number; bucket: string; reserves: string[] }[]
  moved: { consultantId: string; fromRank: number; toRank: number; fromBucket: string; toBucket: string }[]
  leftRanking: { consultantId: string; previousBucket: string }[]
  unchangedCount: number
  /** Les réserves (motifs d'exclusion) des profils DÉJÀ examinés, gardées telles quelles. */
  keptReserves: { consultantId: string; reasons: string[] }[]
}

const CRITERIA_FIELDS_SKIPPED = new Set(['needId', 'accountId'])
const VALUE_MAX = 160

function display(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    const parts = value.map(item => {
      if (item && typeof item === 'object' && 'label' in item) {
        const skill = item as { label: string; required?: boolean }
        return `${skill.label}${skill.required ? '*' : ''}`
      }
      if (item && typeof item === 'object' && 'code' in item) {
        const language = item as { code: string; level?: string | null }
        return language.level ? `${language.code} ${language.level}` : language.code
      }
      return String(item)
    })
    return parts.join(', ').slice(0, VALUE_MAX)
  }
  if (typeof value === 'object') return JSON.stringify(value).slice(0, VALUE_MAX)
  const text = String(value)
  return text === '' ? null : text.slice(0, VALUE_MAX)
}

function criteriaDiff(before: MatchNeed, after: MatchNeed): RunChanges['criteria'] {
  const left = before as unknown as Record<string, unknown>
  const right = after as unknown as Record<string, unknown>
  const fields = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(
    field => !CRITERIA_FIELDS_SKIPPED.has(field),
  )
  const changes: RunChanges['criteria'] = []
  for (const field of fields) {
    const from = display(left[field])
    const to = display(right[field])
    if (from !== to) changes.push({ field, before: from, after: to })
  }
  return changes
}

export function diffRuns(previous: PreviousRunSnapshot | null, current: CurrentRunView): RunChanges | null {
  if (!previous) return null
  const base = {
    previousRunId: previous.runId,
    previousRunAt: previous.createdAt,
    criteria: criteriaDiff(previous.criteria, current.need),
  }
  if (previous.truncated || current.truncated) {
    return {
      ...base,
      comparable: false,
      newCandidates: [],
      moved: [],
      leftRanking: [],
      unchangedCount: 0,
      keptReserves: [],
    }
  }
  const before = new Map(previous.entries.map(entry => [entry.consultantId, entry]))
  const newCandidates: RunChanges['newCandidates'] = []
  const moved: RunChanges['moved'] = []
  const keptReserves: RunChanges['keptReserves'] = []
  let unchangedCount = 0
  current.ordered.forEach((entry, index) => {
    const rank = index + 1
    const known = before.get(entry.consultantId)
    if (!known) {
      newCandidates.push({ consultantId: entry.consultantId, rank, bucket: entry.bucket, reserves: entry.exclusions })
      return
    }
    before.delete(entry.consultantId)
    if (known.rank !== rank || known.bucket !== entry.bucket) {
      moved.push({
        consultantId: entry.consultantId,
        fromRank: known.rank,
        toRank: rank,
        fromBucket: known.bucket,
        toBucket: entry.bucket,
      })
    } else {
      unchangedCount += 1
    }
    if (known.exclusions.length > 0 && entry.exclusions.join('|') === known.exclusions.join('|')) {
      keptReserves.push({ consultantId: entry.consultantId, reasons: known.exclusions })
    }
  })
  const leftRanking = [...before.values()].map(entry => ({
    consultantId: entry.consultantId,
    previousBucket: entry.bucket,
  }))
  return { ...base, comparable: true, newCandidates, moved, leftRanking, unchangedCount, keptReserves }
}
