/**
 * #2442.5 — LA FORME D'UNE RÉFÉRENCE SUPPORT, partagée par l'API et l'écran.
 *
 * L'API la CALCULE (`apps/api/src/common/observability-privacy.ts`) et la pose
 * dans le corps de toute réponse d'erreur ; le navigateur la LIT et l'affiche.
 * Deux fichiers, une seule forme : elle vit donc ici (GA-26 — un réglage vit à
 * un seul endroit), et pas recopiée de chaque côté, où elle dériverait.
 *
 * Huit hexadécimaux derrière `BLM-` : ni `I`, ni `L`, ni `O`, ni `U`, donc rien
 * d'ambigu à épeler au téléphone, et rien qui puisse porter une balise, un
 * retour chariot ou une phrase. C'est ce qui rend la valeur inoffensive à
 * afficher alors même qu'elle DÉRIVE d'un en-tête de requête que l'appelant
 * contrôle (`X-Correlation-ID`).
 */
export const SUPPORT_REFERENCE_PREFIX = 'BLM'

/** La forme exacte. Ancrée des deux côtés : une référence est la chaîne
 *  ENTIÈRE, jamais une sous-chaîne trouvée dans autre chose. */
export const SUPPORT_REFERENCE_PATTERN = /^BLM-[0-9A-F]{8}$/

/**
 * #2442.5 — cette valeur EST-ELLE une référence support ?
 *
 * Le corps d'une réponse d'erreur est « ce que le serveur a eu le temps
 * d'écrire », jamais une forme garantie : un écran ne rend pas une chaîne
 * arbitraire au motif qu'elle s'appelait `supportReference`. Le contrôle porte
 * sur le TYPE puis sur la FORME — un objet avec un `toString()` complaisant
 * n'en est pas une.
 */
export function isSupportReference(value: unknown): value is string {
  return typeof value === 'string' && SUPPORT_REFERENCE_PATTERN.test(value)
}
