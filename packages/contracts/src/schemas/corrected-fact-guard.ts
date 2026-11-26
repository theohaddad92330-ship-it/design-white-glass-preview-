/**
 * #3671 — un fait CORRIGÉ ne réapparaît pas tel quel au prochain lancement.
 *
 * Trois choses distinctes : un retour « faux » / « obsolète » corrige le FAIT ;
 * « inutile » est une préférence (le fait reste vrai, il n'intéresse pas) et ne
 * retire jamais rien ; « utile » n'est qu'un encouragement. Seul le premier
 * groupe agit ici.
 *
 * Une recherche qui redonne le même libellé corrigé est écartée. Si elle le
 * redonne avec une date STRICTEMENT postérieure à la correction, c'est une
 * information nouvelle potentiellement contradictoire : elle reste, marquée
 * `toConfirm`, et ne remplace pas silencieusement la correction terrain.
 * Fonction pure : aucune date lisible → on ne devine pas une nouveauté.
 */
export type CorrectedFactFeedback = {
  target: string
  targetRef: string
  verdict: string
  /** Instant de la correction (ISO). */
  at: string
}

type SignalLike = Record<string, unknown>

const FACT_VERDICTS: readonly string[] = ['faux', 'obsolete']
const LABEL_FIELDS = ['signal', 'title', 'label', 'description', 'summary'] as const

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function labelOf(signal: SignalLike): string | null {
  for (const field of LABEL_FIELDS) {
    const value = signal[field]
    if (typeof value === 'string' && value.trim().length > 0) return normalize(value)
  }
  return null
}

function dateOf(signal: SignalLike): number | null {
  const raw = signal['date']
  if (typeof raw !== 'string') return null
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? null : ms
}

export function guardAgainstCorrectedSignals<T extends SignalLike>(
  incoming: readonly T[],
  corrections: readonly CorrectedFactFeedback[],
): { kept: Array<T | (T & { toConfirm: true })>; suppressed: string[] } {
  // La correction la plus récente par libellé fait foi.
  const latest = new Map<string, number>()
  for (const c of corrections) {
    if (c.target !== 'signal' || !FACT_VERDICTS.includes(c.verdict)) continue
    const at = Date.parse(c.at)
    const key = normalize(c.targetRef)
    if (!key || Number.isNaN(at)) continue
    latest.set(key, Math.max(latest.get(key) ?? 0, at))
  }
  if (latest.size === 0) return { kept: [...incoming], suppressed: [] }

  const kept: Array<T | (T & { toConfirm: true })> = []
  const suppressed: string[] = []
  for (const signal of incoming) {
    const label = labelOf(signal)
    const correctedAt = label ? latest.get(label) : undefined
    if (correctedAt === undefined) {
      kept.push(signal)
      continue
    }
    const date = dateOf(signal)
    if (date !== null && date > correctedAt) {
      kept.push({ ...signal, toConfirm: true })
    } else {
      const raw = LABEL_FIELDS.map(f => signal[f]).find((v): v is string => typeof v === 'string' && v.trim() !== '')
      suppressed.push(raw?.trim() ?? '')
    }
  }
  return { kept, suppressed }
}
