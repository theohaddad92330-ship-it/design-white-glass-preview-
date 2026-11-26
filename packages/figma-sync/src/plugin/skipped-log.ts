import type { SkippedToken } from '../extract/types'
import type { Log } from './api'

/**
 * Journalise `tokens.skipped` : une exclusion VOULUE (`intended: true`, ex.
 * une valeur qui dépend du viewport) va en `info` — ce n'est pas une anomalie
 * à corriger. Le reste (valeur illisible, absente) reste un `warn` : la vraie
 * anomalie que la synchro doit faire remonter. La planche « Non importés »
 * (`foundations.ts`) continue de lister les deux avec leur raison.
 */
export function logSkippedTokens(skipped: readonly SkippedToken[], log: Log): void {
  for (const s of skipped) {
    const text = `Non importé : ${s.cssVar} (${s.source}) — ${s.reason}`
    if (s.intended) log.info(text)
    else log.warn(text)
  }
}
