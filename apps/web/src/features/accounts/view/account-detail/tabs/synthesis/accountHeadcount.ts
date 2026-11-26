import type { FieldSource, RecordFieldAudit } from '@bellum/contracts'

/**
 * #3917.9 (Louis 15/10/2026) — L'EFFECTIF AFFICHÉ EST LA VALEUR LA PLUS PRÉCISE.
 *
 * Un chiffre exact passe devant une tranche (« 106 000 » devant « Plus de 10 000 »), une tranche devant
 * une portée sans chiffre (« mondial »). À précision égale, la valeur portée par la fiche garde sa place.
 * ⚠️ Une CORRECTION HUMAINE gagne toujours, quelle que soit sa précision — même règle que l'arbitre de
 * provenance. La source et la date se disent : le journal d'écriture de la fiche donne les deux pour la
 * valeur portée ; une estimation externe n'a pas de date connue, on n'en invente pas.
 */
type HeadcountPrecision = 'exact' | 'range' | 'scope'

type HeadcountReading = {
  value: string
  precision: HeadcountPrecision
  /** `recorded` = la valeur de la fiche ; `estimate` = l'estimation externe, plus précise. */
  origin: 'recorded' | 'estimate'
  /** La source de la valeur portée (journal d'écriture) ; `null` pour l'estimation ou sans journal. */
  source: FieldSource | null
  observedAt: string | null
}

const WORDS = /salari[ée]s?|employees?|collaborateurs?|staff/gi

export function headcountPrecision(raw: string): HeadcountPrecision {
  const text = raw.replace(WORDS, '').trim()
  if (!/\d/.test(text)) return 'scope'
  return /^[\d\s.,]+$/.test(text) ? 'exact' : 'range'
}

const RANK: Record<HeadcountPrecision, number> = { exact: 2, range: 1, scope: 0 }

export function pickHeadcount(input: {
  recorded: string | null | undefined
  recordedAudit: { source: FieldSource; createdAt: string } | null
  estimate: number | null | undefined
  locale?: string
}): HeadcountReading | null {
  const recorded = input.recorded?.trim() ? input.recorded.trim() : null
  const estimate =
    typeof input.estimate === 'number' && Number.isFinite(input.estimate) && input.estimate > 0
      ? Math.round(input.estimate)
      : null
  const recordedReading: HeadcountReading | null = recorded
    ? {
        value: recorded,
        precision: headcountPrecision(recorded),
        origin: 'recorded',
        source: input.recordedAudit?.source ?? null,
        observedAt: input.recordedAudit?.createdAt ?? null,
      }
    : null
  if (!estimate) return recordedReading
  const estimateReading: HeadcountReading = {
    value: new Intl.NumberFormat(input.locale ?? 'fr-FR').format(estimate),
    precision: 'exact',
    origin: 'estimate',
    source: null,
    observedAt: null,
  }
  if (!recordedReading) return estimateReading
  if (recordedReading.source === 'human') return recordedReading
  return RANK[estimateReading.precision] > RANK[recordedReading.precision] ? estimateReading : recordedReading
}

/** La dernière écriture d'un champ dans le journal de la fiche (source + date), ou `null` sans journal. */
export function latestFieldAudit(
  items: readonly RecordFieldAudit[] | undefined,
  field: string,
): { source: FieldSource; createdAt: string } | null {
  const latest = (items ?? [])
    .filter(item => item.field === field)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]
  return latest ? { source: latest.source, createdAt: latest.createdAt } : null
}
