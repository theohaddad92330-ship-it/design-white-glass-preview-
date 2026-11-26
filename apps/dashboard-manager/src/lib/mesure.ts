/**
 * Supervision 30/09 — une valeur ABSENTE ne s'affiche jamais « 0 » (gardes
 * GA-18 / GA-19). Formateurs d'écran du back-office : `null`, `undefined` ou
 * NaN rendent « non mesuré » (ou le tiret de la page), jamais un zéro.
 */

export const NON_MESURE = 'non mesuré'

function isMeasured(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** `rate` ∈ [0,1] → « 12,3 % », ou « non mesuré ». */
export function pctOrUnmeasured(rate: number | null | undefined): string {
  return isMeasured(rate) ? `${(rate * 100).toFixed(1)} %` : NON_MESURE
}

/** Un compteur, ou « non mesuré ». */
export function countOrUnmeasured(count: number | null | undefined): string {
  return isMeasured(count) ? String(count) : NON_MESURE
}

/** Un coût en dollars (« $0.0123 »), ou le tiret : un coût absent n'est pas « $0.0000 ». */
export function usdOrDash(usd: number | null | undefined): string {
  return isMeasured(usd) ? `$${usd.toFixed(4)}` : '—'
}

/** Une durée en secondes (« 12s »), ou le tiret. */
export function secondsOrDash(ms: number | null | undefined): string {
  return isMeasured(ms) ? `${Math.round(ms / 1000)}s` : '—'
}

/** Un compte de tokens localisé (fr-FR), ou le tiret. */
export function tokensOrDash(n: number | null | undefined): string {
  return isMeasured(n) ? n.toLocaleString('fr-FR') : '—'
}
