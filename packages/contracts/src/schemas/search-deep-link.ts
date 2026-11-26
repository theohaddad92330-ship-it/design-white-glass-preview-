/**
 * #2162.27 / épopée #2892 — LE LIEN PROFOND DE `/search` : un preset STRUCTURÉ.
 *
 * Laura ouvrait déjà `/search?company=…&context=…` (preset `free`). Ce contrat
 * ajoute les presets structurés (`push-offer`, `signal`…) sous une forme PLATE :
 * `preset=<nom>` puis UN paramètre par sous-champ, du même nom que le champ du
 * schéma (`analysis-context.ts`). Jamais un JSON encodé dans l'URL : c'est la
 * forme que le modèle écrit sans se tromper, et celle que le service IA vérifie
 * clé par clé avant de proposer le lien (`_search_preset_refusal`,
 * `chat_tools.py`) — la garde `laura-deep-links.test.ts` tient les deux côtés
 * égaux.
 *
 * ⚠️ Une VALEUR INITIALE, jamais un verrou : le composeur reste éditable, et
 * rien n'est lancé — le débit ne part qu'au clic, après `ScopeConfirmPanel`.
 */

import {
  analysisContextFields,
  analysisContextPresetSchema,
  analysisContextSchema,
  type AnalysisContext,
  type AnalysisContextPreset,
  freeContextSchema,
  incumbentContextSchema,
  knownAccountContextSchema,
  pushOfferContextSchema,
  retryContextSchema,
  signalContextSchema,
  strategicContextSchema,
} from './analysis-context.js'

const PRESET_SCHEMAS = {
  'push-offer': pushOfferContextSchema,
  'known-account': knownAccountContextSchema,
  incumbent: incumbentContextSchema,
  signal: signalContextSchema,
  strategic: strategicContextSchema,
  retry: retryContextSchema,
  free: freeContextSchema,
} as const

/**
 * #4655 — un identifiant `lowerCamelCase` (au moins une majuscule : « source: » reste une phrase) suivi de `:`.
 * « Ton angle » arrivait prérempli avec `prioritizationReason: Commencer par…` — la CLÉ du champ, pas sa phrase.
 */
const FIELD_KEY_PREFIX = /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+:\s*/

export function startsWithFieldKey(value: string): boolean {
  return FIELD_KEY_PREFIX.test(value.trim())
}

/** La phrase sans la clé technique qui la transportait ; un texte sans clé passe tel quel. */
export function stripFieldKeyPrefix(value: string): string {
  return value.trim().replace(FIELD_KEY_PREFIX, '')
}

/** Le routeur analyse chaque valeur en JSON (`2026` → nombre) : on la rend texte. */
function asText(value: unknown): string | undefined {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value !== 'string') return undefined
  const trimmed = stripFieldKeyPrefix(value)
  return trimmed || undefined
}

/**
 * Le contexte d'analyse que porte un lien `/search`, ou `null` s'il n'en porte
 * aucun (l'appelant garde alors son défaut).
 *
 * - sans preset (ou `free`) : `context` est le texte libre, comme avant ;
 * - preset structuré : seuls SES champs sont lus — un champ d'un autre preset,
 *   ou une valeur hors liste (`signalType=rumeur`), est jeté, jamais deviné ;
 *   `context` n'est pas lu, ce preset n'a pas de champ libre.
 */
export function analysisContextFromSearch(search: Record<string, unknown>): AnalysisContext | null {
  const rawPreset = search.preset
  const preset: AnalysisContextPreset | null =
    rawPreset === undefined ? 'free' : (analysisContextPresetSchema.safeParse(rawPreset).data ?? null)
  if (preset === null) return null
  if (preset === 'free') {
    const notes = asText(search.context)
    return notes ? { preset: 'free', notes } : null
  }
  const shape = PRESET_SCHEMAS[preset].shape as Record<string, { safeParse: (v: unknown) => { success: boolean } }>
  const candidate: Record<string, string> = {}
  for (const field of analysisContextFields(preset)) {
    const value = asText(search[field])
    if (value !== undefined && shape[field]?.safeParse(value).success) candidate[field] = value
  }
  return analysisContextSchema.parse({ preset, ...candidate })
}
