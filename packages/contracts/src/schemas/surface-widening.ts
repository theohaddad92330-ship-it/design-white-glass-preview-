import { z } from 'zod'
import type { ContactsWidenOutcome } from './contacts-data.js'
import { CRITERIA_WIDEN_MIN_RESULTS } from './criteria-referential.js'

/**
 * #4433.9 (épopée #4433, décision Louis 21/10/2026) — LES PALIERS DES AUTRES SURFACES.
 *
 * Découvrir (#4434-#4437) et la zone (#4429) élargissent déjà leurs critères. Mes cibles, la veille et
 * l'analyse de compte suivent la MÊME règle : sous `CRITERIA_WIDEN_MIN_RESULTS` résultats, on ÉLARGIT SEUL,
 * palier par palier, et on DIT le palier atteint — jamais un écran à zéro, jamais « tu veux élargir ? ».
 * Un palier qui n'apporte rien n'est pas affiché. Le seuil est celui des critères (GA-26 : un seul endroit) ;
 * le bandeau est celui de Découvrir (`WideningBanner`), il ne s'en écrit pas un second.
 */
export const SURFACE_WIDEN_TIERS = [
  // Veille / Mes cibles : le filtre d'intention (« À traiter », prioritaires, mes règles) tombe.
  'watch_intent',
  // Analyse : le filtre de postes tombe, la bande de séniorité le remplace (postes voisins).
  'contacts_neighbour_roles',
] as const
export type SurfaceWidenTier = (typeof SURFACE_WIDEN_TIERS)[number]

export const surfaceWideningSchema = z.object({
  minResults: z.number().int().positive(),
  steps: z
    .array(
      z.object({
        tier: z.enum(SURFACE_WIDEN_TIERS),
        // Un palier sans apport ne s'écrit pas : `added` vaut au moins 1.
        added: z.number().int().min(1),
      }),
    )
    .min(1),
})
export type SurfaceWidening = z.infer<typeof surfaceWideningSchema>
export type SurfaceWideningStep = SurfaceWidening['steps'][number]

/**
 * Applique l'échelle à une liste de résultats.
 *
 * `rungs[0]` est l'EXACT ; `rungs[i + 1]` est la liste COMPLÈTE au palier `tiers[i]` (évaluée à la demande, un
 * palier non atteint ne coûte rien). L'exact reste en tête ; chaque palier ajoute dessous ce qu'il apporte de
 * nouveau (identifié par `keyOf`). On s'arrête dès que le total atteint le seuil ; un palier qui n'apporte rien
 * n'est pas une étape. Au seuil dès l'exact : rien n'est tenté (le garde-fou « au-dessus, aucun élargissement »).
 */
export function widenToThreshold<T>(
  rungs: readonly (() => readonly T[])[],
  tiers: readonly SurfaceWidenTier[],
  keyOf: (item: T) => string,
  minResults: number = CRITERIA_WIDEN_MIN_RESULTS,
): { items: T[]; steps: SurfaceWideningStep[] } {
  const first = rungs[0]
  const items: T[] = first ? [...first()] : []
  const steps: SurfaceWideningStep[] = []
  const seen = new Set(items.map(keyOf))
  for (let index = 1; index < rungs.length && items.length < minResults; index += 1) {
    const tier = tiers[index - 1]
    const rung = rungs[index]
    if (!tier || !rung) break
    const fresh = rung().filter(item => !seen.has(keyOf(item)))
    if (fresh.length === 0) continue
    for (const item of fresh) seen.add(keyOf(item))
    items.push(...fresh)
    steps.push({ tier, added: fresh.length })
  }
  return { items, steps }
}

/**
 * L'analyse de compte : la passe d'élargissement des contacts (#2543.5g — titres retirés, bande de séniorité) se
 * lit comme un palier de la même échelle. Elle ne se DIT que si elle a apporté : pas tentée, en échec (`added`
 * inconnu — jamais un 0 inventé) ou sans apport, il n'y a rien à afficher.
 */
export function contactsSurfaceWidening(outcome: ContactsWidenOutcome | null | undefined): SurfaceWidening | null {
  const added = outcome?.attempted ? outcome.added : undefined
  if (added === undefined || added < 1) return null
  return { minResults: CRITERIA_WIDEN_MIN_RESULTS, steps: [{ tier: 'contacts_neighbour_roles', added }] }
}
