import { ensureError, TechnicalError } from '@bellum/errors'

/**
 * #4073 — un échec de fabrication du PDF doit se VOIR : la cause voyage dans le
 * message (l'aperçu l'affiche tel quel) et part dans la console. Avant, le
 * message était « PDF rendering failed » et la cause restait dans `cause`,
 * jamais lue ni loggée.
 */
export function toPdfRenderError(error: unknown): TechnicalError {
  const cause = ensureError(error)
  console.error('[account-pdf] PDF rendering failed', cause)
  return new TechnicalError(`PDF rendering failed: ${cause.message}`, { cause })
}
